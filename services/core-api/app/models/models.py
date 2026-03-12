import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Numeric,
    String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class IdempotencyRecord(Base):
    """Generic idempotency store: Idempotency-Key → (resource_type, resource_id)."""
    __tablename__ = "idempotency_record"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Party(Base):
    """A person or company identified by a document (DNI/CUIL/CUIT/Passport)."""
    __tablename__ = "party"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False)          # DNI | CUIL | CUIT | PASSPORT
    doc_number_normalized: Mapped[str] = mapped_column(String(50), nullable=False)
    country: Mapped[str] = mapped_column(String(3), nullable=False, default="ARG")  # ISO 3166-1 alpha-3
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    leads: Mapped[list["Lead"]] = relationship(back_populates="party")

    __table_args__ = (
        UniqueConstraint("doc_type", "doc_number_normalized", "country", name="uq_party_doc"),
    )


class Lead(Base):
    __tablename__ = "lead"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    party_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("party.id"), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)   # WHATSAPP | WEB | REFERRAL …
    status: Mapped[str] = mapped_column(String(20), default="NEW")          # NEW | QUALIFIED | CONVERTED | LOST
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    party: Mapped["Party | None"] = relationship(back_populates="leads")


class Sale(Base):
    __tablename__ = "sale"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buyer_party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("party.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")   # DRAFT | CONFIRMED | CANCELLED
    currency: Mapped[str] = mapped_column(String(3), default="ARS")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    buyer: Mapped["Party"] = relationship(foreign_keys=[buyer_party_id])
    items: Mapped[list["SaleItem"]] = relationship(back_populates="sale", cascade="all, delete-orphan")
    costs: Mapped[list["Cost"]] = relationship(back_populates="sale", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="sale")
    document_refs: Mapped[list["DocumentRef"]] = relationship(back_populates="sale")
    pax: Mapped[list["SalePax"]] = relationship(back_populates="sale", cascade="all, delete-orphan")


class SalePax(Base):
    """Travellers linked to a sale (buyer + companions)."""
    __tablename__ = "sale_pax"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sale.id"), nullable=False)
    party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("party.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="TRAVELER")  # BUYER | TRAVELER

    sale: Mapped["Sale"] = relationship(back_populates="pax")
    party: Mapped["Party"] = relationship()


class SaleItem(Base):
    __tablename__ = "sale_item"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sale.id"), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    item_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # FLIGHT | HOTEL | TRANSFER …
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped["Sale"] = relationship(back_populates="items")
    costs: Mapped[list["Cost"]] = relationship(back_populates="sale_item")


class Provider(Base):
    __tablename__ = "provider"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    doc_number: Mapped[str | None] = mapped_column(String(50), nullable=True)   # CUIT / RUT
    contact_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    country: Mapped[str] = mapped_column(String(3), default="ARG")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Cost(Base):
    """Cost associated with a sale, optionally with a specific sale_item."""
    __tablename__ = "cost"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sale.id"), nullable=False)
    sale_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sale_item.id"), nullable=True)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("provider.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="ARS")
    cost_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped["Sale"] = relationship(back_populates="costs")
    sale_item: Mapped["SaleItem | None"] = relationship(back_populates="costs")
    provider: Mapped["Provider | None"] = relationship()


class Payment(Base):
    __tablename__ = "payment"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sale.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="ARS")
    method: Mapped[str | None] = mapped_column(String(50), nullable=True)     # TRANSFER | CARD | CASH
    status: Mapped[str] = mapped_column(String(20), default="PENDING")        # PENDING | COMPLETED | FAILED
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped["Sale"] = relationship(back_populates="payments")


class Payout(Base):
    """Payment made to a provider."""
    __tablename__ = "payout"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("provider.id"), nullable=False)
    cost_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cost.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="ARS")
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    provider: Mapped["Provider"] = relationship()
    cost: Mapped["Cost | None"] = relationship()


class DocumentRef(Base):
    """Reference to a document (quote/invoice/receipt) generated externally.

    doc_number: correlative per (party, doc_type). Quote 1, 2, 3… per client.
    totals: JSON snapshot of fiscal components {subtotal, discount, taxable_base, iva, other_taxes, total}.
    """
    __tablename__ = "document_ref"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sale.id"), nullable=True)
    party_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("party.id"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lead.id"), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False)   # QUOTE | INVOICE | RECEIPT
    doc_number: Mapped[int | None] = mapped_column(Integer, nullable=True)  # correlativo por (party, doc_type)
    external_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    totals: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped["Sale | None"] = relationship(back_populates="document_refs")
    party: Mapped["Party | None"] = relationship()
    lead: Mapped["Lead | None"] = relationship()


class ConversationThread(Base):
    __tablename__ = "conversation_thread"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    party_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("party.id"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lead.id"), nullable=True)
    sale_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sale.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="WHATSAPP")   # WHATSAPP | EMAIL | PHONE
    status: Mapped[str] = mapped_column(String(20), default="OPEN")        # OPEN | CLOSED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan"
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_message"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation_thread.id"), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)    # INBOUND | OUTBOUND
    content: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    satisfaction: Mapped[int | None] = mapped_column(Integer, nullable=True)
    handoff: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    thread: Mapped["ConversationThread"] = relationship(back_populates="messages")


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── Party ─────────────────────────────────────────────────────────────────────

class PartyCreate(BaseModel):
    doc_type: Literal["DNI", "CUIL", "CUIT", "PASSPORT"]
    doc_number: str = Field(..., min_length=1, description="Raw document number (dots/hyphens allowed)")
    country: str = Field(default="ARG", max_length=3)
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class PartyOut(BaseModel):
    id: uuid.UUID
    doc_type: str
    doc_number_normalized: str
    country: str
    full_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Lead ──────────────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    party_id: Optional[uuid.UUID] = None
    source: Optional[str] = None
    status: str = "NEW"
    notes: Optional[str] = None


class LeadOut(BaseModel):
    id: uuid.UUID
    party_id: Optional[uuid.UUID]
    source: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Provider ──────────────────────────────────────────────────────────────────

class ProviderCreate(BaseModel):
    name: str
    doc_number: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    country: str = "ARG"


class ProviderOut(BaseModel):
    id: uuid.UUID
    name: str
    doc_number: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    country: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── SaleItem ──────────────────────────────────────────────────────────────────

class SaleItemCreate(BaseModel):
    sale_id: uuid.UUID
    description: str
    item_type: Optional[str] = None
    quantity: int = 1
    unit_price: Decimal
    total_price: Decimal


class SaleItemOut(BaseModel):
    id: uuid.UUID
    sale_id: uuid.UUID
    description: str
    item_type: Optional[str]
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Cost ──────────────────────────────────────────────────────────────────────

class CostCreate(BaseModel):
    sale_id: uuid.UUID
    sale_item_id: Optional[uuid.UUID] = None
    provider_id: Optional[uuid.UUID] = None
    description: str
    amount: Decimal
    currency: str = "ARS"
    cost_type: Optional[str] = None


class CostOut(BaseModel):
    id: uuid.UUID
    sale_id: uuid.UUID
    sale_item_id: Optional[uuid.UUID]
    provider_id: Optional[uuid.UUID]
    description: str
    amount: Decimal
    currency: str
    cost_type: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Sale ──────────────────────────────────────────────────────────────────────

class SaleCreate(BaseModel):
    buyer_party_id: uuid.UUID
    status: str = "DRAFT"
    currency: str = "ARS"
    notes: Optional[str] = None


class SaleOut(BaseModel):
    id: uuid.UUID
    buyer_party_id: uuid.UUID
    status: str
    currency: str
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class SaleDetail(BaseModel):
    id: uuid.UUID
    buyer_party_id: uuid.UUID
    status: str
    currency: str
    notes: Optional[str]
    items: list[SaleItemOut]
    costs: list[CostOut]
    subtotal: Decimal
    total_costs: Decimal
    payments_total: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Payment ───────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    sale_id: uuid.UUID
    amount: Decimal
    currency: str = "ARS"
    method: Optional[str] = None
    status: str = "PENDING"


class PaymentOut(BaseModel):
    id: uuid.UUID
    sale_id: uuid.UUID
    amount: Decimal
    currency: str
    method: Optional[str]
    status: str
    paid_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── DocumentRef ───────────────────────────────────────────────────────────────

class DocumentRefCreate(BaseModel):
    sale_id: Optional[uuid.UUID] = None
    party_id: Optional[uuid.UUID] = None
    doc_type: Literal["QUOTE", "INVOICE", "RECEIPT"]
    external_ref: Optional[str] = None
    url: Optional[str] = None


class DocumentRefOut(BaseModel):
    id: uuid.UUID
    sale_id: Optional[uuid.UUID]
    party_id: Optional[uuid.UUID]
    doc_type: str
    doc_number: Optional[int]   # correlativo por (party, doc_type): cotización 1, 2, 3…
    external_ref: Optional[str]
    url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Conversation ──────────────────────────────────────────────────────────────

class ConversationThreadCreate(BaseModel):
    party_id: Optional[uuid.UUID] = None
    lead_id: Optional[uuid.UUID] = None
    sale_id: Optional[uuid.UUID] = None
    channel: str = "WHATSAPP"
    status: str = "OPEN"


class ConversationMessageCreate(BaseModel):
    direction: Literal["INBOUND", "OUTBOUND"]
    content: str
    intent: Optional[str] = None
    satisfaction: Optional[int] = None
    handoff: bool = False


class ConversationMessageOut(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    direction: str
    content: str
    intent: Optional[str]
    satisfaction: Optional[int]
    handoff: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationThreadOut(BaseModel):
    id: uuid.UUID
    party_id: Optional[uuid.UUID]
    lead_id: Optional[uuid.UUID]
    sale_id: Optional[uuid.UUID]
    channel: str
    status: str
    created_at: datetime
    messages: list[ConversationMessageOut] = []

    model_config = {"from_attributes": True}

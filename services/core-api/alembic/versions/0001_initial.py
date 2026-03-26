"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "idempotency_record",
        sa.Column("key", sa.String(200), primary_key=True),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", UUID(as_uuid=True), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "party",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("doc_type", sa.String(20), nullable=False),
        sa.Column("doc_number_normalized", sa.String(50), nullable=False),
        sa.Column("country", sa.String(3), nullable=False, server_default="ARG"),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("doc_type", "doc_number_normalized", "country", name="uq_party_doc"),
    )

    op.create_table(
        "lead",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("party_id", UUID(as_uuid=True), sa.ForeignKey("party.id"), nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="NEW"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "provider",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("doc_number", sa.String(50), nullable=True),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("country", sa.String(3), nullable=False, server_default="ARG"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "sale",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("buyer_party_id", UUID(as_uuid=True), sa.ForeignKey("party.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "sale_item",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sale.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("item_type", sa.String(50), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "sale_pax",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sale.id", ondelete="CASCADE"), nullable=False),
        sa.Column("party_id", UUID(as_uuid=True), sa.ForeignKey("party.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="TRAVELER"),
    )

    op.create_table(
        "cost",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sale.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sale_item_id", UUID(as_uuid=True), sa.ForeignKey("sale_item.id"), nullable=True),
        sa.Column("provider_id", UUID(as_uuid=True), sa.ForeignKey("provider.id"), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("cost_type", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "payment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sale.id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("method", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "payout",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_id", UUID(as_uuid=True), sa.ForeignKey("provider.id"), nullable=False),
        sa.Column("cost_id", UUID(as_uuid=True), sa.ForeignKey("cost.id"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "document_ref",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sale.id"), nullable=True),
        sa.Column("party_id", UUID(as_uuid=True), sa.ForeignKey("party.id"), nullable=True),
        sa.Column("doc_type", sa.String(20), nullable=False),
        sa.Column("doc_number", sa.Integer(), nullable=True),
        sa.Column("external_ref", sa.String(200), nullable=True),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "conversation_thread",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("party_id", UUID(as_uuid=True), sa.ForeignKey("party.id"), nullable=True),
        sa.Column("lead_id", UUID(as_uuid=True), sa.ForeignKey("lead.id"), nullable=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sale.id"), nullable=True),
        sa.Column("channel", sa.String(20), nullable=False, server_default="WHATSAPP"),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "conversation_message",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "thread_id", UUID(as_uuid=True),
            sa.ForeignKey("conversation_thread.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(100), nullable=True),
        sa.Column("satisfaction", sa.Integer(), nullable=True),
        sa.Column("handoff", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "activity_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("actor_id", sa.String(200), nullable=True),
        sa.Column("payload", JSONB(), nullable=True),
        sa.Column("request_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("activity_log")
    op.drop_table("conversation_message")
    op.drop_table("conversation_thread")
    op.drop_table("document_ref")
    op.drop_table("payout")
    op.drop_table("payment")
    op.drop_table("cost")
    op.drop_table("sale_pax")
    op.drop_table("sale_item")
    op.drop_table("sale")
    op.drop_table("lead")
    op.drop_table("provider")
    op.drop_table("party")
    op.drop_table("idempotency_record")

"""document_ref: add lead_id FK and totals JSONB (Stage 2)

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_ref",
        sa.Column("lead_id", UUID(as_uuid=True), sa.ForeignKey("lead.id"), nullable=True),
    )
    op.add_column(
        "document_ref",
        sa.Column("totals", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("document_ref", "totals")
    op.drop_column("document_ref", "lead_id")

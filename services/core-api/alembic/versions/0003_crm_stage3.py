"""crm stage3: lead fields + lead_task table

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lead", sa.Column("assigned_to", sa.String(100), nullable=True))
    op.add_column("lead", sa.Column("destination", sa.String(200), nullable=True))

    op.create_table(
        "lead_task",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", UUID(as_uuid=True),
                  sa.ForeignKey("lead.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("assigned_to", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("lead_task")
    op.drop_column("lead", "destination")
    op.drop_column("lead", "assigned_to")

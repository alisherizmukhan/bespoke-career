"""stripe ids on subscriptions and payments

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("provider_subscription_id", sa.String(80), nullable=True))
    op.add_column("subscriptions", sa.Column("provider_customer_id", sa.String(80), nullable=True))
    op.create_index("ix_subscriptions_provider_subscription_id", "subscriptions", ["provider_subscription_id"])
    op.add_column("payments", sa.Column("provider_ref", sa.String(120), nullable=True))
    op.create_index("ix_payments_provider_ref", "payments", ["provider_ref"])


def downgrade() -> None:
    op.drop_index("ix_payments_provider_ref", "payments")
    op.drop_column("payments", "provider_ref")
    op.drop_index("ix_subscriptions_provider_subscription_id", "subscriptions")
    op.drop_column("subscriptions", "provider_customer_id")
    op.drop_column("subscriptions", "provider_subscription_id")

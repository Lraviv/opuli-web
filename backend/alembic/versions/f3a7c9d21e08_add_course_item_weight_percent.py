"""add course_items.weight_percent

Revision ID: f3a7c9d21e08
Revises: 82eea32abf1a
Create Date: 2026-09-02 22:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a7c9d21e08'
down_revision = '82eea32abf1a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('course_items', sa.Column('weight_percent', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('course_items', 'weight_percent')

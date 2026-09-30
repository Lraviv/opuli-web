"""add course_items.grade

Revision ID: a91d4e6c3f57
Revises: f3a7c9d21e08
Create Date: 2026-09-02 23:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a91d4e6c3f57'
down_revision = 'f3a7c9d21e08'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('course_items', sa.Column('grade', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('course_items', 'grade')

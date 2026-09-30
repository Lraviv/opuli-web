"""add course_items.watched_at

Revision ID: c4e1b7d93a2f
Revises: a8df85d217f0
Create Date: 2026-10-01 01:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e1b7d93a2f'
down_revision = 'a8df85d217f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('course_items', sa.Column('watched_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('course_items', 'watched_at')

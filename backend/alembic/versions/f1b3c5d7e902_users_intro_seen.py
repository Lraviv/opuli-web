"""users.intro_seen - welcome tour shown once

Revision ID: f1b3c5d7e902
Revises: e8a1d4c27f90
Create Date: 2026-10-02 01:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1b3c5d7e902'
down_revision = 'e8a1d4c27f90'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # משתמשים קיימים מקבלים false - יראו את חלון ההסבר פעם אחת (מציג גם את הפיצ'רים החדשים)
    op.add_column('users', sa.Column('intro_seen', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('users', 'intro_seen')

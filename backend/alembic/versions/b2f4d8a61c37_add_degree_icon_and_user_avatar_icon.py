"""add degrees.icon and users.avatar_icon

Revision ID: b2f4d8a61c37
Revises: e5a9c1f47b20
Create Date: 2026-10-01 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'b2f4d8a61c37'
down_revision = 'e5a9c1f47b20'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('degrees', sa.Column('icon', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('users', sa.Column('avatar_icon', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_icon')
    op.drop_column('degrees', 'icon')

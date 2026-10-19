"""official OpuLi team posts in the forum and in course tips (as_team, tip pinning)

Revision ID: a7d2e9c4f1b3
Revises: e2c6f8a1b4d9
Create Date: 2026-10-19 22:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7d2e9c4f1b3'
down_revision = 'e2c6f8a1b4d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('forum_posts', sa.Column('as_team', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('course_posts', sa.Column('as_team', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('course_posts', sa.Column('pinned_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('course_posts', 'pinned_at')
    op.drop_column('course_posts', 'as_team')
    op.drop_column('forum_posts', 'as_team')

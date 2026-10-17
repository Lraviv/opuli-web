"""course pass grade and exam term

Revision ID: c3f8a2d6e914
Revises: b9d3f1a7c520
Create Date: 2026-10-17 13:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'c3f8a2d6e914'
down_revision = 'b9d3f1a7c520'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('courses', sa.Column('pass_grade', sa.Float(), nullable=True))
    op.add_column('exams', sa.Column('term', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('exams', 'term')
    op.drop_column('courses', 'pass_grade')

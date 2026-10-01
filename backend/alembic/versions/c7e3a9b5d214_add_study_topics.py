"""add study_topics

Revision ID: c7e3a9b5d214
Revises: b2f4d8a61c37
Create Date: 2026-10-01 13:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'c7e3a9b5d214'
down_revision = 'b2f4d8a61c37'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'study_topics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('is_done', sa.Boolean(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_study_topics_course_id'), 'study_topics', ['course_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_study_topics_course_id'), table_name='study_topics')
    op.drop_table('study_topics')

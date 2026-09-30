"""Add UserReminder and CourseItem notes

Revision ID: 8ccd834e50a0
Revises: a91d4e6c3f57
Create Date: 2026-09-03 00:23:10.966614

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = '8ccd834e50a0'
down_revision = 'a91d4e6c3f57'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # הטבלה user_reminders חסרה במקור במיגרציה הזו (בפיתוח היא נוצרה ע"י create_all),
    # כך שהרצת המיגרציות על מסד ריק נכשלה. completed_at נוסף ב-6be72a57a916.
    op.create_table(
        'user_reminders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('is_done', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_reminders_user_id'), 'user_reminders', ['user_id'], unique=False)
    op.add_column('course_items', sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('course_items', 'notes')
    op.drop_index(op.f('ix_user_reminders_user_id'), table_name='user_reminders')
    op.drop_table('user_reminders')

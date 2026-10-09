"""email reminders: per-user on/off switches and sent-at markers

Revision ID: a4d2f6b8c913
Revises: e8a1d4c27f90
Create Date: 2026-10-09 22:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4d2f6b8c913'
down_revision = 'e8a1d4c27f90'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ('email_notify_assignments', 'email_notify_exams', 'email_notify_reminders'):
        op.add_column('users', sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.true()))
    for table in ('course_items', 'exams', 'user_reminders'):
        op.add_column(table, sa.Column('email_sent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    for table in ('course_items', 'exams', 'user_reminders'):
        op.drop_column(table, 'email_sent_at')
    for column in ('email_notify_assignments', 'email_notify_exams', 'email_notify_reminders'):
        op.drop_column('users', column)

"""student forum: posts, comments, votes, rsvps, saves and reports

Revision ID: e2c6f8a1b4d9
Revises: c3f8a2d6e914
Create Date: 2026-10-18 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'e2c6f8a1b4d9'
down_revision = 'c3f8a2d6e914'
branch_labels = None
depends_on = None

STR = sqlmodel.sql.sqltypes.AutoString


def upgrade() -> None:
    op.create_table(
        'forum_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('institution', STR(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category', STR(), nullable=False),
        sa.Column('title', STR(), nullable=False),
        sa.Column('body', STR(), nullable=False),
        sa.Column('shared_course_id', sa.Integer(), nullable=True),
        sa.Column('event_starts_at', sa.DateTime(), nullable=True),
        sa.Column('event_ends_at', sa.DateTime(), nullable=True),
        sa.Column('place_public', STR(), nullable=True),
        sa.Column('place_private', STR(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('comment_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('going_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('pinned_at', sa.DateTime(), nullable=True),
        sa.Column('hidden_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['shared_course_id'], ['shared_courses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    for col in ('institution', 'user_id', 'category', 'shared_course_id', 'created_at'):
        op.create_index(op.f(f'ix_forum_posts_{col}'), 'forum_posts', [col], unique=False)

    op.create_table(
        'forum_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('reply_to_user_id', sa.Integer(), nullable=True),
        sa.Column('body', STR(), nullable=False),
        sa.Column('reply_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('hidden_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['post_id'], ['forum_posts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['parent_id'], ['forum_comments.id']),
        sa.ForeignKeyConstraint(['reply_to_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    for col in ('post_id', 'user_id', 'parent_id'):
        op.create_index(op.f(f'ix_forum_comments_{col}'), 'forum_comments', [col], unique=False)

    for table in ('forum_votes', 'forum_rsvps', 'forum_saves'):
        op.create_table(
            table,
            sa.Column('post_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['post_id'], ['forum_posts.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('post_id', 'user_id'),
        )

    op.create_table(
        'forum_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_type', STR(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('reporter_id', sa.Integer(), nullable=False),
        sa.Column('reason', STR(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('target_type', 'target_id', 'reporter_id', name='uq_forum_reports_target_reporter'),
    )
    op.create_index(op.f('ix_forum_reports_target_id'), 'forum_reports', ['target_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_forum_reports_target_id'), table_name='forum_reports')
    op.drop_table('forum_reports')
    for table in ('forum_saves', 'forum_rsvps', 'forum_votes'):
        op.drop_table(table)
    for col in ('parent_id', 'user_id', 'post_id'):
        op.drop_index(op.f(f'ix_forum_comments_{col}'), table_name='forum_comments')
    op.drop_table('forum_comments')
    for col in ('created_at', 'shared_course_id', 'category', 'user_id', 'institution'):
        op.drop_index(op.f(f'ix_forum_posts_{col}'), table_name='forum_posts')
    op.drop_table('forum_posts')

"""study tools v2: grading rules, assignment kind, degree requirements, links, class sessions, calendar token

Revision ID: e8a1d4c27f90
Revises: c7e3a9b5d214
Create Date: 2026-10-02 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'e8a1d4c27f90'
down_revision = 'c7e3a9b5d214'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # כללי הציון של הקורס
    op.add_column('courses', sa.Column('exam_weight', sa.Float(), nullable=True))
    op.add_column('courses', sa.Column('min_exam_grade', sa.Float(), nullable=True))
    op.add_column('courses', sa.Column('min_assignments_count', sa.Integer(), nullable=True))
    op.add_column('courses', sa.Column('min_assignments_weight', sa.Float(), nullable=True))
    op.add_column(
        'courses',
        sa.Column('assignments_shield', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # סוג מטלה (ממ"ן/ממ"ח) וחובה
    assignment_kind = sa.Enum('mmn', 'mmh', 'other', name='assignmentkind')
    assignment_kind.create(op.get_bind(), checkfirst=True)
    op.add_column('course_items', sa.Column('kind', assignment_kind, nullable=True))
    op.add_column(
        'course_items',
        sa.Column('is_mandatory', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # טוקן מנוי יומן
    op.add_column('users', sa.Column('calendar_token', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_index(op.f('ix_users_calendar_token'), 'users', ['calendar_token'], unique=True)

    op.create_table(
        'degree_requirements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('degree_id', sa.Integer(), nullable=False),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('min_credits', sa.Float(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['degree_id'], ['degrees.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_degree_requirements_degree_id'), 'degree_requirements', ['degree_id'], unique=False)

    op.create_table(
        'links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=True),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('url', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_links_user_id'), 'links', ['user_id'], unique=False)
    op.create_index(op.f('ix_links_course_id'), 'links', ['course_id'], unique=False)

    op.create_table(
        'class_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('weekday', sa.Integer(), nullable=False),
        sa.Column('start_time', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('end_time', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('location', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('interval_weeks', sa.Integer(), nullable=False),
        sa.Column('start_date', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('end_date', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_class_sessions_course_id'), 'class_sessions', ['course_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_class_sessions_course_id'), table_name='class_sessions')
    op.drop_table('class_sessions')
    op.drop_index(op.f('ix_links_course_id'), table_name='links')
    op.drop_index(op.f('ix_links_user_id'), table_name='links')
    op.drop_table('links')
    op.drop_index(op.f('ix_degree_requirements_degree_id'), table_name='degree_requirements')
    op.drop_table('degree_requirements')
    op.drop_index(op.f('ix_users_calendar_token'), table_name='users')
    op.drop_column('users', 'calendar_token')
    op.drop_column('course_items', 'is_mandatory')
    op.drop_column('course_items', 'kind')
    sa.Enum(name='assignmentkind').drop(op.get_bind(), checkfirst=True)
    op.drop_column('courses', 'assignments_shield')
    op.drop_column('courses', 'min_assignments_weight')
    op.drop_column('courses', 'min_assignments_count')
    op.drop_column('courses', 'min_exam_grade')
    op.drop_column('courses', 'exam_weight')

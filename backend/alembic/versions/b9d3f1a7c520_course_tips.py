"""course tips: shared courses, posts and anonymous votes

Revision ID: b9d3f1a7c520
Revises: a4d2f6b8c913
Create Date: 2026-10-10 19:30:00.000000

"""
import re

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'b9d3f1a7c520'
down_revision = 'a4d2f6b8c913'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'shared_courses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('institution', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('institution', 'code', name='uq_shared_courses_institution_code'),
    )

    with op.batch_alter_table('courses') as batch_op:
        batch_op.add_column(sa.Column('course_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('shared_course_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_courses_shared_course_id', ['shared_course_id'], unique=False)
        batch_op.create_foreign_key('fk_courses_shared_course_id', 'shared_courses', ['shared_course_id'], ['id'])

    op.create_table(
        'course_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shared_course_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('reply_to_user_id', sa.Integer(), nullable=True),
        sa.Column('body', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reply_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['shared_course_id'], ['shared_courses.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['parent_id'], ['course_posts.id']),
        sa.ForeignKeyConstraint(['reply_to_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_course_posts_shared_course_id'), 'course_posts', ['shared_course_id'], unique=False)
    op.create_index(op.f('ix_course_posts_user_id'), 'course_posts', ['user_id'], unique=False)
    op.create_index(op.f('ix_course_posts_parent_id'), 'course_posts', ['parent_id'], unique=False)

    op.create_table(
        'course_post_votes',
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('value', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['course_posts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('post_id', 'user_id'),
    )

    # מספר קורס לקורסים קיימים שנבחרו מקטלוג של תבנית ("מספר קורס: 20441" בהערות)
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT courses.id, catalog_courses.notes FROM courses "
            "JOIN catalog_courses ON catalog_courses.id = courses.catalog_course_id "
            "WHERE courses.course_code IS NULL AND catalog_courses.notes IS NOT NULL"
        )
    ).fetchall()
    for course_id, notes in rows:
        match = re.search(r"מספר קורס:\s*([0-9A-Za-z-]+)", notes)
        if match:
            conn.execute(
                sa.text("UPDATE courses SET course_code = :code WHERE id = :id"),
                {"code": match.group(1), "id": course_id},
            )


def downgrade() -> None:
    op.drop_table('course_post_votes')
    op.drop_index(op.f('ix_course_posts_parent_id'), table_name='course_posts')
    op.drop_index(op.f('ix_course_posts_user_id'), table_name='course_posts')
    op.drop_index(op.f('ix_course_posts_shared_course_id'), table_name='course_posts')
    op.drop_table('course_posts')
    with op.batch_alter_table('courses') as batch_op:
        batch_op.drop_constraint('fk_courses_shared_course_id', type_='foreignkey')
        batch_op.drop_index('ix_courses_shared_course_id')
        batch_op.drop_column('shared_course_id')
        batch_op.drop_column('course_code')
    op.drop_table('shared_courses')

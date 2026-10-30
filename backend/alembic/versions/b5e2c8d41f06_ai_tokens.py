"""ai tokens: access tokens for AI apps connecting to the MCP server

Revision ID: b5e2c8d41f06
Revises: a7d2e9c4f1b3
Create Date: 2026-10-30 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'b5e2c8d41f06'
down_revision = 'a7d2e9c4f1b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ai_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('token_prefix', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('kind', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('client_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('scopes', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ai_tokens_user_id'), 'ai_tokens', ['user_id'], unique=False)
    op.create_index(op.f('ix_ai_tokens_token_hash'), 'ai_tokens', ['token_hash'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_tokens_token_hash'), table_name='ai_tokens')
    op.drop_index(op.f('ix_ai_tokens_user_id'), table_name='ai_tokens')
    op.drop_table('ai_tokens')

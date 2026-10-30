"""oauth: dynamic clients, pending authorizations, grant_id on ai_tokens

Revision ID: c3f8a1d92e57
Revises: b5e2c8d41f06
Create Date: 2026-10-30 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'c3f8a1d92e57'
down_revision = 'b5e2c8d41f06'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'oauth_clients',
        sa.Column('client_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('client_name', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('client_info', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('client_id'),
    )
    op.create_table(
        'oauth_authorizations',
        sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('client_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('params', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('granted_scopes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('code_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('consumed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_oauth_authorizations_client_id'), 'oauth_authorizations', ['client_id'], unique=False)
    op.create_index(op.f('ix_oauth_authorizations_code_hash'), 'oauth_authorizations', ['code_hash'], unique=True)
    op.add_column('ai_tokens', sa.Column('grant_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_index(op.f('ix_ai_tokens_grant_id'), 'ai_tokens', ['grant_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_tokens_grant_id'), table_name='ai_tokens')
    op.drop_column('ai_tokens', 'grant_id')
    op.drop_index(op.f('ix_oauth_authorizations_code_hash'), table_name='oauth_authorizations')
    op.drop_index(op.f('ix_oauth_authorizations_client_id'), table_name='oauth_authorizations')
    op.drop_table('oauth_authorizations')
    op.drop_table('oauth_clients')

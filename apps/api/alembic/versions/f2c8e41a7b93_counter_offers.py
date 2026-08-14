"""counter offers

Revision ID: f2c8e41a7b93
Revises: d3b7a91c5e04
Create Date: 2026-08-13 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2c8e41a7b93'
down_revision: Union[str, Sequence[str], None] = 'd3b7a91c5e04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'trade_offer',
        sa.Column('replies_to_id', sa.Uuid(), nullable=True),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_offer_replies_to_id'), 'trade_offer', ['replies_to_id'],
        unique=False, schema='pokedex',
    )
    op.create_foreign_key(
        'fk_trade_offer_replies_to_id', 'trade_offer', 'trade_offer',
        ['replies_to_id'], ['id'],
        source_schema='pokedex', referent_schema='pokedex', ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_trade_offer_replies_to_id', 'trade_offer', schema='pokedex', type_='foreignkey')
    op.drop_index(op.f('ix_pokedex_trade_offer_replies_to_id'), table_name='trade_offer', schema='pokedex')
    op.drop_column('trade_offer', 'replies_to_id', schema='pokedex')

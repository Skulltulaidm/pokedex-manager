"""trade listings

Revision ID: c4d5e60f7a18
Revises: b71d3f0c2e84
Create Date: 2026-08-13 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4d5e60f7a18'
down_revision: Union[str, Sequence[str], None] = 'b71d3f0c2e84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'trade_listing',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('open', 'taken', 'cancelled', name='listing_status', schema='pokedex'),
            nullable=False,
        ),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('offer_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('taken_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['auth.user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['offer_id'], ['pokedex.trade_offer.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_listing_owner_id'), 'trade_listing', ['owner_id'],
        unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_listing_status'), 'trade_listing', ['status'],
        unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_listing_offer_id'), 'trade_listing', ['offer_id'],
        unique=False, schema='pokedex',
    )

    op.create_table(
        'trade_listing_card',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('listing_id', sa.Uuid(), nullable=False),
        sa.Column('card_id', sa.String(length=64), nullable=False),
        sa.Column(
            'side',
            # Shared with trade_offer_card, which already created the type.
            postgresql.ENUM(name='offer_side', schema='pokedex', create_type=False),
            nullable=False,
        ),
        sa.Column(
            'condition',
            postgresql.ENUM(name='card_condition', schema='pokedex', create_type=False),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(['card_id'], ['pokedex.card.id']),
        sa.ForeignKeyConstraint(
            ['listing_id'], ['pokedex.trade_listing.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'listing_id', 'card_id', 'side', name='uq_trade_listing_card'
        ),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_listing_card_listing_id'), 'trade_listing_card',
        ['listing_id'], unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_listing_card_card_id'), 'trade_listing_card',
        ['card_id'], unique=False, schema='pokedex',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('trade_listing_card', schema='pokedex')
    op.drop_table('trade_listing', schema='pokedex')
    sa.Enum(name='listing_status', schema='pokedex').drop(op.get_bind(), checkfirst=True)

"""trade offers

Revision ID: d3b7a91c5e04
Revises: a4f1c07b92de
Create Date: 2026-08-13 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3b7a91c5e04'
down_revision: Union[str, Sequence[str], None] = 'a4f1c07b92de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'trade_offer',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('from_user_id', sa.String(), nullable=False),
        sa.Column('to_user_id', sa.String(), nullable=False),
        sa.Column(
            'status',
            sa.Enum(
                'pending', 'accepted', 'declined', 'withdrawn',
                name='offer_status', schema='pokedex',
            ),
            nullable=False,
        ),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['from_user_id'], ['auth.user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['to_user_id'], ['auth.user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_offer_from_user_id'), 'trade_offer', ['from_user_id'],
        unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_offer_to_user_id'), 'trade_offer', ['to_user_id'],
        unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_offer_status'), 'trade_offer', ['status'],
        unique=False, schema='pokedex',
    )

    op.create_table(
        'trade_offer_card',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('offer_id', sa.Uuid(), nullable=False),
        sa.Column('card_id', sa.String(length=64), nullable=False),
        sa.Column(
            'side',
            sa.Enum('offered', 'requested', name='offer_side', schema='pokedex'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['card_id'], ['pokedex.card.id']),
        sa.ForeignKeyConstraint(['offer_id'], ['pokedex.trade_offer.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('offer_id', 'card_id', 'side', name='uq_trade_offer_card'),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_offer_card_offer_id'), 'trade_offer_card', ['offer_id'],
        unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_trade_offer_card_card_id'), 'trade_offer_card', ['card_id'],
        unique=False, schema='pokedex',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('trade_offer_card', schema='pokedex')
    op.drop_table('trade_offer', schema='pokedex')
    for enum_name in ('offer_side', 'offer_status'):
        sa.Enum(name=enum_name, schema='pokedex').drop(op.get_bind(), checkfirst=True)

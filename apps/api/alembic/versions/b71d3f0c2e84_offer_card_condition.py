"""offer card condition

Revision ID: b71d3f0c2e84
Revises: f2c8e41a7b93
Create Date: 2026-08-13 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b71d3f0c2e84'
down_revision: Union[str, Sequence[str], None] = 'f2c8e41a7b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'trade_offer_card',
        sa.Column(
            'condition',
            sa.Enum(
                'mint', 'near_mint', 'lightly_played', 'moderately_played',
                'heavily_played', 'damaged',
                name='card_condition', schema='pokedex',
            ),
            nullable=False,
            server_default='near_mint',
        ),
        schema='pokedex',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('trade_offer_card', 'condition', schema='pokedex')

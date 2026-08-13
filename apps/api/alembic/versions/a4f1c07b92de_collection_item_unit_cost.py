"""collection item unit cost

Revision ID: a4f1c07b92de
Revises: c8b10ea0425b
Create Date: 2026-08-13 08:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4f1c07b92de'
down_revision: Union[str, Sequence[str], None] = 'c8b10ea0425b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'collection_item',
        sa.Column('unit_cost_usd', sa.Numeric(precision=10, scale=2), nullable=True),
        schema='pokedex',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('collection_item', 'unit_cost_usd', schema='pokedex')

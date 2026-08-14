"""direct messages

Revision ID: d7a41f0c92be
Revises: c4d5e60f7a18
Create Date: 2026-08-13 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a41f0c92be'
down_revision: Union[str, Sequence[str], None] = 'c4d5e60f7a18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'direct_thread',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('first_user_id', sa.Text(), nullable=False),
        sa.Column('second_user_id', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['first_user_id'], ['auth.user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['second_user_id'], ['auth.user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('first_user_id', 'second_user_id', name='uq_direct_thread_pair'),
        sa.CheckConstraint('first_user_id < second_user_id', name='ck_direct_thread_ordered'),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_direct_thread_first_user_id'), 'direct_thread',
        ['first_user_id'], unique=False, schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_direct_thread_second_user_id'), 'direct_thread',
        ['second_user_id'], unique=False, schema='pokedex',
    )

    op.create_table(
        'direct_message',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('thread_id', sa.Uuid(), nullable=False),
        sa.Column('sender_id', sa.Text(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(),
            server_default=sa.text('clock_timestamp()'), nullable=False,
        ),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ['thread_id'], ['pokedex.direct_thread.id'], ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(['sender_id'], ['auth.user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='pokedex',
    )
    op.create_index(
        op.f('ix_pokedex_direct_message_sender_id'), 'direct_message',
        ['sender_id'], unique=False, schema='pokedex',
    )
    op.create_index(
        'ix_direct_message_thread_created', 'direct_message',
        ['thread_id', 'created_at'], unique=False, schema='pokedex',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('direct_message', schema='pokedex')
    op.drop_table('direct_thread', schema='pokedex')

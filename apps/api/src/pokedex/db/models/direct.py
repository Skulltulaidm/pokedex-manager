from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from pokedex.db.base import Base
from pokedex.db.models.collection import AUTH_USER_ID, SCHEMA


class DirectThread(Base):
    """The one conversation two collectors have.

    The pair is stored sorted rather than as an author and an addressee, which
    is what lets the database hold the pair unique: with a from/to pair the same
    two people can open two threads by writing to each other at once, and every
    read then has to union both halves back together.

    There is no participant table because there is no third participant. A
    trade is between two people and so is talking about it.
    """

    __tablename__ = "direct_thread"
    __table_args__ = (
        UniqueConstraint("first_user_id", "second_user_id", name="uq_direct_thread_pair"),
        CheckConstraint("first_user_id < second_user_id", name="ck_direct_thread_ordered"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    first_user_id: Mapped[str] = mapped_column(
        ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True
    )
    second_user_id: Mapped[str] = mapped_column(
        ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True
    )

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class DirectMessage(Base):
    """Something one of the two said.

    `read_at` needs no owner: in a thread of two, whoever did not write the
    message is the only person who can read it.
    """

    __tablename__ = "direct_message"
    __table_args__ = (
        # A thread is always read in order and never as a global feed.
        Index("ix_direct_message_thread_created", "thread_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    thread_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{SCHEMA}.direct_thread.id", ondelete="CASCADE")
    )
    sender_id: Mapped[str] = mapped_column(
        ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True
    )

    body: Mapped[str] = mapped_column(Text)
    # The wall clock, not `now()`: `now()` is the transaction's start, so two
    # messages written in one transaction share a timestamp and the thread has
    # no order to read it in.
    created_at: Mapped[datetime] = mapped_column(server_default=func.clock_timestamp())
    read_at: Mapped[datetime | None]

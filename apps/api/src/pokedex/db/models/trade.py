import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pokedex.db.base import Base
from pokedex.db.models.collection import AUTH_USER_ID, SCHEMA, pg_enum


class OfferStatus(enum.StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    WITHDRAWN = "withdrawn"


class OfferSide(enum.StrEnum):
    """Which way a card travels. Named from the proposer's side, which is the
    only fixed reference: `you give` and `you get` depend on who is reading."""

    OFFERED = "offered"
    REQUESTED = "requested"


class TradeOffer(Base):
    """A proposal between two collectors.

    Accepting records that both agreed; it moves no cards. The collection is
    what somebody physically holds, and only the person holding the card knows
    it arrived — the same rule that keeps the assistant from filing cards.
    """

    __tablename__ = "trade_offer"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    from_user_id: Mapped[str] = mapped_column(
        ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True
    )
    to_user_id: Mapped[str] = mapped_column(
        ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True
    )

    status: Mapped[OfferStatus] = mapped_column(
        pg_enum(OfferStatus, "offer_status"), default=OfferStatus.PENDING, index=True
    )
    message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    responded_at: Mapped[datetime | None]

    cards: Mapped[list["TradeOfferCard"]] = relationship(
        back_populates="offer", cascade="all, delete-orphan", lazy="raise"
    )


class TradeOfferCard(Base):
    """One card on one side of an offer.

    Quantity is deliberately absent: an offer names cards, and how many copies
    change hands is settled when the two of them meet. Recording a number here
    would look like a commitment the app cannot hold anyone to.
    """

    __tablename__ = "trade_offer_card"
    __table_args__ = (
        UniqueConstraint("offer_id", "card_id", "side", name="uq_trade_offer_card"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    offer_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{SCHEMA}.trade_offer.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(ForeignKey(f"{SCHEMA}.card.id"), index=True)
    side: Mapped[OfferSide] = mapped_column(pg_enum(OfferSide, "offer_side"))

    offer: Mapped[TradeOffer] = relationship(back_populates="cards", lazy="raise")

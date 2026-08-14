import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pokedex.db.base import Base
from pokedex.db.models.collection import AUTH_USER_ID, SCHEMA, CardCondition, pg_enum


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


class ListingStatus(enum.StrEnum):
    OPEN = "open"
    TAKEN = "taken"
    CANCELLED = "cancelled"


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

    # An offer made in answer to another. The original is declined at the same
    # time, so a chain is a history of what each side asked for, not open offers.
    replies_to_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA}.trade_offer.id", ondelete="SET NULL"), index=True
    )

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

    Condition is not absent, because it is most of the price. A near mint card
    and a damaged one are the same row without it, and worth several times each
    other.
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
    # Copied onto the offer rather than pointed at a collection row: an offer is
    # a promise about a card in a state, and it has to survive its owner editing
    # or deleting the row it came from.
    condition: Mapped[CardCondition] = mapped_column(
        pg_enum(CardCondition, "card_condition"), default=CardCondition.NEAR_MINT
    )

    offer: Mapped[TradeOffer] = relationship(back_populates="cards", lazy="raise")


class TradeListing(Base):
    """A swap published to nobody in particular.

    An offer has an address and a listing does not, and that is the whole
    difference: anyone who holds what it asks for can take it, and taking it is
    the agreement. Taking one writes a TradeOffer that is already accepted, so
    a trade that started on the board and one that started as a proposal are
    the same thing from then on.
    """

    __tablename__ = "trade_listing"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    owner_id: Mapped[str] = mapped_column(
        ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True
    )

    status: Mapped[ListingStatus] = mapped_column(
        pg_enum(ListingStatus, "listing_status"), default=ListingStatus.OPEN, index=True
    )
    note: Mapped[str | None] = mapped_column(Text)

    # The trade it turned into. Whoever took it is that offer's recipient, and
    # keeping the taker only there stops the two records from disagreeing.
    offer_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA}.trade_offer.id", ondelete="SET NULL"), index=True
    )

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    taken_at: Mapped[datetime | None]

    cards: Mapped[list["TradeListingCard"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", lazy="raise"
    )


class TradeListingCard(Base):
    """One card on one side of a listing, in the publisher's terms.

    `OFFERED` is what the publisher hands over and `REQUESTED` what they are
    asking for, the same way round as on an offer.
    """

    __tablename__ = "trade_listing_card"
    __table_args__ = (
        UniqueConstraint("listing_id", "card_id", "side", name="uq_trade_listing_card"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    listing_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{SCHEMA}.trade_listing.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(ForeignKey(f"{SCHEMA}.card.id"), index=True)
    side: Mapped[OfferSide] = mapped_column(pg_enum(OfferSide, "offer_side"))
    # Only the given side has one: what state a wanted card arrives in is
    # whoever takes the listing to answer, and there is nobody to ask yet.
    condition: Mapped[CardCondition | None] = mapped_column(
        pg_enum(CardCondition, "card_condition")
    )

    listing: Mapped[TradeListing] = relationship(back_populates="cards", lazy="raise")

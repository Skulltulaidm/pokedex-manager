from datetime import datetime

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from pokedex.db.base import Base
from pokedex.db.models.collection import SCHEMA


class SpeciesTrivia(Base):
    """One generated blurb per species, shared by every user.

    Cached because the text does not depend on who is reading it: a species is
    the same species for everyone, so paying for it once is the whole point.
    """

    __tablename__ = "species_trivia"

    species_id: Mapped[int] = mapped_column(
        ForeignKey(f"{SCHEMA}.species.id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from pokedex.db.base import Base
from pokedex.db.models.collection import AUTH_USER_ID


class ShareLink(Base):
    """A revocable read-only view of one user's collection.

    Revoking keeps the row rather than deleting it, so a link that stops working
    is distinguishable from one that never existed.
    """

    __tablename__ = "share_link"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[str] = mapped_column(ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True)

    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked_at: Mapped[datetime | None]

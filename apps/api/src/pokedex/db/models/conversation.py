import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from pokedex.db.base import Base
from pokedex.db.models.collection import AUTH_USER_ID, SCHEMA, pg_enum


class MessageRole(enum.StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class Conversation(Base):
    __tablename__ = "conversation"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[str] = mapped_column(ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class Message(Base):
    """One row per model message, storing the framework's payload verbatim.

    A resumed conversation replays with its tool calls intact rather than as a
    lossy transcript.
    """

    __tablename__ = "message"
    __table_args__ = (
        # History is always read as one conversation in order, never as a global feed.
        Index("ix_message_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{SCHEMA}.conversation.id", ondelete="CASCADE")
    )

    role: Mapped[MessageRole] = mapped_column(pg_enum(MessageRole, "message_role"))
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Denormalized for listing a conversation without deserializing every payload.
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class UserPreference(Base):
    """Durable facts the agent learned about the user, one row per key."""

    __tablename__ = "user_preference"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_preference_key"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[str] = mapped_column(ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True)

    key: Mapped[str] = mapped_column(String(64))
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

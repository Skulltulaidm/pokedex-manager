from typing import Any
from uuid import UUID

import pydantic_core
from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import Conversation, Message, MessageRole

TITLE_MAX = 60
# Older turns are dropped rather than summarized: the collection tools re-read live
# data on every turn, so distant history adds cost without adding accuracy.
HISTORY_LIMIT = 20


async def get_conversation(
    db: AsyncSession, user_id: str, conversation_id: UUID
) -> Conversation | None:
    """Scoped by user: an id alone must never be enough to read someone's chat."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def list_conversations(db: AsyncSession, user_id: str) -> list[Conversation]:
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars())


async def list_messages(db: AsyncSession, conversation_id: UUID) -> list[Message]:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return list(result.scalars())


def title_from(first_message: str) -> str:
    """The opening question, trimmed — enough to recognize the thread in a list."""
    title = " ".join(first_message.split())
    if len(title) > TITLE_MAX:
        title = title[: TITLE_MAX - 1].rstrip() + "…"
    return title


async def start_conversation(db: AsyncSession, user_id: str, first_message: str) -> Conversation:
    conversation = Conversation(user_id=user_id, title=title_from(first_message))
    db.add(conversation)
    await db.flush()
    return conversation


async def load_history(db: AsyncSession, conversation_id: UUID) -> list[ModelMessage]:
    result = await db.execute(
        select(Message.content)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    payloads = [row for (row,) in result][::-1]
    return ModelMessagesTypeAdapter.validate_python(payloads)


# A turn with tool calls is not one question and one answer: it is request, tool
# call, tool return, answer. Only two of those parts were ever written by a person
# or shown to one, and those are the kinds listed here.
VISIBLE_PARTS = {"user-prompt", "text"}


def _visible_text(payload: dict[str, Any]) -> str:
    parts = [
        part.get("content", "")
        for part in payload.get("parts", [])
        if part.get("part_kind") in VISIBLE_PARTS
    ]
    return "\n".join(chunk for chunk in parts if isinstance(chunk, str)).strip()


async def save_turn(
    db: AsyncSession,
    conversation_id: UUID,
    new_messages: list[ModelMessage],
) -> None:
    """Persists the turn as the agent produced it, tool calls included."""
    serialized: list[dict[str, Any]] = pydantic_core.to_jsonable_python(new_messages)

    for payload in serialized:
        is_request = payload.get("kind") == "request"
        db.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.USER if is_request else MessageRole.ASSISTANT,
                content=payload,
                text=_visible_text(payload),
            )
        )

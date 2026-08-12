import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    ModelMessage,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
)
from pydantic_ai.run import AgentRunResultEvent

from pokedex.agent import TURN_LIMITS, build_agent, mcp_session
from pokedex.api.deps import Caller, CurrentCaller, CurrentUser, DbSession
from pokedex.config import get_settings
from pokedex.db import SessionFactory
from pokedex.schemas.chat import (
    ChatRequest,
    ConversationDetail,
    ConversationView,
    MessageView,
)
from pokedex.services import conversation as conversations

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("", response_model=list[ConversationView])
async def list_conversations(user: CurrentUser, db: DbSession) -> Any:
    return await conversations.list_conversations(db, user.id)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: UUID, user: CurrentUser, db: DbSession) -> Any:
    conversation = await conversations.get_conversation(db, user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")

    messages = await conversations.list_messages(db, conversation_id)
    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        # Tool traffic is persisted but carries no text; it is history for the model,
        # not for the reader.
        messages=[MessageView.model_validate(m) for m in messages if m.text],
    )


async def run_turn(caller: Caller, payload: ChatRequest) -> AsyncIterator[str]:
    """Streams one agent turn, then persists it.

    The database session is opened here rather than injected: a streaming body runs
    after the endpoint has returned, and a request-scoped session would already be
    closing underneath it.
    """
    settings = get_settings()
    user_id = caller.user.id
    history: list[ModelMessage] = []

    async with SessionFactory() as db:
        if payload.conversation_id is None:
            conversation = await conversations.start_conversation(db, user_id, payload.message)
        else:
            found = await conversations.get_conversation(db, user_id, payload.conversation_id)
            if found is None:
                yield sse("error", {"detail": "Conversation not found"})
                return
            conversation = found
            history = await conversations.load_history(db, conversation.id)

        yield sse("conversation", {"id": str(conversation.id), "title": conversation.title})

        try:
            async with mcp_session(settings.mcp_agent_url, caller.token) as session:
                agent = build_agent(session, settings.agent_model)
                async for event in agent.run_stream_events(
                    payload.message, message_history=history, usage_limits=TURN_LIMITS
                ):
                    match event:
                        # The opening chunk of a reply rides on the part-start
                        # event, not on a delta. Listening only for deltas drops
                        # the first words of every answer.
                        case PartStartEvent(part=TextPart(content=chunk)) if chunk:
                            yield sse("delta", {"text": chunk})
                        case PartDeltaEvent(delta=TextPartDelta(content_delta=chunk)) if chunk:
                            yield sse("delta", {"text": chunk})
                        case FunctionToolCallEvent(part=part):
                            yield sse("tool", {"name": part.tool_name})
                        case AgentRunResultEvent(result=result):
                            await conversations.save_turn(
                                db, conversation.id, result.new_messages()
                            )
                            await db.commit()
                            yield sse("done", {"conversation_id": str(conversation.id)})
        except Exception:
            # A failed turn is not worth half-persisting: the history it would leave
            # behind is one the model never actually produced.
            await db.rollback()
            logger.exception("chat turn failed")
            yield sse("error", {"detail": "El asistente no está disponible en este momento."})


@router.post("", response_class=StreamingResponse)
async def send_message(payload: ChatRequest, caller: CurrentCaller) -> StreamingResponse:
    if not get_settings().agent_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El chat requiere una API key de modelo configurada.",
        )

    return StreamingResponse(
        run_turn(caller, payload),
        media_type="text/event-stream",
        # Without this an intermediary can buffer the whole stream and deliver it at
        # the end, which looks exactly like the model being slow.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

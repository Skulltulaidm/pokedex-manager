from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from pokedex.db.models.conversation import MessageRole


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: UUID | None = None


class MessageView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: MessageRole
    text: str
    created_at: datetime


class ConversationView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationView):
    messages: list[MessageView]

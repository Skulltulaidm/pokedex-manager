from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import UserPreference

MAX_PREFERENCES = 20


async def remember(db: AsyncSession, user_id: str, key: str, value: str) -> UserPreference:
    statement = (
        insert(UserPreference)
        .values(user_id=user_id, key=key, value={"text": value})
        .on_conflict_do_update(
            constraint="uq_user_preference_key", set_={"value": {"text": value}}
        )
        .returning(UserPreference)
    )
    result = await db.execute(statement)
    await db.flush()
    preference: UserPreference = result.scalar_one()
    return preference


async def list_all(db: AsyncSession, user_id: str) -> list[UserPreference]:
    result = await db.execute(
        select(UserPreference)
        .where(UserPreference.user_id == user_id)
        .order_by(UserPreference.updated_at.desc())
        .limit(MAX_PREFERENCES)
    )
    return list(result.scalars())


async def forget(db: AsyncSession, user_id: str, key: str) -> bool:
    preference = await db.scalar(
        select(UserPreference).where(
            UserPreference.user_id == user_id, UserPreference.key == key
        )
    )
    if preference is None:
        return False
    await db.delete(preference)
    return True


def as_text(preferences: list[UserPreference]) -> str:
    """Preferences rendered for the agent's instructions.

    They are injected as context rather than fetched by a tool: something the
    user said once should shape every answer, not only the turns where the model
    thinks to go looking for it.
    """
    if not preferences:
        return ""

    lines = "\n".join(
        f"- {p.key}: {_text(p.value)}" for p in preferences if _text(p.value)
    )
    return f"\n\nWhat this user has told you about themselves:\n{lines}\n" if lines else ""


def _text(value: dict[str, Any]) -> str:
    text = value.get("text")
    return text if isinstance(text, str) else ""

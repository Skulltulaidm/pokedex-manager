from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import UserPreference

MAX_PREFERENCES = 20

# Rows the app keeps for itself in the same table. They are hidden from the
# preference endpoints, which promise the user a list of what the assistant
# learned about them: a bookmark the screen wrote is not that, and letting it be
# deleted there would look like forgetting a fact.
INTERNAL_PREFIX = "sys."
NOTIFICATIONS_SEEN_AT = f"{INTERNAL_PREFIX}notifications_seen_at"


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
        .where(
            UserPreference.user_id == user_id,
            ~UserPreference.key.startswith(INTERNAL_PREFIX),
        )
        .order_by(UserPreference.updated_at.desc())
        .limit(MAX_PREFERENCES)
    )
    return list(result.scalars())


async def forget(db: AsyncSession, user_id: str, key: str) -> bool:
    if key.startswith(INTERNAL_PREFIX):
        return False

    preference = await db.scalar(
        select(UserPreference).where(
            UserPreference.user_id == user_id, UserPreference.key == key
        )
    )
    if preference is None:
        return False
    await db.delete(preference)
    return True


async def mark(db: AsyncSession, user_id: str, key: str, at: datetime) -> None:
    """Record that the user reached some point in time, under an internal key."""
    value = {"at": at.isoformat()}
    await db.execute(
        insert(UserPreference)
        .values(user_id=user_id, key=key, value=value)
        .on_conflict_do_update(constraint="uq_user_preference_key", set_={"value": value})
    )
    await db.flush()


async def marked_at(db: AsyncSession, user_id: str, key: str) -> datetime | None:
    value = await db.scalar(
        select(UserPreference.value).where(
            UserPreference.user_id == user_id, UserPreference.key == key
        )
    )
    at = (value or {}).get("at")
    return datetime.fromisoformat(at) if isinstance(at, str) else None


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

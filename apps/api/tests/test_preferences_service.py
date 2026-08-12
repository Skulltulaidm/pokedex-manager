from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.services import preferences


async def test_a_preference_is_stored_and_read_back(
    db: AsyncSession, user_id: str
) -> None:
    await preferences.remember(db, user_id, "colecciona", "Solo primera edición")

    stored = await preferences.list_all(db, user_id)
    assert [(p.key, p.value["text"]) for p in stored] == [
        ("colecciona", "Solo primera edición")
    ]


async def test_remembering_the_same_key_replaces_it(
    db: AsyncSession, user_id: str
) -> None:
    """A preference is a current fact, not a log: the newest wins."""
    await preferences.remember(db, user_id, "presupuesto", "20 euros")
    await preferences.remember(db, user_id, "presupuesto", "50 euros")

    stored = await preferences.list_all(db, user_id)
    assert len(stored) == 1
    assert stored[0].value["text"] == "50 euros"


async def test_preferences_are_private_to_their_owner(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await preferences.remember(db, user_id, "colecciona", "Base Set")

    assert await preferences.list_all(db, other_user_id) == []


async def test_forgetting_removes_only_that_key(
    db: AsyncSession, user_id: str
) -> None:
    await preferences.remember(db, user_id, "colecciona", "Base Set")
    await preferences.remember(db, user_id, "evita", "Cartas dañadas")

    assert await preferences.forget(db, user_id, "colecciona") is True

    remaining = await preferences.list_all(db, user_id)
    assert [p.key for p in remaining] == ["evita"]


async def test_forgetting_something_unknown_reports_nothing_done(
    db: AsyncSession, user_id: str
) -> None:
    assert await preferences.forget(db, user_id, "nunca-dicho") is False


async def test_nothing_remembered_adds_nothing_to_the_prompt(
    db: AsyncSession, user_id: str
) -> None:
    """An empty section would tell the model there is context when there is none."""
    assert preferences.as_text(await preferences.list_all(db, user_id)) == ""


async def test_remembered_facts_reach_the_prompt(
    db: AsyncSession, user_id: str
) -> None:
    await preferences.remember(db, user_id, "colecciona", "Solo primera edición")

    text = preferences.as_text(await preferences.list_all(db, user_id))
    assert "colecciona: Solo primera edición" in text

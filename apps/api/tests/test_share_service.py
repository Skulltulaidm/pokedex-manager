from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.services import share
from pokedex.services.share import TOKEN_BYTES


async def test_a_link_is_created_once_and_reused(
    db: AsyncSession, user_id: str
) -> None:
    """Asking twice must not strand the first link as an orphan nobody can revoke."""
    first = await share.create(db, user_id)
    second = await share.create(db, user_id)

    assert first.id == second.id
    assert first.token == second.token


async def test_the_token_is_long_enough_to_be_unguessable(
    db: AsyncSession, user_id: str
) -> None:
    link = await share.create(db, user_id)

    assert len(link.token) >= TOKEN_BYTES


async def test_two_users_get_different_tokens(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    mine = await share.create(db, user_id)
    theirs = await share.create(db, other_user_id)

    assert mine.token != theirs.token


async def test_a_revoked_link_no_longer_resolves(
    db: AsyncSession, user_id: str
) -> None:
    link = await share.create(db, user_id)
    assert await share.resolve(db, link.token) is not None

    assert await share.revoke(db, user_id) is True
    assert await share.resolve(db, link.token) is None


async def test_revoking_without_a_link_reports_nothing_done(
    db: AsyncSession, user_id: str
) -> None:
    assert await share.revoke(db, user_id) is False


async def test_a_new_link_can_be_issued_after_revoking(
    db: AsyncSession, user_id: str
) -> None:
    first = await share.create(db, user_id)
    await share.revoke(db, user_id)
    second = await share.create(db, user_id)

    assert second.token != first.token
    assert await share.resolve(db, first.token) is None
    assert await share.resolve(db, second.token) is not None


async def test_an_unknown_token_resolves_to_nothing(db: AsyncSession) -> None:
    assert await share.resolve(db, "not-a-real-token") is None

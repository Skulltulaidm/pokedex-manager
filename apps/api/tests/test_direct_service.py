import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import DirectMessage, DirectThread
from pokedex.schemas.direct import SendMessageRequest
from pokedex.services import direct
from pokedex.services.direct import MessageError

_INSERT_USER = text(
    'INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
    "VALUES (:id, :name, :email, false, now(), now())"
)


@pytest.fixture
async def outsider_id(db: AsyncSession) -> str:
    """Somebody with no part in the conversation, which is most of the point."""
    identifier = f"test-{uuid.uuid4().hex[:12]}"
    await db.execute(
        _INSERT_USER,
        {"id": identifier, "name": "Rojo", "email": f"{identifier}@example.test"},
    )
    return identifier


async def say(db: AsyncSession, sender: str, recipient: str, body: str) -> None:
    sent = await direct.send(db, sender, SendMessageRequest(to_user_id=recipient, body=body))
    assert sent is not None


async def thread_of(db: AsyncSession, user_id: str, partner_id: str) -> DirectThread:
    view = await direct.thread_with(db, user_id, partner_id)
    assert view is not None and view.id is not None
    thread = await direct.get_thread(db, user_id, view.id)
    assert thread is not None
    return thread


async def test_first_message_opens_the_thread(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    message = await direct.send(
        db, user_id, SendMessageRequest(to_user_id=other_user_id, body="¿Cambiamos el Charizard?")
    )

    assert message is not None
    assert message.mine is True
    assert message.sender_id == user_id
    opened = await db.scalar(select(DirectThread.id).where(DirectThread.id == message.thread_id))
    assert opened is not None


async def test_both_sides_land_in_the_same_thread(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Whichever of the two speaks first, there is one conversation."""
    await say(db, user_id, other_user_id, "Hola")
    await say(db, other_user_id, user_id, "Hola de vuelta")

    threads = (
        await db.scalars(
            select(DirectThread).where(
                DirectThread.first_user_id.in_((user_id, other_user_id))
            )
        )
    ).all()
    assert len(threads) == 1


async def test_the_author_is_the_caller_not_the_request(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """There is no field that names a writer, so nobody can be written as."""
    await say(db, user_id, other_user_id, "La mía")
    await say(db, other_user_id, user_id, "La suya")

    thread = await thread_of(db, user_id, other_user_id)
    page = await direct.message_page(db, user_id, thread.id)

    assert page is not None
    assert [(m.body, m.sender_id, m.mine) for m in page.items] == [
        ("La mía", user_id, True),
        ("La suya", other_user_id, False),
    ]


async def test_an_outsider_cannot_read_the_thread(
    db: AsyncSession, user_id: str, other_user_id: str, outsider_id: str
) -> None:
    await say(db, user_id, other_user_id, "Algo privado")
    thread = await thread_of(db, user_id, other_user_id)

    assert await direct.get_thread(db, outsider_id, thread.id) is None
    assert await direct.message_page(db, outsider_id, thread.id) is None


async def test_an_outsider_cannot_mark_the_thread_read(
    db: AsyncSession, user_id: str, other_user_id: str, outsider_id: str
) -> None:
    await say(db, user_id, other_user_id, "Sin leer")
    thread = await thread_of(db, user_id, other_user_id)

    assert await direct.mark_read(db, outsider_id, thread.id) is None

    unread = await db.scalar(
        select(DirectMessage.read_at).where(DirectMessage.thread_id == thread.id)
    )
    assert unread is None


async def test_a_thread_never_shows_up_in_an_outsiders_list(
    db: AsyncSession, user_id: str, other_user_id: str, outsider_id: str
) -> None:
    await say(db, user_id, other_user_id, "Charizard")

    assert (await direct.thread_page(db, outsider_id)).total == 0
    assert (await direct.thread_page(db, outsider_id, search="Charizard")).total == 0
    assert (await direct.thread_page(db, user_id)).total == 1


async def test_unread_counts_only_what_the_other_one_said(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await say(db, user_id, other_user_id, "Uno")
    await say(db, user_id, other_user_id, "Dos")
    await say(db, other_user_id, user_id, "Tres")

    mine = await direct.thread_with(db, user_id, other_user_id)
    theirs = await direct.thread_with(db, other_user_id, user_id)

    assert mine is not None and mine.unread == 1
    assert theirs is not None and theirs.unread == 2


async def test_reading_does_not_clear_your_own_messages(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Marking read is about what you read, never about what you wrote."""
    await say(db, user_id, other_user_id, "Mío sin leer")
    await say(db, other_user_id, user_id, "Suyo sin leer")
    thread = await thread_of(db, user_id, other_user_id)

    view = await direct.mark_read(db, user_id, thread.id)

    assert view is not None and view.unread == 0
    theirs = await direct.thread_with(db, other_user_id, user_id)
    assert theirs is not None and theirs.unread == 1


async def test_thread_list_previews_the_last_message(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await say(db, user_id, other_user_id, "Primero")
    await say(db, other_user_id, user_id, "Último")

    page = await direct.thread_page(db, user_id)

    assert page.total == 1
    assert page.items[0].last_body == "Último"
    assert page.items[0].last_mine is False
    assert page.items[0].partner_name == "Dani"


async def test_search_matches_a_name_or_something_said(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await say(db, user_id, other_user_id, "Te cambio el Blastoise")

    assert (await direct.thread_page(db, user_id, search="dani")).total == 1
    assert (await direct.thread_page(db, user_id, search="blastoise")).total == 1
    assert (await direct.thread_page(db, user_id, search="pikachu")).total == 0


async def test_messages_page_from_the_newest_end(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    for index in range(5):
        await say(db, user_id, other_user_id, f"mensaje {index}")
    thread = await thread_of(db, user_id, other_user_id)

    first = await direct.message_page(db, user_id, thread.id, limit=2, offset=0)
    second = await direct.message_page(db, user_id, thread.id, limit=2, offset=2)

    assert first is not None and second is not None
    assert first.total == 5
    assert [m.body for m in first.items] == ["mensaje 3", "mensaje 4"]
    assert [m.body for m in second.items] == ["mensaje 1", "mensaje 2"]


async def test_a_conversation_with_nobody_yet(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    view = await direct.thread_with(db, user_id, other_user_id)

    assert view is not None
    assert view.id is None
    assert view.partner_name == "Dani"
    assert view.unread == 0


async def test_you_cannot_write_to_yourself(db: AsyncSession, user_id: str) -> None:
    with pytest.raises(MessageError):
        await direct.send(db, user_id, SendMessageRequest(to_user_id=user_id, body="Hola"))

    assert await direct.thread_with(db, user_id, user_id) is None


async def test_writing_to_somebody_who_does_not_exist(
    db: AsyncSession, user_id: str
) -> None:
    sent = await direct.send(db, user_id, SendMessageRequest(to_user_id="nobody", body="Hola"))

    assert sent is None


async def test_unread_by_partner_feeds_the_news(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await say(db, other_user_id, user_id, "Uno")
    await say(db, other_user_id, user_id, "Dos")

    rows = await direct.unread_by_partner(db, user_id)

    assert [(partner, count) for partner, _, count in rows] == [(other_user_id, 2)]
    assert await direct.unread_by_partner(db, other_user_id) == []

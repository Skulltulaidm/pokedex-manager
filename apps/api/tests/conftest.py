import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.session import create_engine

# Better Auth owns this table, so tests insert into it with raw SQL rather than
# duplicating its model. Its columns are camelCase and `user` is reserved.
_INSERT_USER = text(
    'INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
    "VALUES (:id, :name, :email, false, now(), now())"
)


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    """Session bound to an open transaction that is always rolled back.

    Every test sees a real Postgres — enums, check constraints and ON CONFLICT
    behave as in production — while leaving no rows behind.
    """
    engine = create_engine()
    connection = await engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()
        await engine.dispose()


@pytest.fixture
async def user_id(db: AsyncSession) -> str:
    identifier = f"test-{uuid.uuid4().hex[:12]}"
    await db.execute(
        _INSERT_USER,
        {"id": identifier, "name": "Alex", "email": f"{identifier}@example.test"},
    )
    return identifier


@pytest.fixture
async def other_user_id(db: AsyncSession) -> str:
    identifier = f"test-{uuid.uuid4().hex[:12]}"
    await db.execute(
        _INSERT_USER,
        {"id": identifier, "name": "Dani", "email": f"{identifier}@example.test"},
    )
    return identifier

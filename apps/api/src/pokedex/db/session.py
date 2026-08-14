from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from pokedex.config import get_settings

# The database role and the domain schema share the name `pokedex`, so the
# default `"$user", public` search_path would make `pokedex` the implicit
# default schema. Alembic then reports it as `None` and its schema filters stop
# matching. Pinning the path keeps every schema reference explicit.
CONNECT_ARGS = {"server_settings": {"search_path": "public"}}


def create_engine(**kwargs: object) -> AsyncEngine:
    return create_async_engine(
        get_settings().database_url,
        pool_pre_ping=True,
        connect_args=CONNECT_ARGS,
        **kwargs,
    )


engine = create_engine()
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """One transaction per request: committed on success, rolled back on error.

    The session is published on the request so `CommittingRoute` can commit it
    while the response is still being built; the commit below is what covers
    anything that never reaches that route handler.
    """
    async with SessionFactory() as session:
        request.state.db = session
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

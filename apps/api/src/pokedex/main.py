import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.routing import APIRoute
from scalar_fastapi import get_scalar_api_reference

from pokedex.api.v1 import router as v1_router
from pokedex.config import get_settings
from pokedex.db import SessionFactory, engine
from pokedex.mcp import server as mcp_server
from pokedex.services import prices

OPENAPI_URL = "/openapi.json"

log = logging.getLogger(__name__)


async def take_todays_prices() -> None:
    """Never fails the boot: a catalog that cannot be reached is a stale series,
    not a broken app."""
    try:
        async with SessionFactory() as db:
            report = await prices.refresh_prices(db)
            await db.commit()
        if not report.skipped:
            log.info("priced %s cards across %s sets", report.cards, report.sets)
    except Exception:
        log.exception("could not take today's prices")


def operation_id(route: APIRoute) -> str:
    """Name operations after the handler so the generated client reads well.

    FastAPI's default appends path and method, producing hooks like
    `useListCollectionApiV1CollectionGet`.
    """
    return route.name


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # A mounted sub-app's own lifespan never runs, so the host has to start the
    # MCP session manager. Without this the first /mcp request fails with an
    # error that points nowhere near the lifespan.
    async with mcp_server.session_manager.run():
        # Detached, because the reading walks every cached set and the app must
        # answer requests while it does.
        task = (
            asyncio.create_task(take_todays_prices())
            if get_settings().price_refresh_on_start
            else None
        )
        yield
        if task is not None:
            task.cancel()

    await engine.dispose()


app = FastAPI(
    title="PokeDex Manager API",
    version="0.1.0",
    lifespan=lifespan,
    openapi_url=OPENAPI_URL,
    generate_unique_id_function=operation_id,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/scalar", include_in_schema=False)
async def scalar_reference() -> HTMLResponse:
    return get_scalar_api_reference(openapi_url=OPENAPI_URL, title=app.title)


# Mounted at the root, and last: the MCP app carries its own /mcp route plus the
# OAuth resource metadata that discovery expects to find at the domain root.
# Starlette matches in order, so every route above still wins.
app.mount("/", mcp_server.streamable_http_app())

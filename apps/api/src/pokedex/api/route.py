from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute


class CommittingRoute(APIRoute):
    """Commits the request's transaction before its response leaves.

    FastAPI runs the half of a `yield` dependency that follows the yield after
    the response has already been sent, so `get_db`'s commit lands after the
    client is free to act on the result. A client that refetches on success then
    races its own write: the read can reach the database first and come back
    without it, which reads as a mutation that did nothing until a page reload.

    Committing here closes that window for every route on the router. The commit
    in `get_db` stays as the backstop for anything that never reaches this point.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def commit_before_responding(request: Request) -> Response:
            response = await handler(request)
            session = getattr(request.state, "db", None)
            if session is not None:
                await session.commit()
            return response

        return commit_before_responding

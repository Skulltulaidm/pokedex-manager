from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db import get_db
from pokedex.security import AuthenticatedUser, verify_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class Caller:
    """The verified user plus the token that proved it.

    The chat endpoint needs both: the id to scope its rows, and the token itself to
    open an MCP session as that same user rather than as the service.
    """

    user: AuthenticatedUser
    token: str


async def get_caller(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Caller:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    try:
        user = await verify_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    return Caller(user=user, token=credentials.credentials)


async def get_current_user(caller: Annotated[Caller, Depends(get_caller)]) -> AuthenticatedUser:
    return caller.user


CurrentCaller = Annotated[Caller, Depends(get_caller)]
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]

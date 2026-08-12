import jwt
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken

from pokedex.security import verify_token


class JwksTokenVerifier:
    """Verifies the same Better Auth JWT the REST adapter accepts.

    The MCP server is the one data surface seen from a different protocol, not a
    second door with its own rules.
    """

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            user = await verify_token(token)
        except jwt.PyJWTError:
            return None

        return AccessToken(
            token=token,
            client_id=user.id,
            scopes=[],
            subject=user.id,
            claims={"email": user.email} if user.email else {},
        )


class UnauthenticatedError(PermissionError):
    """Raised when a tool runs without a resolved user."""


def current_user_id() -> str:
    """Owner of the request, or an error.

    A tool that cannot name its user must fail rather than fall back to a
    default: the alternative is serving one person's collection to another.
    """
    token = get_access_token()
    if token is None or not token.subject:
        raise UnauthenticatedError("This tool requires an authenticated user")
    return token.subject

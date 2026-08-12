from dataclasses import dataclass
from functools import lru_cache

import jwt
from anyio import to_thread
from jwt import PyJWKClient

from pokedex.config import get_settings

# Pinned rather than read from the token header, which would allow algorithm
# confusion. Better Auth's jwt plugin issues Ed25519 keys.
ALGORITHMS = ["EdDSA"]


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: str
    email: str | None


@lru_cache
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(get_settings().auth_jwks_url)


async def verify_token(token: str) -> AuthenticatedUser:
    settings = get_settings()
    client = _jwks_client()

    # PyJWKClient fetches over blocking urllib, so keep it off the event loop.
    signing_key = await to_thread.run_sync(client.get_signing_key_from_jwt, token)

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=ALGORITHMS,
        issuer=settings.auth_issuer,
        audience=settings.auth_audience,
    )

    subject = payload.get("sub")
    if not subject:
        raise jwt.InvalidTokenError("token has no subject claim")

    return AuthenticatedUser(id=subject, email=payload.get("email"))

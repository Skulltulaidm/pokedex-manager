import secrets

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import ShareLink

# 32 bytes of urlsafe randomness. The link is the only credential guarding the
# page, so it has to be unguessable rather than merely unique.
TOKEN_BYTES = 32


async def active_link(db: AsyncSession, user_id: str) -> ShareLink | None:
    result = await db.execute(
        select(ShareLink).where(
            ShareLink.user_id == user_id, ShareLink.revoked_at.is_(None)
        )
    )
    return result.scalars().first()


async def create(db: AsyncSession, user_id: str) -> ShareLink:
    """One live link per user; asking again returns the same one."""
    existing = await active_link(db, user_id)
    if existing is not None:
        return existing

    link = ShareLink(user_id=user_id, token=secrets.token_urlsafe(TOKEN_BYTES))
    db.add(link)
    await db.flush()
    return link


async def revoke(db: AsyncSession, user_id: str) -> bool:
    link = await active_link(db, user_id)
    if link is None:
        return False

    await db.execute(
        update(ShareLink).where(ShareLink.id == link.id).values(revoked_at=func.now())
    )
    return True


async def resolve(db: AsyncSession, token: str) -> ShareLink | None:
    result = await db.execute(
        select(ShareLink).where(ShareLink.token == token, ShareLink.revoked_at.is_(None))
    )
    return result.scalar_one_or_none()

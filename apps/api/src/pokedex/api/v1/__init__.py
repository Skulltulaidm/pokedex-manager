from fastapi import APIRouter

from pokedex.api.v1 import (
    advice,
    catalog,
    chat,
    collection,
    messages,
    news,
    preferences,
    probe,
    scan,
    share,
    stats,
    trade,
    wishlist,
)

router = APIRouter(prefix="/api/v1")
router.include_router(probe.router)
router.include_router(preferences.router)
router.include_router(advice.router)
router.include_router(catalog.router)
router.include_router(chat.router)
router.include_router(collection.router)
router.include_router(messages.router)
router.include_router(news.router)
router.include_router(scan.router)
router.include_router(stats.router)
router.include_router(wishlist.router)
router.include_router(share.router)
router.include_router(trade.router)

__all__ = ["router"]

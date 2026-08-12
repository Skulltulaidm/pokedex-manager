from fastapi import APIRouter

from pokedex.api.v1 import catalog, chat, collection, probe, scan, stats, wishlist

router = APIRouter(prefix="/api/v1")
router.include_router(probe.router)
router.include_router(catalog.router)
router.include_router(chat.router)
router.include_router(collection.router)
router.include_router(scan.router)
router.include_router(stats.router)
router.include_router(wishlist.router)

__all__ = ["router"]

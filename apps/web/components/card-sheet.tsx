"use client";

import { CardDetail } from "@/components/card-detail";
import { cn } from "@workspace/ui/lib/utils";

/**
 * A card opened beside the page rather than over it.
 *
 * No backdrop and no scroll lock: the list behind stays readable and clickable,
 * so picking the next card is one click rather than close-then-open. That is
 * the difference between inspecting something and being interrupted by it —
 * a dialog is for a decision, and looking at a card is not one.
 */
export function CardSheet({
  cardId,
  onClose,
}: {
  cardId: string | null;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Detalle de la carta"
      aria-hidden={!cardId}
      className={cn(
        "bg-surface ring-edge fixed top-16 right-3 bottom-3 z-40 w-[min(26rem,calc(100vw-1.5rem))] overflow-x-hidden overflow-y-auto rounded-2xl shadow-2xl ring-1 transition-[transform,opacity] duration-200",
        cardId
          ? "translate-x-0 opacity-100"
          : "pointer-events-none translate-x-4 opacity-0",
      )}
    >
      {cardId && <CardDetail cardId={cardId} onClose={onClose} compact />}
    </aside>
  );
}

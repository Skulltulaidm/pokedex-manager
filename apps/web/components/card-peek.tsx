"use client";

import { CardDetail } from "@/components/card-detail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog";

/**
 * One card, on top of wherever you were.
 *
 * The list dialog answers "which of these"; this answers "what is this one"
 * when there is no list to come back to — a card named mid-conversation, or
 * anywhere a name is all the reader has.
 */
export function CardPeek({
  cardId,
  open,
  onClose,
}: {
  cardId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* The card screen draws its own close control beside the title. */}
      <DialogContent
        showCloseButton={false}
        className="max-h-[88svh] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
      >
        <DialogTitle className="sr-only">Ficha de la carta</DialogTitle>
        <DialogDescription className="sr-only">
          Precio, tipos y estadísticas de la carta.
        </DialogDescription>
        <CardDetail cardId={cardId} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

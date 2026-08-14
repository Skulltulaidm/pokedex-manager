"use client";

import { useState } from "react";

import { CardDetail } from "@/components/card-detail";
import { CardImage } from "@/components/card-image";
import { CardSkeleton } from "@/components/pokeball";
import { formatUsd } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";

export type DialogCard = {
  id: string;
  name: string;
  number: string;
  printedTotal: number;
  imageUrl: string | null;
  category: string;
  price: number | null;
  owned: number;
  note?: string;
};

/**
 * A list of cards and the one you opened, side by side.
 *
 * The same shape wherever cards are listed — a set, a want list, the holdings
 * on the summary — because they are the same question: which of these, and what
 * is this one. The grid narrows to two columns rather than closing, so the card
 * you opened keeps its place and the next is one click away.
 *
 * Whatever selects the list — search, filters, paging — belongs to whoever owns
 * the list, and arrives as `toolbar`.
 */
export function CardsDialog({
  open,
  onClose,
  title,
  count,
  cards,
  loading,
  empty,
  toolbar,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  count?: number;
  cards: DialogCard[];
  loading?: boolean;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const [openCard, setOpenCard] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpenCard(null);
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton
        className="max-h-[88svh] w-full max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogTitle className="border-edge border-b px-5 py-4 pr-14 text-left">
          <span className="font-display text-lg font-semibold">{title}</span>
          {count !== undefined && (
            <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
              {count}
            </span>
          )}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {title}: elige una carta para ver su ficha al lado.
        </DialogDescription>

        {toolbar && (
          <div className="border-edge flex flex-wrap items-center gap-2 border-b px-5 py-3">
            {toolbar}
          </div>
        )}

        <div
          className={cn(
            "max-h-[62svh]",
            openCard && "grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]",
          )}
        >
          <div
            className={cn(
              "overflow-y-auto px-5 py-4",
              openCard && "border-edge max-h-[62svh] sm:border-r",
            )}
          >
            {loading && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
                {Array.from({ length: 12 }).map((_, index) => (
                  <li key={index}>
                    <CardSkeleton />
                  </li>
                ))}
              </ul>
            )}

            {!loading && cards.length === 0 && empty}

            <ul
              className={cn(
                "grid gap-3",
                openCard ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,minmax(104px,1fr))]",
              )}
            >
              {cards.map((card) => (
                <li key={card.id}>
                  <button
                    onClick={() => setOpenCard(card.id)}
                    aria-label={`Ver ${card.name}`}
                    className="block w-full text-left"
                  >
                    <CardImage
                      src={card.imageUrl}
                      alt={card.name}
                      sizes="112px"
                      category={card.category}
                      locked={card.owned === 0}
                      selected={openCard === card.id}
                    />
                    <p className="mt-1.5 truncate text-[12px] font-medium">{card.name}</p>
                    <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      {card.number}
                      <span className="text-muted-foreground/50">/{card.printedTotal}</span>
                      {card.owned > 1 && ` · ×${card.owned}`}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums">
                      {card.price === null ? "—" : formatUsd(card.price)}
                    </p>
                    {card.note && (
                      <p className="text-muted-foreground/70 truncate text-[10px]">
                        {card.note}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {openCard && (
            <CardDetail cardId={openCard} onClose={() => setOpenCard(null)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

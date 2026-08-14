"use client";

import { useState } from "react";

import { CardDetail } from "@/components/card-detail";
import { CardImage } from "@/components/card-image";
import { CardSkeleton } from "@/components/pokeball";
import { WishButton } from "@/components/wish-button";
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
      {/* Full screen on a phone and a panel from the tablet up. A dialog that
          keeps a desktop's margins on a 390px screen wastes the only axis it
          has. */}
      <DialogContent
        showCloseButton
        className="inset-0 top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[88svh] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
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

      {/* A floor on the height so three cards and sixty read as the same
          surface: without it a short list collapses into a letterbox. */}
        <div
          className={cn(
            "min-h-[24rem] flex-1 sm:max-h-[62svh] sm:min-h-[30rem]",
            openCard && "sm:grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]",
          )}
        >
          <div
            className={cn(
              "overflow-y-auto px-4 py-4 sm:px-5",
              // On a phone the card takes the screen: two panes in 390px is one
              // pane too many, so the list steps aside until it is closed.
              openCard && "hidden sm:block sm:max-h-[62svh] sm:border-r sm:border-edge",
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
                openCard
                  ? "grid-cols-3 sm:grid-cols-2"
                  : "grid-cols-[repeat(auto-fill,minmax(92px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]",
              )}
            >
              {cards.map((card) => (
                <li key={card.id} className="relative">
                  <WishButton
                    cardId={card.id}
                    cardName={card.name}
                    held={card.owned > 0}
                    className="absolute top-1.5 right-1.5 z-10"
                  />
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
            <CardDetail
              cardId={openCard}
              onClose={() => setOpenCard(null)}
              backLabel="Volver a la lista"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

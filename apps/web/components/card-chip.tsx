"use client";

import { useState } from "react";

import { CardImage } from "@/components/card-image";
import { CardPeek } from "@/components/card-peek";
import { apiClient } from "@/lib/api-client";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import { formatUsd } from "@/lib/format";

/**
 * A card the assistant named, shown rather than spelled.
 *
 * The model writes `[Name](card:id)` and this resolves the id into the card,
 * so an answer about a Charizard carries the Charizard. It stays inline and
 * quiet: a paragraph with three of these should still read as a paragraph.
 *
 * Opening one asks about the card, not about adding it — the answer arrives on
 * top of the conversation instead of replacing it.
 */
export function CardChip({ cardId, fallback }: { cardId: string; fallback: string }) {
  const [open, setOpen] = useState(false);
  const { data: card } = useGetCard(cardId, { client: { client: apiClient } });

  if (!card) {
    return <span className="underline underline-offset-2">{fallback}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${card.name} · ${card.number}/${card.card_set.printed_total} · ${card.card_set.name}`}
        className="ring-edge bg-surface hover:bg-accent/50 mx-0.5 inline-flex max-w-full translate-y-[3px] items-center gap-1.5 rounded-lg py-0.5 pr-2 pl-0.5 align-baseline no-underline ring-1 transition-colors"
      >
        <span className="w-5 shrink-0">
          <CardImage
            src={card.image_small_url}
            alt=""
            sizes="20px"
            category={card.category}
          />
        </span>
        <span className="truncate text-[13px] font-medium">{card.name}</span>
        {card.price_usd !== null && (
          <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
            {formatUsd(Number(card.price_usd))}
          </span>
        )}
      </button>

      <CardPeek cardId={cardId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

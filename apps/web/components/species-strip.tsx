"use client";

import { Lock } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useOwnedCardIds } from "@/lib/api/hooks/useOwnedCardIds";
import { useSearchCards } from "@/lib/api/hooks/useSearchCards";
import { CardImage } from "@/components/card-image";
import { CardSkeleton } from "@/components/pokeball";
import { ScrollRow } from "@/components/scroll-row";

/**
 * Every printing of the same species, owned ones in colour and the rest greyed
 * and locked — the way a roster shows which characters you have.
 */
export function SpeciesStrip({
  speciesId,
  currentCardId,
  name,
}: {
  speciesId: number;
  currentCardId: string;
  name: string;
}) {
  const { data: cards, isPending } = useSearchCards(
    { species_id: speciesId, limit: 40 },
    { client: { client: apiClient } },
  );
  const { data: owned } = useOwnedCardIds({ client: { client: apiClient } });

  if (isPending) {
    return (
      <div className="flex gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} className="w-16" />
        ))}
      </div>
    );
  }

  if (!cards || cards.length < 2) return null;

  const held = new Set(owned ?? []);
  const mine = cards.filter((card) => held.has(card.id)).length;

  return (
    <section className="slab rounded-xl p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-bold tracking-wide uppercase">
          Impresiones de {name}
        </h2>
        <p className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
          {mine}/{cards.length}
        </p>
      </div>

      <ScrollRow bleed={false}>
        {cards.map((card) => {
          const isOwned = held.has(card.id);
          return (
            <div key={card.id} className="shrink-0">
              <div title={`${card.card_set.name} · ${card.number}/${card.card_set.printed_total}`}>
                <CardImage
                  src={card.image_small_url ?? null}
                  alt={card.card_set.name}
                  sizes="64px"
                  locked={!isOwned}
                  selected={card.id === currentCardId}
                  className="w-16 transition-transform hover:-translate-y-0.5"
                >
                  {!isOwned && (
                    <span className="absolute inset-0 grid place-items-center">
                      <Lock className="text-foreground/50 size-4" />
                    </span>
                  )}
                </CardImage>
              </div>
              <p className="text-muted-foreground mt-1.5 w-16 truncate text-[11px]">
                {card.card_set.name}
              </p>
            </div>
          );
        })}
      </ScrollRow>
    </section>
  );
}

"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";

import { CardImage } from "@/components/card-image";
import { PanelSkeleton } from "@/components/pokeball";
import { StatRadar } from "@/components/stat-radar";
import { TypeChip, typeColor } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useCardMarketContext } from "@/lib/api/hooks/useCardMarketContext";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import { formatUsd } from "@/lib/format";
import { Button } from "@workspace/ui/components/button";

/**
 * The card's own screen, inside the dialog.
 *
 * Everything the detail page shows about a printed card, minus what belongs to
 * a collection row: opening a card here is a question about the card, and
 * leaving the set to answer it lost the reader's place in a hundred-card list.
 */
export function CardDetail({
  cardId,
  onClose,
  compact,
}: {
  cardId: string;
  onClose: () => void;
  /** Drops the radar: a hexagon and six labelled bars need more width than a
      side panel has, and squeezed they read as decoration. */
  compact?: boolean;
}) {
  const { data: card, isPending } = useGetCard(cardId, { client: { client: apiClient } });
  const { data: context } = useCardMarketContext(cardId, {
    client: { client: apiClient },
  });

  if (isPending || !card) {
    return (
      <div className="p-5">
        <PanelSkeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="max-h-[62svh] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display truncate text-xl font-semibold tracking-tight">
            {card.name}
          </h3>
          <p className="text-muted-foreground font-mono text-sm tabular-nums">
            {card.number}
            <span className="text-muted-foreground/50">
              /{card.card_set.printed_total}
            </span>
            {card.rarity && ` · ${card.rarity}`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar la carta" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <div className="w-40 shrink-0">
          <CardImage
            src={card.image_large_url ?? card.image_small_url}
            alt={card.name}
            sizes="160px"
            category={card.category}
          />
        </div>

        <div className="min-w-[11rem] flex-1">
          {(card.species?.types.length ?? 0) > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {card.species?.types.map((type) => <TypeChip key={type} type={type} />)}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
            <Figure
              label="Precio"
              value={card.price_usd === null ? "—" : formatUsd(Number(card.price_usd))}
            />
            <Figure label="PS" value={card.hp === null ? "—" : String(card.hp)} />
            {context && (
              <>
                <Figure
                  label="En el set"
                  value={
                    context.price_rank === null
                      ? "sin precio"
                      : `#${context.price_rank} de ${context.priced_in_set}`
                  }
                />
                <Figure
                  label="Tuyas del set"
                  value={`${context.owned_in_set}/${context.cards_in_set}`}
                />
              </>
            )}
          </dl>

          <Link
            href={`/collection/add?card=${card.id}`}
            className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
          >
            Abrir la ficha completa
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      {card.species && !compact && (
        <div className="border-edge mt-5 border-t pt-4">
          <StatRadar
            stats={card.species.stats}
            color={typeColor(card.species.types[0] ?? "normal")}
          />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

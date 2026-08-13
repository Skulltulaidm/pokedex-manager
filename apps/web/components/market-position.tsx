"use client";

import { PriceDelta } from "@/components/price-delta";
import { apiClient } from "@/lib/api-client";
import { useCardMarketContext } from "@/lib/api/hooks/useCardMarketContext";
import { formatUsd } from "@/lib/format";
import { Skeleton } from "@workspace/ui/components/skeleton";

function rankLabel(rank: number, priced: number): string {
  if (rank === 1) return `La más cara de las ${priced} con precio`;
  return `La ${rank}.ª más cara de ${priced}`;
}

/**
 * What a price means, which a number on its own does not say: where the card
 * ranks inside its set and how much of that set is already held.
 */
export function MarketPosition({
  cardId,
  setName,
  price,
}: {
  cardId: string;
  setName: string;
  price: number | null;
}) {
  const { data, isPending } = useCardMarketContext(cardId, {
    client: { client: apiClient },
  });

  if (isPending) return <Skeleton className="h-[104px] w-full rounded-xl" />;
  if (!data) return null;

  const setValue = Number(data.set_value);
  const share = price !== null && setValue > 0 ? (price / setValue) * 100 : null;
  const completion =
    data.cards_in_set > 0 ? (data.owned_in_set / data.cards_in_set) * 100 : 0;

  return (
    <section className="slab rounded-xl p-4">
      <h2 className="font-display mb-3 text-sm font-bold tracking-wide uppercase">
        En {setName}
      </h2>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="font-display text-lg leading-none font-semibold">
          {data.price_rank === null
            ? "Sin precio de referencia"
            : rankLabel(data.price_rank, data.priced_in_set)}
        </p>
        {share !== null && (
          <p className="text-muted-foreground text-sm tabular-nums">
            {share < 0.1 ? "<0.1" : share.toFixed(1)}% del valor del set
          </p>
        )}
        <PriceDelta change={data.change} showAmount className="ml-auto" />
      </div>

      <div className="bg-muted mt-4 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.max(completion, 1.5)}%` }}
        />
      </div>

      <p className="text-muted-foreground mt-2 text-xs tabular-nums">
        Tienes {data.owned_in_set} de {data.cards_in_set}
        <span className="text-muted-foreground/40"> · </span>
        el set entero vale {formatUsd(setValue, true)}
      </p>
    </section>
  );
}

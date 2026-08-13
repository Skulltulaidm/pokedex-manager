"use client";

import { PriceDelta } from "@/components/price-delta";
import { apiClient } from "@/lib/api-client";
import { useMarketSummary } from "@/lib/api/hooks/useMarketSummary";
import { formatUsd } from "@/lib/format";
import { Skeleton } from "@workspace/ui/components/skeleton";

/**
 * The catalog as a single object you own a fraction of.
 *
 * The bar is share of *value*, not of cards: owned value counts duplicates, so
 * measuring it against the catalog would read as 94% complete on a third of the
 * cards. What is filled is the value of the distinct cards held.
 */
export function MarketBar() {
  const { data, isPending } = useMarketSummary({ client: { client: apiClient } });

  if (isPending) return <Skeleton className="mb-5 h-[104px] w-full rounded-xl" />;
  if (!data) return null;

  const catalog = Number(data.catalog_value);
  const missing = Number(data.missing_value);
  const held = catalog - missing;
  const valueShare = catalog > 0 ? held / catalog : 0;
  const cardShare = data.total_cards > 0 ? data.owned_cards / data.total_cards : 0;

  return (
    <section className="slab mb-5 rounded-xl px-5 py-4" aria-label="Tu posición en el catálogo">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
            Tu cartera
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <p className="font-display text-2xl leading-none font-semibold tabular-nums">
              {formatUsd(data.owned_value, true)}
            </p>
            <PriceDelta change={data.change} showAmount />
          </div>
        </div>

        <div className="text-right">
          <p className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
            Completar el catálogo
          </p>
          <p className="text-primary font-display mt-1 text-2xl leading-none font-semibold tabular-nums">
            {formatUsd(missing, true)}
          </p>
        </div>
      </div>

      <div
        className="bg-muted mt-4 h-2 overflow-hidden rounded-full"
        role="img"
        aria-label={`${Math.round(valueShare * 100)}% del valor del catálogo`}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(valueShare * 100, 1.5)}%` }}
        />
      </div>

      <p className="text-muted-foreground mt-2.5 text-xs tabular-nums">
        {data.owned_cards} de {data.total_cards} cartas
        <span className="text-muted-foreground/40"> · </span>
        {Math.round(cardShare * 100)}% del catálogo
        <span className="text-muted-foreground/40"> · </span>
        <span className="text-foreground font-medium">
          {Math.round(valueShare * 100)}% de su valor
        </span>
      </p>
    </section>
  );
}

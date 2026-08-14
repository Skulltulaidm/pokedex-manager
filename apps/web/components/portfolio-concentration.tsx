"use client";

import { PanelSkeleton } from "@/components/pokeball";
import { apiClient } from "@/lib/api-client";
import { useMarketConcentration } from "@/lib/api/hooks/useMarketConcentration";
import type { PortfolioConcentration } from "@/lib/api/types/PortfolioConcentration";
import { formatUsd } from "@/lib/format";
import { cn } from "@workspace/ui/lib/utils";

/**
 * How few cards carry the money.
 *
 * A total says what the collection is worth; this says what it depends on. Two
 * portfolios worth the same are not the same trade when half of one sits in a
 * single card.
 */
export function ConcentrationPanel() {
  const { data, isPending } = useMarketConcentration({ client: { client: apiClient } });

  if (isPending) return <PanelSkeleton className="h-64" />;
  if (!data) return null;

  if (data.cards_for_half === null) {
    return (
      <section>
        <h2 className="font-display mb-1 text-lg font-semibold tracking-tight">
          Concentración
        </h2>
        <p className="text-muted-foreground text-sm">
          Ninguna de tus cartas tiene precio de mercado todavía, así que no hay
          valor que repartir.
        </p>
      </section>
    );
  }

  const total = Number(data.total_value);

  return (
    <section>
      <h2 className="font-display mb-1 text-lg font-semibold tracking-tight">
        Concentración
      </h2>
      <p className="text-muted-foreground mb-5 text-sm">
        La mitad de tu cartera está en{" "}
        <span className="text-foreground font-medium">
          {data.cards_for_half} {data.cards_for_half === 1 ? "carta" : "cartas"}
        </span>{" "}
        de las {data.priced_positions} con precio.
      </p>

      <ul className="space-y-3.5">
        {data.buckets.map((bucket) => (
          <li key={bucket.cards}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span>
                {bucket.cards === 1
                  ? "La carta más cara"
                  : `Las ${bucket.cards} más caras`}
              </span>
              <span className="font-mono tabular-nums">
                {bucket.share.toFixed(1)}%
                <span className="text-muted-foreground/60 ml-2">
                  {formatUsd(bucket.value, true)}
                </span>
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.max(bucket.share, 1.5)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground/70 mt-4 text-xs leading-relaxed">
        Sobre {formatUsd(total, true)} en {data.priced_positions}{" "}
        {data.priced_positions === 1 ? "posición" : "posiciones"} con precio.
        {data.unpriced_positions > 0 &&
          ` Otras ${data.unpriced_positions} no tienen precio y quedan fuera del reparto.`}
      </p>
    </section>
  );
}

/**
 * The same shape as a couple of figures, for putting two of them side by side.
 */
export function ConcentrationFigures({
  shape,
  className,
}: {
  shape: PortfolioConcentration;
  className?: string;
}) {
  const top = shape.buckets[0];

  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="font-display text-lg leading-none font-semibold tabular-nums">
          {formatUsd(shape.total_value, true)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">Posiciones</dt>
        <dd className="font-mono tabular-nums">{shape.priced_positions}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">Mitad del valor en</dt>
        <dd className="font-mono tabular-nums">
          {shape.cards_for_half === null ? (
            <span className="text-muted-foreground/40">—</span>
          ) : (
            `${shape.cards_for_half} ${shape.cards_for_half === 1 ? "carta" : "cartas"}`
          )}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">
          {top && top.cards > 1 ? `En las ${top.cards} más caras` : "En la más cara"}
        </dt>
        <dd className="font-mono tabular-nums">
          {shape.priced_positions === 0 ? (
            <span className="text-muted-foreground/40">—</span>
          ) : (
            `${(top?.share ?? 100).toFixed(1)}%`
          )}
        </dd>
      </div>
    </dl>
  );
}

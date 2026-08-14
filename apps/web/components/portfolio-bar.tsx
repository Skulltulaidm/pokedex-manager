"use client";

import { apiClient } from "@/lib/api-client";
import { PanelSkeleton } from "@/components/pokeball";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { formatUsd } from "@/lib/format";

/**
 * The numbers a marketplace puts above its grid. Every one is derived from what
 * the user holds, so the screen states its own worth before showing a card.
 */
export function PortfolioBar() {
  const { data, isPending } = useCollectionStats({ client: { client: apiClient } });

  if (isPending) return <PanelSkeleton className="h-[70px]" />;
  if (!data || data.total_groups === 0) return null;

  const total = Number(data.value.total_usd);
  const priced = data.value.priced_cards;
  const average = priced > 0 ? total / priced : 0;
  const missing = data.sets.reduce((sum, set) => sum + (set.printed_total - set.owned), 0);

  const metrics = [
    { label: "Valor", value: formatUsd(total, true), lead: true },
    { label: "Precio medio", value: formatUsd(average) },
    { label: "Cartas", value: String(data.total_cards) },
    { label: "Sets", value: String(data.sets.length) },
    { label: "Por conseguir", value: String(missing) },
    { label: "Sin precio", value: String(data.value.unpriced_cards) },
  ];

  return (
    <dl className="slab mb-5 grid grid-cols-3 gap-y-4 rounded-xl px-5 py-4 sm:grid-cols-6">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
            {metric.label}
          </dt>
          <dd
            className={
              metric.lead
                ? "font-display mt-1 text-xl leading-none font-semibold tabular-nums"
                : "mt-1 text-[15px] leading-none font-medium tabular-nums"
            }
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

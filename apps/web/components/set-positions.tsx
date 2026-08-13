"use client";

import { CoverageStrip } from "@/components/coverage-strip";
import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { useMarketSets } from "@/lib/api/hooks/useMarketSets";
import { formatUsd } from "@/lib/format";
import { Skeleton } from "@workspace/ui/components/skeleton";

/**
 * Each set as a position rather than a progress bar.
 *
 * Ordered by what finishing costs, which is not the same order as cards left:
 * the largest set here is the cheapest to close because its expensive cards are
 * already held.
 */
export function SetPositions() {
  const { data: sets, isPending } = useMarketSets({ client: { client: apiClient } });
  const { data: stats } = useCollectionStats({ client: { client: apiClient } });

  if (isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!sets?.length) return null;

  const coverage = new Map(stats?.sets.map((set) => [set.set_id, set]) ?? []);

  return (
    <ul className="grid gap-7">
      {sets.map((set) => {
        const total = Number(set.total_value);
        const missing = Number(set.missing_value);
        const heldShare = total > 0 ? (total - missing) / total : 0;
        const slots = coverage.get(set.set_id);

        return (
          <li key={set.set_id}>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3 className="truncate font-medium">{set.set_name}</h3>
              <p className="text-muted-foreground shrink-0 font-mono text-sm tabular-nums">
                {set.owned}
                <span className="text-muted-foreground/50">/{set.cards}</span>
              </p>
            </div>

            {slots && (
              <CoverageStrip
                printedTotal={slots.printed_total}
                ownedSlots={slots.owned_slots}
              />
            )}

            <dl className="mt-3 flex items-baseline justify-between gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
                  Tuyo
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {formatUsd(set.held_value, true)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
                  Completarlo
                </dt>
                <dd className="text-primary mt-0.5 font-medium tabular-nums">
                  {formatUsd(missing, true)}
                </dd>
              </div>
            </dl>

            <p className="text-muted-foreground mt-1.5 text-xs tabular-nums">
              Tienes el {Math.round(heldShare * 100)}% de su valor
            </p>
          </li>
        );
      })}
    </ul>
  );
}

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import type { PortfolioReturn } from "@/lib/api/types/PortfolioReturn";
import { formatUsd } from "@/lib/format";
import { cn } from "@workspace/ui/lib/utils";

/**
 * What the holdings cost against what they are worth.
 *
 * Rendering nothing without a recorded cost matches PriceDelta: a portfolio
 * with no purchase prices has no measurable return, and a 0% would claim it
 * broke even. The count of uncosted positions stays visible for the same
 * reason — the figure describes part of the collection, and says which part.
 */
export function ReturnSummary({
  performance,
  className,
}: {
  performance: PortfolioReturn | null | undefined;
  className?: string;
}) {
  if (!performance) return null;

  const up = performance.percent >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const sign = up ? "+" : "−";
  const amount = Math.abs(Number(performance.absolute));

  return (
    <section className={cn("border-edge border-t pt-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Rendimiento
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <p
              className={cn(
                "font-display text-2xl leading-none font-semibold tabular-nums",
                up ? "text-emerald-500" : "text-destructive",
              )}
            >
              {sign}
              {formatUsd(amount, amount >= 10)}
            </p>
            <span
              className={cn(
                "inline-flex items-baseline gap-0.5 text-sm font-medium tabular-nums",
                up ? "text-emerald-500" : "text-destructive",
              )}
            >
              <Icon className="size-3.5 shrink-0 self-center" aria-hidden />
              {sign}
              {Math.abs(performance.percent).toFixed(1)}%
            </span>
          </div>
        </div>

        <dl className="text-right text-xs">
          <div className="flex justify-end gap-2">
            <dt className="text-muted-foreground">Pagaste</dt>
            <dd className="font-mono tabular-nums">
              {formatUsd(Number(performance.cost_basis), true)}
            </dd>
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <dt className="text-muted-foreground">Valen</dt>
            <dd className="font-mono tabular-nums">
              {formatUsd(Number(performance.market_value), true)}
            </dd>
          </div>
        </dl>
      </div>

      {performance.positions_without_cost > 0 && (
        <p className="text-muted-foreground/70 mt-3 text-xs">
          Sobre {performance.positions}{" "}
          {performance.positions === 1 ? "posición" : "posiciones"} con costo
          registrado. Quedan {performance.positions_without_cost} sin él.
        </p>
      )}
    </section>
  );
}

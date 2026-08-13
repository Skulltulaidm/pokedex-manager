import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import type { PriceChange } from "@/lib/api/types/PriceChange";
import { formatUsd } from "@/lib/format";
import { cn } from "@workspace/ui/lib/utils";

const MONTH = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

/**
 * Movement, in the two colours every market uses.
 *
 * Rendering nothing when there is no history is deliberate: a portfolio synced
 * once has no measurable change, and a grey 0% would claim otherwise.
 */
export function PriceDelta({
  change,
  showAmount = false,
  className,
}: {
  change: PriceChange | null | undefined;
  showAmount?: boolean;
  className?: string;
}) {
  if (!change) return null;

  const up = change.percent >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const amount = Math.abs(Number(change.absolute));

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 text-sm font-medium tabular-nums",
        up ? "text-emerald-500" : "text-destructive",
        className,
      )}
      title={`Desde el ${MONTH.format(new Date(change.since))}`}
    >
      <Icon className="size-3.5 shrink-0 self-center" aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(change.percent).toFixed(1)}%
      {showAmount && (
        <span className="text-muted-foreground font-normal">
          {up ? "+" : "−"}
          {/* Rounding is for portfolio-sized numbers; a few cents rounds to $0. */}
          {formatUsd(amount, amount >= 10)}
        </span>
      )}
    </span>
  );
}

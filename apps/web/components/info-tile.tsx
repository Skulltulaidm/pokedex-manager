import type { LucideIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

/**
 * A fact as a tile rather than a row in a table. The icon carries the category,
 * so the label can shrink and the value can lead.
 */
export function InfoTile({
  icon: Icon,
  label,
  value,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn("ring-edge bg-surface rounded-xl p-3 ring-1", className)}>
      <div className="text-muted-foreground flex items-center gap-1.5">
        <Icon className="size-3.5" style={tone ? { color: tone } : undefined} />
        <span className="truncate text-[11px] tracking-wide uppercase">{label}</span>
      </div>
      <p className="mt-1.5 truncate text-[15px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

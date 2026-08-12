import { Heart, Shield, ShieldHalf, Sparkles, Sword, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { STAT_LABEL, STAT_ORDER } from "@/lib/labels";

export const STAT_ICON: Record<string, LucideIcon> = {
  hp: Heart,
  attack: Sword,
  defense: Shield,
  "special-attack": Sparkles,
  "special-defense": ShieldHalf,
  speed: Wind,
};

// Blissey's 255 HP is the record, not a yardstick: measured against it a typical
// stat fills a fifth of the chart and every Pokemon looks weak. 150 is roughly
// where a strong first-generation stat lands.
const SCALE = 150;
// The grey reference ring. A shape only means something next to another shape.
const BASELINE = 70;

const SIZE = 220;
const CENTRE = SIZE / 2;
const RADIUS = 74;

function point(index: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / STAT_ORDER.length - Math.PI / 2;
  const distance = (Math.min(value, SCALE) / SCALE) * RADIUS;
  return [CENTRE + Math.cos(angle) * distance, CENTRE + Math.sin(angle) * distance];
}

function polygon(values: number[]): string {
  return values.map((value, index) => point(index, value).join(",")).join(" ");
}

/**
 * The stat spread as a shape, the way the games themselves show it. Six bars
 * make the reader compare lengths; one silhouette is read at a glance.
 */
export function StatRadar({
  stats,
  color,
}: {
  stats: Record<string, number>;
  color: string;
}) {
  const values = STAT_ORDER.map((key) => stats[key] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[220px] shrink-0"
        role="img"
        aria-label={STAT_ORDER.map((key, i) => `${STAT_LABEL[key]} ${values[i]}`).join(", ")}
      >
        {[0.33, 0.66, 1].map((ring) => (
          <polygon
            key={ring}
            points={polygon(STAT_ORDER.map(() => SCALE * ring))}
            className="fill-none stroke-current"
            style={{ stroke: "var(--edge)" }}
          />
        ))}

        <polygon
          points={polygon(STAT_ORDER.map(() => BASELINE))}
          style={{ fill: "var(--muted)", stroke: "var(--edge)" }}
        />

        <polygon
          points={polygon(values)}
          style={{ fill: color, fillOpacity: 0.32, stroke: color, strokeWidth: 2 }}
        />

        {values.map((value, index) => {
          const [x, y] = point(index, value);
          return <circle key={index} cx={x} cy={y} r={3} style={{ fill: color }} />;
        })}
      </svg>

      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1 sm:gap-y-1.5">
        {STAT_ORDER.map((key, index) => {
          const Icon = STAT_ICON[key]!;
          const value = values[index]!;
          return (
            <li key={key} className="flex items-center gap-2 text-sm">
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <span className="text-muted-foreground flex-1 truncate">{STAT_LABEL[key]}</span>
              <span className="font-mono font-medium tabular-nums">{value}</span>
            </li>
          );
        })}
        <li className="border-edge col-span-2 mt-1 flex items-center gap-2 border-t pt-2 text-sm sm:col-span-1">
          <span className="text-muted-foreground flex-1">Total</span>
          <span className="font-mono font-semibold tabular-nums">{total}</span>
        </li>
      </ul>
    </div>
  );
}

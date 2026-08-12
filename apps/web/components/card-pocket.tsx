import Image from "next/image";

import { TYPE_VAR, TypeDots } from "@/components/type-dot";
import { cn } from "@workspace/ui/lib/utils";

// Pokemon cards are 63x88mm. Everything that stands in for one keeps that ratio.
const CARD_RATIO = "aspect-[63/88]";

export function EmptyPocket({ label }: { label?: string }) {
  return (
    <div
      className={cn(
        CARD_RATIO,
        "border-edge/60 flex items-center justify-center rounded-lg border border-dashed",
      )}
    >
      {label && (
        <span className="text-muted-foreground/40 font-mono text-xs">{label}</span>
      )}
    </div>
  );
}

export function CardPocket({
  name,
  setName,
  number,
  printedTotal,
  imageUrl,
  types,
  quantity,
  condition,
}: {
  name: string;
  setName: string;
  number: string;
  printedTotal: number;
  imageUrl: string | null;
  types: string[];
  quantity: number;
  condition?: string;
}) {
  const glow = TYPE_VAR[types[0] ?? ""] ?? null;

  return (
    <div className="group flex flex-col gap-2.5">
      <div className={cn(CARD_RATIO, "relative")}>
        {glow && (
          <div
            aria-hidden
            className="aura absolute -inset-4 opacity-45 blur-xl transition-opacity duration-500 group-hover:opacity-75"
            style={{ "--glow": `var(${glow})` } as React.CSSProperties}
          />
        )}

        <div className="ring-edge relative h-full w-full overflow-hidden rounded-lg shadow-[0_6px_20px_-8px_oklch(0_0_0/0.8)] ring-1 transition-transform duration-300 group-hover:-translate-y-1">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              sizes="(min-width: 1536px) 13vw, (min-width: 1024px) 17vw, (min-width: 640px) 28vw, 46vw"
              className="object-cover"
            />
          ) : (
            <div className="bg-surface text-muted-foreground flex h-full items-center justify-center px-2 text-center text-xs">
              {name}
            </div>
          )}

          <div
            aria-hidden
            className="foil pointer-events-none absolute inset-0 bg-[position:180%_0] opacity-0 mix-blend-overlay transition-all duration-700 group-hover:bg-[position:-60%_0] group-hover:opacity-100 motion-reduce:transition-none"
          />

          {quantity > 1 && (
            <span className="glass text-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 font-mono text-[11px] leading-none">
              ×{quantity}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm leading-tight font-semibold">{name}</p>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
          <span className="shrink-0 font-mono tabular-nums">
            {number}
            <span className="text-muted-foreground/45">/{printedTotal}</span>
          </span>
          <span className="truncate">{setName}</span>
          <TypeDots types={types} className="ml-auto shrink-0" />
        </p>
        {condition && (
          <p className="text-muted-foreground/70 mt-1 text-[11px]">{condition}</p>
        )}
      </div>
    </div>
  );
}

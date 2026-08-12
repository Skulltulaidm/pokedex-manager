import { CARD_RATIO, CardImage } from "@/components/card-image";
import { TypeDots } from "@/components/type-dot";
import { formatUsd } from "@/lib/format";
import { cn } from "@workspace/ui/lib/utils";

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
  price,
  rarity,
}: {
  name: string;
  setName: string;
  number: string;
  printedTotal: number;
  imageUrl: string | null;
  types: string[];
  quantity: number;
  condition?: string;
  price?: number | null;
  rarity?: string | null;
}) {
  return (
    <div className="group flex flex-col gap-2.5">
      <CardImage
        src={imageUrl}
        alt={name}
        sizes="(min-width: 1536px) 13vw, (min-width: 1024px) 17vw, (min-width: 640px) 28vw, 46vw"
        glowType={types[0]}
        foil
        className="transition-transform duration-300 group-hover:-translate-y-1"
      >
        {quantity > 1 && (
          <span className="glass text-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 font-mono text-[11px] leading-none">
            ×{quantity}
          </span>
        )}
        {rarity && (
          <span className="glass text-muted-foreground absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] leading-none tracking-wide uppercase">
            {rarity}
          </span>
        )}
      </CardImage>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm leading-tight font-semibold">{name}</p>
          <TypeDots types={types} className="shrink-0" />
        </div>

        {/* Price leads the second line: this is a screen about what a collection
            is worth, so the number belongs beside the name. */}
        <p className="mt-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground truncate font-mono tabular-nums">
            {number}
            <span className="text-muted-foreground/45">/{printedTotal}</span>
            <span className="mx-1.5">·</span>
            {setName}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            {price == null ? <span className="text-muted-foreground/40">—</span> : formatUsd(price)}
          </span>
        </p>

        {(condition || (quantity > 1 && price != null)) && (
          <p className="text-muted-foreground/70 mt-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate">{condition}</span>
            {quantity > 1 && price != null && (
              <span className="shrink-0 tabular-nums">{formatUsd(price * quantity)} total</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

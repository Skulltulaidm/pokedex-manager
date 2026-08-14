import { CardImage } from "@/components/card-image";
import { TypeDots } from "@/components/type-dot";
import { WishButton } from "@/components/wish-button";
import { formatUsd } from "@/lib/format";
import { cn } from "@workspace/ui/lib/utils";

/**
 * One catalog card in the grid, in one of two states.
 *
 * Held cards keep their type aura and full colour; the rest are desaturated and
 * unlit. The aura is the whole tell, so it is passed only when a card is held.
 */
export function CardPocket({
  name,
  setName,
  number,
  printedTotal,
  imageUrl,
  types,
  owned,
  price,
  rarity,
  category,
  cardId,
}: {
  name: string;
  setName: string;
  number: string;
  printedTotal: number;
  imageUrl: string | null;
  types: string[];
  owned: number;
  price?: number | null;
  rarity?: string | null;
  category?: string;
  cardId?: string;
}) {
  const held = owned > 0;

  return (
    <div className="group flex flex-col gap-2.5">
      {/* The lift moved out of the frame so the wish button rides with it, and
          out of the frame's grayscale so it keeps its colour on a missing card. */}
      <div className="relative transition-transform duration-300 group-hover:-translate-y-1">
        <CardImage
          src={imageUrl}
          alt={name}
          sizes="(min-width: 1536px) 13vw, (min-width: 1024px) 17vw, (min-width: 640px) 28vw, 46vw"
          glowType={held ? types[0] : null}
          locked={!held}
          foil={held}
          category={category}
          className={cn(!held && "opacity-80 transition-opacity group-hover:opacity-100")}
        >
          {owned > 1 && (
            <span className="glass text-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 font-mono text-[11px] leading-none">
              ×{owned}
            </span>
          )}
          {rarity && (
            <span className="glass text-muted-foreground absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] leading-none tracking-wide uppercase">
              {rarity}
            </span>
          )}
        </CardImage>

        {cardId && (
          <WishButton
            cardId={cardId}
            cardName={name}
            held={held}
            className="absolute right-2 bottom-2"
          />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm leading-tight font-semibold",
              !held && "text-muted-foreground",
            )}
          >
            {name}
          </p>
          <TypeDots types={types} className={cn("shrink-0", !held && "opacity-45")} />
        </div>

        <p className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
            {number}
            <span className="text-muted-foreground/45">/{printedTotal}</span>
          </span>
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              !held && "text-muted-foreground/70 font-medium",
            )}
          >
            {price == null ? <span className="text-muted-foreground/40">—</span> : formatUsd(price)}
          </span>
        </p>

        <p className="text-muted-foreground/60 mt-0.5 truncate text-[11px]">{setName}</p>
      </div>
    </div>
  );
}

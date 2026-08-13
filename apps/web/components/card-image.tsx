import Image from "next/image";

import { TYPE_VAR } from "@/components/type-dot";
import { cn } from "@workspace/ui/lib/utils";

// Pokemon cards are 63x88mm. Everything that stands in for one keeps that ratio,
// which is why it is declared once here and nowhere else.
export const CARD_RATIO = "aspect-[63/88]";

/**
 * The illustration window inside a card face, as a fraction of the whole scan.
 *
 * Measured off the 1999 frame, which every set in the catalog shares, and split
 * by category because the three layouts put the window at different heights:
 * a Trainer carries its name above the art where a Pokemon carries it beside.
 * Every window keeps the same shape so one grid holds all three.
 */
const ART_WIDTH = 0.84;
const ART_HEIGHT = 0.35;
const ART_RATIO = (63 * ART_WIDTH) / (88 * ART_HEIGHT);
const ART_SCALE = 1 / ART_WIDTH;

const ART_TOP: Record<string, number> = {
  Pokemon: 0.125,
  Trainer: 0.225,
  // No illustration at all, just the type symbol, so the window is centred on it.
  Energy: 0.3,
};

function artOffset(category: string | undefined): number {
  const top = ART_TOP[category ?? "Pokemon"] ?? ART_TOP.Pokemon!;
  // `top` resolves against the frame's height while the maths above is in units
  // of its width, so the ratio converts between the two.
  return -top * ART_SCALE * (88 / 63) * ART_RATIO * 100;
}

/**
 * A card rendered at some size, with the treatments a card can carry.
 *
 * Eleven places drew this frame with their own combination of ratio, ring and
 * rounding; the differences between them were accidents, not decisions.
 */
export function CardImage({
  src,
  alt,
  sizes,
  className,
  glowType,
  locked,
  selected,
  priority,
  foil,
  art,
  category,
  children,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  glowType?: string | null;
  locked?: boolean;
  selected?: boolean;
  priority?: boolean;
  foil?: boolean;
  art?: boolean;
  category?: string;
  children?: React.ReactNode;
}) {
  const glow = glowType ? TYPE_VAR[glowType] : null;

  return (
    <div
      className={cn("relative", !art && CARD_RATIO, className)}
      style={art ? { aspectRatio: ART_RATIO } : undefined}
    >
      {glow && (
        <div
          aria-hidden
          className="aura absolute -inset-4 opacity-45 blur-xl transition-opacity duration-500 group-hover:opacity-75"
          style={{ "--glow": `var(${glow})` } as React.CSSProperties}
        />
      )}

      <div
        className={cn(
          "ring-edge relative size-full overflow-hidden rounded-lg ring-1",
          selected && "ring-primary ring-2 ring-inset",
          locked && "grayscale",
        )}
      >
        {src ? (
          art ? (
            <Image
              src={src}
              alt={alt}
              width={480}
              height={670}
              sizes={sizes}
              priority={priority}
              className={cn("absolute max-w-none", locked && "opacity-40")}
              style={{
                width: `${ART_SCALE * 100}%`,
                height: "auto",
                left: `${((1 - ART_WIDTH) / 2) * -ART_SCALE * 100}%`,
                top: `${artOffset(category)}%`,
              }}
            />
          ) : (
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              priority={priority}
              className={cn("object-cover", locked && "opacity-40")}
            />
          )
        ) : (
          <div className="bg-surface text-muted-foreground flex size-full items-center justify-center px-2 text-center text-xs">
            {alt}
          </div>
        )}

        {foil && (
          <div
            aria-hidden
            className="foil pointer-events-none absolute inset-0 bg-[position:180%_0] opacity-0 mix-blend-overlay transition-all duration-700 group-hover:bg-[position:-60%_0] group-hover:opacity-100 motion-reduce:transition-none"
          />
        )}

        {children}
      </div>
    </div>
  );
}

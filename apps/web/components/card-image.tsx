import Image from "next/image";

import { TYPE_VAR } from "@/components/type-dot";
import { cn } from "@workspace/ui/lib/utils";

// Pokemon cards are 63x88mm. Everything that stands in for one keeps that ratio,
// which is why it is declared once here and nowhere else.
export const CARD_RATIO = "aspect-[63/88]";

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
  children?: React.ReactNode;
}) {
  const glow = glowType ? TYPE_VAR[glowType] : null;

  return (
    <div className={cn(CARD_RATIO, "relative", className)}>
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
          <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className={cn("object-cover", locked && "opacity-40")}
          />
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

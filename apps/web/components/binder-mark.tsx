import { cn } from "@workspace/ui/lib/utils";

/**
 * A nine-pocket page, part filled: the product's premise stated as a shape.
 *
 * Deliberately colourless. Type colour is the card art's job, and a logo built
 * from the same palette competes with the grid it sits above.
 */
export function BinderMark({
  filled = 5,
  className,
}: {
  filled?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid w-fit grid-cols-3 gap-1.5", className)} aria-hidden>
      {Array.from({ length: 9 }).map((_, index) => (
        <span
          key={index}
          className="block aspect-[63/88] w-7 rounded-[4px]"
          style={
            index < filled
              ? {
                  background: "oklch(1 0 0 / 0.1)",
                  boxShadow:
                    "inset 0 0 0 1px oklch(1 0 0 / 0.22), inset 0 1px 0 oklch(1 0 0 / 0.15)",
                }
              : { boxShadow: "inset 0 0 0 1px var(--edge)" }
          }
        />
      ))}
    </div>
  );
}

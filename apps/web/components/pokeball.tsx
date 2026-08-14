"use client";

import { cn } from "@workspace/ui/lib/utils";

type Catch = "waiting" | "caught" | "escaped";

/**
 * The three states of a throw, borrowed for the three states of a request.
 *
 * A ball that has caught something sits still; a ball still deciding shakes.
 * That is the same uncertainty a pending request is in, so waiting wobbles,
 * arriving clicks shut, and failing bursts open — which is also why a failed
 * load can say so without a second icon: the animation already did.
 */
export function Pokeball({
  state = "waiting",
  size = 28,
  className,
}: {
  state?: Catch;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="presentation"
      className={cn(
        "shrink-0",
        state === "waiting" && "wobble",
        state === "caught" && "caught",
        state === "escaped" && "escaped",
        className,
      )}
    >
      <defs>
        <clipPath id="pokeball-top">
          <rect x="0" y="0" width="48" height="24" />
        </clipPath>
        <clipPath id="pokeball-bottom">
          <rect x="0" y="24" width="48" height="24" />
        </clipPath>
      </defs>

      {state === "escaped" ? (
        /* Each half keeps its share of the band, and the button rides the top
           one. Without them it is a red shape floating over a white one, which
           reads as a rendering fault rather than as a ball that opened. */
        <g>
          <g transform="translate(0 -6) rotate(-6 24 24)">
            <path
              d="M3 24a21 21 0 0 1 42 0Z"
              className="fill-destructive stroke-foreground/20"
              strokeWidth="1.5"
            />
            <circle
              cx="24"
              cy="24"
              r="7.5"
              className="fill-surface stroke-foreground/85"
              strokeWidth="3"
              clipPath="url(#pokeball-top)"
            />
            <rect x="3" y="21" width="42" height="3" className="fill-foreground/85" />
          </g>
          <g transform="translate(0 6) rotate(5 24 24)">
            <path
              d="M45 24a21 21 0 0 1-42 0Z"
              className="fill-surface stroke-foreground/20"
              strokeWidth="1.5"
            />
            <rect x="3" y="24" width="42" height="3" className="fill-foreground/85" />
          </g>
        </g>
      ) : (
        <>
          <circle
            cx="24"
            cy="24"
            r="21"
            className="fill-destructive"
            clipPath="url(#pokeball-top)"
          />
          <circle
            cx="24"
            cy="24"
            r="21"
            className="fill-surface"
            clipPath="url(#pokeball-bottom)"
          />
          <circle
            cx="24"
            cy="24"
            r="21"
            fill="none"
            className="stroke-foreground/20"
            strokeWidth="1.5"
          />
          <rect x="3" y="22" width="42" height="4" className="fill-foreground/85" />
          <circle
            cx="24"
            cy="24"
            r="7.5"
            className="fill-surface stroke-foreground/85"
            strokeWidth="3"
          />
          <circle cx="24" cy="24" r="3" className="fill-foreground/25" />
        </>
      )}
    </svg>
  );
}

/**
 * A card-shaped hole with a ball spinning in it.
 *
 * Sized by its container rather than a fixed height, so it can stand in for a
 * tile in a grid without the grid moving when the real card arrives.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "ring-edge bg-surface grid aspect-[63/88] w-full place-items-center rounded-lg ring-1",
        className,
      )}
    >
      <Pokeball size={26} className="opacity-35" />
    </div>
  );
}

/**
 * A block the size of what is coming, with a ball turning in it.
 *
 * Placeholders keep the shape of the thing they stand for so the page does not
 * jump when it arrives; the ball is what says the wait is deliberate rather
 * than a panel that failed to draw.
 */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "ring-edge bg-surface/60 grid w-full place-items-center rounded-xl ring-1",
        className,
      )}
    >
      <Pokeball size={22} className="opacity-30" />
    </div>
  );
}

/** A grid of card-shaped holes, for anywhere cards are about to arrive. */
export function CardGridSkeleton({
  count = 12,
  min = 104,
  className,
}: {
  count?: number;
  min?: number;
  className?: string;
}) {
  return (
    <ul
      className={cn("grid gap-3", className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <li key={index}>
          <CardSkeleton />
        </li>
      ))}
    </ul>
  );
}

/** Stacked rows, for lists that are not made of cards. */
export function RowsSkeleton({
  count = 4,
  height = "h-12",
}: {
  count?: number;
  height?: string;
}) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <li
          key={index}
          className={cn(
            "ring-edge bg-surface/60 flex items-center rounded-lg px-3 ring-1",
            height,
          )}
        >
          <Pokeball size={16} className="opacity-25" />
        </li>
      ))}
    </ul>
  );
}

/**
 * What a request that failed looks like: the ball open, and what went wrong.
 */
export function LoadFailed({
  message = "No se pudo cargar.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ring-edge bg-surface/60 flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center ring-1">
      <Pokeball state="escaped" size={56} />
      <p className="text-muted-foreground text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-foreground text-sm underline underline-offset-4"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

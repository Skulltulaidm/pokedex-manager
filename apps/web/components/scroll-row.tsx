"use client";

import { useRef, useState } from "react";

import { cn } from "@workspace/ui/lib/utils";

// Below this a gesture is a click that wobbled, above it a drag.
const DRAG_THRESHOLD = 4;

/**
 * A horizontal strip that scrolls without a visible bar and can be dragged with
 * a mouse.
 *
 * A trackpad scrolls sideways on its own; a mouse has no way to, so without
 * drag the row is unreachable for anyone not on a laptop.
 */
export function ScrollRow({
  children,
  className,
  bleed = true,
}: {
  children: React.ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  // Refs, not state: the first pointermove of a drag arrives before a state
  // update has rendered and would read the stale value.
  const origin = useRef<{ x: number; left: number } | null>(null);
  const dragged = useRef(false);
  const [grabbing, setGrabbing] = useState(false);

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType !== "mouse" || !track.current) return;
    origin.current = { x: event.clientX, left: track.current.scrollLeft };
    dragged.current = false;
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!origin.current || !track.current) return;

    const travelled = event.clientX - origin.current.x;
    if (!dragged.current && Math.abs(travelled) > DRAG_THRESHOLD) {
      dragged.current = true;
      setGrabbing(true);
    }
    if (dragged.current) track.current.scrollLeft = origin.current.left - travelled;
  }

  function endDrag() {
    origin.current = null;
    setGrabbing(false);
  }

  return (
    <div
      ref={track}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      // Captured on the way down so a drag that ends over a chip does not also
      // select it.
      onClickCapture={(event) => {
        if (!dragged.current) return;
        event.preventDefault();
        event.stopPropagation();
        dragged.current = false;
      }}
      className={cn(
        // overflow-x forces overflow-y to compute as auto rather than visible, so
        // anything that lifts on hover is clipped without room to lift into.
        "scrollbar-none overflow-x-auto overscroll-x-contain py-1.5",
        // Restores the inset the negative margin removed, so the first and last
        // item are not flush against the screen edge.
        bleed && "-mx-4 px-4 lg:-mx-6 lg:px-6",
        grabbing ? "cursor-grabbing select-none" : "cursor-grab",
        className,
      )}
    >
      <div className="flex w-max gap-2">{children}</div>
    </div>
  );
}

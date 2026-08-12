"use client";

import { useCallback, useRef, useState } from "react";

/**
 * How many columns the grid is actually rendering, and the ref to attach to it.
 *
 * A page size fixed in code cannot fill rows: the column count changes with the
 * viewport, so any constant leaves a ragged last row at most widths.
 *
 * The ref is a callback rather than an object because the grid does not exist
 * on the first render — it appears once the data arrives, and an effect keyed
 * on a stable ref would have already run and found nothing to observe.
 */
export function useGridColumns(): [(node: HTMLElement | null) => void, number] {
  const [columns, setColumns] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!node) return;

    const measure = () => {
      const template = getComputedStyle(node).gridTemplateColumns;
      setColumns(template.split(" ").filter(Boolean).length);
    };

    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(node);
  }, []);

  return [ref, columns];
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * View state that lives in the address bar without leaving the page.
 *
 * `router.replace` is a navigation even when only a query parameter moves: Next
 * fetches the route's payload again and the tree remounts, so every filter click
 * flashed a skeleton and refetched what was already on screen. The History API
 * writes the same URL with no round trip, which keeps a filtered view linkable
 * and the click instant.
 *
 * The trade is that the state is now React's, so anything reading the URL must
 * go through this hook rather than `useSearchParams`, which the native call
 * does not notify.
 */
export function useUrlState(initial: Record<string, string | undefined> = {}) {
  const [params, setParams] = useState<URLSearchParams>(() => {
    const search = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    for (const [key, value] of Object.entries(initial)) {
      if (value !== undefined && !search.has(key)) search.set(key, value);
    }
    return search;
  });

  // The back button rewrites the URL without telling React, so the state has to
  // be re-read when it does.
  useEffect(() => {
    const onPop = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const set = useCallback((next: Record<string, string | undefined>) => {
    setParams((current) => {
      const merged = new URLSearchParams(current.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === "") merged.delete(key);
        else merged.set(key, value);
      }

      const query = merged.toString();
      window.history.replaceState(
        null,
        "",
        query ? `${window.location.pathname}?${query}` : window.location.pathname,
      );
      return merged;
    });
  }, []);

  return [params, set] as const;
}

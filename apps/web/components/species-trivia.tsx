"use client";

import { Sparkles } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useSpeciesTrivia } from "@/lib/api/hooks/useSpeciesTrivia";
import { Skeleton } from "@workspace/ui/components/skeleton";

/**
 * Generated once per species and cached, so the wait is paid by whoever opens
 * the card first and by nobody after them.
 */
export function SpeciesTrivia({ speciesId }: { speciesId: number }) {
  const { data, isPending } = useSpeciesTrivia(speciesId, {
    client: { client: apiClient },
  });

  if (isPending) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    );
  }

  if (!data?.text) return null;

  return (
    <div className="border-edge mt-4 flex gap-2.5 border-t pt-4">
      <Sparkles className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" />
      <p className="text-muted-foreground text-sm leading-relaxed">{data.text}</p>
    </div>
  );
}

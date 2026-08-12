import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@workspace/ui/components/button";

/**
 * Paging lives beside the heading, not under the results: controls at the foot
 * of a long grid make the reader scroll down to move and back up to read.
 */
export function Pager({
  page,
  lastPage,
  onChange,
}: {
  page: number;
  lastPage: number;
  onChange: (page: number) => void;
}) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft />
      </Button>
      <p className="text-muted-foreground min-w-14 text-center text-sm tabular-nums">
        {page} / {lastPage}
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Página siguiente"
        disabled={page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

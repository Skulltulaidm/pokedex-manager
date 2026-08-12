"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { ChatHistory } from "@/components/chat-history";
import { CollectionFilters } from "@/components/collection-filters";
import { Skeleton } from "@workspace/ui/components/skeleton";

const PANELS: Record<string, { title: string; content: React.ReactNode }> = {
  "/collection": { title: "Filtros", content: <CollectionFilters /> },
  "/chat": { title: "Conversaciones", content: <ChatHistory /> },
};

/**
 * The second rail: what this section is for, beside the icons that got you here.
 *
 * Filters belong to the shell rather than to the grid — they survive navigating
 * into a card and back, and the screen keeps its whole width for content.
 */
export function ContextPanel() {
  const pathname = usePathname();
  const panel = PANELS[pathname];

  if (!panel) return null;

  return (
    <aside className="border-edge bg-surface/40 hidden w-56 shrink-0 flex-col border-r lg:flex">
      <div className="border-edge flex h-(--header-height) shrink-0 items-center border-b px-4">
        <p className="text-sm font-medium">{panel.title}</p>
      </div>
      <div className="scrollbar-none flex-1 overflow-y-auto p-4">
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
          {panel.content}
        </Suspense>
      </div>
    </aside>
  );
}

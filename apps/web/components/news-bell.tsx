"use client";

import { ArrowRight, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NewsThumb } from "@/components/news-thumb";
import { RowsSkeleton } from "@/components/pokeball";
import { apiClient } from "@/lib/api-client";
import { useNewsFeed } from "@/lib/api/hooks/useNewsFeed";
import type { NewsEntry } from "@/lib/api/types";
import { formatAgo, formatMoment } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog";

const PREVIEW = 6;

/**
 * The last few things that happened, and the way to the rest.
 *
 * The badge counts only what is waiting on the reader: a card that changed
 * price is worth knowing, an offer nobody has answered is worth doing, and a
 * number that mixes the two stops meaning anything.
 */
export function NewsBell() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data, isPending } = useNewsFeed(
    { limit: PREVIEW },
    { client: { client: apiClient } },
  );

  if (pathname === "/notifications") return null;

  const entries = data?.items ?? [];
  const waiting = data?.waiting ?? 0;
  const rest = (data?.total ?? 0) - entries.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={waiting > 0 ? `Novedades, ${waiting} sin responder` : "Novedades"}
        className="text-muted-foreground hover:text-foreground relative transition-colors"
      >
        <Bell className="size-4" />
        {waiting > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
            {waiting}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80svh] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="border-edge border-b px-5 py-4 text-left">
            <span className="font-display text-lg font-semibold">Novedades</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Ofertas y cambios de precio de los últimos días.
          </DialogDescription>

          <div className="max-h-[62svh] overflow-y-auto px-5 py-3">
            {isPending && <RowsSkeleton count={3} />}

            {!isPending && entries.length === 0 && (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Nada nuevo esta semana.
              </p>
            )}

            <ul className="divide-edge divide-y">
              {entries.map((entry, index) => (
                <li key={`${entry.kind}-${entry.at}-${index}`}>
                  <Entry entry={entry} onFollow={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-edge hover:bg-secondary/60 flex items-center justify-center gap-1.5 border-t px-5 py-3 text-sm font-medium transition-colors"
          >
            Ver todas
            {rest > 0 && (
              <span className="text-muted-foreground tabular-nums">y {rest} más</span>
            )}
            <ArrowRight className="size-3.5" />
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Entry({ entry, onFollow }: { entry: NewsEntry; onFollow: () => void }) {
  const body = (
    <div className="flex items-center gap-3 py-3">
      <NewsThumb entry={entry} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.title}</p>
        {entry.detail && (
          <p className="text-muted-foreground truncate text-xs">{entry.detail}</p>
        )}
      </div>

      <time
        dateTime={entry.at}
        title={formatMoment(entry.at)}
        className="text-muted-foreground/70 shrink-0 text-[11px] tabular-nums"
      >
        {formatAgo(entry.at)}
      </time>
      {!entry.seen && <span className="bg-primary size-1.5 shrink-0 rounded-full" />}
    </div>
  );

  if (!entry.href) return body;

  return (
    <Link href={entry.href} onClick={onFollow} className="block">
      {body}
    </Link>
  );
}

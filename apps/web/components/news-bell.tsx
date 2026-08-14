"use client";

import { ArrowDownRight, ArrowUpRight, Bell, Handshake } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { RowsSkeleton } from "@/components/pokeball";
import { apiClient } from "@/lib/api-client";
import { useNewsFeed } from "@/lib/api/hooks/useNewsFeed";
import type { NewsEntry } from "@/lib/api/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";

/**
 * What happened while you were not looking.
 *
 * The badge counts only what is waiting on the reader: a card that changed
 * price is worth knowing, an offer nobody has answered is worth doing, and a
 * number that mixes the two stops meaning anything.
 */
export function NewsBell() {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useNewsFeed({}, { client: { client: apiClient } });

  const waiting = data?.waiting ?? 0;

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

            {!isPending && data?.entries.length === 0 && (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Nada nuevo esta semana.
              </p>
            )}

            <ul className="divide-edge divide-y">
              {data?.entries.map((entry, index) => (
                <li key={`${entry.kind}-${entry.at}-${index}`}>
                  <Entry entry={entry} onFollow={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Entry({ entry, onFollow }: { entry: NewsEntry; onFollow: () => void }) {
  const cheaper = entry.kind === "wish_cheaper";
  const body = (
    <div className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "ring-edge grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg ring-1",
          entry.image_url ? "relative" : "bg-secondary",
        )}
      >
        {entry.image_url ? (
          <Image src={entry.image_url} alt="" fill sizes="32px" className="object-cover" />
        ) : entry.kind.startsWith("offer") ? (
          <Handshake className="size-4" />
        ) : cheaper ? (
          <ArrowDownRight className="size-4" />
        ) : (
          <ArrowUpRight className="size-4" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.title}</p>
        {entry.detail && (
          <p className="text-muted-foreground truncate text-xs">{entry.detail}</p>
        )}
      </div>

      {entry.actionable && <span className="bg-primary size-1.5 shrink-0 rounded-full" />}
    </div>
  );

  if (!entry.href) return body;

  return (
    <Link href={entry.href} onClick={onFollow} className="block">
      {body}
    </Link>
  );
}

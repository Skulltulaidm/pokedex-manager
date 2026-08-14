"use client";

import { MessagesSquare, Search, X } from "lucide-react";
import Link from "next/link";

import { Pager } from "@/components/pager";
import { RowsSkeleton } from "@/components/pokeball";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useListThreads } from "@/lib/api/hooks/useListThreads";
import type { ThreadView } from "@/lib/api/types";
import { formatAgo, formatMoment } from "@/lib/format";
import { buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

export const THREADS_PER_PAGE = 12;

/**
 * Who you are talking to, in the order they last spoke.
 *
 * The row carries the last line said rather than a subject, because a
 * conversation about a trade has no subject: what it is about is whatever the
 * two of them last wrote.
 */
export function ThreadList({
  openId,
  page,
  search,
  onPage,
  onSearch,
  className,
}: {
  openId: string | null;
  page: number;
  search: string;
  onPage: (page: number) => void;
  onSearch: (search: string) => void;
  className?: string;
}) {
  const { data, isPending } = useListThreads(
    {
      search: search || undefined,
      limit: THREADS_PER_PAGE,
      offset: (page - 1) * THREADS_PER_PAGE,
    },
    {
      client: { client: apiClient },
      // No sockets: the list catches up on a timer and whenever the tab is
      // looked at again, which is honest about how fresh it is.
      query: { refetchInterval: 20_000 },
    },
  );

  const lastPage = data ? Math.max(1, Math.ceil(data.total / THREADS_PER_PAGE)) : 1;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <InputGroup className="bg-secondary h-10 flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            defaultValue={search}
            placeholder="Coleccionista o palabra…"
            aria-label="Buscar en tus conversaciones"
            onChange={(event) => onSearch(event.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <button onClick={() => onSearch("")} aria-label="Limpiar">
                <X className="size-4" />
              </button>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Pager page={page} lastPage={lastPage} onChange={onPage} />
      </div>

      {isPending && <RowsSkeleton count={5} height="h-16" />}

      {data?.total === 0 && (search ? <NoResults /> : <Empty />)}

      {data && data.items.length > 0 && (
        <ul className="scrollbar-none ring-edge bg-surface divide-edge min-h-0 flex-1 divide-y overflow-y-auto rounded-2xl ring-1">
          {data.items.map((thread) => (
            <li key={thread.partner_id}>
              <Row thread={thread} open={thread.partner_id === openId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ thread, open }: { thread: ThreadView; open: boolean }) {
  return (
    <Link
      href={`/messages/${thread.partner_id}`}
      aria-current={open ? "true" : undefined}
      className={cn(
        "hover:bg-secondary/50 flex items-center gap-3 px-3.5 py-3 transition-colors",
        open && "bg-secondary/70",
      )}
    >
      <UserAvatar value={thread.partner_id} size={38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              thread.unread > 0 ? "font-semibold" : "font-medium",
            )}
          >
            {thread.partner_name ?? "Coleccionista"}
          </p>
          {thread.last_at && (
            <time
              dateTime={thread.last_at}
              title={formatMoment(thread.last_at)}
              className="text-muted-foreground/70 shrink-0 text-[11px] tabular-nums"
            >
              {formatAgo(thread.last_at)}
            </time>
          )}
        </div>
        <p
          className={cn(
            "truncate text-xs",
            thread.unread > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {thread.last_mine && <span className="text-muted-foreground/70">Tú: </span>}
          {thread.last_body}
        </p>
      </div>

      {thread.unread > 0 && (
        <span
          className="bg-primary text-primary-foreground grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
          aria-label={`${thread.unread} sin leer`}
        >
          {thread.unread}
        </span>
      )}
    </Link>
  );
}

function NoResults() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-10 text-center ring-1">
      <p className="text-muted-foreground text-sm">
        Ninguna conversación con esa búsqueda. Probá con otro nombre o con una carta que
        hayan nombrado.
      </p>
    </div>
  );
}

function Empty() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-14 text-center ring-1">
      <MessagesSquare
        className="text-muted-foreground/30 mx-auto size-10"
        strokeWidth={1.25}
        aria-hidden
      />
      <h2 className="font-display mt-4 text-lg font-semibold">Todavía no hablaste con nadie</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Un trueque se cierra hablando: preguntá por el estado de una carta, acordá dónde se
        encuentran, o proponé algo distinto. Escribile a quien te haya hecho una oferta o a
        quien publicó en el tablón.
      </p>
      <Link href="/trades" className={cn(buttonVariants(), "mt-5")}>
        Ver trueques
      </Link>
    </div>
  );
}

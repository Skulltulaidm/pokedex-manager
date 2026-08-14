"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { NewsThumb } from "@/components/news-thumb";
import { Pager } from "@/components/pager";
import { RowsSkeleton } from "@/components/pokeball";
import { ScreenHeader } from "@/components/screen-header";
import { apiClient } from "@/lib/api-client";
import { useMarkNewsSeen } from "@/lib/api/hooks/useMarkNewsSeen";
import { newsFeedQueryKey, useNewsFeed } from "@/lib/api/hooks/useNewsFeed";
import type { NewsEntry } from "@/lib/api/types";
import { formatAgo, formatDay, formatMoment, plural } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 15;

/**
 * Everything that happened this week, oldest kinds and newest alike.
 *
 * Opening it is what marks the week as read, and the marking deliberately does
 * not reach back into this list: a screen whose unread marks vanish while you
 * are reading it cannot tell you what you came for.
 */
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [params, setParam] = useUrlState();

  const page = Math.max(1, Number(params.get("p") ?? 1));
  const pending = params.get("filtro") === "pendientes";

  const { data, isPending } = useNewsFeed(
    {
      actionable: pending || undefined,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    },
    { client: { client: apiClient } },
  );

  const markSeen = useMarkNewsSeen({ client: { client: apiClient } });
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || !data) return;
    marked.current = true;
    markSeen.mutate(undefined, {
      onSuccess: () =>
        // Stale, not refetched: this screen has to keep showing what was new
        // when the reader got here, and the bell reloads on its way back
        // anyway — it unmounts while they are on this page.
        queryClient.invalidateQueries({
          queryKey: newsFeedQueryKey(),
          refetchType: "none",
        }),
    });
  }, [data, markSeen, queryClient]);

  const entries = data?.items ?? [];
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;
  const waiting = data?.waiting ?? 0;

  return (
    <>
      <ScreenHeader
        title="Novedades"
        meta={waiting > 0 ? `${waiting} sin responder` : undefined}
      >
        <Pager
          page={page}
          lastPage={lastPage}
          onChange={(next) => setParam({ p: String(next) })}
        />
      </ScreenHeader>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip active={!pending} onClick={() => setParam({ filtro: undefined, p: undefined })}>
          Todas
        </Chip>
        <Chip
          active={pending}
          onClick={() => setParam({ filtro: "pendientes", p: undefined })}
        >
          Sin responder
        </Chip>
        {data && (
          <span className="text-muted-foreground ml-auto text-sm tabular-nums">
            {plural(data.total, "novedad", "novedades")}
          </span>
        )}
      </div>

      {isPending && <RowsSkeleton count={5} height="h-16" />}

      {data && entries.length === 0 && (pending ? <NothingPending /> : <Empty />)}

      <div className="space-y-7">
        {byDay(entries).map(([day, ofThatDay]) => (
          <section key={day}>
            <h2 className="text-muted-foreground mb-2.5 text-[11px] tracking-wide uppercase">
              {day}
            </h2>
            <ul className="ring-edge bg-surface divide-edge divide-y overflow-hidden rounded-2xl ring-1">
              {ofThatDay.map((entry) => (
                <li key={keyOf(entry)}>
                  <Row entry={entry} fresh={!entry.seen} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function Row({ entry, fresh }: { entry: NewsEntry; fresh: boolean }) {
  const body = (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3.5 transition-colors",
        fresh && "bg-primary/5",
        entry.href && "hover:bg-secondary/50",
      )}
    >
      <NewsThumb entry={entry} big />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{entry.title}</p>
        {entry.detail && (
          <p className="text-muted-foreground mt-0.5 text-xs">{entry.detail}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <time
          dateTime={entry.at}
          title={formatMoment(entry.at)}
          className="text-muted-foreground/70 text-[11px] tabular-nums"
        >
          {formatAgo(entry.at)}
        </time>
        {fresh && (
          <span className="bg-primary size-1.5 rounded-full" aria-label="Sin leer" />
        )}
      </div>
    </div>
  );

  if (!entry.href) return body;

  return (
    <Link href={entry.href} className="block">
      {body}
    </Link>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NothingPending() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-12 text-center ring-1">
      <p className="text-muted-foreground text-sm">
        Nada esperando tu respuesta. Quitá el filtro para ver el resto de la semana.
      </p>
    </div>
  );
}

function Empty() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-16 text-center ring-1">
      <BellOff
        className="text-muted-foreground/30 mx-auto size-10"
        strokeWidth={1.25}
        aria-hidden
      />
      <h2 className="font-display mt-4 text-lg font-semibold">Semana tranquila</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Acá aparecen las ofertas que te llegan, los trueques que cierras y las cartas de
        tu lista de deseos que cambian de precio. Mientras más marques lo que buscas, más
        tenemos para avisarte.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/trades" className={buttonVariants()}>
          Ver trueques
        </Link>
        <Link
          href="/stats?tab=deseos"
          className={buttonVariants({ variant: "outline" })}
        >
          Tu lista de deseos
        </Link>
      </div>
    </div>
  );
}

function keyOf(entry: NewsEntry): string {
  return `${entry.kind}-${entry.at}-${entry.card_id ?? entry.partner_id ?? ""}`;
}

/** The page in the order it arrived, cut where the calendar day changes. */
function byDay(entries: NewsEntry[]): [string, NewsEntry[]][] {
  const days = new Map<string, NewsEntry[]>();
  for (const entry of entries) {
    const day = formatDay(entry.at);
    days.set(day, [...(days.get(day) ?? []), entry]);
  }
  return [...days];
}

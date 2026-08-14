"use client";

import { CalendarDays, Handshake, Heart, Layers, Search, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useUrlState } from "@/lib/url-state";
import { Suspense, useState } from "react";

import { CardImage } from "@/components/card-image";
import { PanelSkeleton } from "@/components/pokeball";
import { Pager } from "@/components/pager";
import { ScreenHeader } from "@/components/screen-header";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useGetCollector } from "@/lib/api/hooks/useGetCollector";
import { useListSpares } from "@/lib/api/hooks/useListSpares";
import type { CollectorProfile } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 18;

export default function CollectorPage() {
  return (
    <Suspense fallback={<PanelSkeleton className="h-96" />}>
      <Collector />
    </Suspense>
  );
}

function Collector() {
  const { id } = useParams<{ id: string }>();
  const { data: profile, isPending } = useGetCollector(id, {
    client: { client: apiClient },
  });

  if (isPending) return <PanelSkeleton className="h-96" />;
  if (!profile) {
    return (
      <p className="text-muted-foreground ring-edge bg-surface/60 rounded-2xl px-6 py-12 text-center text-sm ring-1">
        No encontramos a ese coleccionista.
      </p>
    );
  }

  return (
    <>
      <ScreenHeader title={profile.is_self ? "Tu perfil" : "Coleccionista"}>
        {!profile.is_self && (
          <Link
            href={`/trades/new?con=${profile.user_id}`}
            className={buttonVariants({ size: "sm" })}
          >
            <Handshake />
            Armar un trueque
          </Link>
        )}
      </ScreenHeader>

      <Identity profile={profile} />
      <Numbers profile={profile} />
      {profile.sets.length > 0 && <Sets profile={profile} />}

      <Spares ownerId={profile.user_id} isSelf={profile.is_self} />
    </>
  );
}

function Identity({ profile }: { profile: CollectorProfile }) {
  const since = profile.joined_at
    ? new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(
        new Date(profile.joined_at),
      )
    : null;

  return (
    <div className="mb-6 flex items-center gap-4">
      <UserAvatar value={profile.user_id} size={64} />
      <div className="min-w-0">
        <h2 className="font-display truncate text-2xl font-semibold tracking-tight">
          {profile.name ?? "Coleccionista"}
        </h2>
        {since && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CalendarDays className="size-3.5" />
            Coleccionando aquí desde {since}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Counts, never money.
 *
 * What a collection is worth is a claim about a person; how much of it is free
 * to trade is a claim about the cards, and that is the part a counterparty is
 * entitled to. Your own profile shows the same figures so the page never looks
 * different to you than to whoever you send it to.
 */
function Numbers({ profile }: { profile: CollectorProfile }) {
  return (
    <dl className="ring-edge bg-surface mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl ring-1 sm:grid-cols-4">
      <Figure label="Cartas" value={profile.cards} note={`${profile.distinct_cards} distintas`} />
      <Figure label="Repetidas" value={profile.spares} note="libres para truequear" />
      <Figure
        label={profile.is_self ? "Buscas" : "Busca"}
        value={profile.wants}
        note="en su lista de deseos"
      />
      {profile.is_self ? (
        <Figure label="Sets" value={profile.sets.length} note="empezados" />
      ) : (
        <Figure
          label="Coinciden"
          value={profile.you_want + profile.they_want}
          note={`${profile.you_want} que buscas · ${profile.they_want} que quiere`}
          accent={profile.you_want + profile.they_want > 0}
        />
      )}
    </dl>
  );
}

function Figure({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</dt>
      <dd
        className={cn(
          "font-display mt-1 text-2xl font-semibold tabular-nums",
          accent && "text-primary",
        )}
      >
        {value}
      </dd>
      <p className="text-muted-foreground/70 text-xs">{note}</p>
    </div>
  );
}

function Sets({ profile }: { profile: CollectorProfile }) {
  return (
    <section className="mb-8">
      <h3 className="text-muted-foreground mb-3 flex items-center gap-1.5 text-[11px] tracking-wide uppercase">
        <Layers className="size-3.5" />
        Sets que colecciona
      </h3>
      <ul className="space-y-2">
        {profile.sets.map((set) => (
          <li key={set.set_id} className="flex items-center gap-3">
            <p className="w-32 shrink-0 truncate text-sm font-medium">{set.set_name}</p>
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-foreground h-full rounded-full"
                style={{ width: `${(set.owned / set.printed_total) * 100}%` }}
              />
            </div>
            <p className="text-muted-foreground w-16 shrink-0 text-right font-mono text-xs tabular-nums">
              {set.owned}
              <span className="text-muted-foreground/50">/{set.printed_total}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Spares({ ownerId, isSelf }: { ownerId: string; isSelf: boolean }) {
  const [params, setParam] = useUrlState();
  const page = Math.max(1, Number(params.get("p") ?? 1));
  const [search, setSearch] = useState("");

  const { data } = useListSpares(
    ownerId,
    { search: search || undefined, limit: PER_PAGE, offset: (page - 1) * PER_PAGE },
    { client: { client: apiClient } },
  );

  const lastPage = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">
          {isSelf ? "Tus repetidas" : "Repetidas"}
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            {data?.total ?? 0}
          </span>
        </h3>

        <div className="flex items-center gap-2">
          <InputGroup className="bg-secondary h-9 w-48 rounded-full border-transparent">
            <InputGroupAddon>
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              placeholder="Buscar carta…"
              aria-label="Buscar entre las repetidas"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <button onClick={() => setSearch("")} aria-label="Limpiar">
                  <X className="size-3.5" />
                </button>
              </InputGroupAddon>
            )}
          </InputGroup>
          <Pager
            page={page}
            lastPage={lastPage}
            onChange={(next) => setParam({ p: String(next) })}
          />
        </div>
      </div>

      {data?.total === 0 && (
        <p className="text-muted-foreground ring-edge bg-surface/60 rounded-2xl px-6 py-10 text-center text-sm ring-1">
          {isSelf
            ? "No tienes repetidas todavía. Una segunda copia de una carta es lo que se puede truequear."
            : "No tiene repetidas libres ahora mismo."}
        </p>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
        {data?.items.map((entry) => (
          <li key={entry.card.id}>
            <Link href={`/collection/add?card=${entry.card.id}`} className="block">
              <div className="relative">
                <CardImage
                  src={entry.card.image_small_url}
                  alt={entry.card.name}
                  sizes="104px"
                  category={entry.card.category}
                />
                {entry.wanted && (
                  <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full">
                    <Heart className="size-3" />
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-[12px] font-medium">{entry.card.name}</p>
              <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
                {entry.price_usd === null ? "—" : formatUsd(Number(entry.price_usd))}
                {entry.copies > 1 && ` · ${entry.copies}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

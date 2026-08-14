"use client";

import { ArrowLeftRight, Check, Megaphone, Search, X } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { MessageLink } from "@/components/message-link";
import { Pager } from "@/components/pager";
import { PanelSkeleton } from "@/components/pokeball";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useAcceptListing } from "@/lib/api/hooks/useAcceptListing";
import { useCancelListing } from "@/lib/api/hooks/useCancelListing";
import { useListListings } from "@/lib/api/hooks/useListListings";
import type { ListingCardView, TradeListingView } from "@/lib/api/types";
import { formatUsd, plural } from "@/lib/format";
import { conditionLabel, conditionShort } from "@/lib/labels";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 4;

export type Filter = "todas" | "puedo" | "mias" | "tomadas";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "puedo", label: "Las que puedo cumplir" },
  { key: "mias", label: "Mías" },
  { key: "tomadas", label: "Cerradas" },
];

/**
 * The open board: swaps published to nobody in particular.
 *
 * A listing is read from the reader's side — what arrives and what leaves — but
 * the API names both sides from the publisher, who is the only party that does
 * not change between readers, so the labels swap on `is_mine`.
 */
export function ListingBoard({
  page,
  search,
  filter,
  onPage,
  onSearch,
  onFilter,
}: {
  page: number;
  search: string;
  filter: Filter;
  onPage: (page: number) => void;
  onSearch: (search: string) => void;
  onFilter: (filter: Filter) => void;
}) {
  const queryClient = useQueryClient();

  const { data, isPending } = useListListings(
    {
      search: search || undefined,
      fulfillable: filter === "puedo" ? true : undefined,
      mine: filter === "mias" ? true : filter === "puedo" ? false : undefined,
      status_filter: filter === "tomadas" ? "taken" : "open",
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    },
    { client: { client: apiClient } },
  );

  const invalidate = () => void queryClient.invalidateQueries();

  const accept = useAcceptListing({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("Trueque cerrado. Cargá la carta cuando la tengas en la mano.");
      },
      onError: () => toast.error("No se pudo tomar. Puede que ya lo haya tomado alguien."),
    },
  });

  const cancel = useCancelListing({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("Publicación retirada del tablón");
      },
      onError: () => toast.error("No se pudo retirar."),
    },
  });

  const busy = accept.isPending || cancel.isPending;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Tablón abierto</h2>
          <p className="text-muted-foreground text-sm">
            Publicaciones sin destinatario: las toma quien pueda cumplirlas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/trades/publish" className={buttonVariants({ size: "sm" })}>
            <Megaphone />
            Publicar
          </Link>
          <span className="text-muted-foreground text-sm tabular-nums">
            {data?.total ?? 0}
          </span>
          <Pager page={page} lastPage={lastPage} onChange={onPage} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <InputGroup className="bg-secondary h-10 max-w-xs flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            defaultValue={search}
            placeholder="Carta o coleccionista…"
            aria-label="Buscar en el tablón"
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

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => onFilter(entry.key)}
              aria-pressed={filter === entry.key}
              className={cn(
                "rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                filter === entry.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {isPending && (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <PanelSkeleton key={index} className="h-56" />
          ))}
        </div>
      )}

      {data?.total === 0 && <Empty filtered={Boolean(search) || filter !== "todas"} />}

      <ul className="space-y-4">
        {data?.items.map((listing) => (
          <li key={listing.id}>
            <Listing
              listing={listing}
              busy={busy}
              onAccept={() => accept.mutate({ listing_id: listing.id })}
              onCancel={() => cancel.mutate({ listing_id: listing.id })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Listing({
  listing,
  busy,
  onAccept,
  onCancel,
}: {
  listing: TradeListingView;
  busy: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const balance = Number(listing.balance);
  const open = listing.status === "open";
  const takeable = !listing.is_mine && open && listing.available && listing.can_fulfil;

  return (
    <article
      className={cn(
        "ring-edge bg-surface rounded-2xl p-4 ring-1 sm:p-5",
        takeable && "ring-primary/40",
      )}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar value={listing.owner_id} size={30} />
          {listing.is_mine ? (
            <span className="text-sm font-medium">Tu publicación</span>
          ) : (
            <Link
              href={`/collectors/${listing.owner_id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {listing.owner_name ?? "Un coleccionista"}
            </Link>
          )}
          <Badge listing={listing} />
        </div>

        <div className="text-right">
          <p
            className={cn(
              "font-mono text-sm font-medium tabular-nums",
              balance >= 0 ? "text-emerald-500" : "text-destructive",
            )}
          >
            {balance >= 0 ? "+" : "−"}
            {formatUsd(Math.abs(balance))}
          </p>
          <p className="text-muted-foreground/70 text-[11px]">
            {listing.is_mine ? "para quien lo tome" : balance >= 0 ? "a tu favor" : "en tu contra"}
          </p>
        </div>
      </header>

      {listing.note && (
        <p className="text-muted-foreground mb-4 text-sm italic">“{listing.note}”</p>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <Side
          title={listing.is_mine ? "Entregas" : "Recibes"}
          cards={listing.gives}
          value={listing.give_value}
        />
        <ArrowLeftRight
          className="text-muted-foreground/30 mx-auto size-5 shrink-0 sm:mt-9"
          aria-hidden
        />
        <Side
          title={listing.is_mine ? "Pides" : "Entregas"}
          cards={listing.wants}
          value={listing.want_value}
        />
      </div>

      <div className="border-edge mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        {/* Whoever published it is the only one who can answer what a listing
            does not say: the condition of a card, or where to meet. */}
        {!listing.is_mine && <MessageLink partnerId={listing.owner_id} variant="ghost" />}
        {listing.is_mine ? (
          open ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
                Quitar del tablón
              </Button>
              <p className="text-muted-foreground/70 text-xs">
                Sigue en pie hasta que alguien la tome o la retires.
              </p>
            </>
          ) : (
            <Done listing={listing} />
          )
        ) : takeable ? (
          <>
            <Button size="sm" disabled={busy} onClick={onAccept}>
              <Check />
              Tomar este trueque
            </Button>
            <p className="text-muted-foreground/70 text-xs">
              Tomarlo es aceptarlo: queda cerrado con {listing.owner_name ?? "quien lo publicó"}.
            </p>
          </>
        ) : !open ? (
          <Done listing={listing} />
        ) : !listing.available ? (
          <p className="text-muted-foreground text-xs">
            Quien la publicó ya no tiene libres esas cartas, así que nadie puede tomarla.
          </p>
        ) : (
          <>
            <Button size="sm" disabled>
              Tomar este trueque
            </Button>
            <p className="text-muted-foreground text-xs">
              Te {listing.missing === 1 ? "falta" : "faltan"}{" "}
              {plural(listing.missing, "carta repetida", "cartas repetidas")} de las que
              pide.
            </p>
          </>
        )}
      </div>
    </article>
  );
}

function Done({ listing }: { listing: TradeListingView }) {
  if (listing.status === "taken") {
    return (
      <p className="text-muted-foreground text-xs">
        Cerrado. Ninguna carta cambió de colección: cuando la tengas en la mano,
        cargala vos.
      </p>
    );
  }

  return <p className="text-muted-foreground text-xs">Retirada del tablón.</p>;
}

function Badge({ listing }: { listing: TradeListingView }) {
  const [label, tone] = describe(listing);

  return (
    <span
      className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}
    >
      {label}
    </span>
  );
}

function describe(listing: TradeListingView): [string, string] {
  if (listing.status === "taken") return ["Cerrada", "bg-emerald-500/15 text-emerald-500"];
  if (listing.status === "cancelled") return ["Retirada", "bg-muted text-muted-foreground/70"];
  if (listing.is_mine) return ["En el tablón", "bg-secondary text-muted-foreground"];
  if (!listing.available) return ["Sin respaldo", "bg-muted text-muted-foreground/70"];
  if (listing.can_fulfil) return ["Puedes cumplirla", "bg-emerald-500/15 text-emerald-500"];
  return [`Te faltan ${listing.missing}`, "bg-secondary text-muted-foreground"];
}

function Side({
  title,
  cards,
  value,
}: {
  title: string;
  cards: ListingCardView[];
  value: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {title}
        </h3>
        <p className="font-mono text-sm tabular-nums">{formatUsd(value)}</p>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
        {cards.map((entry) => (
          <li key={entry.card.id}>
            <CardImage
              src={entry.card.image_small_url}
              alt={entry.card.name}
              sizes="96px"
              category={entry.card.category}
            />
            <p className="mt-1.5 truncate text-[11px] font-medium">{entry.card.name}</p>
            <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
              {entry.price_usd === null ? "—" : formatUsd(entry.price_usd)}
              {entry.condition && (
                <span className="text-muted-foreground/60" title={conditionLabel(entry.condition)}>
                  {" "}
                  · {conditionShort(entry.condition)}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-12 text-center ring-1">
        <p className="text-muted-foreground text-sm">
          Ninguna publicación con ese filtro. Probá con otro nombre o mirá todas.
        </p>
      </div>
    );
  }

  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-14 text-center ring-1">
      <Megaphone
        className="text-muted-foreground/30 mx-auto size-10"
        strokeWidth={1.25}
        aria-hidden
      />
      <h3 className="font-display mt-4 text-lg font-semibold">El tablón está vacío</h3>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Acá no hace falta encontrar a nadie: publicás qué das y qué pedís, y lo toma
        quien pueda cumplirlo.
      </p>
      <Link href="/trades/publish" className={cn(buttonVariants(), "mt-5")}>
        <Megaphone />
        Publicar en el tablón
      </Link>
    </div>
  );
}

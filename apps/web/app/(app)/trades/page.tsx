"use client";

import { ArrowLeftRight, Handshake, Search, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { PanelSkeleton } from "@/components/pokeball";
import { CardPreview, type PreviewCard, type PreviewSides } from "@/components/card-preview";
import { OfferList } from "@/components/offer-list";
import { Pager } from "@/components/pager";
import { ScreenHeader } from "@/components/screen-header";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useUrlState } from "@/lib/url-state";
import { useCreateOffer } from "@/lib/api/hooks/useCreateOffer";
import { useListOffers } from "@/lib/api/hooks/useListOffers";
import { useListTrades } from "@/lib/api/hooks/useListTrades";
import type { TradeCard, TradeMatch } from "@/lib/api/types";
import { formatUsd, plural } from "@/lib/format";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 5;
const OFFERS_PER_PAGE = 4;

export default function TradesPage() {
  return (
    <Suspense fallback={<MatchesSkeleton />}>
      <Trades />
    </Suspense>
  );
}

function Trades() {
  const queryClient = useQueryClient();
  const [params, setParam] = useUrlState();

  // Every list state lives in the URL: a filtered page can be linked, and going
  // back returns to the same page rather than the top of the list.
  const page = Math.max(1, Number(params.get("p") ?? 1));
  const offersPage = Math.max(1, Number(params.get("op") ?? 1));
  const search = params.get("q") ?? "";
  const side = params.get("lado");

  const { data: matches, isPending } = useListTrades(
    {
      search: search || undefined,
      favourable: side === "favor" ? true : side === "contra" ? false : undefined,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    },
    { client: { client: apiClient } },
  );

  const { data: open } = useListOffers(
    { status_filter: "pending", limit: OFFERS_PER_PAGE, offset: (offersPage - 1) * OFFERS_PER_PAGE },
    { client: { client: apiClient } },
  );
  const { data: settled } = useListOffers(
    { limit: 50, offset: 0 },
    { client: { client: apiClient } },
  );

  const create = useCreateOffer({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success("Oferta enviada");
      },
      onError: () => toast.error("No se pudo enviar la oferta."),
    },
  });

  const history = (settled?.items ?? []).filter((offer) => offer.status !== "pending");
  const pendingWith = new Set((open?.items ?? []).map((offer) => offer.partner_id));
  const lastPage = matches ? Math.max(1, Math.ceil(matches.total / PER_PAGE)) : 1;
  const offersLastPage = open ? Math.max(1, Math.ceil(open.total / OFFERS_PER_PAGE)) : 1;

  return (
    <>
      <ScreenHeader
        title="Trueques"
        meta={open && open.total > 0 ? plural(open.total, "abierta", "abiertas") : undefined}
      >
        <Link href="/trades/new" className={buttonVariants({ size: "sm" })}>
          <Handshake />
          Armar un trueque
        </Link>
      </ScreenHeader>

      {open && open.items.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Ofertas abiertas
            </h2>
            <Pager
              page={offersPage}
              lastPage={offersLastPage}
              onChange={(next) => setParam({ op: String(next) })}
            />
          </div>
          <OfferList offers={open.items} />
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Coincidencias</h2>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm tabular-nums">
            {matches?.total ?? 0}
          </span>
          <Pager
            page={page}
            lastPage={lastPage}
            onChange={(next) => setParam({ p: String(next) })}
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <InputGroup className="bg-secondary h-10 max-w-xs flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            defaultValue={search}
            placeholder="Coleccionista o carta…"
            aria-label="Buscar en coincidencias"
            onChange={(event) => setParam({ q: event.target.value, p: undefined })}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <button onClick={() => setParam({ q: undefined, p: undefined })} aria-label="Limpiar">
                <X className="size-4" />
              </button>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="flex gap-1.5">
          <Chip active={!side} onClick={() => setParam({ lado: undefined, p: undefined })}>
            Todas
          </Chip>
          <Chip active={side === "favor"} onClick={() => setParam({ lado: "favor", p: undefined })}>
            A tu favor
          </Chip>
          <Chip
            active={side === "contra"}
            onClick={() => setParam({ lado: "contra", p: undefined })}
          >
            En tu contra
          </Chip>
        </div>
      </div>

      {isPending && <MatchesSkeleton />}
      {matches?.total === 0 && (search || side ? <NoResults /> : <Empty />)}

      <ul className="space-y-4">
        {matches?.items.map((match) => (
          <li key={match.partner_id}>
            <Match
              match={match}
              proposed={pendingWith.has(match.partner_id)}
              busy={create.isPending}
              onPropose={() =>
                create.mutate({
                  data: {
                    to_user_id: match.partner_id,
                    offered: match.you_give.map((entry) => ({ card_id: entry.card.id })),
                    requested: match.you_get.map((entry) => ({ card_id: entry.card.id })),
                  },
                })
              }
            />
          </li>
        ))}
      </ul>

      {history.length > 0 && (
        <section className="mt-10">
          <h2 className="text-muted-foreground mb-3 text-[11px] tracking-wide uppercase">
            Historial
          </h2>
          <OfferList offers={history} />
        </section>
      )}
    </>
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
        active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function toPreview(entry: TradeCard): PreviewCard {
  return {
    id: entry.card.id,
    name: entry.card.name,
    number: entry.card.number,
    setName: entry.card.card_set.name,
    printedTotal: entry.card.card_set.printed_total,
    rarity: entry.card.rarity,
    category: entry.card.category,
    hp: entry.card.hp,
    types: entry.card.species?.types ?? [],
    imageUrl: entry.card.image_large_url ?? entry.card.image_small_url,
    price: entry.price_usd === null ? null : Number(entry.price_usd),
    copies: entry.copies,
  };
}

/**
 * Both sides of the swap, at a size where the card is recognisable.
 *
 * The tiles are the reason this screen exists: a thumbnail too small to tell a
 * Ninetales from a Raichu turns the whole trade into a row of numbers.
 */
function Match({
  match,
  proposed,
  busy,
  onPropose,
}: {
  match: TradeMatch;
  proposed: boolean;
  busy: boolean;
  onPropose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const balance = Number(match.balance);
  const favourable = balance >= 0;

  const sides: PreviewSides = {
    give: match.you_give.map(toPreview),
    get: match.you_get.map(toPreview),
  };

  return (
    <article className="ring-edge bg-surface rounded-2xl p-5 ring-1">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <UserAvatar value={match.partner_id} size={34} />
          <Link href={`/collectors/${match.partner_id}`} className="font-medium hover:underline">
            {match.partner_name ?? "Coleccionista"}
          </Link>
        </div>

        <div className="text-right">
          <p
            className={cn(
              "font-mono text-sm font-medium tabular-nums",
              favourable ? "text-emerald-600" : "text-destructive",
            )}
          >
            {favourable ? "+" : "−"}
            {formatUsd(Math.abs(balance))}
          </p>
          <p className="text-muted-foreground/70 text-[11px]">
            {favourable ? "a tu favor" : "en tu contra"}
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <Side
          title="Entregas"
          cards={sides.give}
          value={match.give_value}
          onOpen={setOpenId}
        />
        <ArrowLeftRight
          className="text-muted-foreground/30 mx-auto size-5 shrink-0 lg:mt-10"
          aria-hidden
        />
        <Side title="Recibes" cards={sides.get} value={match.get_value} onOpen={setOpenId} />
      </div>

      {match.unpriced > 0 && (
        <p className="text-muted-foreground/70 mt-4 text-xs">
          {match.unpriced} {match.unpriced === 1 ? "carta" : "cartas"} sin precio de
          mercado, fuera de los totales.
        </p>
      )}

      <div className="border-edge mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
        {proposed ? (
          <p className="text-muted-foreground text-sm">
            Ya le propusiste este trueque. Está arriba, esperando respuesta.
          </p>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={onPropose}>
              <Handshake />
              Proponer este trueque
            </Button>
            <Link
              href={`/trades/new?con=${match.partner_id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Elegir otras cartas
            </Link>
            <p className="text-muted-foreground/60 text-xs">
              Propone todas las cartas de arriba, o arma el tuyo carta por carta.
            </p>
          </>
        )}
      </div>

      <CardPreview sides={sides} openId={openId} onOpenChange={setOpenId} />
    </article>
  );
}

function Side({
  title,
  cards,
  value,
  onOpen,
}: {
  title: string;
  cards: PreviewCard[];
  value: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-muted-foreground text-[11px] tracking-wide uppercase">{title}</h3>
        <p className="font-mono text-sm tabular-nums">{formatUsd(value)}</p>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              onClick={() => onOpen(card.id)}
              className="group/tile w-full text-left"
              aria-label={`Ver ${card.name}`}
            >
              <div className="transition-transform group-hover/tile:-translate-y-0.5">
                <CardImage
                  src={card.imageUrl}
                  alt={card.name}
                  sizes="112px"
                  category={card.category}
                />
              </div>
              <p className="mt-2 truncate text-[13px] font-medium">{card.name}</p>
              <p className="text-muted-foreground font-mono text-[11px] tabular-nums">
                {card.price === null ? "sin precio" : formatUsd(card.price)}
                {card.copies !== undefined && card.copies > 1 && (
                  <span className="text-muted-foreground/60"> · {card.copies} libres</span>
                )}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoResults() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-12 text-center ring-1">
      <p className="text-muted-foreground text-sm">
        Ninguna coincidencia con ese filtro. Probá con otro nombre o quitá el filtro.
      </p>
    </div>
  );
}

function Empty() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-16 text-center ring-1">
      <Handshake
        className="text-muted-foreground/30 mx-auto size-10"
        strokeWidth={1.25}
        aria-hidden
      />
      <h2 className="font-display mt-4 text-lg font-semibold">Todavía no hay trueques</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Un trueque necesita las dos mitades: que alguien quiera una de tus repetidas y
        que tenga repetida una de tu lista de deseos. Aparecerán aquí en cuanto las dos
        coincidan.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/collection?tengo=missing" className={buttonVariants()}>
          Marcar lo que buscas
        </Link>
        <Link href="/stats?tab=deseos" className={buttonVariants({ variant: "outline" })}>
          Ver tus deseos
        </Link>
      </div>
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, index) => (
        <PanelSkeleton key={index} className="h-64" />
      ))}
    </div>
  );
}

"use client";

import { ArrowLeftRight, Handshake } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { OfferList } from "@/components/offer-list";
import { ScreenHeader } from "@/components/screen-header";
import { apiClient } from "@/lib/api-client";
import { useCreateOffer } from "@/lib/api/hooks/useCreateOffer";
import { useListOffers } from "@/lib/api/hooks/useListOffers";
import { useListTrades } from "@/lib/api/hooks/useListTrades";
import type { TradeCard, TradeMatch } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

export default function TradesPage() {
  const queryClient = useQueryClient();
  const { data: matches, isPending } = useListTrades(
    {},
    { client: { client: apiClient } },
  );
  const { data: offers } = useListOffers({}, { client: { client: apiClient } });

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

  const open = offers?.filter((offer) => offer.status === "pending") ?? [];
  const settled = offers?.filter((offer) => offer.status !== "pending") ?? [];
  // A counterparty with an offer already on the table is not a fresh
  // opportunity, so the match stops asking to propose the same swap twice.
  const pendingWith = new Set(open.map((offer) => offer.partner_id));

  return (
    <>
      <ScreenHeader
        title="Trueques"
        meta={
          open.length > 0
            ? `${open.length} ${open.length === 1 ? "oferta abierta" : "ofertas abiertas"}`
            : undefined
        }
      />

      {open.length > 0 && (
        <section className="mb-9">
          <h2 className="text-muted-foreground mb-3 text-[11px] tracking-wide uppercase">
            Ofertas abiertas
          </h2>
          <OfferList offers={open} />
        </section>
      )}

      <h2 className="font-display mb-1 text-lg font-semibold">Coincidencias</h2>
      <p className="text-muted-foreground mb-6 max-w-2xl text-sm">
        Coleccionistas que quieren una carta que te sobra y tienen una que
        buscas. Solo se ofrecen cartas repetidas: la única copia de una carta es
        tu colección, no inventario.
      </p>

      {isPending && <MatchesSkeleton />}
      {matches?.length === 0 && <Empty />}

      <ul className="space-y-4">
        {matches?.map((match) => (
          <li key={match.partner_id}>
            <Match
              match={match}
              proposed={pendingWith.has(match.partner_id)}
              busy={create.isPending}
              onPropose={() =>
                create.mutate({
                  data: {
                    to_user_id: match.partner_id,
                    offered: match.you_give.map((entry) => entry.card.id),
                    requested: match.you_get.map((entry) => entry.card.id),
                  },
                })
              }
            />
          </li>
        ))}
      </ul>

      {settled.length > 0 && (
        <section className="mt-10">
          <h2 className="text-muted-foreground mb-3 text-[11px] tracking-wide uppercase">
            Historial
          </h2>
          <OfferList offers={settled} />
        </section>
      )}
    </>
  );
}

/**
 * Both sides of the swap, side by side, with the balance between them.
 *
 * The balance is stated and not acted on: which cards even out a trade is the
 * two collectors' argument, and a number that picked a winner would be
 * pretending to knowledge about condition and sentiment that it does not have.
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
  const balance = Number(match.balance);
  const favourable = balance >= 0;

  return (
    <article className="ring-edge bg-surface rounded-2xl p-5 ring-1">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-secondary text-muted-foreground grid size-8 place-items-center rounded-full text-xs font-medium uppercase">
            {(match.partner_name ?? "?").slice(0, 2)}
          </span>
          <p className="font-medium">{match.partner_name ?? "Coleccionista"}</p>
        </div>

        <div className="text-right">
          <p
            className={cn(
              "font-mono text-sm font-medium tabular-nums",
              favourable ? "text-emerald-500" : "text-destructive",
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

      <div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <Side title="Entregas" cards={match.you_give} value={match.give_value} />
        <ArrowLeftRight
          className="text-muted-foreground/30 mx-auto size-5 shrink-0 sm:mt-9"
          aria-hidden
        />
        <Side title="Recibes" cards={match.you_get} value={match.get_value} />
      </div>

      {match.unpriced > 0 && (
        <p className="text-muted-foreground/70 mt-4 text-xs">
          {match.unpriced} {match.unpriced === 1 ? "carta" : "cartas"} sin precio
          de mercado, fuera de los totales.
        </p>
      )}

      <div className="border-edge mt-5 flex items-center gap-3 border-t pt-4">
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
            <p className="text-muted-foreground/60 text-xs">
              Propone todas las cartas de arriba. Nada se mueve hasta que ambos
              se pongan de acuerdo.
            </p>
          </>
        )}
      </div>
    </article>
  );
}

function Side({
  title,
  cards,
  value,
}: {
  title: string;
  cards: TradeCard[];
  value: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {title}
        </h2>
        <p className="font-mono text-sm tabular-nums">{formatUsd(value)}</p>
      </div>

      <ul className="flex flex-wrap gap-2.5">
        {cards.map((entry) => (
          <li key={entry.card.id} className="w-16">
            <CardImage
              src={entry.card.image_small_url}
              alt={entry.card.name}
              sizes="64px"
              category={entry.card.category}
            />
            <p className="mt-1.5 truncate text-[11px] leading-tight" title={entry.card.name}>
              {entry.card.name}
            </p>
            <p className="text-muted-foreground/70 font-mono text-[10px] tabular-nums">
              {entry.price_usd ? formatUsd(entry.price_usd) : "sin precio"}
              {entry.copies > 1 && ` · ${entry.copies} libres`}
            </p>
          </li>
        ))}
      </ul>
    </section>
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
      <h2 className="font-display mt-4 text-lg font-semibold">
        Todavía no hay trueques
      </h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Un trueque necesita las dos mitades: que alguien quiera una de tus
        repetidas y que tenga repetida una de tu lista de deseos. Aparecerán aquí
        en cuanto las dos coincidan.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/collection?tengo=missing" className={buttonVariants()}>
          Marcar lo que buscas
        </Link>
        <Link
          href="/stats?tab=deseos"
          className={buttonVariants({ variant: "outline" })}
        >
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
        <Skeleton key={index} className="h-52 rounded-2xl" />
      ))}
    </div>
  );
}

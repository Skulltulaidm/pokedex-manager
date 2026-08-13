"use client";

import { ArrowLeftRight, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { apiClient } from "@/lib/api-client";
import { useRespondToOffer } from "@/lib/api/hooks/useRespondToOffer";
import { useWithdrawOffer } from "@/lib/api/hooks/useWithdrawOffer";
import type { OfferCardView, TradeOfferView } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  declined: "Rechazada",
  withdrawn: "Retirada",
};

/**
 * Offers the reader is party to.
 *
 * Received offers come first: one of them is waiting on this person, and the
 * ones they sent are waiting on somebody else.
 */
export function OfferList({ offers }: { offers: TradeOfferView[] }) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries();

  const respond = useRespondToOffer({
    client: { client: apiClient },
    mutation: {
      onSuccess: (offer) => {
        invalidate();
        toast.success(
          offer.status === "accepted" ? "Trueque aceptado" : "Oferta rechazada",
        );
      },
      onError: () => toast.error("No se pudo responder."),
    },
  });

  const withdraw = useWithdrawOffer({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("Oferta retirada");
      },
      onError: () => toast.error("No se pudo retirar."),
    },
  });

  const busy = respond.isPending || withdraw.isPending;
  const sorted = [...offers].sort((a, b) =>
    a.direction === b.direction ? 0 : a.direction === "received" ? -1 : 1,
  );

  return (
    <ul className="space-y-3">
      {sorted.map((offer) => (
        <li key={offer.id}>
          <article className="ring-edge bg-surface rounded-2xl p-4 ring-1">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="bg-secondary text-muted-foreground grid size-7 place-items-center rounded-full text-[11px] font-medium uppercase">
                  {(offer.partner_name ?? "?").slice(0, 2)}
                </span>
                <p className="text-sm font-medium">
                  {offer.direction === "received" ? "De" : "Para"}{" "}
                  {offer.partner_name ?? "un coleccionista"}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    offer.status === "pending"
                      ? "bg-secondary text-muted-foreground"
                      : offer.status === "accepted"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-muted text-muted-foreground/70",
                  )}
                >
                  {STATUS_LABEL[offer.status] ?? offer.status}
                </span>
              </div>

              <Balance balance={offer.balance} />
            </header>

            {offer.message && (
              <p className="text-muted-foreground mb-4 text-sm italic">
                “{offer.message}”
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Cards title="Entregas" cards={offer.you_give} value={offer.give_value} />
              <ArrowLeftRight className="text-muted-foreground/30 size-4" aria-hidden />
              <Cards title="Recibes" cards={offer.you_get} value={offer.get_value} />
            </div>

            {offer.status === "pending" && (
              <div className="border-edge mt-4 flex gap-2 border-t pt-3">
                {offer.direction === "received" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        respond.mutate({ offer_id: offer.id, data: { accept: true } })
                      }
                    >
                      <Check />
                      Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        respond.mutate({ offer_id: offer.id, data: { accept: false } })
                      }
                    >
                      <X />
                      Rechazar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => withdraw.mutate({ offer_id: offer.id })}
                  >
                    Retirar
                  </Button>
                )}
              </div>
            )}

            {offer.status === "accepted" && (
              <p className="text-muted-foreground/70 border-edge mt-4 border-t pt-3 text-xs">
                Acordado. Las cartas no se movieron de ninguna colección: cuando
                tengas la carta en la mano, cargala vos.
              </p>
            )}
          </article>
        </li>
      ))}
    </ul>
  );
}

function Balance({ balance }: { balance: string }) {
  const value = Number(balance);
  const favourable = value >= 0;

  return (
    <p
      className={cn(
        "font-mono text-sm font-medium tabular-nums",
        favourable ? "text-emerald-500" : "text-destructive",
      )}
    >
      {favourable ? "+" : "−"}
      {formatUsd(Math.abs(value))}
    </p>
  );
}

function Cards({
  title,
  cards,
  value,
}: {
  title: string;
  cards: OfferCardView[];
  value: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {title}
        </h3>
        <p className="font-mono text-xs tabular-nums">{formatUsd(value)}</p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {cards.map((entry) => (
          <li key={entry.card.id} className="w-11" title={entry.card.name}>
            <CardImage
              src={entry.card.image_small_url}
              alt={entry.card.name}
              sizes="44px"
              category={entry.card.category}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

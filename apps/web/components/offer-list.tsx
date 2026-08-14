"use client";

import { ArrowLeftRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useRespondToOffer } from "@/lib/api/hooks/useRespondToOffer";
import { useWithdrawOffer } from "@/lib/api/hooks/useWithdrawOffer";
import type { OfferCardView, TradeOfferView } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { conditionLabel, conditionShort } from "@/lib/labels";
import { Button, buttonVariants } from "@workspace/ui/components/button";
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
                <UserAvatar value={offer.partner_id} size={28} />
                <Link
                  href={`/collectors/${offer.partner_id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {offer.direction === "received" ? "De" : "Para"}{" "}
                  {offer.partner_name ?? "un coleccionista"}
                </Link>
                {offer.replies_to_id && (
                  <span className="text-muted-foreground/70 text-[11px]">
                    contraoferta
                  </span>
                )}
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
                    <Link
                      href={`/trades/new?con=${offer.partner_id}&responde=${offer.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <ArrowLeftRight />
                      Contraofertar
                    </Link>
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
        <p className="font-mono text-xs tabular-nums" title="Ajustado por el estado de cada carta">
          {formatUsd(value)}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {cards.map((entry) => (
          <li key={entry.card.id} className="w-14">
            <div title={`${entry.card.name} · ${conditionLabel(entry.condition)}`}>
              <CardImage
                src={entry.card.image_small_url}
                alt={entry.card.name}
                sizes="56px"
                category={entry.card.category}
              />
            </div>
            <p
              className="text-muted-foreground/80 mt-1 text-center font-mono text-[10px]"
              title={conditionLabel(entry.condition)}
            >
              {conditionShort(entry.condition)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

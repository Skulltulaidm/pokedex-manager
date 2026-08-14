"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, Search, X } from "lucide-react";
import { useState } from "react";

import { ConcentrationFigures } from "@/components/portfolio-concentration";
import { apiClient } from "@/lib/api-client";
import { simulateTrade } from "@/lib/api/clients/simulateTrade";
import { useMarketCards } from "@/lib/api/hooks/useMarketCards";
import type { TradeSimulationRequest } from "@/lib/api/types/TradeSimulationRequest";
import { formatUsd } from "@/lib/format";
import { Button } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

const RESULTS = 6;

type PickedCard = {
  id: string;
  name: string;
  setName: string;
  price: string | null | undefined;
  owned: number;
};

type Pick = { card: PickedCard; quantity: number };

/**
 * A swap that has not happened, priced.
 *
 * The interesting answer is not whether the two piles are worth the same — it is
 * what the collection looks like afterwards, which is why the shape travels
 * beside the money.
 */
export function PortfolioSimulator() {
  const [give, setGive] = useState<Pick[]>([]);
  const [receive, setReceive] = useState<Pick[]>([]);

  const request: TradeSimulationRequest = {
    give: give.map(({ card, quantity }) => ({ card_id: card.id, quantity })),
    receive: receive.map(({ card, quantity }) => ({ card_id: card.id, quantity })),
  };
  const empty = give.length === 0 && receive.length === 0;

  // A query rather than a mutation: the endpoint takes a body because it takes a
  // list of cards, but it writes nothing, and the answer should follow the
  // basket as it is edited instead of waiting for a button.
  const { data, isFetching, isError } = useQuery({
    queryKey: ["market-simulation", request],
    queryFn: () => simulateTrade(request, { client: apiClient }),
    enabled: !empty,
  });

  return (
    <section>
      <h2 className="font-display mb-1 text-lg font-semibold tracking-tight">
        Simulador de trueque
      </h2>
      <p className="text-muted-foreground mb-6 text-sm">
        Arma un intercambio hipotético y mira cómo queda tu cartera. No se envía
        nada ni cambia ninguna carta de dueño.
      </p>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Side
          title="Entregas"
          subtitle="Sólo cartas que tienes"
          picks={give}
          onChange={setGive}
          ownedOnly
        />
        <Side
          title="Recibes"
          subtitle="Cualquier carta del catálogo"
          picks={receive}
          onChange={setReceive}
        />
      </div>

      <div className="mt-6">
        {empty ? (
          <p className="text-muted-foreground ring-edge bg-surface/60 rounded-xl px-4 py-8 text-center text-sm ring-1">
            Elige al menos una carta de cualquiera de los dos lados.
          </p>
        ) : isError ? (
          <p className="text-destructive ring-edge bg-surface/60 rounded-xl px-4 py-8 text-center text-sm ring-1">
            No se pudo calcular el intercambio. Revisa que entregues copias que
            realmente tienes.
          </p>
        ) : data ? (
          <div className={cn("space-y-6", isFetching && "opacity-60")}>
            <Balance
              give={data.give_value}
              receive={data.receive_value}
              delta={data.value_delta}
            />

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div className="ring-edge bg-surface rounded-xl p-4 ring-1">
                <p className="text-muted-foreground mb-3 text-[11px] tracking-wide uppercase">
                  Ahora
                </p>
                <ConcentrationFigures shape={data.before} />
              </div>
              <ArrowRight
                className="text-muted-foreground/40 mx-auto size-5 shrink-0 rotate-90 lg:rotate-0"
                aria-hidden
              />
              <div className="ring-edge bg-surface rounded-xl p-4 ring-1">
                <p className="text-muted-foreground mb-3 text-[11px] tracking-wide uppercase">
                  Después
                </p>
                <ConcentrationFigures shape={data.after} />
              </div>
            </div>

            {data.unpriced_cards.length > 0 && (
              <p className="text-muted-foreground/80 text-xs leading-relaxed">
                {data.unpriced_cards.length}{" "}
                {data.unpriced_cards.length === 1
                  ? "carta del intercambio no tiene precio de mercado, así que no suma"
                  : "cartas del intercambio no tienen precio de mercado, así que no suman"}
                . El saldo de arriba vale sólo por lo que sí se puede tasar.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Balance({
  give,
  receive,
  delta,
}: {
  give: string;
  receive: string;
  delta: string;
}) {
  const amount = Number(delta);
  const up = amount >= 0;

  return (
    <div className="slab flex flex-wrap items-end justify-between gap-4 rounded-xl px-5 py-4">
      <div>
        <p className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
          Diferencia
        </p>
        <p
          className={cn(
            "font-display mt-1 text-2xl leading-none font-semibold tabular-nums",
            up ? "text-emerald-500" : "text-destructive",
          )}
        >
          {up ? "+" : "−"}
          {formatUsd(Math.abs(amount))}
        </p>
      </div>
      <dl className="text-xs">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Entregas</dt>
          <dd className="font-mono tabular-nums">{formatUsd(give)}</dd>
        </div>
        <div className="mt-1 flex gap-2">
          <dt className="text-muted-foreground">Recibes</dt>
          <dd className="font-mono tabular-nums">{formatUsd(receive)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Side({
  title,
  subtitle,
  picks,
  onChange,
  ownedOnly = false,
}: {
  title: string;
  subtitle: string;
  picks: Pick[];
  onChange: (picks: Pick[]) => void;
  ownedOnly?: boolean;
}) {
  const [query, setQuery] = useState("");

  const { data } = useMarketCards(
    {
      search: query || undefined,
      owned: ownedOnly ? "owned" : "all",
      sort: "price",
      limit: RESULTS,
    },
    { client: { client: apiClient } },
  );

  function add(card: PickedCard) {
    setQuery("");
    if (picks.some((pick) => pick.card.id === card.id)) return;
    onChange([...picks, { card, quantity: 1 }]);
  }

  function setQuantity(id: string, quantity: number) {
    onChange(
      quantity <= 0
        ? picks.filter((pick) => pick.card.id !== id)
        : picks.map((pick) =>
            pick.card.id === id ? { ...pick, quantity } : pick,
          ),
    );
  }

  const results = (data?.items ?? []).filter(
    (item) => !picks.some((pick) => pick.card.id === item.card.id),
  );

  return (
    <div className="ring-edge bg-surface/60 min-w-0 rounded-xl p-4 ring-1">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>

      <InputGroup className="bg-secondary h-10 rounded-full border-transparent">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          placeholder="Buscar carta…"
          aria-label={`Buscar carta para ${title.toLowerCase()}`}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>

      {query.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.length === 0 && (
            <li className="text-muted-foreground px-2 py-2 text-sm">
              Sin resultados.
            </li>
          )}
          {results.map((item) => (
            <li key={item.card.id}>
              <button
                onClick={() =>
                  add({
                    id: item.card.id,
                    name: item.card.name,
                    setName: item.card.card_set.name,
                    price: item.card.price_usd,
                    owned: item.owned,
                  })
                }
                className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.card.name}</span>
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {item.card.card_set.name}
                    {item.owned > 0 && ` · tienes ${item.owned}`}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  {item.card.price_usd == null ? (
                    <span className="text-muted-foreground/40">—</span>
                  ) : (
                    formatUsd(item.card.price_usd)
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 space-y-2">
        {picks.length === 0 && (
          <li className="text-muted-foreground/70 py-2 text-sm">
            Todavía no elegiste ninguna.
          </li>
        )}
        {picks.map(({ card, quantity }) => (
          <li key={card.id} className="slab flex items-center gap-2 rounded-lg p-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{card.name}</span>
              <span className="text-muted-foreground block truncate text-[11px] tabular-nums">
                {card.setName}
                <span className="mx-1.5">·</span>
                {card.price == null ? "sin precio" : formatUsd(card.price)}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar una copia de ${card.name}`}
                onClick={() => setQuantity(card.id, quantity - 1)}
              >
                <Minus />
              </Button>
              <span className="w-5 text-center font-mono text-sm tabular-nums">
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Añadir una copia de ${card.name}`}
                // Giving away copies that are not held is not a trade the API
                // will price, so the control stops before the request does.
                disabled={ownedOnly && quantity >= card.owned}
                onClick={() => setQuantity(card.id, quantity + 1)}
              >
                <Plus />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar ${card.name}`}
                onClick={() => setQuantity(card.id, 0)}
              >
                <X />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

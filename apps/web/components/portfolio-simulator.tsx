"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, Search, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { apiClient } from "@/lib/api-client";
import { proposeTrade } from "@/lib/api/clients/proposeTrade";
import { simulateTrade } from "@/lib/api/clients/simulateTrade";
import { useMarketCards } from "@/lib/api/hooks/useMarketCards";
import type { PortfolioConcentration } from "@/lib/api/types/PortfolioConcentration";
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
  imageUrl: string | null;
  category: string;
  price: string | null | undefined;
  owned: number;
};

type Pick = { card: PickedCard; quantity: number };

/**
 * A swap that has not happened, priced.
 *
 * The interesting answer is not whether the two piles are worth the same — it is
 * what the collection looks like afterwards, which is why the shape travels
 * beside the money, and why every figure says whether it moved the right way.
 */
export function PortfolioSimulator() {
  const [give, setGive] = useState<Pick[]>([]);
  const [receive, setReceive] = useState<Pick[]>([]);
  const [rationale, setRationale] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

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

  async function ask() {
    setAsking(true);
    try {
      const advice = await proposeTrade({ goal: null }, { client: apiClient });
      const load = (legs: typeof advice.give): Pick[] =>
        legs.map((leg) => ({
          card: {
            id: leg.card_id,
            name: leg.card_name,
            setName: leg.set_name ?? "",
            imageUrl: leg.image_url ?? null,
            category: leg.category ?? "Pokemon",
            price: leg.price_usd,
            owned: leg.owned ?? 1,
          },
          quantity: leg.quantity ?? 1,
        }));
      setGive(load(advice.give));
      setReceive(load(advice.receive));
      setRationale(advice.rationale);
    } catch {
      toast.error(
        "No se pudo proponer un trueque. Hacen falta cartas repetidas y una lista de deseos.",
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display mb-1 text-lg font-semibold tracking-tight">
            Simulador de trueque
          </h2>
          <p className="text-muted-foreground text-sm">
            Arma un intercambio hipotético y mira cómo queda tu cartera. No se envía
            nada ni cambia ninguna carta de dueño.
          </p>
        </div>
        <Button onClick={ask} disabled={asking} variant="outline" size="sm">
          <Sparkles />
          {asking ? "Pensando…" : "Que la IA proponga uno"}
        </Button>
      </div>

      {rationale && (
        <p className="ring-edge bg-surface mb-6 flex gap-2.5 rounded-xl px-4 py-3 text-sm ring-1">
          <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
          <span>{rationale}</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <Side
          title="Entregas"
          subtitle="Sólo cartas que tienes"
          tone="give"
          picks={give}
          onChange={(next) => {
            setGive(next);
            setRationale(null);
          }}
          ownedOnly
        />
        <ArrowRight
          className="text-muted-foreground/30 mx-auto size-5 shrink-0 rotate-90 lg:mt-24 lg:rotate-0"
          aria-hidden
        />
        <Side
          title="Recibes"
          subtitle="Cualquier carta del catálogo"
          tone="receive"
          picks={receive}
          onChange={(next) => {
            setReceive(next);
            setRationale(null);
          }}
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
          <div className={cn("space-y-4", isFetching && "opacity-60")}>
            <Verdict
              give={Number(data.give_value)}
              receive={Number(data.receive_value)}
              before={data.before}
              after={data.after}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Change
                label="Valor de la cartera"
                before={formatUsd(data.before.total_value, true)}
                after={formatUsd(data.after.total_value, true)}
                verdict={compare(
                  Number(data.after.total_value),
                  Number(data.before.total_value),
                )}
              />
              <Change
                label="Cartas distintas"
                before={String(data.before.priced_positions + data.before.unpriced_positions)}
                after={String(data.after.priced_positions + data.after.unpriced_positions)}
                verdict={compare(
                  data.after.priced_positions + data.after.unpriced_positions,
                  data.before.priced_positions + data.before.unpriced_positions,
                )}
              />
              <Change
                label="Mitad del valor en"
                before={cards(data.before.cards_for_half)}
                after={cards(data.after.cards_for_half)}
                hint="Más cartas es menos riesgo"
                verdict={compare(
                  data.after.cards_for_half ?? 0,
                  data.before.cards_for_half ?? 0,
                )}
              />
              <Change
                label="En la carta más cara"
                before={share(data.before)}
                after={share(data.after)}
                hint="Menos es menos riesgo"
                verdict={compare(
                  topShare(data.before),
                  topShare(data.after),
                )}
              />
            </div>

            {data.unpriced_cards.length > 0 && (
              <p className="text-muted-foreground/80 text-xs leading-relaxed">
                {data.unpriced_cards.length}{" "}
                {data.unpriced_cards.length === 1
                  ? "carta del intercambio no tiene precio de mercado, así que no suma"
                  : "cartas del intercambio no tienen precio de mercado, así que no suman"}
                . El saldo vale sólo por lo que sí se puede tasar.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function topShare(shape: PortfolioConcentration): number {
  return shape.buckets[0]?.share ?? 0;
}

// Already a percentage, not a fraction.
function share(shape: PortfolioConcentration): string {
  const value = topShare(shape);
  return value ? `${value.toFixed(1)}%` : "—";
}

function cards(count: number | null | undefined): string {
  return count == null ? "—" : `${count} ${count === 1 ? "carta" : "cartas"}`;
}

/** Higher is better, so callers pass the pair in the order that makes it so. */
function compare(after: number, before: number): "up" | "down" | "flat" {
  if (after > before) return "up";
  if (after < before) return "down";
  return "flat";
}

/**
 * The trade in one sentence, because four numbers moving at once is not an
 * answer to "should I do this".
 */
function Verdict({
  give,
  receive,
  before,
  after,
}: {
  give: number;
  receive: number;
  before: PortfolioConcentration;
  after: PortfolioConcentration;
}) {
  const delta = receive - give;
  const even = Math.abs(delta) < 1;
  const safer = topShare(after) < topShare(before);

  const money = even
    ? "Es un trueque parejo en dinero"
    : delta > 0
      ? `Recibes ${formatUsd(delta)} más de lo que entregas`
      : `Entregas ${formatUsd(-delta)} más de lo que recibes`;

  const shape =
    topShare(after) === topShare(before)
      ? "y tu cartera queda igual de concentrada"
      : safer
        ? "y tu cartera queda menos concentrada en una sola carta"
        : "y tu cartera queda más concentrada en una sola carta";

  return (
    <div className="slab flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4">
      <p className="max-w-lg text-sm leading-relaxed">
        <span
          className={cn(
            "font-display text-2xl font-semibold tabular-nums",
            even
              ? "text-foreground"
              : delta > 0
                ? "text-emerald-600"
                : "text-destructive",
          )}
        >
          {even ? "≈" : delta > 0 ? "+" : "−"}
          {formatUsd(Math.abs(delta))}
        </span>
        <span className="mt-1 block">
          {money} {shape}.
        </span>
      </p>

      <dl className="text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Entregas</dt>
          <dd className="font-mono tabular-nums">{formatUsd(give)}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <dt className="text-muted-foreground">Recibes</dt>
          <dd className="font-mono tabular-nums">{formatUsd(receive)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Change({
  label,
  before,
  after,
  hint,
  verdict,
}: {
  label: string;
  before: string;
  after: string;
  hint?: string;
  verdict: "up" | "down" | "flat";
}) {
  return (
    <div className="ring-edge bg-surface rounded-xl px-4 py-3 ring-1">
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-2 font-mono text-sm tabular-nums">
        <span className="text-muted-foreground/70 line-through decoration-1">{before}</span>
        <ArrowRight className="text-muted-foreground/40 size-3" aria-hidden />
        <span
          className={cn(
            "text-base font-medium",
            verdict === "up" && "text-emerald-600",
            verdict === "down" && "text-destructive",
          )}
        >
          {after}
        </span>
      </p>
      {hint && <p className="text-muted-foreground/60 mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

function Side({
  title,
  subtitle,
  tone,
  picks,
  onChange,
  ownedOnly = false,
}: {
  title: string;
  subtitle: string;
  tone: "give" | "receive";
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
        : picks.map((pick) => (pick.card.id === id ? { ...pick, quantity } : pick)),
    );
  }

  const results = (data?.items ?? []).filter(
    (item) => !picks.some((pick) => pick.card.id === item.card.id),
  );

  const total = picks.reduce(
    (sum, pick) => sum + Number(pick.card.price ?? 0) * pick.quantity,
    0,
  );

  return (
    <div className="ring-edge bg-surface/60 min-w-0 rounded-xl p-4 ring-1">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 font-medium">
          <span
            className={cn(
              "size-2 rounded-full",
              tone === "give" ? "bg-destructive" : "bg-emerald-500",
            )}
            aria-hidden
          />
          {title}
          {picks.length > 0 && (
            <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums">
              {picks.length}
            </span>
          )}
        </h3>
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
            <li className="text-muted-foreground px-2 py-2 text-sm">Sin resultados.</li>
          )}
          {results.map((item) => (
            <li key={item.card.id}>
              <button
                onClick={() =>
                  add({
                    id: item.card.id,
                    name: item.card.name,
                    setName: item.card.card_set.name,
                    imageUrl: item.card.image_small_url,
                    category: item.card.category,
                    price: item.card.price_usd,
                    owned: item.owned,
                  })
                }
                className="hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors"
              >
                <span className="w-7 shrink-0">
                  <CardImage
                    src={item.card.image_small_url}
                    alt=""
                    sizes="28px"
                    category={item.card.category}
                  />
                </span>
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

      {picks.length === 0 ? (
        <p className="text-muted-foreground/70 py-6 text-center text-sm">
          Todavía no elegiste ninguna.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3">
            {picks.map(({ card, quantity }) => (
              <li key={card.id}>
                <div className="relative">
                  <CardImage
                    src={card.imageUrl}
                    alt={card.name}
                    sizes="96px"
                    category={card.category}
                  />
                  <button
                    onClick={() => setQuantity(card.id, 0)}
                    aria-label={`Quitar ${card.name}`}
                    className="glass text-foreground absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full"
                  >
                    <X className="size-3" />
                  </button>
                </div>

                <p className="mt-1.5 truncate text-[12px] font-medium">{card.name}</p>
                <p className="text-muted-foreground font-mono text-[11px] tabular-nums">
                  {card.price == null ? "sin precio" : formatUsd(card.price)}
                </p>

                <div className="mt-1 flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar una copia de ${card.name}`}
                    onClick={() => setQuantity(card.id, quantity - 1)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-4 text-center font-mono text-xs tabular-nums">
                    {quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Añadir una copia de ${card.name}`}
                    // Giving away copies that are not held is not a trade the API
                    // will price, so the control stops before the request does.
                    disabled={ownedOnly && quantity >= card.owned}
                    onClick={() => setQuantity(card.id, quantity + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <p className="border-edge mt-3 flex justify-between border-t pt-2.5 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono font-medium tabular-nums">{formatUsd(total)}</span>
          </p>
        </>
      )}
    </div>
  );
}

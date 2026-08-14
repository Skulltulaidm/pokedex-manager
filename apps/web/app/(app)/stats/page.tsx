"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";

import { ActivityFeed } from "@/components/activity-feed";
import { BinderMark } from "@/components/binder-mark";
import { CardRow } from "@/components/card-row";
import { CardsDialog, type DialogCard } from "@/components/cards-dialog";
import { TypeSpectrum } from "@/components/coverage-strip";
import { PanelSkeleton, RowsSkeleton } from "@/components/pokeball";
import { PriceDelta } from "@/components/price-delta";
import { ReturnSummary } from "@/components/return-summary";
import { ScreenHeader } from "@/components/screen-header";
import { SetPositions } from "@/components/set-positions";
import { typeColor, typeLabel } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useUrlState } from "@/lib/url-state";
import { formatShare, formatUsd } from "@/lib/format";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { useMarketSummary } from "@/lib/api/hooks/useMarketSummary";
import type { CollectionStats } from "@/lib/api/types";
import { useListCollection } from "@/lib/api/hooks/useListCollection";
import {
  listWishlistQueryKey,
  useListWishlist,
} from "@/lib/api/hooks/useListWishlist";
import { useRemoveFromWishlist } from "@/lib/api/hooks/useRemoveFromWishlist";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function StatsPage() {
  return (
    <Suspense fallback={<StatsSkeleton />}>
      <Stats />
    </Suspense>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <PanelSkeleton className="h-24" />
      <PanelSkeleton className="h-40" />
    </div>
  );
}

function Stats() {
  // The tab lives in the URL so a link can point at the want list and a reload
  // stays where it was, the way the catalog already treats its filters.
  const [params, setParam] = useUrlState();
  // Which list is open, not which card: the dialog owns the card, so opening
  // one from the want list arrives with the rest of the want list beside it.
  const [openList, setOpenList] = useState<"holdings" | "wishes" | null>(null);
  const tab = params.get("tab") === "deseos" ? "deseos" : "resumen";
  const setTab = (next: string) => setParam({ tab: next === "resumen" ? undefined : next });

  const { data, isPending } = useCollectionStats({ client: { client: apiClient } });

  if (isPending) return <StatsSkeleton />;

  if (!data || data.total_groups === 0) return <Empty />;

  return (
    <div>
      <ScreenHeader title="Resumen" />

      <Tabs value={tab} onValueChange={(next) => setTab(next as string)}>
        <TabsList className="mb-6">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="deseos">Deseos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          {/* The right column is a stack of lists and outruns anything short
              beside it, so the long sections live on the left rather than
              below, where they left a column of nothing. */}
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:items-start">
          <div className="space-y-8">
          <section>
            <p className="font-display text-[2.75rem] leading-none font-semibold tabular-nums">
              {data.total_cards}
              <span className="text-muted-foreground ml-2.5 text-base font-medium">
                {data.total_cards === 1 ? "carta" : "cartas"}
              </span>
            </p>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {data.total_groups} {data.total_groups === 1 ? "entrada" : "entradas"} en{" "}
              {data.sets.length} {data.sets.length === 1 ? "set" : "sets"}
            </p>

            <Value value={data.value} />

            {data.types.length > 0 && (
              <div className="mt-6">
                <TypeSpectrum entries={data.types} />
                <ul className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2">
                  {data.types.map((entry) => (
                    <li key={entry.type} className="flex items-center gap-1.5 text-sm">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          background: typeColor(entry.type),
                          boxShadow: `0 0 8px ${typeColor(entry.type)}`,
                        }}
                      />
                      {typeLabel(entry.type)}
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {entry.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Tus sets
            </h2>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              Cada casilla es una carta impresa; las encendidas son las tuyas. Van
              ordenados por lo que cuesta terminarlos, no por lo que les falta.
            </p>

            <SetPositions />
          </section>

          {data.generations.length > 0 && (
            <section>
              <h2 className="font-display mb-4 text-lg font-semibold tracking-tight">
                Generaciones
              </h2>
              <ul className="space-y-2.5">
                {data.generations.map((entry) => (
                  <li key={entry.generation} className="flex items-center gap-3">
                    <span className="text-muted-foreground w-14 shrink-0 text-sm">
                      Gen {entry.generation}
                    </span>
                    <span className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-foreground block h-full rounded-full"
                        style={{
                          width: `${Math.max(3, (entry.count / data.total_groups) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right font-mono text-sm tabular-nums">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </div>

          <div className="space-y-8">
            <TopHoldings total={Number(data.value.total_usd)} onOpen={() => setOpenList("holdings")} />
            <section>
              <h2 className="font-display mb-3 text-lg font-semibold tracking-tight">
                Actividad
              </h2>
              <ActivityFeed />
            </section>
          </div>
          </div>
        </TabsContent>

        <TabsContent value="deseos">
          <Wishlist onOpen={() => setOpenList("wishes")} />
        </TabsContent>
      </Tabs>

      <ListDialog which={openList} onClose={() => setOpenList(null)} />
    </div>
  );
}

/**
 * The coverage sits next to the total on purpose: most cards carry no market
 * price, and the figure alone would read as complete.
 */
function Value({ value }: { value: CollectionStats["value"] }) {
  const { data: summary } = useMarketSummary({ client: { client: apiClient } });

  if (value.priced_cards === 0) return null;

  const total = Number(value.total_usd);
  const covered = value.priced_cards + value.unpriced_cards;
  const coverage = covered === 0 ? 0 : (value.priced_cards / covered) * 100;

  return (
    <section className="ring-edge bg-surface mt-6 rounded-2xl p-5 ring-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Valor estimado
          </p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
            <p className="font-display text-[2.25rem] leading-none font-semibold tabular-nums">
              {formatUsd(total, true)}
            </p>
            <PriceDelta change={summary?.change} showAmount />
          </div>
        </div>
        <span className="ring-edge text-muted-foreground rounded-full px-2.5 py-1 text-[11px] ring-1">
          USD
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Cartas con precio</span>
          <span className="font-mono tabular-nums">
            {value.priced_cards}
            <span className="text-muted-foreground/50">/{covered}</span>
          </span>
        </div>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-foreground h-full rounded-full transition-[width] duration-700"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      <ReturnSummary performance={summary?.performance} className="mt-5" />

      <p className="text-muted-foreground/70 mt-4 text-xs leading-relaxed">
        Orientativo. Es el precio de mercado de TCGplayer para cada carta, no una
        tasación: el estado real y la edición cambian lo que vale.
      </p>
    </section>
  );
}

/**
 * The cards carrying the value, largest first. A portfolio is read by its
 * positions, not only by its total.
 */
function TopHoldings({ total, onOpen }: { total: number; onOpen: () => void }) {
  const { data, isPending } = useListCollection(
    { sort: "price" as never, limit: 5 },
    { client: { client: apiClient } },
  );

  if (isPending) return <RowsSkeleton count={5} height="h-[76px]" />;

  const priced = data?.items.filter((item) => item.card.price_usd != null) ?? [];
  if (priced.length === 0) return null;

  // Concentration: a portfolio resting on a handful of cards carries a
  // different risk from one spread across a hundred, and the total hides it.
  const top = priced.reduce(
    (sum, item) => sum + Number(item.card.price_usd) * item.quantity,
    0,
  );

  return (
    <section>
      <h2 className="font-display mb-1 text-lg font-semibold tracking-tight">
        Tus cartas más valiosas
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Estas {priced.length} suman el {formatShare(top, total)} de tu cartera.
      </p>
      <ul className="space-y-2.5">
        {priced.map((item) => {
          const unit = Number(item.card.price_usd);
          const line = unit * item.quantity;
          return (
            <li key={item.id}>
              <button
                onClick={onOpen}
                className="block w-full text-left"
                aria-label={`Ver ${item.card.name}`}
              >
                <CardRow
                  name={item.card.name}
                  number={item.card.number}
                  printedTotal={item.card.card_set.printed_total}
                  setName={item.card.card_set.name}
                  imageUrl={item.card.image_small_url ?? null}
                  types={item.card.species?.types ?? []}
                >
                  <div className="shrink-0 text-right">
                    <p className="text-[15px] font-semibold tabular-nums">
                      {formatUsd(line)}
                    </p>
                    <p className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {formatShare(line, total)}
                      {item.quantity > 1 && ` · ${item.quantity} × ${formatUsd(unit)}`}
                    </p>
                  </div>
                </CardRow>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Wishlist({ onOpen }: { onOpen: () => void }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useListWishlist({ client: { client: apiClient } });
  const { mutate: remove } = useRemoveFromWishlist({
    client: { client: apiClient },
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: listWishlistQueryKey() }),
    },
  });

  if (isPending) return <RowsSkeleton count={5} height="h-[76px]" />;
  if (!data?.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-muted-foreground mx-auto max-w-xs text-sm">
          Aquí llegan las cartas que quieres, incluidas las que te sugiera el
          asistente.
        </p>
        <Link href="/chat" className={cn(buttonVariants({ variant: "outline" }), "mt-5")}>
          Preguntar qué me conviene
        </Link>
      </div>
    );
  }

  // A want list is a shopping list, so it is priced and ordered like one.
  const sorted = [...data].sort(
    (a, b) => Number(b.card.price_usd ?? 0) - Number(a.card.price_usd ?? 0),
  );
  // A card already on the shelf costs nothing to get: counting it would send
  // the reader shopping for what they own and overstate the total.
  const missing = sorted.filter((item) => (item.owned ?? 0) === 0);
  const held = sorted.length - missing.length;
  const priced = missing.filter((item) => item.card.price_usd != null);
  const total = priced.reduce((sum, item) => sum + Number(item.card.price_usd), 0);
  const suggested = sorted.filter((item) => item.added_by === "agent").length;

  return (
    <>
      <div className="slab mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl px-5 py-4">
        <div>
          <p className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
            Comprarlas todas
          </p>
          <p className="font-display text-primary mt-1 text-2xl leading-none font-semibold tabular-nums">
            {formatUsd(total, true)}
          </p>
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {missing.length} {missing.length === 1 ? "carta" : "cartas"} por conseguir
          {priced.length < missing.length &&
            ` · ${missing.length - priced.length} sin precio`}
          {held > 0 && ` · ${held} que ya tienes`}
          {suggested > 0 &&
            ` · ${suggested} ${suggested === 1 ? "sugerida" : "sugeridas"} por el asistente`}
        </p>
      </div>

      <ul className="grid gap-2.5 lg:grid-cols-2">
        {sorted.map((item) => (
          <li key={item.id}>
            <button
              onClick={onOpen}
              className="block w-full text-left"
              aria-label={`Ver ${item.card.name}`}
            >
            <CardRow
              name={item.card.name}
              number={item.card.number}
              printedTotal={item.card.card_set.printed_total}
              setName={item.card.card_set.name}
              imageUrl={item.card.image_small_url ?? null}
              types={item.card.species?.types ?? []}
              note={
                <p className="text-muted-foreground/80 mt-1 text-xs">
                  {(item.owned ?? 0) > 0 && (
                    <span className="text-emerald-600">
                      Ya tienes {item.owned} ·{" "}
                    </span>
                  )}
                  {item.added_by === "agent" ? "Sugerida · " : ""}
                  {item.reason}
                </p>
              }
            >
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    (item.owned ?? 0) > 0 && "text-muted-foreground/40 line-through",
                  )}
                >
                  {item.card.price_usd == null ? (
                    <span className="text-muted-foreground/40">—</span>
                  ) : (
                    formatUsd(item.card.price_usd)
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${item.card.name} de deseos`}
                  onClick={() => remove({ item_id: item.id })}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardRow>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Empty() {
  return (
    <>
      <ScreenHeader title="Resumen" />
      <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-16 text-center ring-1">
        <BinderMark className="mx-auto mb-7" />
        <h2 className="font-display text-lg font-semibold">
          Todavía no hay nada que resumir
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
          En cuanto registres unas cartas verás de qué tipos es tu colección y
          cuánto te falta para completar cada set.
        </p>
        <Link href="/scan" className={cn(buttonVariants(), "mt-6")}>
          Escanear una carta
        </Link>
      </div>
    </>
  );
}

/**
 * The two lists on this screen, in the dialog the sets already use.
 *
 * Both are short enough to arrive whole, so neither brings a toolbar: searching
 * five holdings is a control nobody needs.
 */
function ListDialog({
  which,
  onClose,
}: {
  which: "holdings" | "wishes" | null;
  onClose: () => void;
}) {
  const { data: holdings } = useListCollection(
    { sort: "price" as never, limit: 20 },
    { client: { client: apiClient }, query: { enabled: which === "holdings" } },
  );
  const { data: wishes } = useListWishlist({
    client: { client: apiClient },
    query: { enabled: which === "wishes" },
  });

  const cards: DialogCard[] =
    which === "holdings"
      ? (holdings?.items ?? []).map((item) => ({
          id: item.card.id,
          name: item.card.name,
          number: item.card.number,
          printedTotal: item.card.card_set.printed_total,
          imageUrl: item.card.image_small_url,
          category: item.card.category,
          price: item.card.price_usd === null ? null : Number(item.card.price_usd),
          owned: item.quantity,
        }))
      : (wishes ?? []).map((wish) => ({
          id: wish.card.id,
          name: wish.card.name,
          number: wish.card.number,
          printedTotal: wish.card.card_set.printed_total,
          imageUrl: wish.card.image_small_url,
          category: wish.card.category,
          price: wish.card.price_usd === null ? null : Number(wish.card.price_usd),
          owned: wish.owned ?? 0,
          note: (wish.owned ?? 0) > 0 ? `Ya tienes ${wish.owned}` : (wish.reason ?? undefined),
        }));

  return (
    <CardsDialog
      open={which !== null}
      onClose={onClose}
      title={which === "wishes" ? "Tus deseos" : "Tus cartas más valiosas"}
      count={cards.length}
      cards={cards}
      loading={which !== null && cards.length === 0}
    />
  );
}

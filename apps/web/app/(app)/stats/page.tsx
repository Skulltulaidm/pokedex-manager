"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BinderMark } from "@/components/binder-mark";
import { CardRow } from "@/components/card-row";
import { CoverageStrip, TypeSpectrum } from "@/components/coverage-strip";
import { ScreenHeader } from "@/components/screen-header";
import { typeColor, typeLabel } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import type { CollectionStats } from "@/lib/api/types";
import { useListGaps } from "@/lib/api/hooks/useListGaps";
import {
  listWishlistQueryKey,
  useListWishlist,
} from "@/lib/api/hooks/useListWishlist";
import { useRemoveFromWishlist } from "@/lib/api/hooks/useRemoveFromWishlist";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function StatsPage() {
  const [tab, setTab] = useState("resumen");
  const { data, isPending } = useCollectionStats({ client: { client: apiClient } });

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || data.total_groups === 0) return <Empty />;

  return (
    <div>
      <ScreenHeader title="Resumen" />

      <Tabs value={tab} onValueChange={(next) => setTab(next as string)}>
        <TabsList className="mb-6">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="falta">Me falta</TabsTrigger>
          <TabsTrigger value="deseos">Deseos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-9">
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
              Cobertura por set
            </h2>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              Cada casilla es una carta impresa. Las encendidas son las tuyas, y su
              color es el tipo de la carta.
            </p>

            <div className="space-y-7">
              {data.sets.map((set) => (
                <div key={set.set_id}>
                  <div className="mb-2.5 flex items-baseline justify-between gap-3">
                    <h3 className="truncate font-medium">{set.set_name}</h3>
                    <p className="shrink-0 font-mono text-sm tabular-nums">
                      {set.owned}
                      <span className="text-muted-foreground/50">/{set.printed_total}</span>
                    </p>
                  </div>
                  <CoverageStrip
                    printedTotal={set.printed_total}
                    ownedSlots={set.owned_slots}
                  />
                </div>
              ))}
            </div>
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
        </TabsContent>

        <TabsContent value="falta">
          <Gaps />
        </TabsContent>

        <TabsContent value="deseos">
          <Wishlist />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * The coverage sits next to the total on purpose: most cards carry no market
 * price, and the figure alone would read as complete.
 */
function Value({ value }: { value: CollectionStats["value"] }) {
  const total = Number(value.total_eur);
  if (value.priced_cards === 0) return null;

  return (
    <div className="ring-edge bg-surface mt-6 rounded-2xl p-4 ring-1">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        Valor estimado
      </p>
      <p className="font-display mt-1 text-2xl font-semibold tabular-nums">
        {total.toLocaleString("es", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
      </p>
      <p className="text-muted-foreground mt-1.5 text-sm">
        {value.unpriced_cards > 0
          ? `De ${value.priced_cards} ${value.priced_cards === 1 ? "carta" : "cartas"} con precio de mercado. ${value.unpriced_cards} sin precio.`
          : `Todas tus cartas tienen precio de mercado.`}
      </p>
    </div>
  );
}

function Gaps() {
  const { data, isPending } = useListGaps({ limit: 60 }, { client: { client: apiClient } });

  if (isPending) return <RowsSkeleton />;
  if (!data?.length) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        No te falta ninguna carta de los sets que empezaste.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {data.map((gap) => (
        <section key={gap.set_id}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {gap.set_name}
            </h2>
            <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
              {gap.missing.length} por conseguir
            </p>
          </div>
          <ul className="space-y-2.5">
            {gap.missing.map((card) => (
              <li key={card.id}>
                <CardRow
                  name={card.name}
                  number={card.number}
                  printedTotal={card.card_set.printed_total}
                  setName={card.card_set.name}
                  imageUrl={card.image_small_url ?? null}
                  types={card.species?.types ?? []}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Wishlist() {
  const queryClient = useQueryClient();
  const { data, isPending } = useListWishlist({ client: { client: apiClient } });
  const { mutate: remove } = useRemoveFromWishlist({
    client: { client: apiClient },
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: listWishlistQueryKey() }),
    },
  });

  if (isPending) return <RowsSkeleton />;
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

  return (
    <ul className="space-y-2.5">
      {data.map((item) => (
        <li key={item.id}>
          <CardRow
            name={item.card.name}
            number={item.card.number}
            printedTotal={item.card.card_set.printed_total}
            setName={item.card.card_set.name}
            imageUrl={item.card.image_small_url ?? null}
            types={item.card.species?.types ?? []}
            note={
              <p className="text-muted-foreground/80 mt-1 text-xs">
                {item.added_by === "agent" ? "Sugerida · " : ""}
                {item.reason}
              </p>
            }
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Quitar ${item.card.name} de deseos`}
              onClick={() => remove({ item_id: item.id })}
            >
              <Trash2 />
            </Button>
          </CardRow>
        </li>
      ))}
    </ul>
  );
}

function RowsSkeleton() {
  return (
    <ul className="space-y-2.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={index}>
          <Skeleton className="h-[76px] w-full rounded-2xl" />
        </li>
      ))}
    </ul>
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

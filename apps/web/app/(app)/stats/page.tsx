"use client";

import Link from "next/link";

import { BinderMark } from "@/components/binder-mark";
import { ScreenHeader } from "@/components/screen-header";
import { CoverageStrip, TypeSpectrum } from "@/components/coverage-strip";
import { typeColor, typeLabel } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

export default function StatsPage() {
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

  if (!data || data.total_groups === 0) {
    return (
      <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-16 text-center ring-1">
        <BinderMark className="mx-auto mb-7" />
        <h2 className="font-display text-lg font-bold">Todavía no hay nada que resumir</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
          En cuanto registres unas cartas verás de qué tipos es tu colección y
          cuánto te falta para completar cada set.
        </p>
        <Link href="/collection/add" className={cn(buttonVariants(), "mt-6")}>
          Agregar una carta
        </Link>
      </div>
    );
  }

  const missing = data.sets.reduce(
    (sum, set) => sum + (set.printed_total - set.owned),
    0,
  );

  return (
    <div className="space-y-9">
      <ScreenHeader title="Resumen" />

      <section>
        <p className="font-display text-[2.75rem] leading-none font-semibold tabular-nums">
          {data.total_cards}
          <span className="text-muted-foreground ml-2.5 text-base font-medium">
            {data.total_cards === 1 ? "carta" : "cartas"}
          </span>
        </p>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {data.total_groups} {data.total_groups === 1 ? "entrada" : "entradas"} ·{" "}
          {missing} por conseguir en los sets que ya empezaste
        </p>

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
        <h2 className="font-display text-lg font-bold tracking-tight">Cobertura por set</h2>
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
          <h2 className="font-display mb-4 text-lg font-bold tracking-tight">
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
  );
}

"use client";

import { ArrowLeftRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { TypeChip, typeColor } from "@/components/type-dot";
import { VisualComparison } from "@/components/visual-comparison";
import { apiClient } from "@/lib/api-client";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import type { CardView } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { STAT_LABEL, STAT_MAX, STAT_ORDER, formatReleaseDate } from "@/lib/labels";
import { buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

function Comparison() {
  const params = useSearchParams();
  const ids = [params.get("a"), params.get("b")];

  const left = useGetCard(ids[0] ?? "", {
    client: { client: apiClient },
    query: { enabled: Boolean(ids[0]) },
  });
  const right = useGetCard(ids[1] ?? "", {
    client: { client: apiClient },
    query: { enabled: Boolean(ids[1]) },
  });

  if (!ids[0] || !ids[1]) return <Empty />;
  if (left.isPending || right.isPending) return <ComparisonSkeleton />;
  if (!left.data || !right.data) return <Empty />;

  const cards = [left.data, right.data] as const;

  return (
    <>
      <Breadcrumbs
        trail={[{ label: "Colección", href: "/collection" }, { label: "Comparar" }]}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {cards.map((card) => (
          <Portrait key={card.id} card={card} />
        ))}
      </div>

      <Duel
        label="Precio orientativo"
        values={cards.map((card) =>
          card.price_usd == null ? null : Number(card.price_usd),
        )}
        render={(value) => (value === null ? "—" : formatUsd(value))}
      />
      <Duel
        label="PS impresos"
        values={cards.map((card) => card.hp)}
        render={(value) => value ?? "—"}
      />
      <Duel
        label="Salió"
        values={cards.map((card) =>
          card.card_set.release_date
            ? new Date(card.card_set.release_date).getTime()
            : null,
        )}
        render={(_, index) =>
          cards[index]!.card_set.release_date
            ? formatReleaseDate(cards[index]!.card_set.release_date!)
            : "—"
        }
        lowerWins
      />

      <VisualComparison a={cards[0].id} b={cards[1].id} />

      {cards.every((card) => card.species) && (
        <section className="mt-9">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-tight">
            Especie
          </h2>
          <ul className="space-y-3.5">
            {STAT_ORDER.filter((key) =>
              cards.every((card) => key in (card.species?.stats ?? {})),
            ).map((key) => {
              const values = cards.map((card) => card.species!.stats[key] ?? 0);
              return (
                <li key={key}>
                  <p className="text-muted-foreground mb-1.5 text-center text-xs">
                    {STAT_LABEL[key]}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">
                      {values[0]}
                    </span>
                    <Bar value={values[0]!} color={typeColor(cards[0].species!.types[0] ?? "normal")} align="end" />
                    <Bar value={values[1]!} color={typeColor(cards[1].species!.types[0] ?? "normal")} align="start" />
                    <span className="w-8 shrink-0 font-mono text-sm tabular-nums">
                      {values[1]}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Portrait({ card }: { card: CardView }) {
  return (
    <div>
      <div className="relative">
        <div
          aria-hidden
          className="aura absolute -inset-6 opacity-55 blur-2xl"
          style={{ "--glow": typeColor(card.species?.types[0] ?? "normal") } as React.CSSProperties}
        />
        <div className="ring-edge relative aspect-[63/88] overflow-hidden rounded-xl ring-1">
          {card.image_large_url && (
            <Image
              src={card.image_large_url}
              alt={card.name}
              fill
              sizes="(min-width: 640px) 40vw, 46vw"
              className="object-cover"
            />
          )}
        </div>
      </div>
      <p className="mt-3 truncate text-[15px] font-semibold">{card.name}</p>
      <p className="text-muted-foreground font-mono text-xs tabular-nums">
        {card.number}
        <span className="text-muted-foreground/50">/{card.card_set.printed_total}</span>
      </p>
      {card.species && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.species.types.map((type) => (
            <TypeChip key={type} type={type} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One fact, both cards, and the winner marked. A comparison that only prints two
 * columns leaves the reader to do the subtraction.
 */
function Duel({
  label,
  values,
  render,
  lowerWins = false,
}: {
  label: string;
  values: (number | null)[];
  render: (value: number | null, index: number) => React.ReactNode;
  lowerWins?: boolean;
}) {
  const a = values[0] ?? null;
  const b = values[1] ?? null;
  let winner: 0 | 1 | null = null;
  if (a !== null && b !== null && a !== b) {
    const aWins = lowerWins ? a < b : a > b;
    winner = aWins ? 0 : 1;
  }

  return (
    <div className="ring-edge bg-surface mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl px-4 py-3 ring-1">
      <p className={cn("text-right tabular-nums", winner === 0 ? "font-semibold" : "text-muted-foreground")}>
        {render(a ?? null, 0)}
      </p>
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className={cn("tabular-nums", winner === 1 ? "font-semibold" : "text-muted-foreground")}>
        {render(b ?? null, 1)}
      </p>
    </div>
  );
}

function Bar({
  value,
  color,
  align,
}: {
  value: number;
  color: string;
  align: "start" | "end";
}) {
  return (
    <span className={cn("bg-muted h-2 flex-1 overflow-hidden rounded-full", align === "end" && "flex justify-end")}>
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${(value / STAT_MAX) * 100}%`, background: color }}
      />
    </span>
  );
}

function ComparisonSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <Skeleton className="aspect-[63/88] rounded-xl" />
        <Skeleton className="aspect-[63/88] rounded-xl" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-12 rounded-xl" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-16 text-center ring-1">
      <ArrowLeftRight className="text-muted-foreground/40 mx-auto mb-5 size-10" strokeWidth={1.25} />
      <h2 className="font-display text-lg font-semibold">Elige dos cartas</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Desde tu colección puedes comparar dos cartas lado a lado: precio, PS y
        las estadísticas de cada especie.
      </p>
      <Link href="/collection" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
        Ir a mi colección
      </Link>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<ComparisonSkeleton />}>
      <Comparison />
    </Suspense>
  );
}

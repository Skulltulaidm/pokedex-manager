"use client";

import { ArrowLeftRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CardImage } from "@/components/card-image";
import { TypeChip } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import { useListCollection } from "@/lib/api/hooks/useListCollection";
import type { CardView, CollectionItemView } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { conditionLabel } from "@/lib/labels";
import { buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

type Side = {
  card: CardView;
  owned: CollectionItemView | undefined;
  unit: number | null;
  position: number;
};

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
  const { data: mine } = useListCollection(
    { limit: 200 },
    { client: { client: apiClient } },
  );

  if (!ids[0] || !ids[1]) return <Empty />;
  if (left.isPending || right.isPending) return <ComparisonSkeleton />;
  if (!left.data || !right.data) return <Empty />;

  const sides: Side[] = [left.data, right.data].map((card) => {
    const owned = mine?.items.find((item) => item.card.id === card.id);
    const unit = card.price_usd == null ? null : Number(card.price_usd);
    return { card, owned, unit, position: (unit ?? 0) * (owned?.quantity ?? 0) };
  });

  const [a, b] = sides as [Side, Side];
  const gap =
    a.unit !== null && b.unit !== null ? Math.abs(a.unit - b.unit) : null;
  const dearer = a.unit !== null && b.unit !== null ? (a.unit > b.unit ? a : b) : null;

  return (
    <>
      <Breadcrumbs
        trail={[{ label: "Colección", href: "/collection" }, { label: "Comparar" }]}
      />

      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-2 gap-4 sm:gap-8">
          {sides.map((side) => (
            <Portrait key={side.card.id} side={side} />
          ))}
        </div>

        {dearer && gap !== null && gap > 0 && (
          <p className="text-muted-foreground mt-6 flex items-center justify-center gap-2 text-sm">
            <TrendingUp className="size-4" />
            <span className="text-foreground font-medium">{dearer.card.name}</span>
            cuesta {formatUsd(gap)} más
          </p>
        )}

        <dl className="mt-6">
          <Row
            label="Precio de mercado"
            values={sides.map((side) => (side.unit === null ? "—" : formatUsd(side.unit)))}
            winner={dearer ? sides.indexOf(dearer) : null}
          />
          <Row
            label="En tu colección"
            values={sides.map((side) =>
              side.owned ? `×${side.owned.quantity} · ${conditionLabel(side.owned.condition)}` : "No la tienes",
            )}
          />
          <Row
            label="Valor de tu posición"
            values={sides.map((side) =>
              side.position > 0 ? formatUsd(side.position) : "—",
            )}
            winner={
              a.position === b.position ? null : a.position > b.position ? 0 : 1
            }
          />
          <Row label="Rareza" values={sides.map((side) => side.card.rarity ?? "—")} />
          <Row
            label="Set"
            values={sides.map(
              (side) =>
                `${side.card.card_set.name} · ${side.card.number}/${side.card.card_set.printed_total}`,
            )}
          />
          <Row
            label="Año"
            values={sides.map((side) =>
              side.card.card_set.release_date
                ? String(new Date(side.card.card_set.release_date).getFullYear())
                : "—",
            )}
          />
        </dl>
      </div>
    </>
  );
}

function Portrait({ side }: { side: Side }) {
  const { card } = side;

  return (
    <div>
      <CardImage
        src={card.image_large_url ?? null}
        alt={card.name}
        sizes="190px"
        locked={!side.owned}
        className="mx-auto w-full max-w-[190px]"
      />

      <p className="mt-3 truncate text-center text-[15px] font-semibold">{card.name}</p>
      <p className="font-display text-center text-xl font-semibold tabular-nums">
        {side.unit === null ? "—" : formatUsd(side.unit)}
      </p>
      {card.species && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {card.species.types.map((type) => (
            <TypeChip key={type} type={type} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One fact, both cards, and the better side marked where there is one. */
function Row({
  label,
  values,
  winner,
}: {
  label: string;
  values: string[];
  winner?: number | null;
}) {
  return (
    <div className="border-edge grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b py-3 last:border-0">
      <dd
        className={cn(
          "truncate text-right text-sm tabular-nums",
          winner === 0 ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {values[0]}
      </dd>
      <dt className="text-muted-foreground/70 w-32 text-center text-[11px] tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-sm tabular-nums",
          winner === 1 ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {values[1]}
      </dd>
    </div>
  );
}

function ComparisonSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:gap-8">
        <Skeleton className="mx-auto aspect-[63/88] w-full max-w-[190px] rounded-xl" />
        <Skeleton className="mx-auto aspect-[63/88] w-full max-w-[190px] rounded-xl" />
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-11 rounded-lg" />
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
        Desde tu colección puedes comparar dos cartas: qué cuesta cada una, cuánto
        vale lo que tienes de ellas y de qué set son.
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

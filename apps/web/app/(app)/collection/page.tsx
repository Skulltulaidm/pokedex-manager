"use client";

import { ArrowLeftRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { BinderMark } from "@/components/binder-mark";
import { CardPocket } from "@/components/card-pocket";
import { FilterBar } from "@/components/filter-bar";
import { Pager } from "@/components/pager";
import { PortfolioBar } from "@/components/portfolio-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollRow } from "@/components/scroll-row";
import { ShareMenu } from "@/components/share-menu";
import { TYPE_ICON, typeColor, typeLabel } from "@/components/type-dot";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { useListCollection } from "@/lib/api/hooks/useListCollection";
import { conditionLabel } from "@/lib/labels";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

// Rows per page. The page size itself is the column count times this, so a
// page always fills its rows whatever the viewport resolves to.
const ROWS_PER_PAGE = 6;
const FALLBACK_COLUMNS = 6;


function CollectionGrid() {
  const params = useSearchParams();
  const router = useRouter();

  const type = params.get("type") ?? undefined;
  const setId = params.get("set") ?? undefined;
  const generation = params.get("gen") ?? undefined;
  const condition = params.get("estado") ?? undefined;
  const query = params.get("q") ?? "";
  const sort = params.get("orden") ?? "recent";
  const page = Number(params.get("p") ?? 1);

  const [draft, setDraft] = useState(query);
  const [gridRef, measured] = useGridColumns();
  const columns = measured || FALLBACK_COLUMNS;
  const pageSize = columns * ROWS_PER_PAGE;

  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  function pick(cardId: string) {
    const next = picked.includes(cardId)
      ? picked.filter((id) => id !== cardId)
      : [...picked, cardId].slice(-2);

    setPicked(next);
    if (next.length === 2) router.push(`/compare?a=${next[0]}&b=${next[1]}`);
  }
  const activeFilters = [setId, generation, condition, params.get("orden")].filter(
    Boolean,
  ).length;

  useEffect(() => setDraft(query), [query]);

  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => setParam({ q: draft || undefined, p: undefined }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const { data: stats } = useCollectionStats({ client: { client: apiClient } });
  const { data, isPending, error } = useListCollection(
    {
      type,
      set_id: setId,
      generation: generation ? Number(generation) : undefined,
      condition: condition as never,
      search: query || undefined,
      sort: sort as never,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    },
    { client: { client: apiClient } },
  );

  function setParam(next: Record<string, string | undefined>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.replace(search.size ? `/collection?${search}` : "/collection", { scroll: false });
  }

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <ScreenHeader
        title="Mi colección"
        meta={
          data && (
            <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
              {total}
            </span>
          )
        }
      >
        <Pager page={page} lastPage={lastPage} onChange={(next) => setParam({ p: String(next) })} />
        <Button
          variant={comparing ? "default" : "ghost"}
          size="icon"
          aria-label={comparing ? "Salir de comparar" : "Comparar dos cartas"}
          onClick={() => {
            setComparing(!comparing);
            setPicked([]);
          }}
        >
          <ArrowLeftRight />
        </Button>
        <ShareMenu />
      </ScreenHeader>

      <PortfolioBar />

      <div className="mb-3 flex gap-2">
        <InputGroup className="bg-secondary h-11 flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Buscar una carta"
            aria-label="Buscar en tu colección"
          />
          {draft && (
            <InputGroupAddon align="inline-end">
              <button onClick={() => setDraft("")} aria-label="Limpiar búsqueda">
                <X className="size-4" />
              </button>
            </InputGroupAddon>
          )}
        </InputGroup>

      </div>

      {comparing && (
        <p className="ring-edge bg-surface text-muted-foreground mb-4 rounded-xl px-4 py-2.5 text-sm ring-1">
          {picked.length === 0
            ? "Toca dos cartas para compararlas."
            : "Toca una segunda carta."}
        </p>
      )}

      <div className="mb-4">
        <FilterBar />
      </div>

      {stats && stats.types.length > 0 && (
        <ScrollRow className="mb-5">
          <Chip active={!type} onClick={() => setParam({ type: undefined, p: undefined })}>
            Todos
          </Chip>
          {stats.types.map((entry) => (
            <TypeFilterChip
              key={entry.type}
              type={entry.type}
              count={entry.count}
              active={type === entry.type}
              onClick={() => setParam({ type: entry.type, p: undefined })}
            />
          ))}
        </ScrollRow>
      )}

      {isPending && <PocketSkeleton />}

      {error && (
        <p className="text-destructive text-sm">
          No se pudo cargar la colección. Revisa que el servidor esté corriendo.
        </p>
      )}

      {data && data.items.length === 0 && (
        <EmptyCollection filtered={Boolean(query || type || activeFilters)} />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul
            ref={gridRef}
            className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
          >
            {data.items.map((item, index) => (
              <li
                key={item.id}
                className="settle"
                style={{ "--index": Math.min(index, 11) } as React.CSSProperties}
              >
                <ItemLink
                  comparing={comparing}
                  picked={picked.includes(item.card.id)}
                  href={`/collection/${item.id}`}
                  onPick={() => pick(item.card.id)}
                >
                  <CardPocket
                    name={item.card.name}
                    setName={item.card.card_set.name}
                    number={item.card.number}
                    printedTotal={item.card.card_set.printed_total}
                    imageUrl={item.card.image_large_url ?? item.card.image_small_url ?? null}
                    types={item.card.species?.types ?? []}
                    quantity={item.quantity}
                    condition={conditionLabel(item.condition)}
                    price={item.card.price_usd == null ? null : Number(item.card.price_usd)}
                    rarity={item.card.rarity}
                  />
                </ItemLink>
              </li>
            ))}
          </ul>

        </>
      )}
    </>
  );
}

function TypeFilterChip({
  type,
  count,
  active,
  onClick,
}: {
  type: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const color = typeColor(type);
  const Icon = TYPE_ICON[type];

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-[13px] font-medium transition-all hover:-translate-y-px hover:brightness-105 active:translate-y-0"
      style={{
        color: active ? "var(--background)" : color,
        background: active ? color : `color-mix(in oklch, ${color} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} ${active ? 100 : 26}%, transparent)`,
      }}
    >
      {Icon && <Icon className="size-3.5" />}
      {typeLabel(type)}
      <span className="font-mono text-[11px] tabular-nums opacity-60">{count}</span>
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all hover:-translate-y-px active:translate-y-0",
        active
          ? "bg-foreground text-background"
          : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PocketSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {Array.from({ length: 8 }).map((_, index) => (
        <li key={index} className="space-y-2">
          <Skeleton className="aspect-[63/88] rounded-lg" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

function EmptyCollection({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <div className="ring-edge bg-surface/60 rounded-2xl py-16 text-center ring-1">
        <p className="text-muted-foreground text-sm">
          Ninguna carta de tu colección cumple esta búsqueda.
        </p>
      </div>
    );
  }

  return (
    <div className="ring-edge bg-surface/60 rounded-2xl px-6 py-16 text-center ring-1">
      <BinderMark className="mx-auto mb-7" />
      <h2 className="font-display text-lg font-semibold">Tu binder está vacío</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Registra tu primera carta y empieza a ver qué tienes, de qué tipos y qué
        te falta para completar cada set.
      </p>
      <Link href="/collection/add" className={cn(buttonVariants(), "mt-6")}>
        Agregar una carta
      </Link>
    </div>
  );
}

export default function CollectionPage() {
  return (
    <Suspense fallback={<PocketSkeleton />}>
      <CollectionGrid />
    </Suspense>
  );
}


/**
 * The same tile is a link most of the time and a checkbox while comparing.
 * Keeping one element avoids the grid reflowing when the mode changes.
 */
function ItemLink({
  comparing,
  picked,
  href,
  onPick,
  children,
}: {
  comparing: boolean;
  picked: boolean;
  href: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  const ring = cn(
    "focus-visible:ring-ring block rounded-lg transition-[outline-color,transform] focus-visible:ring-2 focus-visible:outline-none",
    picked && "outline-foreground scale-[0.97] outline-2 outline-offset-4",
  );

  if (comparing) {
    return (
      <button onClick={onPick} aria-pressed={picked} className={cn(ring, "w-full text-left")}>
        {children}
      </button>
    );
  }

  return (
    <Link href={href} className={ring}>
      {children}
    </Link>
  );
}

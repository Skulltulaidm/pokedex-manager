"use client";

import { ArrowLeftRight, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { BinderMark } from "@/components/binder-mark";
import { CardPocket } from "@/components/card-pocket";
import { ScreenHeader } from "@/components/screen-header";
import { ShareMenu } from "@/components/share-menu";
import { typeLabel } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { useListCollection } from "@/lib/api/hooks/useListCollection";
import { CONDITION_ORDER, conditionLabel } from "@/lib/labels";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

const PAGE_SIZE = 24;

const SORTS = [
  { value: "name", label: "Nombre" },
  { value: "number", label: "Número" },
  { value: "price", label: "Precio" },
];

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
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
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
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

        <FilterSheet
          setId={setId}
          generation={generation}
          condition={condition}
          sort={sort}
          count={activeFilters}
          sets={stats?.sets ?? []}
          generations={stats?.generations ?? []}
          onApply={(next) => setParam({ ...next, p: undefined })}
        />
      </div>

      {comparing && (
        <p className="ring-edge bg-surface text-muted-foreground mb-4 rounded-xl px-4 py-2.5 text-sm ring-1">
          {picked.length === 0
            ? "Toca dos cartas para compararlas."
            : "Toca una segunda carta."}
        </p>
      )}

      {stats && stats.types.length > 0 && (
        <div className="scrollbar-none -mx-4 mb-5 overflow-x-auto px-4 md:-mx-6 md:px-6">
          <div className="flex w-max gap-2 pb-0.5">
            <Chip active={!type} onClick={() => setParam({ type: undefined, p: undefined })}>
              Todos
            </Chip>
            {stats.types.map((entry) => (
              <Chip
                key={entry.type}
                active={type === entry.type}
                onClick={() => setParam({ type: entry.type, p: undefined })}
              >
                {typeLabel(entry.type)}
              </Chip>
            ))}
          </div>
        </div>
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
          <ul className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
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
                  />
                </ItemLink>
              </li>
            ))}
          </ul>

          {lastPage > 1 && (
            <nav className="mt-8 flex items-center justify-between" aria-label="Paginación">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setParam({ p: String(page - 1) })}
              >
                Anterior
              </Button>
              <p className="text-muted-foreground text-sm tabular-nums">
                {page} de {lastPage}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setParam({ p: String(page + 1) })}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

function FilterSheet({
  setId,
  generation,
  condition,
  sort,
  count,
  sets,
  generations,
  onApply,
}: {
  setId?: string;
  generation?: string;
  condition?: string;
  sort: string;
  count: number;
  sets: { set_id: string; set_name: string }[];
  generations: { generation: number }[];
  onApply: (next: Record<string, string | undefined>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" className="size-11 shrink-0 rounded-full sm:w-auto sm:px-4">
            <SlidersHorizontal />
            <span className="hidden sm:inline">Filtros</span>
            {count > 0 && (
              <span className="bg-foreground text-background grid size-5 place-items-center rounded-full text-[11px] tabular-nums">
                {count}
              </span>
            )}
          </Button>
        }
      />
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>

        <div className="grid gap-6 px-4 py-2">
          <Picker
            label="Set"
            value={setId}
            options={sets.map((entry) => ({ value: entry.set_id, label: entry.set_name }))}
            onChange={(value) => onApply({ set: value })}
          />
          <Picker
            label="Generación"
            value={generation}
            options={generations.map((entry) => ({
              value: String(entry.generation),
              label: `Generación ${entry.generation}`,
            }))}
            onChange={(value) => onApply({ gen: value })}
          />
          <Picker
            label="Ordenar por"
            value={sort === "recent" ? undefined : sort}
            options={SORTS}
            onChange={(value) => onApply({ orden: value })}
          />
          <Picker
            label="Estado"
            value={condition}
            options={CONDITION_ORDER.map((value) => ({
              value,
              label: conditionLabel(value),
            }))}
            onChange={(value) => onApply({ estado: value })}
          />
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() =>
              onApply({ set: undefined, gen: undefined, estado: undefined, orden: undefined })
            }
          >
            Limpiar
          </Button>
          <SheetClose render={<Button className="flex-1">Ver resultados</Button>} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Options as chips rather than a select: every value is visible without opening a
 * popup, and one tap applies it instead of two.
 */
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="text-muted-foreground mb-2.5 text-sm">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <Chip active={!value} onClick={() => onChange(undefined)}>
          Cualquiera
        </Chip>
        {options.map((option) => (
          <Chip
            key={option.value}
            active={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </fieldset>
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
        "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PocketSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
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

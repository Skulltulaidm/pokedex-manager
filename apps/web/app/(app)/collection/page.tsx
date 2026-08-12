"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { BinderMark } from "@/components/binder-mark";
import { CardPocket } from "@/components/card-pocket";
import { typeLabel } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { useListCollection } from "@/lib/api/hooks/useListCollection";
import { CONDITION_ORDER, conditionLabel } from "@/lib/labels";
import { buttonVariants } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

const ANY = "__any__";

function CollectionGrid() {
  const params = useSearchParams();
  const router = useRouter();

  const type = params.get("type") ?? undefined;
  const setId = params.get("set") ?? undefined;
  const generation = params.get("gen") ?? undefined;
  const condition = params.get("estado") ?? undefined;
  const anyFilter = Boolean(type || setId || generation || condition);

  const { data: stats } = useCollectionStats({ client: { client: apiClient } });
  const { data, isPending, error } = useListCollection(
    {
      type,
      set_id: setId,
      generation: generation ? Number(generation) : undefined,
      condition: condition as never,
      limit: 60,
    },
    { client: { client: apiClient } },
  );

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ANY) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `/collection?${next}` : "/collection");
  }

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          Mi colección
        </h1>
        {data && (
          <p className="text-muted-foreground shrink-0 font-mono text-sm">
            {data.total} {data.total === 1 ? "entrada" : "entradas"}
          </p>
        )}
      </div>

      {stats && stats.types.length > 0 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip active={!type} onClick={() => setParam("type", undefined)}>
            Todos los tipos
          </FilterChip>
          {stats.types.map((entry) => (
            <FilterChip
              key={entry.type}
              active={type === entry.type}
              onClick={() => setParam("type", entry.type)}
            >
              {typeLabel(entry.type)}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        <Compact
          value={setId}
          placeholder="Set"
          onChange={(value) => setParam("set", value)}
          options={
            stats?.sets.map((entry) => ({
              value: entry.set_id,
              label: entry.set_name,
            })) ?? []
          }
        />
        <Compact
          value={generation}
          placeholder="Generación"
          onChange={(value) => setParam("gen", value)}
          options={
            stats?.generations.map((entry) => ({
              value: String(entry.generation),
              label: `Gen ${entry.generation}`,
            })) ?? []
          }
        />
        {/* Conditions are a fixed list, so this would render on an empty collection. */}
        {stats && stats.total_groups > 0 && (
          <Compact
            value={condition}
            placeholder="Estado"
            onChange={(value) => setParam("estado", value)}
            options={CONDITION_ORDER.map((value) => ({
              value,
              label: conditionLabel(value),
            }))}
          />
        )}
        {anyFilter && (
          <button
            onClick={() => router.replace("/collection")}
            className="text-muted-foreground hover:text-foreground px-1 text-sm underline"
          >
            Quitar filtros
          </button>
        )}
      </div>

      {isPending && <PocketSkeleton />}

      {error && (
        <p className="text-destructive text-sm">
          No se pudo cargar la colección. Revisa que el servidor esté corriendo.
        </p>
      )}

      {data && data.items.length === 0 && <EmptyCollection filtered={anyFilter} />}

      {data && data.items.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/collection/${item.id}`}
                className="focus-visible:ring-ring block rounded-md focus-visible:ring-2 focus-visible:outline-none"
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Compact({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | undefined;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  if (options.length === 0) return null;

  return (
    <Select
      // Null rather than a sentinel: a sentinel becomes the trigger's visible
      // label, and the placeholder never shows.
      value={value ?? null}
      onValueChange={(next) => onChange(next ?? undefined)}
    >
      <SelectTrigger className="bg-card h-9 w-auto min-w-32" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Cualquiera</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterChip({
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
        "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-surface text-muted-foreground ring-edge hover:text-foreground ring-1",
      )}
    >
      {children}
    </button>
  );
}

function PocketSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 8 }).map((_, index) => (
        <li key={index} className="space-y-2">
          <Skeleton className="aspect-[63/88] rounded-md" />
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
      <div className="ring-edge bg-surface/60 rounded-lg py-14 text-center ring-1">
        <p className="text-muted-foreground text-sm">
          Ninguna carta de tu colección cumple estos filtros.
        </p>
      </div>
    );
  }

  return (
    <div className="ring-edge bg-surface/60 rounded-lg px-6 py-14 text-center ring-1">
      <BinderMark className="mx-auto mb-6" />
      <h2 className="font-display text-lg font-bold">Tu binder está vacío</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Registra tu primera carta y empieza a ver qué tienes, de qué tipos y qué
        te falta para completar cada set.
      </p>
      <Link href="/collection/add" className={cn(buttonVariants(), "mt-5")}>
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

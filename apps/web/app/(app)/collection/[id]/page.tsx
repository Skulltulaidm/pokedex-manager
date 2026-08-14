"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Heart, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CardSkeleton, PanelSkeleton } from "@/components/pokeball";
import { CardImage } from "@/components/card-image";
import { InfoTile } from "@/components/info-tile";
import { MarketPosition } from "@/components/market-position";
import { SpeciesStrip } from "@/components/species-strip";
import { SpeciesTrivia } from "@/components/species-trivia";
import { StatRadar } from "@/components/stat-radar";
import { TypeChip } from "@/components/type-dot";
import { formatUsd } from "@/lib/format";
import { apiClient } from "@/lib/api-client";
import { useGetItem } from "@/lib/api/hooks/useGetItem";
import { useRemoveItem } from "@/lib/api/hooks/useRemoveItem";
import { useUpdateItem } from "@/lib/api/hooks/useUpdateItem";
import {
  CONDITION_ORDER,
  VARIANT_LABEL,
  conditionLabel,
} from "@/lib/labels";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: item, isPending } = useGetItem(id, {
    client: { client: apiClient },
  });

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useUpdateItem({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setEditing(false);
        toast.success("Cambios guardados");
      },
      onError: () => toast.error("No se pudo guardar."),
    },
  });

  const remove = useRemoveItem({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success("Carta eliminada de tu colección");
        router.push("/collection");
      },
      onError: () => toast.error("No se pudo eliminar."),
    },
  });

  if (isPending) {
    return (
      <div className="space-y-5">
        <CardSkeleton className="mx-auto w-56" />
        <PanelSkeleton className="h-40" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Esta carta ya no está en tu colección.</p>
        <Link href="/collection" className="mt-4 inline-block text-sm underline">
          Volver a la colección
        </Link>
      </div>
    );
  }

  const { card } = item;
  const availableVariants = Object.entries(card.variants).filter(([, exists]) => exists);

  const price = card.price_usd == null ? null : Number(card.price_usd);

  return (
    <div>
      <Breadcrumbs
        trail={[
          { label: "Catálogo", href: "/collection" },
          { label: card.card_set.name, href: `/collection?set=${card.card_set.id}` },
          { label: card.name },
        ]}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="relative mx-auto w-60 lg:sticky lg:top-0 lg:w-full">
        <CardImage
          src={card.image_large_url ?? null}
          alt={card.name}
          sizes="240px"
          glowType={card.species?.types[0]}
          priority
          className="shadow-[0_20px_50px_-15px_oklch(0_0_0/0.9)]"
        />
      </div>

      <div className="mt-7 space-y-6 lg:mt-0">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display truncate text-[28px] leading-none font-semibold tracking-[-0.03em]">
            {card.name}
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm tabular-nums">
            {card.number}
            <span className="text-muted-foreground/50">/{card.card_set.printed_total}</span>
            <span className="mx-2">·</span>
            {card.card_set.name}
          </p>
          {card.species && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.species.types.map((type) => (
                <TypeChip key={type} type={type} />
              ))}
            </div>
          )}
        </div>

        {price !== null && (
          <div className="shrink-0 text-right">
            <p className="font-display text-2xl leading-none font-semibold tabular-nums">
              {formatUsd(price)}
            </p>
            <p className="text-muted-foreground mt-1.5 text-xs">orientativo</p>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {card.rarity && <InfoTile icon={Sparkles} label="Rareza" value={card.rarity} />}
        {card.hp !== null && <InfoTile icon={Heart} label="PS" value={card.hp} />}
        {card.card_set.release_date && (
          <InfoTile
            icon={CalendarDays}
            label="Salió"
            value={new Date(card.card_set.release_date).getFullYear()}
          />
        )}
        {availableVariants.length > 0 && (
          <InfoTile
            icon={Layers}
            label="Impresión"
            value={availableVariants.map(([name]) => VARIANT_LABEL[name] ?? name).join(" · ")}
          />
        )}
      </div>

      <MarketPosition
        cardId={card.id}
        setName={card.card_set.name}
        price={price}
      />

      {/* Trainer and Energy cards get no species block at all: a panel that only
          says a Pokemon is absent is a panel the card already answers. */}
      {card.species && (
        <Section title={`Especie · Generación ${card.species.generation}`}>
          <div className="pt-1">
            {/* Brand red rather than the type colour: six full-width bars in one
                of eighteen hues is what drowns out the palette. */}
            <StatRadar stats={card.species.stats} color="var(--primary)" />
            <SpeciesTrivia speciesId={card.species.id} />
          </div>
        </Section>
      )}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
      {card.species && (
        <SpeciesStrip
          speciesId={card.species.id}
          currentCardId={card.id}
          name={card.name}
        />
      )}

      <Section title="En tu colección">
        {editing ? (
          <EditForm
            quantity={item.quantity}
            condition={item.condition}
            notes={item.notes}
            unitCost={item.unit_cost_usd}
            busy={update.isPending}
            onCancel={() => setEditing(false)}
            onSave={(data) => update.mutate({ item_id: item.id, data })}
          />
        ) : (
          <>
            <div className="mt-1 mb-5 flex flex-wrap items-center gap-2">
              <span className="bg-foreground text-background rounded-full px-3 py-1.5 text-[13px] font-medium tabular-nums">
                ×{item.quantity}
              </span>
              <span className="bg-secondary rounded-full px-3 py-1.5 text-[13px] font-medium">
                {conditionLabel(item.condition)}
              </span>
              {price !== null && item.quantity > 1 && (
                <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                  {formatUsd(price * item.quantity)} en total
                </span>
              )}
            </div>

            <PositionReturn
              unitCost={item.unit_cost_usd}
              price={price}
              quantity={item.quantity}
            />

            {item.notes && (
              <p className="text-muted-foreground mb-5 text-sm leading-relaxed">
                {item.notes}
              </p>
            )}

            <div className="border-edge flex gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setEditing(true)}>
                Editar
              </Button>
              {confirmDelete ? (
                <>
                  <Button
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ item_id: item.id })}
                  >
                    Sí, eliminar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="text-destructive ml-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  Eliminar
                </Button>
              )}
            </div>
          </>
        )}
      </Section>
      </div>
      </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="slab rounded-xl p-4">
      <h2 className="font-display mb-2 text-sm font-bold tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * This position against what it cost.
 *
 * Stated per copy and in total: the unit price is what a trade argues over, and
 * the total is what actually moved. A position with no recorded cost says so
 * rather than staying blank, because it is the reason the portfolio return
 * leaves it out.
 */
function PositionReturn({
  unitCost,
  price,
  quantity,
}: {
  unitCost: string | number | null;
  price: number | null;
  quantity: number;
}) {
  if (unitCost == null) {
    return (
      <p className="text-muted-foreground/70 mb-5 text-sm">
        Sin precio de compra, así que esta carta queda fuera de tu rendimiento.
        Está en <span className="text-muted-foreground">Editar</span>.
      </p>
    );
  }

  const cost = Number(unitCost);
  const paid = cost * quantity;
  const worth = price === null ? null : price * quantity;
  const gain = worth === null ? null : worth - paid;
  const percent = worth === null || paid <= 0 ? null : ((worth - paid) / paid) * 100;
  const up = (gain ?? 0) >= 0;

  return (
    <dl className="border-edge mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-y py-3 text-sm">
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Pagaste</dt>
        <dd className="font-mono tabular-nums">
          {formatUsd(cost)}
          {quantity > 1 && (
            <span className="text-muted-foreground/60"> ×{quantity} · {formatUsd(paid)}</span>
          )}
        </dd>
      </div>
      {gain !== null && percent !== null && (
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Rendimiento</dt>
          <dd
            className={cn(
              "font-mono font-medium tabular-nums",
              up ? "text-emerald-500" : "text-destructive",
            )}
          >
            {up ? "+" : "−"}
            {formatUsd(Math.abs(gain))} · {up ? "+" : "−"}
            {Math.abs(percent).toFixed(1)}%
          </dd>
        </div>
      )}
    </dl>
  );
}

function EditForm({
  quantity: initialQuantity,
  condition: initialCondition,
  notes: initialNotes,
  unitCost: initialUnitCost,
  busy,
  onCancel,
  onSave,
}: {
  quantity: number;
  condition: string;
  notes: string | null;
  unitCost: string | number | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (data: {
    quantity: number;
    condition: never;
    notes: string | null;
    unit_cost_usd: number | null;
  }) => void;
}) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [condition, setCondition] = useState(initialCondition);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [paid, setPaid] = useState(initialUnitCost == null ? "" : String(initialUnitCost));

  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-1.5">
        <Label htmlFor="quantity">Cantidad</Label>
        <Input
          id="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
          className="w-24 font-mono"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Estado</legend>
        <div className="flex flex-wrap gap-2">
          {CONDITION_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCondition(value)}
              aria-pressed={condition === value}
              className={cn(
                "ring-edge rounded-full px-3 py-1.5 text-sm ring-1 transition-colors",
                condition === value
                  ? "bg-foreground text-background ring-transparent"
                  : "bg-background hover:bg-accent",
              )}
            >
              {conditionLabel(value)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="paid">Precio pagado por unidad</Label>
        <InputGroup className="h-10 w-40">
          <InputGroupAddon>
            <span className="text-muted-foreground">$</span>
          </InputGroupAddon>
          <InputGroupInput
            id="paid"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={paid}
            onChange={(event) => setPaid(event.target.value)}
            className="font-mono"
          />
        </InputGroup>
        <p className="text-muted-foreground/70 text-xs">
          Vacío significa que no lo sabés, no que fue gratis: la carta queda
          fuera del rendimiento en vez de contar como ganancia entera.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Nota</Label>
        <Input
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() =>
            onSave({
              quantity,
              condition: condition as never,
              notes: notes.trim() || null,
              unit_cost_usd: paid.trim() ? Number(paid) : null,
            })
          }
        >
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

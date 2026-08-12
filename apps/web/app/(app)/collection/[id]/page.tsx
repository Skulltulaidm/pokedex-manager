"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { TypeChip, typeColor } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useGetItem } from "@/lib/api/hooks/useGetItem";
import { useRemoveItem } from "@/lib/api/hooks/useRemoveItem";
import { useUpdateItem } from "@/lib/api/hooks/useUpdateItem";
import {
  CONDITION_ORDER,
  STAT_LABEL,
  STAT_MAX,
  STAT_ORDER,
  VARIANT_LABEL,
  conditionLabel,
  formatReleaseDate,
} from "@/lib/labels";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Skeleton } from "@workspace/ui/components/skeleton";
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
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mx-auto aspect-[63/88] w-56 rounded-lg" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-lg" />
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

  return (
    <div className="space-y-7">
      <Link
        href="/collection"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        Colección
      </Link>

      <div className="relative mx-auto w-60">
        <div
          aria-hidden
          className="aura absolute -inset-10 opacity-60 blur-2xl"
          style={{ "--glow": typeColor(card.species?.types[0] ?? "normal") } as React.CSSProperties}
        />
        <div className="ring-edge relative aspect-[63/88] overflow-hidden rounded-xl shadow-[0_20px_50px_-15px_oklch(0_0_0/0.9)] ring-1">
          {card.image_large_url && (
            <Image
              src={card.image_large_url}
              alt={card.name}
              fill
              sizes="240px"
              priority
              className="object-cover"
            />
          )}
        </div>
      </div>

      <div className="text-center">
        <h1 className="font-display text-3xl leading-none font-extrabold tracking-tight">
          {card.name}
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">
          {card.number}
          <span className="text-muted-foreground/50">/{card.card_set.printed_total}</span>
          <span className="mx-2">·</span>
          {card.card_set.name}
        </p>
      </div>

      <Section title="La carta">
        <Row label="Número">
          <span className="font-mono">
            {card.number}
            <span className="text-muted-foreground/55">/{card.card_set.printed_total}</span>
          </span>
        </Row>
        {card.rarity && <Row label="Rareza">{card.rarity}</Row>}
        {card.price_eur !== null && card.price_eur !== undefined && (
          <Row label="Precio de mercado">
            <span className="font-mono tabular-nums">
              {Number(card.price_eur).toLocaleString("es", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
          </Row>
        )}
        {card.hp !== null && (
          <Row label="PS impresos">
            <span className="font-mono">{card.hp}</span>
          </Row>
        )}
        {card.card_set.release_date && (
          <Row label="Salió">
            {formatReleaseDate(card.card_set.release_date)}
          </Row>
        )}
        {availableVariants.length > 0 && (
          <Row label="Impresiones">
            {availableVariants
              .map(([name]) => VARIANT_LABEL[name] ?? name)
              .join(" · ")}
          </Row>
        )}
      </Section>

      {card.species ? (
        <Section title="La especie">
          <Row label="Tipos">
            <span className="flex flex-wrap justify-end gap-1.5">
              {card.species.types.map((type) => (
                <TypeChip key={type} type={type} />
              ))}
            </span>
          </Row>
          <Row label="Generación">
            <span className="font-mono">{card.species.generation}</span>
          </Row>

          <div className="pt-1">
            <ul className="space-y-1.5">
              {STAT_ORDER.filter((key) => key in card.species!.stats).map((key) => {
                const value = card.species!.stats[key] ?? 0;
                return (
                  <li key={key} className="flex items-center gap-3">
                    <span className="text-muted-foreground w-28 shrink-0 text-sm">
                      {STAT_LABEL[key]}
                    </span>
                    <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(value / STAT_MAX) * 100}%`,
                          background: typeColor(card.species!.types[0] ?? "normal"),
                        }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-sm">
                      {value}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      ) : (
        <Section title="La especie">
          <p className="text-muted-foreground py-1 text-sm">
            Esta es una carta de {card.category === "Trainer" ? "Entrenador" : "Energía"}:
            no representa a ningún Pokémon.
          </p>
        </Section>
      )}

      <Section title="En tu colección">
        {editing ? (
          <EditForm
            quantity={item.quantity}
            condition={item.condition}
            notes={item.notes}
            busy={update.isPending}
            onCancel={() => setEditing(false)}
            onSave={(data) => update.mutate({ item_id: item.id, data })}
          />
        ) : (
          <>
            <Row label="Cantidad">
              <span className="font-mono">{item.quantity}</span>
            </Row>
            <Row label="Estado">{conditionLabel(item.condition)}</Row>
            {item.notes && <Row label="Nota">{item.notes}</Row>}

            <div className="flex gap-2 pt-3">
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
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ring-edge bg-surface rounded-xl p-4 ring-1">
      <h2 className="font-display mb-2 text-sm font-bold tracking-wide uppercase">
        {title}
      </h2>
      <div className="divide-seam divide-y">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function EditForm({
  quantity: initialQuantity,
  condition: initialCondition,
  notes: initialNotes,
  busy,
  onCancel,
  onSave,
}: {
  quantity: number;
  condition: string;
  notes: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (data: {
    quantity: number;
    condition: never;
    notes: string | null;
  }) => void;
}) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [condition, setCondition] = useState(initialCondition);
  const [notes, setNotes] = useState(initialNotes ?? "");

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
            })
          }
        >
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

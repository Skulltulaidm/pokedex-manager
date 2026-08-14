"use client";

import { Heart, Search } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { TypeDots } from "@/components/type-dot";
import { CardSkeleton } from "@/components/pokeball";
import { apiClient } from "@/lib/api-client";
import { useAddCard } from "@/lib/api/hooks/useAddCard";
import { useAddToWishlist } from "@/lib/api/hooks/useAddToWishlist";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import { useSearchCards } from "@/lib/api/hooks/useSearchCards";
import type { CardView } from "@/lib/api/types/CardView";
import { formatUsd } from "@/lib/format";
import { CONDITION_ORDER, conditionLabel } from "@/lib/labels";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Label } from "@workspace/ui/components/label";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

export default function AddCardPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <AddCard />
    </Suspense>
  );
}

function AddCard() {
  const params = useSearchParams();
  const linkedId = params.get("card");

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CardView | null>(null);
  // Arriving from a card in the grid preselects it; going back has to survive
  // that, so the link is dropped rather than re-read from the URL.
  const [followLink, setFollowLink] = useState(true);

  const { data: linked } = useGetCard(linkedId ?? undefined, {
    client: { client: apiClient },
    query: { enabled: Boolean(linkedId) && followLink },
  });

  const card = picked ?? (followLink ? (linked ?? null) : null);

  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-semibold tracking-tight">
        Agregar una carta
      </h1>
      <p className="text-muted-foreground mb-5 text-sm">
        Busca por nombre. Si no reconoces el set, la imagen te lo dice.
      </p>

      {card ? (
        <ConfirmForm
          card={card}
          onBack={() => {
            setPicked(null);
            setFollowLink(false);
          }}
        />
      ) : (
        <SearchStep query={query} onQuery={setQuery} onPick={setPicked} />
      )}
    </>
  );
}

const RESULTS = 24;

function SearchStep({
  query,
  onQuery,
  onPick,
}: {
  query: string;
  onQuery: (value: string) => void;
  onPick: (card: CardView) => void;
}) {
  const trimmed = query.trim();
  const { data, isFetching } = useSearchCards(
    { q: trimmed || undefined, limit: RESULTS },
    { client: { client: apiClient } },
  );
  const capped = data?.length === RESULTS;

  return (
    <>
      <InputGroup className="bg-secondary h-11 rounded-full border-transparent">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Charizard, Blastoise…"
          autoFocus
          aria-label="Buscar carta por nombre"
        />
        {isFetching && (
          <InputGroupAddon align="inline-end">
            <Spinner className="text-muted-foreground size-4" />
          </InputGroupAddon>
        )}
      </InputGroup>

      {data && data.length === 0 && (
        <p className="text-muted-foreground mt-8 text-center text-sm">
          Ninguna carta coincide con «{trimmed}». Prueba con el nombre del Pokémon.
        </p>
      )}

      {!data && <ResultsSkeleton />}

      <ul className="divide-edge mt-4 divide-y">
        {data?.map((card) => (
          <li key={card.id}>
            <button
              onClick={() => onPick(card)}
              className="hover:bg-accent/60 flex w-full items-center gap-3 rounded-lg px-1.5 py-2.5 text-left transition-colors active:scale-[0.99]"
            >
              <div className="bg-surface ring-edge relative h-16 w-[46px] shrink-0 overflow-hidden rounded-md ring-1 ring-inset">
                {card.image_small_url && (
                  <Image
                    src={card.image_small_url}
                    alt=""
                    fill
                    sizes="46px"
                    className="object-contain"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{card.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {card.card_set.name}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <TypeDots types={card.species?.types ?? []} />
                <span className="text-muted-foreground font-mono text-xs">
                  {card.number}/{card.card_set.printed_total}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {capped && (
        <p className="text-muted-foreground mt-4 text-center text-xs">
          Se muestran las primeras {RESULTS}. Escribe un poco más para acortar la lista.
        </p>
      )}
    </>
  );
}

function ConfirmForm({ card, onBack }: { card: CardView; onBack: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [condition, setCondition] = useState("near_mint");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState("");

  const { mutate, isPending } = useAddCard({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success(`${card.name} agregada a tu colección`);
        router.push("/collection");
      },
      onError: () =>
        toast.error("No se pudo guardar. Intenta de nuevo."),
    },
  });

  const want = useAddToWishlist({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success(`${card.name} anotada en tus deseos`);
        router.push("/stats?tab=deseos");
      },
      onError: () => toast.error("No se pudo anotar. Intenta de nuevo."),
    },
  });

  const busy = isPending || want.isPending;

  return (
    <div className="space-y-6">
      <div className="ring-edge bg-surface flex gap-4 rounded-lg p-3 ring-1">
        <div className="bg-surface ring-edge relative h-32 w-[92px] shrink-0 overflow-hidden rounded-md ring-1 ring-inset">
          {card.image_large_url && (
            <Image
              src={card.image_large_url}
              alt={card.name}
              fill
              sizes="92px"
              className="object-contain"
            />
          )}
        </div>

        <div className="min-w-0 space-y-1">
          <p className="font-display text-lg leading-tight font-bold">{card.name}</p>
          <p className="text-muted-foreground text-sm">{card.card_set.name}</p>
          <p className="text-muted-foreground font-mono text-sm">
            {card.number}/{card.card_set.printed_total}
            {card.rarity && ` · ${card.rarity}`}
          </p>
          <TypeDots types={card.species?.types ?? []} />
        </div>
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
                  ? "bg-primary text-primary-foreground ring-transparent"
                  : "bg-card hover:bg-accent",
              )}
            >
              {conditionLabel(value)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="quantity">Cuántas tienes</Label>
        <Input
          id="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
          className="w-28 font-mono"
        />
      </div>

      {/* Left empty rather than prefilled with today's price: a guessed cost
          would read as a real one and show a return of exactly zero. */}
      <div className="space-y-1.5">
        <Label htmlFor="paid">Cuánto pagaste por cada una (opcional)</Label>
        <InputGroup className="h-11 w-44">
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
        <p className="text-muted-foreground text-xs">
          {card.price_usd
            ? `Hoy se cotiza en ${formatUsd(Number(card.price_usd))}. Sin este dato la carta queda fuera de tu rendimiento.`
            : "Sin este dato la carta queda fuera de tu rendimiento."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Nota (opcional)</Label>
        <Input
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="De la caja del abuelo"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          Cambiar carta
        </Button>
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() =>
            mutate({
              data: {
                card_id: card.id,
                condition: condition as never,
                quantity,
                notes: notes.trim() || null,
                unit_cost_usd: paid.trim() ? Number(paid) : null,
              },
            })
          }
        >
          {isPending ? "Guardando…" : "Guardar en mi colección"}
        </Button>
      </div>

      {/* Landing here from a card you do not own means one of two things, and
          only one of them had a way out. Wanting a card is what a counterparty
          can match against; without it a collection is invisible to trading. */}
      <div className="border-edge border-t pt-5 text-center">
        <p className="text-muted-foreground mb-3 text-sm">
          ¿Todavía no la tienes?
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => want.mutate({ data: { card_id: card.id } })}
        >
          <Heart />
          {want.isPending ? "Anotando…" : "La quiero"}
        </Button>
        <p className="text-muted-foreground/60 mx-auto mt-3 max-w-sm text-xs">
          Va a tus deseos. Cuando alguien la tenga repetida y quiera algo que a
          ti te sobra, aparece en Trueques.
        </p>
      </div>
    </div>
  );
}


function ResultsSkeleton() {
  return (
    <ul className="divide-edge mt-4 divide-y">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 px-1.5 py-2.5">
          <CardSkeleton className="w-[46px] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="bg-muted h-4 w-2/5 rounded" />
            <div className="bg-muted h-3 w-1/4 rounded" />
          </div>
          <div className="bg-muted h-3 w-12 shrink-0 rounded" />
        </li>
      ))}
    </ul>
  );
}

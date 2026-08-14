"use client";

import { ExternalLink, Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CardImage } from "@/components/card-image";
import { StatRadar } from "@/components/stat-radar";
import { TypeChip, typeColor } from "@/components/type-dot";
import { Pager } from "@/components/pager";
import { apiClient } from "@/lib/api-client";
import { useCardMarketContext } from "@/lib/api/hooks/useCardMarketContext";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import { useMarketCards } from "@/lib/api/hooks/useMarketCards";
import { formatUsd } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 18;

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "owned", label: "Tuyas" },
  { value: "missing", label: "Te faltan" },
] as const;

/**
 * The cards behind a set's coverage strip.
 *
 * The strip answers how much of a set is held; the only next question is which
 * ones, and until now that meant leaving the page and rebuilding the filter by
 * hand in the catalog.
 */
export function SetCardsDialog({
  setId,
  setName,
  open,
  onClose,
}: {
  setId: string;
  setName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [owned, setOwned] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [openCard, setOpenCard] = useState<string | null>(null);

  const { data, isPending } = useMarketCards(
    {
      set_id: setId,
      search: search || undefined,
      owned,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    },
    { client: { client: apiClient }, query: { enabled: open } },
  );

  const lastPage = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  const change = (next: () => void) => {
    next();
    setPage(1);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton
        className="max-h-[88svh] w-full max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogTitle className="border-edge border-b px-5 py-4 pr-14 text-left">
          <span className="font-display text-lg font-semibold">{setName}</span>
          {data && (
            <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
              {data.total}
            </span>
          )}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Cartas del set {setName}, con búsqueda, filtros y paginación.
        </DialogDescription>

        <div className="border-edge flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <InputGroup className="bg-secondary h-9 max-w-[15rem] min-w-0 flex-1 rounded-full border-transparent">
            <InputGroupAddon>
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              placeholder="Buscar en el set…"
              aria-label={`Buscar en ${setName}`}
              onChange={(event) => change(() => setSearch(event.target.value))}
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <button onClick={() => change(() => setSearch(""))} aria-label="Limpiar">
                  <X className="size-3.5" />
                </button>
              </InputGroupAddon>
            )}
          </InputGroup>

          <div className="flex gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => change(() => setOwned(filter.value))}
                aria-pressed={owned === filter.value}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                  owned === filter.value
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <Pager page={page} lastPage={lastPage} onChange={setPage} />
        </div>

        <div
          className={cn(
            "max-h-[62svh]",
            openCard ? "grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]" : "",
          )}
        >
        {/* The grid narrows instead of closing: the card you opened stays in the
            list beside its details, so the next one is one click away. */}
        <div
          className={cn(
            "overflow-y-auto px-5 py-4",
            openCard && "border-edge max-h-[62svh] sm:border-r",
          )}
        >
          {isPending && <Skeleton className="h-64 rounded-xl" />}

          {data?.total === 0 && (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {search
                ? "Ninguna carta del set coincide."
                : owned === "owned"
                  ? "Todavía no tienes ninguna de este set."
                  : "No falta ninguna: el set está completo."}
            </p>
          )}

          <ul
            className={cn(
              "grid gap-3",
              openCard
                ? "grid-cols-2"
                : "grid-cols-[repeat(auto-fill,minmax(104px,1fr))]",
            )}
          >
            {data?.items.map((entry) => (
              <li key={entry.card.id}>
                <button
                  onClick={() => setOpenCard(entry.card.id)}
                  aria-pressed={openCard === entry.card.id}
                  className={cn(
                    "block w-full rounded-lg text-left",
                    openCard === entry.card.id && "ring-foreground ring-2",
                  )}
                >
                  {/* A card you do not own reads as absent rather than as a
                      different card: same frame, drained of colour. */}
                  <div className={cn(entry.owned === 0 && "opacity-45 grayscale")}>
                    <CardImage
                      src={entry.card.image_small_url}
                      alt={entry.card.name}
                      sizes="112px"
                      category={entry.card.category}
                    />
                  </div>
                  <p className="mt-1.5 truncate text-[12px] font-medium">
                    {entry.card.name}
                  </p>
                  <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
                    {entry.card.number}
                    <span className="text-muted-foreground/50">
                      /{entry.card.card_set.printed_total}
                    </span>
                    {entry.owned > 1 && ` · ×${entry.owned}`}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums">
                    {entry.card.price_usd === null
                      ? "—"
                      : formatUsd(Number(entry.card.price_usd))}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {openCard && (
          <CardDetail cardId={openCard} onClose={() => setOpenCard(null)} />
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The card's own screen, inside the dialog.
 *
 * Everything the detail page shows about a printed card, minus what belongs to
 * a collection row: opening a card here is a question about the card, and
 * leaving the set to answer it lost the reader's place in a hundred-card list.
 */
function CardDetail({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { data: card, isPending } = useGetCard(cardId, { client: { client: apiClient } });
  const { data: context } = useCardMarketContext(cardId, {
    client: { client: apiClient },
  });

  if (isPending || !card) {
    return (
      <div className="p-5">
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-h-[62svh] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display truncate text-xl font-semibold tracking-tight">
            {card.name}
          </h3>
          <p className="text-muted-foreground font-mono text-sm tabular-nums">
            {card.number}
            <span className="text-muted-foreground/50">
              /{card.card_set.printed_total}
            </span>
            {card.rarity && ` · ${card.rarity}`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar la carta" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <div className="w-40 shrink-0">
          <CardImage
            src={card.image_large_url ?? card.image_small_url}
            alt={card.name}
            sizes="160px"
            category={card.category}
          />
        </div>

        <div className="min-w-[12rem] flex-1">
          {(card.species?.types.length ?? 0) > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {card.species?.types.map((type) => <TypeChip key={type} type={type} />)}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
            <Figure
              label="Precio"
              value={card.price_usd === null ? "—" : formatUsd(Number(card.price_usd))}
            />
            <Figure label="PS" value={card.hp === null ? "—" : String(card.hp)} />
            {context && (
              <>
                <Figure
                  label="En el set"
                  value={
                    context.price_rank === null
                      ? "sin precio"
                      : `#${context.price_rank} de ${context.priced_in_set}`
                  }
                />
                <Figure
                  label="Tuyas del set"
                  value={`${context.owned_in_set}/${context.cards_in_set}`}
                />
              </>
            )}
          </dl>

          <Link
            href={`/collection/add?card=${card.id}`}
            className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
          >
            Abrir la ficha completa
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      {card.species && (
        <div className="border-edge mt-5 border-t pt-4">
          <StatRadar
            stats={card.species.stats}
            color={typeColor(card.species.types[0] ?? "normal")}
          />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

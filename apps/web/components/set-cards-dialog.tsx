"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";

import { CardsDialog, type DialogCard } from "@/components/cards-dialog";
import { Pager } from "@/components/pager";
import { apiClient } from "@/lib/api-client";
import { useMarketCards } from "@/lib/api/hooks/useMarketCards";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
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
 * hand in the catalog. A set is the one list long enough to need searching and
 * paging, so it brings its own controls to the shared dialog.
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

  const cards: DialogCard[] =
    data?.items.map((entry) => ({
      id: entry.card.id,
      name: entry.card.name,
      number: entry.card.number,
      printedTotal: entry.card.card_set.printed_total,
      imageUrl: entry.card.image_small_url,
      category: entry.card.category,
      price: entry.card.price_usd === null ? null : Number(entry.card.price_usd),
      owned: entry.owned,
    })) ?? [];

  return (
    <CardsDialog
      open={open}
      onClose={onClose}
      title={setName}
      count={data?.total}
      cards={cards}
      loading={isPending}
      empty={
        <p className="text-muted-foreground py-12 text-center text-sm">
          {search
            ? "Ninguna carta del set coincide."
            : owned === "owned"
              ? "Todavía no tienes ninguna de este set."
              : "No falta ninguna: el set está completo."}
        </p>
      }
      toolbar={
        <>
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
        </>
      }
    />
  );
}

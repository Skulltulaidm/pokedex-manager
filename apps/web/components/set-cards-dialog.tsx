"use client";

import { useState } from "react";

import { CardsDialog, type DialogCard } from "@/components/cards-dialog";
import { DialogToolbar } from "@/components/dialog-toolbar";
import { apiClient } from "@/lib/api-client";
import { useMarketCards } from "@/lib/api/hooks/useMarketCards";

const PER_PAGE = 18;

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "owned", label: "Tuyas" },
  { value: "missing", label: "Te faltan" },
] as const;

type Owned = (typeof FILTERS)[number]["value"];

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
  const [owned, setOwned] = useState<Owned>("all");

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
        <DialogToolbar
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Buscar en el set…"
          searchLabel={`Buscar en ${setName}`}
          filters={FILTERS}
          filter={owned}
          onFilter={(value) => {
            setOwned(value);
            setPage(1);
          }}
          page={page}
          lastPage={lastPage}
          onPage={setPage}
        />
      }
    />
  );
}

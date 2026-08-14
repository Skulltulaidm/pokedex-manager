"use client";

import { Check, Search, X } from "lucide-react";

import { CardImage } from "@/components/card-image";
import { CardSkeleton } from "@/components/pokeball";
import { Pager } from "@/components/pager";
import { formatUsd } from "@/lib/format";
import { conditionLabel, conditionShort } from "@/lib/labels";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";

export type PickerCard = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string;
  price: string | null;
  /** Copies free to trade, where the list is somebody's inventory. */
  copies?: number;
  /** The state the copy would go on the table in, where one is known. */
  condition?: string | null;
};

/**
 * A grid of cards you pick from, searchable and a page at a time.
 *
 * The same panel on both sides of a listing: what you hand over comes from your
 * own spares and what you ask for comes from the catalogue, but choosing is the
 * same act and looks like it.
 */
export function CardPicker({
  title,
  subtitle,
  cards,
  total,
  loading,
  empty,
  picked,
  onToggle,
  search,
  onSearch,
  page,
  lastPage,
  onPage,
  children,
}: {
  title: string;
  subtitle: string;
  cards: PickerCard[];
  total: number;
  loading?: boolean;
  empty: string;
  picked: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  page: number;
  lastPage: number;
  onPage: (page: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="ring-edge bg-surface min-w-0 rounded-2xl p-4 ring-1">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {total}
        </span>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <InputGroup className="bg-secondary h-9 min-w-0 flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            placeholder="Buscar carta…"
            aria-label={`Buscar en ${title}`}
            onChange={(event) => onSearch(event.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <button onClick={() => onSearch("")} aria-label="Limpiar">
                <X className="size-3.5" />
              </button>
            </InputGroupAddon>
          )}
        </InputGroup>

        {children}

        <Pager page={page} lastPage={lastPage} onChange={onPage} />
      </div>

      {loading && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5">
          {Array.from({ length: 8 }).map((_, index) => (
            <li key={index}>
              <CardSkeleton />
            </li>
          ))}
        </ul>
      )}

      {!loading && total === 0 && (
        <p className="text-muted-foreground py-10 text-center text-sm">{empty}</p>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5">
        {cards.map((card) => (
          <li key={card.id}>
            <PickerTile
              card={card}
              picked={picked.has(card.id)}
              onToggle={() => onToggle(card.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PickerTile({
  card,
  picked,
  onToggle,
}: {
  card: PickerCard;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} aria-pressed={picked} className="w-full text-left">
      <div
        className={cn("relative rounded-lg transition-all", picked && "ring-foreground ring-2")}
      >
        <CardImage
          src={card.imageUrl}
          alt={card.name}
          sizes="96px"
          category={card.category}
        />
        {picked && (
          <span className="bg-foreground text-background absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full">
            <Check className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium">{card.name}</p>
      <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
        {card.price === null ? "—" : formatUsd(Number(card.price))}
        {card.copies !== undefined && card.copies > 1 && ` · ${card.copies}`}
      </p>
      {card.condition && (
        <p
          className="text-muted-foreground/60 font-mono text-[10px]"
          title={conditionLabel(card.condition)}
        >
          {conditionShort(card.condition)}
        </p>
      )}
    </button>
  );
}

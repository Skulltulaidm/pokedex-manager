"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Pager } from "@/components/pager";
import { RowsSkeleton } from "@/components/pokeball";
import { apiClient } from "@/lib/api-client";
import { useMarketPositions } from "@/lib/api/hooks/useMarketPositions";
import type { MarketPositionsQueryParams } from "@/lib/api/types/MarketPositions";
import type { PositionView } from "@/lib/api/types/PositionView";
import { formatUsd } from "@/lib/format";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 10;

type SortKey = NonNullable<MarketPositionsQueryParams["sort"]>;
type Direction = NonNullable<MarketPositionsQueryParams["direction"]>;

type Column = {
  key: SortKey | null;
  label: string;
  hint?: string;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Carta" },
  { key: "quantity", label: "Copias" },
  { key: null, label: "Costo unit.", hint: "Promedio de las copias con costo registrado" },
  { key: "cost", label: "Costo" },
  { key: "value", label: "Valor" },
  { key: "gain", label: "G/P" },
  { key: "gain_percent", label: "G/P %" },
  { key: null, label: "Cartera", hint: "Cuánto de tu valor total pesa esta posición" },
];

/**
 * The holdings as a ledger, one row per card.
 *
 * Sorting and paging are the table's own state rather than the address bar: the
 * screen already keeps its tab there, and two components writing the same URL
 * overwrite each other's parameters.
 */
export function PortfolioPositions() {
  const [sort, setSort] = useState<SortKey>("value");
  const [direction, setDirection] = useState<Direction>("desc");
  const [page, setPage] = useState(1);

  const { data, isPending } = useMarketPositions(
    { sort, direction, limit: PER_PAGE, offset: (page - 1) * PER_PAGE },
    { client: { client: apiClient } },
  );

  function reorder(key: SortKey) {
    if (key === sort) {
      setDirection(direction === "desc" ? "asc" : "desc");
    } else {
      setSort(key);
      setDirection(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    // A grid track sizes to its content unless told otherwise, and the table
    // inside is wider than a phone: without this the column grows past the
    // screen and takes the paragraphs with it.
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Posiciones
        </h2>
        <p className="text-muted-foreground text-sm tabular-nums">
          {total} {total === 1 ? "carta" : "cartas"}
        </p>
        <div className="ml-auto">
          <Pager page={page} lastPage={lastPage} onChange={setPage} />
        </div>
      </div>

      <p className="text-muted-foreground mb-4 text-sm">
        Cada carta es una posición: sus copias juntas, lo que pagaste por ellas y
        lo que valen hoy. Toca una columna para ordenarla.
      </p>

      {isPending ? (
        <RowsSkeleton count={6} height="h-11" />
      ) : total === 0 ? (
        <p className="text-muted-foreground ring-edge bg-surface/60 rounded-xl px-4 py-8 text-center text-sm ring-1">
          Todavía no tienes cartas registradas.
        </p>
      ) : (
        // The table keeps its own scroll: eight columns do not fit a phone, and
        // letting the body scroll sideways would drag the whole screen with it.
        <div className="ring-edge bg-surface overflow-x-auto rounded-xl ring-1">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-edge border-b">
                {COLUMNS.map((column, index) => (
                  <th
                    key={column.label}
                    scope="col"
                    title={column.hint}
                    className={cn(
                      "text-muted-foreground px-3 py-2.5 text-[11px] font-medium tracking-wide uppercase",
                      index === 0 ? "text-left" : "text-right",
                    )}
                  >
                    {column.key === null ? (
                      column.label
                    ) : (
                      <button
                        onClick={() => reorder(column.key as SortKey)}
                        className={cn(
                          // The browser's own stylesheet resets text-transform
                          // on buttons, so the header has to say it again.
                          "hover:text-foreground inline-flex items-center gap-1 uppercase transition-colors",
                          sort === column.key && "text-foreground",
                        )}
                        aria-label={`Ordenar por ${column.label}`}
                      >
                        {column.label}
                        {sort === column.key &&
                          (direction === "desc" ? (
                            <ChevronDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronUp className="size-3.5" aria-hidden />
                          ))}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((position) => (
                <Row key={position.card.id} position={position} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground/70 mt-3 text-xs leading-relaxed">
        El costo y la ganancia sólo miran las copias con precio de compra
        registrado. Una carta sin costo aparece con un guion, no con un cero.
      </p>
    </section>
  );
}

function Row({ position }: { position: PositionView }) {
  const gain = position.gain_absolute === null ? null : Number(position.gain_absolute);
  const up = gain !== null && gain >= 0;

  return (
    <tr className="border-edge/60 hover:bg-muted/40 border-b transition-colors last:border-0">
      <td className="max-w-[16rem] px-3 py-2.5">
        <p className="truncate font-medium">{position.card.name}</p>
        <p className="text-muted-foreground truncate font-mono text-[11px] tabular-nums">
          {position.card.number}
          <span className="text-muted-foreground/50">
            /{position.card.card_set.printed_total}
          </span>
          <span className="mx-1.5">·</span>
          {position.card.card_set.name}
        </p>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{position.quantity}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <Money amount={position.unit_cost_usd} />
        {position.costed_quantity > 0 &&
          position.costed_quantity < position.quantity && (
            <span className="text-muted-foreground/60 block text-[11px]">
              {position.costed_quantity} de {position.quantity}
            </span>
          )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <Money amount={position.cost_basis} />
      </td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">
        <Money amount={position.market_value} />
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          gain !== null && (up ? "text-emerald-500" : "text-destructive"),
        )}
      >
        {gain === null ? (
          <Dash />
        ) : (
          `${up ? "+" : "−"}${formatUsd(Math.abs(gain))}`
        )}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          position.gain_percent !== null &&
            (position.gain_percent >= 0 ? "text-emerald-500" : "text-destructive"),
        )}
      >
        {position.gain_percent === null ? (
          <Dash />
        ) : (
          `${position.gain_percent >= 0 ? "+" : "−"}${Math.abs(position.gain_percent).toFixed(1)}%`
        )}
      </td>
      <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
        {position.portfolio_share < 0.1 && position.portfolio_share > 0
          ? "<0.1%"
          : `${position.portfolio_share.toFixed(1)}%`}
      </td>
    </tr>
  );
}

function Money({ amount }: { amount: string | null }) {
  if (amount === null) return <Dash />;
  return <>{formatUsd(amount)}</>;
}

function Dash() {
  return <span className="text-muted-foreground/40">—</span>;
}

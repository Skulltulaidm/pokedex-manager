"use client";

import { Check, ChevronDown, X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";

const SORTS = [
  { value: "number", label: "Número" },
  { value: "price", label: "Precio" },
  { value: "name", label: "Nombre" },
  { value: "owned", label: "Tuyas primero" },
];

type Option = { value: string; label: string; count?: string };

/**
 * One row of facets above the grid.
 *
 * A rail costs a column on every screen for controls used once a session; a bar
 * costs one row and leaves the width to the cards.
 */
/**
 * The bar reads and writes the grid's state rather than owning it: two
 * components each navigating on their own would fight over the same URL, and
 * only one of them would win the render.
 */
export function FilterBar({
  params,
  onChange,
}: {
  params: URLSearchParams;
  onChange: (next: Record<string, string | undefined>) => void;
}) {
  const { data: stats } = useCollectionStats({ client: { client: apiClient } });

  const set = (next: Record<string, string | undefined>) =>
    onChange({ ...next, p: undefined });

  const facets = [
    { key: "orden", label: "Ordenar", options: SORTS },
    {
      key: "set",
      label: "Set",
      options: (stats?.sets ?? []).map((entry) => ({
        value: entry.set_id,
        label: entry.set_name,
        count: `${entry.owned}/${entry.printed_total}`,
      })),
    },
    {
      key: "gen",
      label: "Generación",
      options: (stats?.generations ?? []).map((entry) => ({
        value: String(entry.generation),
        label: `Gen ${entry.generation}`,
        count: String(entry.count),
      })),
    },
  ];

  const active = facets.filter((facet) => params.get(facet.key));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {facets.map((facet) => (
        <Facet
          key={facet.key}
          label={facet.label}
          options={facet.options}
          value={params.get(facet.key) ?? undefined}
          onChange={(value) => set({ [facet.key]: value })}
        />
      ))}

      {active.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => set({ set: undefined, gen: undefined, orden: undefined })}
        >
          <X />
          Limpiar
        </Button>
      )}
    </div>
  );
}

function Facet({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: Option[];
  onChange: (value: string | undefined) => void;
}) {
  if (options.length === 0) return null;

  const chosen = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              chosen
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {chosen ? `${label}: ${chosen.label}` : label}
            <ChevronDown className="size-3.5 opacity-60" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value === value ? undefined : option.value)}
            >
              <span className="flex-1 truncate">{option.label}</span>
              {option.count && (
                <span className="text-muted-foreground font-mono text-[11px]">
                  {option.count}
                </span>
              )}
              {option.value === value && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

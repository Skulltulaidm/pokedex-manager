"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { useCollectionStats } from "@/lib/api/hooks/useCollectionStats";
import { CONDITION_ORDER, conditionLabel } from "@/lib/labels";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

export const SORTS = [
  { value: "name", label: "Nombre" },
  { value: "number", label: "Número" },
  { value: "price", label: "Precio" },
];

/**
 * Owns its own state through the URL rather than through props.
 *
 * The panel that renders it lives in the shell, several levels above the grid
 * it filters; threading callbacks down would couple the layout to a screen.
 */
export function CollectionFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: stats } = useCollectionStats({ client: { client: apiClient } });

  const set = (next: Record<string, string | undefined>) => {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ ...next, p: undefined })) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.replace(search.size ? `/collection?${search}` : "/collection", {
      scroll: false,
    });
  };

  const active = ["set", "gen", "estado", "orden"].filter((key) => params.get(key)).length;

  return (
    <div className="grid gap-6">
      {active > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start px-2"
          onClick={() => set({ set: undefined, gen: undefined, estado: undefined, orden: undefined })}
        >
          Quitar {active} {active === 1 ? "filtro" : "filtros"}
        </Button>
      )}

      <Group
        label="Ordenar por"
        value={params.get("orden") ?? undefined}
        options={SORTS}
        onChange={(value) => set({ orden: value })}
      />
      <Group
        label="Estado"
        value={params.get("estado") ?? undefined}
        options={CONDITION_ORDER.map((value) => ({ value, label: conditionLabel(value) }))}
        onChange={(value) => set({ estado: value })}
      />
      <Group
        label="Set"
        value={params.get("set") ?? undefined}
        options={(stats?.sets ?? []).map((entry) => ({
          value: entry.set_id,
          label: entry.set_name,
          count: `${entry.owned}/${entry.printed_total}`,
        }))}
        onChange={(value) => set({ set: value })}
      />
      <Group
        label="Generación"
        value={params.get("gen") ?? undefined}
        options={(stats?.generations ?? []).map((entry) => ({
          value: String(entry.generation),
          label: `Generación ${entry.generation}`,
          count: String(entry.count),
        }))}
        onChange={(value) => set({ gen: value })}
      />
    </div>
  );
}

/** Options as rows with their counts, the way a marketplace lists facets. */
function Group({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string; count?: string }[];
  onChange: (value: string | undefined) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="text-muted-foreground/70 mb-2 text-[11px] tracking-wide uppercase">
        {label}
      </legend>
      <div className="space-y-0.5">
        {options.map((option) => {
          const on = value === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onChange(on ? undefined : option.value)}
              aria-pressed={on}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                on ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <span className="flex-1 truncate">{option.label}</span>
              {option.count && (
                <span className="shrink-0 font-mono text-[11px] opacity-60">{option.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { Fragment } from "react";

import { ScrollRow } from "@/components/scroll-row";
import { TypeDots, typeColor } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useSpeciesEvolutions } from "@/lib/api/hooks/useSpeciesEvolutions";
import type { EvolutionMemberView } from "@/lib/api/types/EvolutionMemberView";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The family a species belongs to, the way the Pokedex prints it: every member
 * in dex order, the card's own lit, and the ones the reader owns no card of
 * greyed out.
 *
 * A species alone in its chain, or with no chain at all, comes back empty from
 * the API and draws nothing — a panel that only says a Pokemon evolves into
 * nobody is a panel worth not having.
 */
export function EvolutionLine({ speciesId }: { speciesId: number }) {
  const { data: family } = useSpeciesEvolutions(speciesId, {
    client: { client: apiClient },
  });

  if (!family || family.length === 0) return null;

  return (
    // min-w-0 because the track below is wider than the screen on a long family,
    // and without it the grid column sizes to that track and drags the page off.
    <section className="slab min-w-0 rounded-xl p-4">
      <h2 className="font-display mb-1 text-sm font-bold tracking-wide uppercase">
        Línea evolutiva
      </h2>

      <ScrollRow bleed={false}>
        {family.map((member, index) => (
          <Fragment key={member.id}>
            {index > 0 && (
              <ChevronRight
                aria-hidden
                className="text-muted-foreground/40 mt-7 size-4 shrink-0 self-start"
              />
            )}
            <Member member={member} />
          </Fragment>
        ))}
      </ScrollRow>
    </section>
  );
}

function Member({ member }: { member: EvolutionMemberView }) {
  const color = typeColor(member.types[0] ?? "normal");

  return (
    <div className="w-20 shrink-0 text-center">
      <div
        className={cn(
          "ring-edge grid size-20 place-items-center rounded-lg ring-1",
          member.is_current && "ring-primary ring-2",
        )}
        style={{
          background: member.owned
            ? `color-mix(in oklch, ${color} 12%, transparent)`
            : undefined,
        }}
      >
        {member.sprite_url ? (
          <Image
            src={member.sprite_url}
            alt={member.name}
            width={72}
            height={72}
            className={cn("size-[72px]", !member.owned && "opacity-35 grayscale")}
          />
        ) : (
          <span className="text-muted-foreground/50 text-xs">sin sprite</span>
        )}
      </div>

      <p
        className={cn(
          "mt-1.5 truncate text-[11px] capitalize",
          member.is_current ? "font-medium" : "text-muted-foreground",
        )}
      >
        {member.name}
      </p>
      <p className="text-muted-foreground/60 flex items-center justify-center gap-1.5 font-mono text-[10px] tabular-nums">
        #{String(member.id).padStart(3, "0")}
        <TypeDots types={member.types.slice(0, 1)} />
      </p>
    </div>
  );
}

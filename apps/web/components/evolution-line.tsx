"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { Fragment, useState } from "react";

import { CARD_RATIO, CardImage } from "@/components/card-image";
import { CardPeek } from "@/components/card-peek";
import { ScrollRow } from "@/components/scroll-row";
import { TypeDots } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useSpeciesEvolutions } from "@/lib/api/hooks/useSpeciesEvolutions";
import type { EvolutionMemberView } from "@/lib/api/types/EvolutionMemberView";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The family a species belongs to, the way the Pokedex prints it: every member
 * in dex order as a card, the current one lit, and the ones the reader owns no
 * card of greyed out. Opening one raises the card over the page rather than
 * navigating, so the line stays where it was.
 *
 * A species alone in its chain, or with no chain at all, comes back empty from
 * the API and draws nothing — a panel that only says a Pokemon evolves into
 * nobody is a panel worth not having.
 */
export function EvolutionLine({ speciesId }: { speciesId: number }) {
  const { data: family } = useSpeciesEvolutions(speciesId, {
    client: { client: apiClient },
  });
  const [openCard, setOpenCard] = useState<string | null>(null);

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
                className="text-muted-foreground/40 mt-14 size-4 shrink-0 self-start"
              />
            )}
            <Member member={member} onOpen={setOpenCard} />
          </Fragment>
        ))}
      </ScrollRow>

      {openCard && (
        <CardPeek cardId={openCard} open onClose={() => setOpenCard(null)} />
      )}
    </section>
  );
}

function Member({
  member,
  onOpen,
}: {
  member: EvolutionMemberView;
  onOpen: (cardId: string) => void;
}) {
  const cardId = member.card_id;

  return (
    <div className="w-[88px] shrink-0 text-center">
      {cardId ? (
        <button
          onClick={() => onOpen(cardId)}
          aria-label={`Ver ${member.card_name ?? member.name}`}
          className="block w-full"
        >
          <CardImage
            src={member.card_image_url}
            alt={member.card_name ?? member.name}
            sizes="88px"
            category={member.card_category ?? undefined}
            locked={!member.owned}
            selected={member.is_current}
            className="transition-transform hover:-translate-y-0.5"
          />
        </button>
      ) : (
        <SpriteTile member={member} />
      )}

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

/** A member no set in the catalog prints: the dex knows it, the binder cannot. */
function SpriteTile({ member }: { member: EvolutionMemberView }) {
  return (
    <div
      className={cn(
        "ring-edge bg-surface grid w-full place-items-center rounded-lg ring-1",
        CARD_RATIO,
        member.is_current && "ring-primary ring-2 ring-inset",
      )}
    >
      {member.sprite_url ? (
        <Image
          src={member.sprite_url}
          alt={member.name}
          width={64}
          height={64}
          className="size-16 opacity-35 grayscale"
        />
      ) : (
        <span className="text-muted-foreground/50 text-[10px]">sin carta</span>
      )}
    </div>
  );
}

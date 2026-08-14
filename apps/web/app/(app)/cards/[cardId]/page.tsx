"use client";

import { CalendarDays, Heart, Layers, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CardImage } from "@/components/card-image";
import { EvolutionLine } from "@/components/evolution-line";
import { InfoTile } from "@/components/info-tile";
import { MarketPosition } from "@/components/market-position";
import { CardSkeleton, PanelSkeleton } from "@/components/pokeball";
import { SpeciesStrip } from "@/components/species-strip";
import { SpeciesTrivia } from "@/components/species-trivia";
import { StatRadar } from "@/components/stat-radar";
import { TypeChip } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { useCardMarketContext } from "@/lib/api/hooks/useCardMarketContext";
import { useGetCard } from "@/lib/api/hooks/useGetCard";
import { formatUsd } from "@/lib/format";
import { VARIANT_LABEL } from "@/lib/labels";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

/**
 * A card's own page, whether or not the reader holds it.
 *
 * Everything the collection screen says about a printed card, without the part
 * that belongs to a holding: until now a card nobody owned had nowhere to go
 * but the form that adds it, which answered a question nobody had asked yet.
 */
export default function CardPage() {
  const { cardId } = useParams<{ cardId: string }>();

  const { data: card, isPending } = useGetCard(cardId, {
    client: { client: apiClient },
  });
  const { data: context } = useCardMarketContext(cardId, {
    client: { client: apiClient },
  });

  if (isPending) {
    return (
      <div className="space-y-5">
        <CardSkeleton className="mx-auto w-56" />
        <PanelSkeleton className="h-40" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Esta carta no está en el catálogo.</p>
        <Link href="/collection" className="mt-4 inline-block text-sm underline">
          Volver al catálogo
        </Link>
      </div>
    );
  }

  const availableVariants = Object.entries(card.variants).filter(([, exists]) => exists);
  const price = card.price_usd == null ? null : Number(card.price_usd);

  return (
    <div>
      <Breadcrumbs
        trail={[
          { label: "Catálogo", href: "/collection" },
          { label: card.card_set.name, href: `/collection?set=${card.card_set.id}` },
          { label: card.name },
        ]}
      />

      {/* `contents` below lg so the panel under the card can order itself after
          the facts while still riding the sticky column above them. */}
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <aside className="contents lg:sticky lg:top-0 lg:block lg:space-y-6">
          <div className="relative order-1 mx-auto w-60 lg:w-full">
            <CardImage
              src={card.image_large_url ?? card.image_small_url}
              alt={card.name}
              sizes="240px"
              glowType={card.species?.types[0]}
              category={card.category}
              priority
              className="shadow-[0_20px_50px_-15px_oklch(0_0_0/0.9)]"
            />
          </div>

          <div className="order-3 mt-6 lg:mt-0">
            <OwnershipPanel
              cardId={card.id}
              owned={context?.owned ?? 0}
              itemId={context?.item_id ?? null}
            />
          </div>
        </aside>

        <div className="order-2 mt-7 space-y-6 lg:mt-0">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display truncate text-[28px] leading-none font-semibold tracking-[-0.03em]">
                {card.name}
              </h1>
              <p className="text-muted-foreground mt-2 font-mono text-sm tabular-nums">
                {card.number}
                <span className="text-muted-foreground/50">
                  /{card.card_set.printed_total}
                </span>
                <span className="mx-2">·</span>
                {card.card_set.name}
              </p>
              {card.species && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.species.types.map((type) => (
                    <TypeChip key={type} type={type} />
                  ))}
                </div>
              )}
            </div>

            {price !== null && (
              <div className="shrink-0 text-right">
                <p className="font-display text-2xl leading-none font-semibold tabular-nums">
                  {formatUsd(price)}
                </p>
                <p className="text-muted-foreground mt-1.5 text-xs">orientativo</p>
              </div>
            )}
          </header>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {card.rarity && <InfoTile icon={Sparkles} label="Rareza" value={card.rarity} />}
            {card.hp !== null && <InfoTile icon={Heart} label="PS" value={card.hp} />}
            {card.card_set.release_date && (
              <InfoTile
                icon={CalendarDays}
                label="Salió"
                value={new Date(card.card_set.release_date).getFullYear()}
              />
            )}
            {availableVariants.length > 0 && (
              <InfoTile
                icon={Layers}
                label="Impresión"
                value={availableVariants
                  .map(([name]) => VARIANT_LABEL[name] ?? name)
                  .join(" · ")}
              />
            )}
          </div>

          <MarketPosition cardId={card.id} setName={card.card_set.name} price={price} />

          {card.species && (
            <section className="slab rounded-xl p-4">
              <h2 className="font-display mb-2 text-sm font-bold tracking-wide uppercase">
                Especie · Generación {card.species.generation}
              </h2>
              <div className="pt-1">
                <StatRadar stats={card.species.stats} color="var(--primary)" />
                <SpeciesTrivia speciesId={card.species.id} />
              </div>
            </section>
          )}

          {card.species && <EvolutionLine speciesId={card.species.id} />}

          {card.species && (
            <SpeciesStrip
              speciesId={card.species.id}
              currentCardId={card.id}
              name={card.name}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What the reader can do about this card: catalogue a copy, or reach the ones
 * already catalogued.
 */
function OwnershipPanel({
  cardId,
  owned,
  itemId,
}: {
  cardId: string;
  owned: number;
  itemId: string | null;
}) {
  return (
    <section className="slab rounded-xl p-4">
      <h2 className="font-display mb-3 text-sm font-bold tracking-wide uppercase">
        {owned > 0 ? "Ya la tienes" : "Todavía no la tienes"}
      </h2>

      {owned > 0 && itemId && (
        <p className="text-muted-foreground mb-4 text-sm tabular-nums">
          Tienes ×{owned} en tu colección.{" "}
          <Link href={`/collection/${itemId}`} className="text-foreground underline underline-offset-4">
            Ver tu ficha
          </Link>
        </p>
      )}

      <Link
        href={`/collection/add?card=${cardId}`}
        className={cn(buttonVariants({ variant: owned > 0 ? "outline" : "default" }), "w-full")}
      >
        <Plus />
        {owned > 0 ? "Agregar otra copia" : "Agregar a tu colección"}
      </Link>

      {owned === 0 && (
        <p className="text-muted-foreground/70 mt-3 text-xs">
          Si la buscas, anótala en tus deseos desde{" "}
          <Link href={`/collection/add?card=${cardId}`} className="underline underline-offset-4">
            la misma pantalla
          </Link>
          : aparece en Trueques cuando alguien la tenga repetida.
        </p>
      )}
    </section>
  );
}

"use client";

import { ArrowLeftRight, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CardImage } from "@/components/card-image";
import { TypeChip } from "@/components/type-dot";
import { formatUsd } from "@/lib/format";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";

export type PreviewCard = {
  id: string;
  name: string;
  number: string;
  setName: string;
  printedTotal: number;
  rarity: string | null;
  category: string;
  hp: number | null;
  types: string[];
  imageUrl: string | null;
  price: number | null;
  copies?: number;
};

export type PreviewSides = {
  give: PreviewCard[];
  get: PreviewCard[];
};

/**
 * A card at a size you can actually read, without leaving the trade.
 *
 * The thumbnails of every card in the swap stay on screen, so moving between
 * them is one click rather than close-and-reopen. Compare puts one card from
 * each side face to face, which is the question a trade actually asks.
 */
export function CardPreview({
  sides,
  openId,
  onOpenChange,
}: {
  sides: PreviewSides;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const all = [...sides.give, ...sides.get];
  const current = all.find((card) => card.id === openId) ?? null;
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!openId) setComparing(false);
  }, [openId]);

  useEffect(() => {
    if (!openId) return;

    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

      const index = all.findIndex((card) => card.id === openId);
      const next = event.key === "ArrowRight" ? index + 1 : index - 1;
      const target = all[(next + all.length) % all.length];
      if (target) onOpenChange(target.id);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, all, onOpenChange]);

  if (!current) return null;

  const onGiveSide = sides.give.some((card) => card.id === current.id);
  // Comparing pairs the open card against the other side's most valuable one:
  // that is the card the swap hinges on.
  const counterpart = (onGiveSide ? sides.get : sides.give)
    .slice()
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(null)}>
      <DialogContent
        showCloseButton
        className="max-h-[90svh] w-full max-w-3xl gap-0 overflow-y-auto p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">
          {current.name}, {current.number} de {current.printedTotal}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Carta del trueque con {onGiveSide ? "lo que entregas" : "lo que recibes"}.
          Usa las flechas para moverte entre las cartas.
        </DialogDescription>

        <header className="border-edge flex items-center gap-3 border-b px-5 py-3 pr-14">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            {onGiveSide ? "Entregas" : "Recibes"}
          </p>
          {counterpart && (
            <Button
              variant={comparing ? "default" : "ghost"}
              size="sm"
              className="ml-auto"
              onClick={() => setComparing((value) => !value)}
            >
              <ArrowLeftRight />
              Comparar
            </Button>
          )}
        </header>

        <div className="p-5">
          <div className={cn("grid gap-6", comparing ? "sm:grid-cols-2" : "sm:grid-cols-[220px_1fr]")}>
            <Face card={current} caption={comparing} label={comparing ? "Tu lado" : undefined} />
            {comparing && counterpart ? (
              <Face card={counterpart} caption label="Del otro lado" />
            ) : (
              <Details card={current} />
            )}
          </div>

          {comparing && counterpart && (
            <Verdict a={current} b={counterpart} aGives={onGiveSide} />
          )}
        </div>

        <Filmstrip sides={sides} openId={current.id} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

/** The card itself. The caption only appears where no details panel says the same. */
function Face({ card, caption, label }: { card: PreviewCard; caption?: boolean; label?: string }) {
  return (
    <div>
      {label && (
        <p className="text-muted-foreground mb-2 text-[11px] tracking-wide uppercase">{label}</p>
      )}
      <div className="mx-auto max-w-[240px]">
        <CardImage
          src={card.imageUrl}
          alt={card.name}
          sizes="240px"
          category={card.category}
        />
      </div>
      {caption && (
        <div className="mt-3 text-center">
          <p className="font-display font-semibold">{card.name}</p>
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {card.number}/{card.printedTotal} · {card.setName}
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            {card.price === null ? "sin precio" : formatUsd(card.price)}
          </p>
        </div>
      )}
    </div>
  );
}

function Details({ card }: { card: PreviewCard }) {
  return (
    <div className="min-w-0">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{card.name}</h2>
      <p className="text-muted-foreground font-mono text-sm tabular-nums">
        {card.number}/{card.printedTotal} · {card.setName}
      </p>

      {card.types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {card.types.map((type) => (
            <TypeChip key={type} type={type} />
          ))}
        </div>
      )}

      <dl className="border-edge mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 text-sm">
        <Stat label="Precio" value={card.price === null ? "—" : formatUsd(card.price)} strong />
        <Stat label="Rareza" value={card.rarity ?? "—"} />
        <Stat label="PS" value={card.hp === null ? "—" : String(card.hp)} />
        <Stat
          label="Libres"
          value={card.copies === undefined ? "—" : `${card.copies}`}
        />
      </dl>

      <Link
        href={`/collection/add?card=${card.id}`}
        className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
      >
        Ver la ficha completa
        <ExternalLink className="size-3.5" />
      </Link>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</dt>
      <dd className={cn("font-mono tabular-nums", strong && "text-base font-medium")}>{value}</dd>
    </div>
  );
}

/** What the two cards are worth against each other, stated plainly. */
function Verdict({ a, b, aGives }: { a: PreviewCard; b: PreviewCard; aGives: boolean }) {
  if (a.price === null || b.price === null) {
    return (
      <p className="text-muted-foreground border-edge mt-5 border-t pt-4 text-center text-sm">
        Una de las dos no tiene precio de mercado, así que no hay comparación honesta.
      </p>
    );
  }

  const mine = aGives ? a.price : b.price;
  const theirs = aGives ? b.price : a.price;
  const diff = theirs - mine;
  const up = diff >= 0;

  return (
    <p className="border-edge mt-5 border-t pt-4 text-center text-sm">
      Das {formatUsd(mine)} y recibes {formatUsd(theirs)}:{" "}
      <span className={cn("font-mono font-medium", up ? "text-emerald-600" : "text-destructive")}>
        {up ? "+" : "−"}
        {formatUsd(Math.abs(diff))}
      </span>{" "}
      <span className="text-muted-foreground">{up ? "a tu favor" : "en tu contra"}</span>
    </p>
  );
}

/** Every card in the swap, grouped by side, as a strip you can walk. */
function Filmstrip({
  sides,
  openId,
  onOpenChange,
}: {
  sides: PreviewSides;
  openId: string;
  onOpenChange: (id: string) => void;
}) {
  const all = [...sides.give, ...sides.get];
  const index = all.findIndex((card) => card.id === openId);

  const step = (delta: number) => {
    const target = all[(index + delta + all.length) % all.length];
    if (target) onOpenChange(target.id);
  };

  return (
    <footer className="border-edge bg-raised/40 flex items-center gap-3 border-t px-5 py-3">
      <Button variant="ghost" size="icon" aria-label="Carta anterior" onClick={() => step(-1)}>
        <ChevronLeft />
      </Button>

      <div className="flex flex-1 items-center gap-4 overflow-x-auto">
        <Strip label="Entregas" cards={sides.give} openId={openId} onOpenChange={onOpenChange} />
        <ArrowLeftRight className="text-muted-foreground/40 size-4 shrink-0" aria-hidden />
        <Strip label="Recibes" cards={sides.get} openId={openId} onOpenChange={onOpenChange} />
      </div>

      <Button variant="ghost" size="icon" aria-label="Carta siguiente" onClick={() => step(1)}>
        <ChevronRight />
      </Button>
    </footer>
  );
}

function Strip({
  label,
  cards,
  openId,
  onOpenChange,
}: {
  label: string;
  cards: PreviewCard[];
  openId: string;
  onOpenChange: (id: string) => void;
}) {
  return (
    <div className="shrink-0">
      <p className="text-muted-foreground/70 mb-1 text-[10px] tracking-wide uppercase">{label}</p>
      <ul className="flex gap-1.5">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              onClick={() => onOpenChange(card.id)}
              aria-label={card.name}
              aria-current={card.id === openId}
              className={cn(
                "w-10 rounded-md transition-opacity",
                card.id === openId ? "ring-foreground ring-2" : "opacity-55 hover:opacity-100",
              )}
            >
              <CardImage
                src={card.imageUrl}
                alt={card.name}
                sizes="40px"
                category={card.category}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { typeColor } from "@/components/type-dot";

export type OwnedSlot = { number: string; type?: string | null };

/**
 * One slot per card printed in a set, lit only where the card is owned.
 *
 * The gaps are the point: this is the screen answering "what am I missing".
 * Owned slots carry their card's own type colour, so a long dark run reads as a
 * hole in the set while the lit ones show what the set is made of.
 */
export function CoverageStrip({
  printedTotal,
  ownedSlots,
}: {
  printedTotal: number;
  ownedSlots: OwnedSlot[];
}) {
  const held = new Map(ownedSlots.map((slot) => [slot.number, slot.type]));

  return (
    <div className="flex flex-wrap gap-[3px]">
      {Array.from({ length: printedTotal }, (_, index) => {
        const number = String(index + 1);
        const owned = held.has(number);
        const color = owned ? typeColor(held.get(number) ?? "normal") : null;

        return (
          <span
            key={number}
            title={owned ? `Tienes la ${number}` : `Te falta la ${number}`}
            className="h-4 w-2.5 rounded-[3px] transition-transform hover:scale-125"
            style={
              color
                ? { background: color, boxShadow: `0 0 10px -2px ${color}` }
                : { boxShadow: "inset 0 0 0 1px var(--edge)" }
            }
          />
        );
      })}
    </div>
  );
}

/**
 * The whole collection as one bar, each type a segment sized by how many cards
 * carry it. Where the coverage strip answers "what is missing", this answers
 * "what is this collection actually made of".
 */
export function TypeSpectrum({
  entries,
}: {
  entries: { type: string; count: number }[];
}) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return null;

  return (
    <div className="ring-edge flex h-3 w-full overflow-hidden rounded-full ring-1">
      {entries.map((entry) => (
        <span
          key={entry.type}
          className="h-full"
          style={{
            width: `${(entry.count / total) * 100}%`,
            background: typeColor(entry.type),
          }}
        />
      ))}
    </div>
  );
}

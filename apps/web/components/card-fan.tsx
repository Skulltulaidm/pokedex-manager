import Image from "next/image";

import { typeColor } from "@/components/type-dot";

/**
 * Four cards fanned out, as they sit when you spread a handful on a table.
 *
 * The sign-in screen's job is to say what this is before anyone reads a word,
 * and nothing says it faster than the artwork itself.
 */
// Offsets are in card-widths so the fan holds its shape at any viewport size.
const FAN = [
  { id: "4", type: "fire", rotate: -15, x: -0.62, y: 16, z: 1 },
  { id: "2", type: "water", rotate: -5, x: -0.21, y: 2, z: 2 },
  { id: "15", type: "grass", rotate: 5, x: 0.21, y: 2, z: 3 },
  { id: "58", type: "electric", rotate: 15, x: 0.62, y: 16, z: 4 },
];

const CARD_W = "clamp(88px, 26vw, 116px)";

export function CardFan() {
  return (
    <div className="relative h-48 w-full sm:h-56" aria-hidden>
      {FAN.map((card) => (
        <div
          key={card.id}
          className="absolute top-0 left-1/2 aspect-[63/88]"
          style={{
            width: CARD_W,
            transform: `translateX(calc(-50% + ${card.x} * ${CARD_W})) translateY(${card.y}px) rotate(${card.rotate}deg)`,
            zIndex: card.z,
          }}
        >
          <div
            className="aura absolute -inset-5 opacity-55 blur-2xl"
            style={{ "--glow": typeColor(card.type) } as React.CSSProperties}
          />
          <div className="ring-edge relative h-full w-full overflow-hidden rounded-lg shadow-[0_12px_32px_-10px_oklch(0_0_0/0.9)] ring-1">
            <Image
              src={`https://assets.tcgdex.net/en/base/base1/${card.id}/high.webp`}
              alt=""
              fill
              sizes="116px"
              className="object-cover"
              priority
            />
          </div>
        </div>
      ))}
    </div>
  );
}

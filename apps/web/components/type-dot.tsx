import {
  Bird,
  Bug,
  CircleDot,
  Droplet,
  Flame,
  Gem,
  Ghost,
  Hand,
  Leaf,
  Moon,
  Mountain,
  Skull,
  Snowflake,
  Sparkles,
  Sprout,
  Swords,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

// A glyph is recognised before a word is read, and these eighteen are the
// vocabulary the whole collection is filtered and coloured by.
export const TYPE_ICON: Record<string, LucideIcon> = {
  normal: CircleDot,
  fire: Flame,
  water: Droplet,
  electric: Zap,
  grass: Leaf,
  ice: Snowflake,
  fighting: Hand,
  poison: Skull,
  ground: Mountain,
  flying: Bird,
  psychic: Sparkles,
  bug: Bug,
  rock: Gem,
  ghost: Ghost,
  dragon: Swords,
  dark: Moon,
  steel: Wrench,
  fairy: Sprout,
};

/**
 * The CSS variable behind each type, not a utility class.
 *
 * A type colour is used as a fill, a glow, a ring and a gradient stop, and only a
 * raw variable can serve all four; a `bg-*` class can only ever be a background.
 */
export const TYPE_VAR: Record<string, string> = {
  normal: "--type-normal",
  fire: "--type-fire",
  water: "--type-water",
  electric: "--type-electric",
  grass: "--type-grass",
  ice: "--type-ice",
  fighting: "--type-fighting",
  poison: "--type-poison",
  ground: "--type-ground",
  flying: "--type-flying",
  psychic: "--type-psychic",
  bug: "--type-bug",
  rock: "--type-rock",
  ghost: "--type-ghost",
  dragon: "--type-dragon",
  dark: "--type-dark",
  steel: "--type-steel",
  fairy: "--type-fairy",
};

const TYPE_LABEL: Record<string, string> = {
  normal: "Normal",
  fire: "Fuego",
  water: "Agua",
  electric: "Eléctrico",
  grass: "Planta",
  ice: "Hielo",
  fighting: "Lucha",
  poison: "Veneno",
  ground: "Tierra",
  flying: "Volador",
  psychic: "Psíquico",
  bug: "Bicho",
  rock: "Roca",
  ghost: "Fantasma",
  dragon: "Dragón",
  dark: "Siniestro",
  steel: "Acero",
  fairy: "Hada",
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function typeColor(type: string): string {
  const variable = TYPE_VAR[type];
  return variable ? `var(${variable})` : "var(--muted-foreground)";
}

export function TypeDots({
  types,
  className,
}: {
  types: string[];
  className?: string;
}) {
  if (types.length === 0) return null;

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={types.map(typeLabel).join(" y ")}
    >
      {types.map((type) => (
        <span
          key={type}
          className="size-2 rounded-full"
          style={{
            background: typeColor(type),
            boxShadow: `0 0 8px ${typeColor(type)}`,
          }}
        />
      ))}
    </span>
  );
}

export function TypeChip({ type }: { type: string }) {
  const color = typeColor(type);
  const Icon = TYPE_ICON[type] ?? CircleDot;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 text-xs font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 28%, transparent)`,
      }}
    >
      <Icon className="size-3.5" />
      {typeLabel(type)}
    </span>
  );
}

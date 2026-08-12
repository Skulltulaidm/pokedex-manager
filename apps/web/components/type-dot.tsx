import { cn } from "@workspace/ui/lib/utils";

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

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 28%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {typeLabel(type)}
    </span>
  );
}

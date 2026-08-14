export const CONDITION_LABEL: Record<string, string> = {
  mint: "Impecable",
  near_mint: "Casi impecable",
  lightly_played: "Poco jugada",
  moderately_played: "Jugada",
  heavily_played: "Muy jugada",
  damaged: "Dañada",
};

export const CONDITION_ORDER = [
  "mint",
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
] as const;

export function conditionLabel(condition: string): string {
  return CONDITION_LABEL[condition] ?? condition;
}

/**
 * The grades collectors actually read, in the letters the hobby prints on a
 * listing. "Casi impecable" does not fit under a thumbnail and nobody says it
 * out loud anyway; the full label stays as the title attribute.
 */
export const CONDITION_SHORT: Record<string, string> = {
  mint: "M",
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

export function conditionShort(condition: string): string {
  return CONDITION_SHORT[condition] ?? condition;
}

export const STAT_LABEL: Record<string, string> = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  "special-attack": "At. especial",
  "special-defense": "Def. especial",
  speed: "Velocidad",
};

export const STAT_ORDER = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;

// The highest base stat in any single stat is Blissey's 255 HP.
export const STAT_MAX = 255;

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Formatted here rather than with toLocaleDateString so server and client agree. */
export function formatReleaseDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

export const VARIANT_LABEL: Record<string, string> = {
  normal: "Normal",
  holo: "Holo",
  reverse: "Reverse holo",
  firstEdition: "1.ª edición",
  wPromo: "Promo",
};

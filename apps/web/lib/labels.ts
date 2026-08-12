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

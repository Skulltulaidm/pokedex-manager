// The interface is Spanish but the currency is not: es-ES renders USD as
// "2777 US$", which no portfolio anywhere shows. The amount is formatted the way
// the currency is read.
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const USD_ROUND = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsd(value: number | string, round = false): string {
  return (round ? USD_ROUND : USD).format(Number(value));
}

export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const DAY_HEADING = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const FULL_MOMENT = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeStyle: "short",
});

/** The heading a day's worth of entries sits under. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  const days = daysApart(date, new Date());
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";

  const heading = DAY_HEADING.format(date);
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}

/**
 * How long ago, short enough to sit at the end of a row on a phone.
 *
 * "hace 23 minutos" is the readable form and it does not fit next to a title on
 * a 390px screen, so the row carries the number and the tooltip the sentence.
 */
export function formatAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

export function formatMoment(iso: string): string {
  return FULL_MOMENT.format(new Date(iso));
}

/** Whole days between two moments, counted by calendar day rather than by hours. */
function daysApart(from: Date, to: Date): number {
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day(to) - day(from)) / 86_400_000);
}

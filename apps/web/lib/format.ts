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

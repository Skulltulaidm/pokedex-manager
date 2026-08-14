"use client";

import { apiClient } from "@/lib/api-client";
import { useMarketSummary } from "@/lib/api/hooks/useMarketSummary";

const DAY = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });

/**
 * Where the value curve will go, and why it is not here yet.
 *
 * The price history is days old, so a chart would be two points and a line
 * between them — a trend the data cannot support. Saying so is the honest
 * version of the panel until the series is long enough to draw.
 */
export function PortfolioHistory() {
  const { data } = useMarketSummary({ client: { client: apiClient } });
  const since = data?.change?.since;

  return (
    <section className="ring-edge bg-surface/60 rounded-xl px-4 py-4 ring-1">
      <h2 className="font-display text-sm font-semibold tracking-tight">
        Evolución
      </h2>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
        {since
          ? `Sólo hay precios guardados desde el ${DAY.format(new Date(since))}. Con ese historial no se puede dibujar una curva sin inventarla; cuando haya semanas de lecturas, la evolución del valor va aquí.`
          : "Todavía no hay historial de precios: el catálogo guarda una lectura por día y aún no acumula suficientes para mostrar una evolución."}
      </p>
    </section>
  );
}

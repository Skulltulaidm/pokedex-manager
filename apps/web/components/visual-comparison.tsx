"use client";

import { Eye, Sparkles } from "lucide-react";
import { useState } from "react";

import { compareCards } from "@/lib/api/clients/compareCards";
import type { VisualComparison as Comparison } from "@/lib/api/types";
import { apiClient } from "@/lib/api-client";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";

/**
 * The one comparison the data cannot make: printing, frame and wear live only
 * in the artwork. Asked for on demand, because it costs a vision call.
 */
export function VisualComparison({ a, b }: { a: string; b: string }) {
  const [result, setResult] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function look() {
    setBusy(true);
    setFailed(false);
    try {
      setResult(await compareCards({ a, b }, { client: apiClient }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className="slab mt-6 rounded-xl p-4">
        <h2 className="font-display mb-3 flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
          <Sparkles className="size-4" />
          Lo que se ve
        </h2>
        <p className="text-[15px] leading-relaxed">{result.summary}</p>
        {result.differences && result.differences.length > 0 && (
          <ul className="mt-4 space-y-2">
            {result.differences.map((line, index) => (
              <li key={index} className="text-muted-foreground flex gap-2.5 text-sm">
                <span className="bg-muted-foreground/40 mt-2 size-1 shrink-0 rounded-full" />
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="mt-6 text-center">
      <Button variant="outline" onClick={look} disabled={busy}>
        {busy ? <Spinner className="size-4" /> : <Eye />}
        {busy ? "Mirando las cartas…" : "Comparar las imágenes"}
      </Button>
      {failed && (
        <p className="text-muted-foreground mt-3 text-sm">
          No se pudo comparar las imágenes. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}

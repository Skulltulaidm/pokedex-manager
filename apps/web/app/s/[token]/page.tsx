import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CoverageStrip, TypeSpectrum } from "@/components/coverage-strip";
import { typeLabel } from "@/components/type-dot";
import type { PublicCollection } from "@/lib/api/types";
import { buttonVariants } from "@workspace/ui/components/button";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8010";

async function fetchShared(token: string): Promise<PublicCollection | null> {
  const response = await fetch(`${API_URL}/api/v1/public/${token}`, {
    cache: "no-store",
  });
  return response.ok ? response.json() : null;
}

export default async function SharedCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchShared(token);
  if (!data) notFound();

  return (
    <main className="rise mx-auto max-w-6xl px-4 py-10 md:px-6">
      <header className="mb-8">
        <p className="text-muted-foreground text-sm">Colección compartida</p>
        <h1 className="font-display mt-1 text-3xl font-semibold tracking-[-0.02em]">
          {data.total_cards} {data.total_cards === 1 ? "carta" : "cartas"}
        </h1>

        {data.types.length > 0 && (
          <div className="mt-5 max-w-xl">
            <TypeSpectrum entries={data.types} />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {data.types.map((entry) => (
                <li key={entry.type} className="text-muted-foreground text-sm">
                  {typeLabel(entry.type)}{" "}
                  <span className="font-mono tabular-nums">{entry.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {data.sets.length > 0 && (
        <section className="mb-9 max-w-xl">
          {data.sets.map((set) => (
            <div key={set.set_id}>
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h2 className="truncate font-medium">{set.set_name}</h2>
                <p className="shrink-0 font-mono text-sm tabular-nums">
                  {set.owned}
                  <span className="text-muted-foreground/50">/{set.printed_total}</span>
                </p>
              </div>
              <CoverageStrip printedTotal={set.printed_total} ownedSlots={set.owned_slots} />
            </div>
          ))}
        </section>
      )}

      <ul className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {data.items.map((item) => (
          <li key={item.id}>
            <div className="ring-edge relative aspect-[63/88] overflow-hidden rounded-lg ring-1">
              {item.card.image_large_url && (
                <Image
                  src={item.card.image_large_url}
                  alt={item.card.name}
                  fill
                  sizes="(min-width: 1024px) 18vw, 46vw"
                  className="object-cover"
                />
              )}
              {item.quantity > 1 && (
                <span className="glass text-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 font-mono text-[11px]">
                  ×{item.quantity}
                </span>
              )}
            </div>
            <p className="mt-2.5 truncate text-sm font-semibold">{item.card.name}</p>
            <p className="text-muted-foreground font-mono text-xs tabular-nums">
              {item.card.number}
              <span className="text-muted-foreground/50">
                /{item.card.card_set.printed_total}
              </span>
            </p>
          </li>
        ))}
      </ul>

      <footer className="border-edge mt-14 border-t pt-8 text-center">
        <p className="text-muted-foreground text-sm">
          Cataloga la tuya con PokéDex Manager.
        </p>
        <Link
          href="/sign-in"
          className={buttonVariants({ variant: "outline", className: "mt-4" })}
        >
          Crear mi colección
        </Link>
      </footer>
    </main>
  );
}

"use client";

import { ArrowLeftRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardPicker, type PickerCard } from "@/components/card-picker";
import { PanelSkeleton } from "@/components/pokeball";
import { ScreenHeader } from "@/components/screen-header";
import { apiClient } from "@/lib/api-client";
import { useListSpares } from "@/lib/api/hooks/useListSpares";
import { useMarketCards } from "@/lib/api/hooks/useMarketCards";
import { usePublishListing } from "@/lib/api/hooks/usePublishListing";
import { authClient } from "@/lib/auth-client";
import { useUrlState } from "@/lib/url-state";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { InputGroup, InputGroupInput } from "@workspace/ui/components/input-group";

const PER_PAGE = 12;

export default function PublishListingPage() {
  return (
    <Suspense fallback={<PanelSkeleton className="h-96" />}>
      <Publisher />
    </Suspense>
  );
}

/**
 * Publishing a swap nobody was asked for.
 *
 * The two sides are not symmetrical, and that is the point: what you hand over
 * has to be a copy you actually hold spare, while what you ask for is any card
 * in the catalog — nobody has promised it yet, so nothing constrains it.
 */
function Publisher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [params, setParam] = useUrlState();

  const [give, setGive] = useState<Set<string>>(new Set());
  const [want, setWant] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [giveSearch, setGiveSearch] = useState("");
  const [wantSearch, setWantSearch] = useState("");

  const givePage = Math.max(1, Number(params.get("pd") ?? 1));
  const wantPage = Math.max(1, Number(params.get("pp") ?? 1));
  const userId = session?.user?.id ?? "";

  const { data: spares, isPending: sparesPending } = useListSpares(
    userId,
    {
      search: giveSearch || undefined,
      limit: PER_PAGE,
      offset: (givePage - 1) * PER_PAGE,
    },
    { client: { client: apiClient }, query: { enabled: Boolean(userId) } },
  );

  const { data: catalog, isPending: catalogPending } = useMarketCards(
    {
      search: wantSearch || undefined,
      limit: PER_PAGE,
      offset: (wantPage - 1) * PER_PAGE,
    },
    { client: { client: apiClient } },
  );

  const publish = usePublishListing({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success("Publicada en el tablón");
        router.push("/trades");
      },
      onError: () =>
        toast.error("No se pudo publicar. Revisa que sigan libres las que das."),
    },
  });

  const giveCards: PickerCard[] = (spares?.items ?? []).map((entry) => ({
    id: entry.card.id,
    name: entry.card.name,
    imageUrl: entry.card.image_small_url,
    category: entry.card.category,
    price: entry.price_usd,
    copies: entry.copies,
    condition: entry.conditions.at(-1)?.condition ?? null,
  }));

  const wantCards: PickerCard[] = (catalog?.items ?? []).map((entry) => ({
    id: entry.card.id,
    name: entry.card.name,
    imageUrl: entry.card.image_small_url,
    category: entry.card.category,
    price: entry.card.price_usd ?? null,
  }));

  const ready = give.size > 0 && want.size > 0;

  return (
    <>
      <ScreenHeader title="Publicar en el tablón" />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/trades" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Volver a trueques
        </Link>
        <p className="text-muted-foreground text-sm">
          No eliges con quién: eliges qué das y qué pides, y lo toma quien pueda.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <CardPicker
          title="Das"
          subtitle="Solo tus repetidas"
          cards={giveCards}
          total={spares?.total ?? 0}
          loading={sparesPending}
          empty={
            giveSearch
              ? "Ninguna repetida coincide."
              : "No tienes repetidas para ofrecer todavía."
          }
          picked={give}
          onToggle={(id) => setGive((current) => toggle(current, id))}
          search={giveSearch}
          onSearch={(value) => {
            setGiveSearch(value);
            setParam({ pd: undefined });
          }}
          page={givePage}
          lastPage={lastPage(spares?.total)}
          onPage={(next) => setParam({ pd: String(next) })}
        />

        <ArrowLeftRight
          className="text-muted-foreground/30 mx-auto size-5 shrink-0 lg:mt-24"
          aria-hidden
        />

        <CardPicker
          title="Pides"
          subtitle="Cualquier carta del catálogo"
          cards={wantCards}
          total={catalog?.total ?? 0}
          loading={catalogPending}
          empty="Ninguna carta coincide."
          picked={want}
          onToggle={(id) => setWant((current) => toggle(current, id))}
          search={wantSearch}
          onSearch={(value) => {
            setWantSearch(value);
            setParam({ pp: undefined });
          }}
          page={wantPage}
          lastPage={lastPage(catalog?.total)}
          onPage={(next) => setParam({ pp: String(next) })}
        />
      </div>

      <div className="bg-surface/95 ring-edge sticky bottom-0 mt-6 rounded-2xl p-4 ring-1 backdrop-blur">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm">
            <span className="text-muted-foreground">Das</span>{" "}
            <span className="font-mono font-medium tabular-nums">{give.size}</span>
            <span className="text-muted-foreground/50 mx-2">·</span>
            <span className="text-muted-foreground">Pides</span>{" "}
            <span className="font-mono font-medium tabular-nums">{want.size}</span>
          </p>

          <InputGroup className="bg-secondary h-9 min-w-48 flex-1 rounded-full border-transparent">
            <InputGroupInput
              value={note}
              maxLength={280}
              placeholder="Una nota (opcional)"
              aria-label="Nota de la publicación"
              onChange={(event) => setNote(event.target.value)}
            />
          </InputGroup>

          <Button
            disabled={!ready || publish.isPending}
            onClick={() =>
              publish.mutate({
                data: {
                  give: [...give].map((card_id) => ({ card_id })),
                  want: [...want],
                  note: note || null,
                },
              })
            }
          >
            <Megaphone />
            {publish.isPending ? "Publicando…" : "Publicar"}
          </Button>
        </div>

        <p className="text-muted-foreground/70 mt-2 text-xs">
          {ready
            ? "Queda en el tablón hasta que alguien la tome o la retires. Ninguna carta se mueve de tu colección."
            : "Una publicación necesita al menos una carta de cada lado."}
        </p>
      </div>
    </>
  );
}

function lastPage(total: number | undefined): number {
  return total ? Math.max(1, Math.ceil(total / PER_PAGE)) : 1;
}

// Updated from the current set rather than the one this render captured: two
// picks landing in the same tick would otherwise both start from the old set
// and the first would be lost.
function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

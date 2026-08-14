"use client";

import { ArrowLeftRight, Check, Handshake, Heart, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CardImage } from "@/components/card-image";
import { Pager } from "@/components/pager";
import { ScreenHeader } from "@/components/screen-header";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useCounterOffer } from "@/lib/api/hooks/useCounterOffer";
import { useCreateOffer } from "@/lib/api/hooks/useCreateOffer";
import { useListCollectors } from "@/lib/api/hooks/useListCollectors";
import { useListOffers } from "@/lib/api/hooks/useListOffers";
import { useListSpares } from "@/lib/api/hooks/useListSpares";
import { authClient } from "@/lib/auth-client";
import type { SpareCard } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { conditionLabel, conditionShort } from "@/lib/labels";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 12;

export default function NewTradePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const partnerId = params.get("con");
  const answering = params.get("responde");

  // Countering starts from the offer on the table rather than a blank slate:
  // a negotiation is an edit of what was proposed, not a fresh proposal.
  const { data: offers } = useListOffers(
    { status_filter: "pending", limit: 50 },
    { client: { client: apiClient }, query: { enabled: Boolean(answering) } },
  );
  const original = offers?.items.find((offer) => offer.id === answering);

  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!original || seeded) return;
    setGive(new Set(original.you_give.map((entry) => entry.card.id)));
    setGet(new Set(original.you_get.map((entry) => entry.card.id)));
    setSeeded(true);
  }, [original, seeded]);

  const onSent = (what: string) => {
    void queryClient.invalidateQueries();
    toast.success(what);
    router.push("/trades");
  };
  const onFailed = () =>
    toast.error("No se pudo enviar. Revisa que sigan estando libres.");

  const create = useCreateOffer({
    client: { client: apiClient },
    mutation: { onSuccess: () => onSent("Oferta enviada"), onError: onFailed },
  });
  const counter = useCounterOffer({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => onSent("Contraoferta enviada"),
      onError: onFailed,
    },
  });

  if (!partnerId) return <CollectorPicker />;

  return (
    <>
      <ScreenHeader title={answering ? "Contraofertar" : "Armar un trueque"} />

      {answering && (
        <p className="ring-edge bg-surface text-muted-foreground mb-4 rounded-xl px-4 py-3 text-sm ring-1">
          Vas a responder con otras cartas. Al enviar, la oferta original queda
          rechazada — no pueden quedar dos en pie sobre la misma mesa.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/trades/new"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Cambiar de coleccionista
        </Link>
        <p className="text-muted-foreground text-sm">
          Elige de cada lado. Ninguna carta cambia de dueño hasta que ambos acepten.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <SparePanel
          title="Entregas"
          subtitle="Tus repetidas"
          ownerId={session?.user?.id ?? ""}
          picked={give}
          onToggle={(id) => setGive((current) => toggle(current, id))}
          paramKey="pg"
        />

        <ArrowLeftRight
          className="text-muted-foreground/30 mx-auto size-5 shrink-0 lg:mt-24"
          aria-hidden
        />

        <SparePanel
          title="Recibes"
          subtitle="Repetidas de quien elegiste"
          ownerId={partnerId}
          picked={get}
          onToggle={(id) => setGet((current) => toggle(current, id))}
          paramKey="pr"
          markWanted
        />
      </div>

      <Summary
        give={give}
        get={get}
        busy={create.isPending || counter.isPending}
        countering={Boolean(answering)}
        onSend={(message) => {
          const data = {
            to_user_id: partnerId,
            offered: [...give].map((card_id) => ({ card_id })),
            requested: [...get].map((card_id) => ({ card_id })),
            message: message || null,
          };
          if (answering) counter.mutate({ offer_id: answering, data });
          else create.mutate({ data });
        }}
      />
    </>
  );
}

// Updated from the current set rather than the one this render captured: two
// picks landing in the same tick would otherwise both start from the old set
// and the first would be lost.
function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Who to trade with, before there is anything to trade. */
function CollectorPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("p") ?? 1));
  const search = params.get("q") ?? "";

  const setParam = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) merged.delete(key);
      else merged.set(key, value);
    }
    router.replace(`/trades/new${merged.size ? `?${merged}` : ""}`, { scroll: false });
  };

  const { data, isPending } = useListCollectors(
    { search: search || undefined, limit: 12, offset: (page - 1) * 12 },
    { client: { client: apiClient } },
  );

  const lastPage = data ? Math.max(1, Math.ceil(data.total / 12)) : 1;

  return (
    <>
      <ScreenHeader title="Armar un trueque" meta={`${data?.total ?? 0} coleccionistas`} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <InputGroup className="bg-secondary h-10 max-w-xs flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            defaultValue={search}
            placeholder="Buscar coleccionista…"
            aria-label="Buscar coleccionista"
            onChange={(event) => setParam({ q: event.target.value, p: undefined })}
          />
        </InputGroup>
        <Pager page={page} lastPage={lastPage} onChange={(next) => setParam({ p: String(next) })} />
      </div>

      {isPending && <Skeleton className="h-40 rounded-2xl" />}

      {data?.total === 0 && (
        <p className="text-muted-foreground ring-edge bg-surface/60 rounded-2xl px-6 py-12 text-center text-sm ring-1">
          Nadie tiene cartas repetidas todavía. En cuanto alguien registre una
          segunda copia de algo, aparece acá.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.items.map((collector) => (
          <li key={collector.user_id}>
            <Link
              href={`/trades/new?con=${collector.user_id}`}
              className="ring-edge bg-surface hover:border-muted-foreground/30 flex items-center gap-3 rounded-2xl p-4 ring-1 transition-colors"
            >
              <UserAvatar value={collector.user_id} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {collector.name ?? "Coleccionista"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {collector.spares} repetidas
                  {collector.you_want > 0 && ` · ${collector.you_want} que buscas`}
                  {collector.they_want > 0 && ` · quiere ${collector.they_want} tuyas`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** One side's inventory: searchable, paginated, and picked from. */
function SparePanel({
  title,
  subtitle,
  ownerId,
  picked,
  onToggle,
  paramKey,
  markWanted,
}: {
  title: string;
  subtitle: string;
  ownerId: string;
  picked: Set<string>;
  onToggle: (id: string) => void;
  paramKey: string;
  markWanted?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get(paramKey) ?? 1));
  const [search, setSearch] = useState("");
  const [onlyWanted, setOnlyWanted] = useState(false);

  const { data, isPending } = useListSpares(
    ownerId,
    {
      search: search || undefined,
      wanted_only: markWanted ? onlyWanted : undefined,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    },
    { client: { client: apiClient }, query: { enabled: Boolean(ownerId) } },
  );

  const setPage = (next: number) => {
    const merged = new URLSearchParams(params.toString());
    merged.set(paramKey, String(next));
    router.replace(`/trades/new?${merged}`, { scroll: false });
  };

  const lastPage = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <section className="ring-edge bg-surface min-w-0 rounded-2xl p-4 ring-1">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {data?.total ?? 0}
        </span>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <InputGroup className="bg-secondary h-9 min-w-0 flex-1 rounded-full border-transparent">
          <InputGroupAddon>
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            placeholder="Buscar carta…"
            aria-label={`Buscar en ${title}`}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <button onClick={() => setSearch("")} aria-label="Limpiar">
                <X className="size-3.5" />
              </button>
            </InputGroupAddon>
          )}
        </InputGroup>

        {markWanted && (
          <button
            onClick={() => setOnlyWanted((value) => !value)}
            aria-pressed={onlyWanted}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              onlyWanted
                ? "bg-foreground text-background"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            <Heart className="size-3.5" />
            Que busco
          </button>
        )}

        <Pager page={page} lastPage={lastPage} onChange={setPage} />
      </div>

      {isPending && <Skeleton className="h-64 rounded-xl" />}

      {data?.total === 0 && (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {search ? "Ninguna carta coincide." : "No hay repetidas de este lado."}
        </p>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5">
        {data?.items.map((entry) => (
          <li key={entry.card.id}>
            <Tile
              entry={entry}
              picked={picked.has(entry.card.id)}
              onToggle={() => onToggle(entry.card.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({
  entry,
  picked,
  onToggle,
}: {
  entry: SpareCard;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} aria-pressed={picked} className="w-full text-left">
      <div className={cn("relative rounded-lg transition-all", picked && "ring-foreground ring-2")}>
        <CardImage
          src={entry.card.image_small_url}
          alt={entry.card.name}
          sizes="96px"
          category={entry.card.category}
        />
        {picked && (
          <span className="bg-foreground text-background absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full">
            <Check className="size-3" />
          </span>
        )}
        {entry.wanted && !picked && (
          <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full">
            <Heart className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium">{entry.card.name}</p>
      <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
        {entry.price_usd === null ? "—" : formatUsd(Number(entry.price_usd))}
        {entry.copies > 1 && ` · ${entry.copies}`}
      </p>
      {/* The worst copy is the one that changes hands unless someone says
          otherwise, so it is the one named here. */}
      {entry.conditions.length > 0 && (
        <p
          className="text-muted-foreground/60 font-mono text-[10px]"
          title={conditionLabel(entry.conditions[entry.conditions.length - 1]!.condition)}
        >
          {conditionShort(entry.conditions[entry.conditions.length - 1]!.condition)}
          {entry.conditions.length > 1 && ` +${entry.conditions.length - 1}`}
        </p>
      )}
    </button>
  );
}

/**
 * What the offer adds up to, pinned where it cannot be scrolled away from.
 *
 * The balance is the whole question of a trade, and a total that lives at the
 * bottom of two long lists is a total nobody reads while choosing.
 */
function Summary({
  give,
  get,
  busy,
  countering,
  onSend,
}: {
  give: Set<string>;
  get: Set<string>;
  busy: boolean;
  countering?: boolean;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const ready = give.size > 0 && get.size > 0;

  return (
    <div className="bg-surface/95 ring-edge sticky bottom-0 mt-6 rounded-2xl p-4 ring-1 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm">
          <span className="text-muted-foreground">Entregas</span>{" "}
          <span className="font-mono font-medium tabular-nums">{give.size}</span>
          <span className="text-muted-foreground/50 mx-2">·</span>
          <span className="text-muted-foreground">Recibes</span>{" "}
          <span className="font-mono font-medium tabular-nums">{get.size}</span>
        </p>

        <InputGroup className="bg-secondary h-9 min-w-48 flex-1 rounded-full border-transparent">
          <InputGroupInput
            value={message}
            maxLength={280}
            placeholder="Un mensaje (opcional)"
            aria-label="Mensaje para la oferta"
            onChange={(event) => setMessage(event.target.value)}
          />
        </InputGroup>

        <Button disabled={!ready || busy} onClick={() => onSend(message)}>
          <Handshake />
          {busy ? "Enviando…" : countering ? "Enviar contraoferta" : "Enviar oferta"}
        </Button>
      </div>

      {!ready && (
        <p className="text-muted-foreground/70 mt-2 text-xs">
          Un trueque necesita al menos una carta de cada lado.
        </p>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, Check, ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/screen-header";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { TypeDots } from "@/components/type-dot";
import { apiClient } from "@/lib/api-client";
import { confirmScan } from "@/lib/api/clients/confirmScan";
import { createScan } from "@/lib/api/clients/createScan";
import type { CardCandidate, ScanResult } from "@/lib/api/types";
import { CONDITION_ORDER, conditionLabel } from "@/lib/labels";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

const SIGNAL_LABELS: Record<string, string> = {
  collector_number: "número",
  set_total: "tamaño del set",
  name: "nombre",
  hp: "PS",
};

export default function ScanPage() {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [condition, setCondition] = useState("near_mint");
  const [showAll, setShowAll] = useState(false);
  const [saved, setSaved] = useState<SavedCard[]>([]);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setBusy(true);

    try {
      setResult(await createScan({ image: file }, { client: apiClient }));
    } catch {
      toast.error("No se pudo leer la foto. Intenta con otra.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function save(candidate: CardCandidate) {
    if (!result?.scan_id) return;
    setSaving(candidate.card.id);

    try {
      await confirmScan(
        result.scan_id,
        { card_id: candidate.card.id, condition: condition as never, quantity: 1 },
        { client: apiClient },
      );
      // Scanning a box is the real task, so the screen resets for the next card
      // instead of leaving after one.
      setSaved((prev) => [
        {
          id: candidate.card.id,
          name: candidate.card.name,
          image: candidate.card.image_small_url ?? null,
        },
        ...prev,
      ]);
      toast.success(`${candidate.card.name} guardada`);
      reset();
    } catch {
      toast.error("No se pudo guardar la carta.");
      setSaving(null);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setShowAll(false);
    setSaving(null);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) upload(file);
  }

  const settled = result?.status === "resolved" && !showAll;
  const shown = settled ? result.candidates.slice(0, 1) : (result?.candidates ?? []);
  const rest = (result?.candidates ?? []).slice(shown.length);

  return (
    <>
      <ScreenHeader title="Escanear">
        {saved.length > 0 && (
          <Link href="/collection" className={buttonVariants({ size: "sm" })}>
            Terminar · {saved.length}
          </Link>
        )}
      </ScreenHeader>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
      />

      {!preview && (
        <div className="mx-auto max-w-md text-center">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "mb-6 grid aspect-[63/88] max-h-[46svh] w-full place-items-center rounded-2xl border-2 border-dashed transition-colors",
              dragging
                ? "border-foreground bg-accent"
                : "border-edge bg-surface/60",
            )}
          >
            <div className="px-6">
              <Camera className="text-muted-foreground/40 mx-auto size-12" strokeWidth={1.25} />
              <p className="text-muted-foreground/60 mt-3 hidden text-sm md:block">
                {dragging ? "Suelta la foto" : "o arrastra una foto aquí"}
              </p>
            </div>
          </div>
          <h2 className="font-display text-lg font-semibold">Fotografía la carta</h2>
          <p className="text-muted-foreground mx-auto mt-2 mb-6 max-w-xs text-sm">
            Encuadra la carta completa y con buena luz. El número y el total del
            set son lo que más ayuda a identificarla.
          </p>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => camera.current?.click()}>
              <Camera />
              Tomar foto
            </Button>
            <Button variant="outline" size="lg" onClick={() => library.current?.click()}>
              <ImagePlus />
              Elegir de la galería
            </Button>
          </div>
          {saved.length > 0 && <SavedStrip saved={saved} />}
        </div>
      )}

      {preview && (
        <div className="mx-auto max-w-2xl">
          <div className="flex gap-4">
            <div className="ring-edge relative aspect-[63/88] w-28 shrink-0 overflow-hidden rounded-xl ring-1">
              <Image src={preview} alt="Foto que tomaste" fill className="object-cover" />
            </div>

            <div className="min-w-0 flex-1">
              {busy && (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Spinner className="size-4" />
                  Leyendo la carta…
                </p>
              )}

              {result && (
                <>
                  <Reading result={result} />
                  <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={reset}>
                    <RotateCcw />
                    Otra foto
                  </Button>
                </>
              )}
            </div>
          </div>

          {result && result.candidates.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-1 text-sm font-medium">
                {result.status === "resolved" ? "Es esta carta" : "¿Cuál de estas es?"}
              </h2>
              <p className="text-muted-foreground mb-4 text-sm">
                Elige el estado y confirma para guardarla.
              </p>

              <div className="mb-5 flex flex-wrap gap-2">
                {CONDITION_ORDER.map((value) => (
                  <button
                    key={value}
                    onClick={() => setCondition(value)}
                    aria-pressed={condition === value}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      condition === value
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {conditionLabel(value)}
                  </button>
                ))}
              </div>

              <ul className="space-y-2.5">
                {shown.map((candidate) => (
                  <li key={candidate.card.id}>
                    <Candidate
                      candidate={candidate}
                      saving={saving === candidate.card.id}
                      disabled={saving !== null}
                      onSave={() => save(candidate)}
                    />
                  </li>
                ))}
              </ul>

              {rest.length > 0 && !showAll && (
                <Button
                  variant="ghost"
                  className="text-muted-foreground mt-3 w-full"
                  onClick={() => setShowAll(true)}
                >
                  No es esa · ver {rest.length} más
                </Button>
              )}
            </section>
          )}

          {result && result.candidates.length === 0 && !busy && <NotFound />}
        </div>
      )}
    </>
  );
}

function Reading({ result }: { result: ScanResult }) {
  const { reading } = result;
  const read = [
    reading.name,
    reading.collector_number && `n.º ${reading.collector_number}`,
    reading.set_total && `de ${reading.set_total}`,
    reading.hp && `${reading.hp} PS`,
  ].filter(Boolean);

  if (read.length === 0) {
    return <p className="text-muted-foreground text-sm">No se leyó nada legible en la foto.</p>;
  }

  return (
    <>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">Leí en la carta</p>
      <p className="mt-1 text-[15px] leading-snug font-medium">{read.join(" · ")}</p>
    </>
  );
}

/**
 * Each candidate states which signals agreed. A score alone asks for trust; the
 * signals let the user check the machine's reasoning against the card in hand.
 */
function Candidate({
  candidate,
  saving,
  disabled,
  onSave,
}: {
  candidate: CardCandidate;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const { card } = candidate;
  const signals = candidate.matched_on.map((key) => SIGNAL_LABELS[key] ?? key);

  return (
    <div className="ring-edge bg-surface flex items-center gap-3.5 rounded-2xl p-3 ring-1">
      <div className="ring-edge relative aspect-[63/88] w-14 shrink-0 overflow-hidden rounded-lg ring-1">
        {card.image_small_url && (
          <Image src={card.image_small_url} alt={card.name} fill sizes="56px" className="object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{card.name}</p>
          <TypeDots types={card.species?.types ?? []} />
        </div>
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {card.number}
          <span className="text-muted-foreground/50">/{card.card_set.printed_total}</span>
          <span className="mx-1.5">·</span>
          {card.card_set.name}
        </p>
        {signals.length > 0 && (
          <p className="text-muted-foreground/80 mt-1 text-xs">Coincide en {signals.join(", ")}</p>
        )}
      </div>

      <Button size="sm" disabled={disabled} onClick={onSave} className="shrink-0">
        {saving ? <Spinner className="size-4" /> : <Check />}
        Guardar
      </Button>
    </div>
  );
}

function NotFound() {
  return (
    <div className="ring-edge bg-surface/60 mt-8 rounded-2xl px-6 py-12 text-center ring-1">
      <h2 className="font-display text-lg font-semibold">No pude identificarla</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
        Puede que la foto no deje ver el número, o que la carta todavía no esté en
        el catálogo. Búscala por nombre y la registramos igual.
      </p>
      <Link href="/collection/add" className="mt-5 inline-block">
        <Button variant="outline">Buscar por nombre</Button>
      </Link>
    </div>
  );
}


type SavedCard = { id: string; name: string; image: string | null };

/** What this session has already catalogued, so a long box feels like progress. */
function SavedStrip({ saved }: { saved: SavedCard[] }) {
  return (
    <section className="mt-8 text-left">
      <h2 className="text-muted-foreground mb-3 text-[11px] tracking-wide uppercase">
        Guardadas ahora · {saved.length}
      </h2>
      <ul className="scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4">
        {saved.map((card, index) => (
          <li
            key={`${card.id}-${index}`}
            className="settle shrink-0"
            style={{ "--index": Math.min(index, 6) } as React.CSSProperties}
          >
            <div className="ring-edge relative aspect-[63/88] w-14 overflow-hidden rounded-lg ring-1">
              {card.image && (
                <Image src={card.image} alt={card.name} fill sizes="56px" className="object-cover" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

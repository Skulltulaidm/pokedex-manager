"use client";

import { PlusCircle, ScanLine, Sparkles } from "lucide-react";
import { RowsSkeleton } from "@/components/pokeball";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";

import { apiClient } from "@/lib/api-client";
import { useCollectionActivity } from "@/lib/api/hooks/useCollectionActivity";
import type { ActivityEntry } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";

const KIND: Record<string, { icon: LucideIcon; label: string }> = {
  added: { icon: PlusCircle, label: "Añadida" },
  scanned: { icon: ScanLine, label: "Escaneada" },
  suggested: { icon: Sparkles, label: "Sugerida" },
};

const SCAN_STATUS: Record<string, string> = {
  resolved: "identificada",
  ambiguous: "ambigua",
  failed: "sin identificar",
  pending: "pendiente",
  extracted: "leída",
};

/** Assembled from three tables that each already record when something happened. */
export function ActivityFeed() {
  const { data, isPending } = useCollectionActivity({ client: { client: apiClient } });

  if (isPending) return <RowsSkeleton count={4} />;

  if (!data?.length) return null;

  return (
    <ul className="divide-edge divide-y">
      {data.map((entry, index) => (
        <Entry key={`${entry.kind}-${entry.at}-${index}`} entry={entry} />
      ))}
    </ul>
  );
}

function Entry({ entry }: { entry: ActivityEntry }) {
  const kind = KIND[entry.kind] ?? KIND.added!;
  const Icon = kind.icon;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="ring-edge relative aspect-[63/88] w-7 shrink-0 overflow-hidden rounded ring-1">
        {entry.image_url ? (
          <Image src={entry.image_url} alt="" fill sizes="28px" className="object-cover" />
        ) : (
          <span className="bg-muted block size-full" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {entry.card_name ?? "Carta sin identificar"}
          {entry.quantity && entry.quantity > 1 && (
            <span className="text-muted-foreground ml-1.5 font-mono text-xs">
              ×{entry.quantity}
            </span>
          )}
        </p>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Icon className="size-3" />
          {kind.label}
          {entry.kind === "scanned" && entry.detail && (
            <span className="opacity-70">· {SCAN_STATUS[entry.detail] ?? entry.detail}</span>
          )}
          {entry.kind === "added" && entry.detail && (
            <span className="truncate opacity-70">· {entry.detail}</span>
          )}
        </p>
      </div>

      {entry.value_usd != null && (
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {formatUsd(entry.value_usd)}
        </span>
      )}
    </li>
  );
}

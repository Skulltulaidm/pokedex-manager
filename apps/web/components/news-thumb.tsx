import { ArrowDownRight, ArrowUpRight, CheckCheck, Handshake, Megaphone, Reply } from "lucide-react";
import Image from "next/image";

import type { NewsEntry } from "@/lib/api/types";
import { cn } from "@workspace/ui/lib/utils";

const MARK = {
  offer_waiting: { icon: Handshake, tone: "" },
  offer_answered: { icon: Reply, tone: "" },
  trade_closed: { icon: CheckCheck, tone: "text-emerald-600" },
  listing_taken: { icon: Megaphone, tone: "" },
  wish_cheaper: { icon: ArrowDownRight, tone: "text-emerald-600" },
  wish_dearer: { icon: ArrowUpRight, tone: "text-destructive" },
} as const;

/**
 * What the entry is about, at a glance: the card if there is one, otherwise the
 * shape of what happened.
 */
export function NewsThumb({ entry, big = false }: { entry: NewsEntry; big?: boolean }) {
  const { icon: Icon, tone } = MARK[entry.kind];

  return (
    <span
      className={cn(
        "ring-edge grid shrink-0 place-items-center overflow-hidden rounded-lg ring-1",
        big ? "size-10" : "size-8",
        entry.image_url ? "relative" : "bg-secondary",
      )}
    >
      {entry.image_url ? (
        <Image
          src={entry.image_url}
          alt=""
          fill
          sizes={big ? "40px" : "32px"}
          className="object-cover"
        />
      ) : (
        <Icon className={cn(big ? "size-[18px]" : "size-4", tone)} />
      )}
    </span>
  );
}

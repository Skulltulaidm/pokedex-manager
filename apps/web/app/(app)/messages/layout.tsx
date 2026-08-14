"use client";

import { usePathname } from "next/navigation";

import { ScreenHeader } from "@/components/screen-header";
import { ThreadList } from "@/components/thread-list";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The list of conversations, and whichever one is open beside it.
 *
 * The list lives in the layout rather than in the screen so it survives moving
 * between conversations: the search you typed to find somebody is still there
 * after you open them.
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const [params, setParam] = useUrlState();
  const pathname = usePathname();

  // The open conversation is the collector, and it is a path rather than a
  // query parameter: the two of them have exactly one conversation, and a path
  // is the half of the address a client-side navigation gets right on arrival.
  const openId = pathname.startsWith("/messages/") ? pathname.slice("/messages/".length) : null;
  const page = Math.max(1, Number(params.get("p") ?? 1));
  const search = params.get("q") ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader title="Mensajes" />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[340px_1fr] lg:gap-6">
        <ThreadList
          openId={openId}
          page={page}
          search={search}
          onPage={(next) => setParam({ p: String(next) })}
          onSearch={(next) => setParam({ q: next, p: undefined })}
          className={cn(openId && "hidden lg:flex")}
        />
        {children}
      </div>
    </div>
  );
}

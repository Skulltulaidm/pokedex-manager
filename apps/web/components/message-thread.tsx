"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, Handshake } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Pager } from "@/components/pager";
import { PanelSkeleton, RowsSkeleton } from "@/components/pokeball";
import { UserAvatar } from "@/components/user-avatar";
import { apiClient } from "@/lib/api-client";
import { useGetThreadWith } from "@/lib/api/hooks/useGetThreadWith";
import { useListThreadMessages } from "@/lib/api/hooks/useListThreadMessages";
import { useMarkThreadRead } from "@/lib/api/hooks/useMarkThreadRead";
import { useSendDirectMessage } from "@/lib/api/hooks/useSendDirectMessage";
import type { DirectMessageView } from "@/lib/api/types";
import { formatDay, formatMoment } from "@/lib/format";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

const PER_PAGE = 30;

const TIME = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

/**
 * One conversation, and the field it is written in.
 *
 * Nothing here is live: the thread catches up on a timer and when the tab is
 * looked at again. A chat that pretends to be instant and is not is worse than
 * one that never claimed to be.
 */
export function MessageThread({
  partnerId,
  onBack,
}: {
  partnerId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  // Not in the address bar, unlike every other list in this app: which slice of
  // a conversation you scrolled back to is not a view worth linking to.
  const [page, setPage] = useState(1);
  const foot = useRef<HTMLDivElement>(null);

  const { data: thread, isPending: loadingThread } = useGetThreadWith(partnerId, {
    client: { client: apiClient },
    query: { refetchInterval: 15_000 },
  });

  const threadId = thread?.id ?? undefined;
  const { data: messages, isPending: loadingMessages } = useListThreadMessages(
    threadId,
    { limit: PER_PAGE, offset: (page - 1) * PER_PAGE },
    { client: { client: apiClient }, query: { refetchInterval: 15_000 } },
  );

  const { mutate: markRead } = useMarkThreadRead({ client: { client: apiClient } });
  const send = useSendDirectMessage({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries();
      },
      onError: () => toast.error("No se pudo enviar el mensaje."),
    },
  });

  // Reading is what the open thread means, so it is marked whenever unread
  // messages are on screen — including the ones the timer brings in later. The
  // count is part of the key so a second arrival is marked too, and a mark that
  // is already in flight is not sent twice while its refetch lands.
  const unread = thread?.unread ?? 0;
  const marked = useRef<string | null>(null);
  useEffect(() => {
    const key = `${threadId}:${unread}`;
    if (!threadId || unread === 0 || marked.current === key) return;
    marked.current = key;
    markRead(
      { thread_id: threadId },
      { onSuccess: () => void queryClient.invalidateQueries() },
    );
  }, [threadId, unread, markRead, queryClient]);

  const entries = messages?.items ?? [];
  const lastPage = messages ? Math.max(1, Math.ceil(messages.total / PER_PAGE)) : 1;

  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [entries.length, partnerId]);

  if (loadingThread) return <PanelSkeleton className="h-full min-h-80" />;

  if (!thread) {
    return (
      <p className="text-muted-foreground ring-edge bg-surface/60 rounded-2xl px-6 py-12 text-center text-sm ring-1">
        No encontramos a ese coleccionista.
      </p>
    );
  }

  return (
    <section className="ring-edge bg-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl ring-1">
      <header className="border-edge flex items-center gap-2.5 border-b px-3 py-2.5 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Volver a las conversaciones"
          className="lg:hidden"
        >
          <ArrowLeft />
        </Button>

        <UserAvatar value={thread.partner_id} size={34} />
        <Link
          href={`/collectors/${thread.partner_id}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
        >
          {thread.partner_name ?? "Coleccionista"}
        </Link>

        <Pager page={page} lastPage={lastPage} onChange={setPage} />
        <Link
          href={`/trades/new?con=${thread.partner_id}`}
          aria-label="Armar un trueque"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <Handshake />
        </Link>
      </header>

      <div className="scrollbar-none min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4 sm:px-4">
        {threadId && loadingMessages && <RowsSkeleton count={4} height="h-10" />}

        {!threadId && <FirstWord name={thread.partner_name} />}

        {byDay(entries).map(([day, ofThatDay]) => (
          <div key={day}>
            <p className="text-muted-foreground/70 mb-3 text-center text-[11px] tracking-wide uppercase">
              {day}
            </p>
            <ol className="space-y-1.5">
              {ofThatDay.map((message) => (
                <li key={message.id}>
                  <Bubble message={message} />
                </li>
              ))}
            </ol>
          </div>
        ))}

        <div ref={foot} />
      </div>

      {/* The assistant's button is fixed to the same corner from lg up, and it
          would sit on top of the send button without the extra padding. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (body) send.mutate({ data: { to_user_id: partnerId, body } });
        }}
        className="border-edge flex items-end gap-2 border-t p-2.5 sm:p-3 lg:pr-20"
      >
        <Composer value={draft} onChange={setDraft} />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          aria-label="Enviar"
          className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-25"
        >
          <ArrowUp className="size-[18px]" />
        </button>
      </form>
    </section>
  );
}

function Composer({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  // A textarea keeps the rows it was given, so the height is measured back off
  // the content on every change.
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={field}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      rows={1}
      maxLength={2000}
      placeholder="Escribí un mensaje"
      aria-label="Mensaje"
      className="bg-secondary ring-edge scrollbar-none max-h-40 min-h-9 flex-1 resize-none rounded-2xl px-3.5 py-2 text-[15px] ring-1 focus-visible:outline-none"
    />
  );
}

function Bubble({ message }: { message: DirectMessageView }) {
  return (
    <div className={cn("flex", message.mine && "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 sm:max-w-[70%]",
          message.mine
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-secondary rounded-bl-md",
        )}
      >
        <p className="text-[15px] leading-snug wrap-anywhere whitespace-pre-wrap">
          {message.body}
        </p>
        <time
          dateTime={message.created_at}
          title={formatMoment(message.created_at)}
          className={cn(
            "mt-0.5 block text-[10px] tabular-nums",
            message.mine ? "text-primary-foreground/60 text-right" : "text-muted-foreground/60",
          )}
        >
          {TIME.format(new Date(message.created_at))}
        </time>
      </div>
    </div>
  );
}

function FirstWord({ name }: { name: string | null }) {
  return (
    <div className="grid h-full place-items-center px-6 py-10 text-center">
      <div>
        <p className="text-muted-foreground text-sm">
          Todavía no hablaste con {name ?? "este coleccionista"}.
        </p>
        <p className="text-muted-foreground/70 mx-auto mt-1.5 max-w-xs text-xs">
          Contale qué carta te interesa y en qué estado la buscás. La conversación se abre
          con el primer mensaje.
        </p>
      </div>
    </div>
  );
}

/** The page in the order it was said, cut where the calendar day changes. */
function byDay(messages: DirectMessageView[]): [string, DirectMessageView[]][] {
  const days = new Map<string, DirectMessageView[]>();
  for (const message of messages) {
    const day = formatDay(message.created_at);
    days.set(day, [...(days.get(day) ?? []), message]);
  }
  return [...days];
}

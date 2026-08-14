"use client";

import { ArrowUp, Maximize2, MessageCircle, Square, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChatAnswer } from "@/components/chat-answer";
import { useChatTurns } from "@/components/chat-turns";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The mini chat lives in the app layout, so its thread survives moving between
 * screens. Only /chat hides it, where the full screen already owns the agent.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const { turns, status, busy, conversationId, send, stop } = useChatTurns();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status, open]);

  if (!session || pathname === "/chat") return null;

  function submit() {
    const question = draft;
    setDraft("");
    send(question);
  }

  return (
    <div className="fixed right-4 bottom-28 z-30 flex flex-col items-end gap-3 lg:right-6 lg:bottom-6">
      {open && (
        <section
          aria-label="Asistente"
          className="bg-background ring-edge flex h-[min(30rem,65svh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl shadow-2xl ring-1"
        >
          <header className="border-edge flex items-center gap-2 border-b px-4 py-3">
            <h2 className="font-display text-sm font-semibold tracking-[-0.02em]">Preguntar</h2>
            <Link
              href={conversationId ? `/chat?c=${conversationId}` : "/chat"}
              onClick={() => setOpen(false)}
              aria-label="Abrir la conversación completa"
              className="text-muted-foreground hover:text-foreground ml-auto transition-colors"
            >
              <Maximize2 className="size-4" />
            </Link>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar el asistente"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ol className="flex min-h-full flex-col justify-end space-y-4">
              {turns.length === 0 ? (
                <li className="text-muted-foreground text-sm">
                  Pregúntame lo que quieras sobre tu colección.
                </li>
              ) : (
                turns.map((turn, index) => (
                  <li key={index}>
                    {turn.role === "user" ? (
                      <p className="bg-secondary ml-auto w-fit max-w-[85%] rounded-2xl px-3 py-2 text-sm">
                        {turn.text}
                      </p>
                    ) : (
                      <ChatAnswer text={turn.text} className="text-sm" />
                    )}
                  </li>
                ))
              )}
              {status && (
                <li className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Spinner className="size-3" />
                  {status}…
                </li>
              )}
              <div ref={bottom} />
            </ol>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="bg-secondary ring-edge m-2 flex items-end gap-2 rounded-3xl p-1.5 ring-1"
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Pregunta lo que quieras"
              aria-label="Mensaje"
              className="max-h-24 min-h-8 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
            <button
              type={busy ? "button" : "submit"}
              onClick={busy ? stop : undefined}
              disabled={!busy && !draft.trim()}
              aria-label={busy ? "Detener" : "Enviar"}
              className={cn(
                "bg-foreground text-background grid size-8 shrink-0 place-items-center rounded-full transition-opacity",
                !busy && !draft.trim() && "opacity-25",
              )}
            >
              {busy ? <Square className="size-3 fill-current" /> : <ArrowUp className="size-4" />}
            </button>
          </form>
        </section>
      )}

      <button
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-label={open ? "Cerrar el asistente" : "Abrir el asistente"}
        className="bg-foreground text-background grid size-12 place-items-center rounded-full shadow-lg transition-transform active:scale-90"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>
    </div>
  );
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowUpRight, MessageSquareText, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getConversation } from "@/lib/api/clients/getConversation";
import { useListConversations } from "@/lib/api/hooks/useListConversations";
import { listConversationsQueryKey } from "@/lib/api/hooks/useListConversations";
import { apiClient } from "@/lib/api-client";
import { streamChat } from "@/lib/chat-stream";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

type Turn = { role: "user" | "assistant"; text: string };

const TOOL_LABELS: Record<string, string> = {
  search_cards: "Buscando en el catálogo",
  get_card_details: "Leyendo la ficha de la carta",
  get_collection: "Revisando tu colección",
  collection_stats: "Sacando cuentas",
};

const SUGGESTIONS = [
  "¿Cuántas cartas tengo y de qué tipos?",
  "¿Qué me falta para completar el Base Set?",
  "¿Tengo algún Charizard?",
];

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { data: previous } = useListConversations({ client: { client: apiClient } });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status]);

  async function resume(id: string) {
    const detail = await getConversation(id, { client: apiClient });
    conversationId.current = id;
    setTurns(detail.messages.map(({ role, text }) => ({ role, text })));
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    setDraft("");
    setBusy(true);
    setStatus("Pensando");
    setTurns((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: "" }]);

    const controller = new AbortController();
    abort.current = controller;

    try {
      for await (const event of streamChat(question, conversationId.current, controller.signal)) {
        switch (event.type) {
          case "conversation":
            conversationId.current = event.id;
            queryClient.invalidateQueries({ queryKey: listConversationsQueryKey() });
            break;
          case "tool":
            setStatus(TOOL_LABELS[event.name] ?? "Consultando");
            break;
          case "delta":
            setStatus(null);
            setTurns((prev) => appendToLast(prev, event.text));
            break;
          case "error":
            setStatus(null);
            setTurns((prev) => replaceLast(prev, event.detail));
            break;
        }
      }
    } catch {
      // An aborted stream is the user's own doing, not a failure to report.
      if (!controller.signal.aborted) {
        setTurns((prev) => replaceLast(prev, "Se perdió la conexión con el asistente."));
      }
    } finally {
      setStatus(null);
      setBusy(false);
      abort.current = null;
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-[calc(100svh-11rem)] flex-col">
      <h1 className="font-display mb-4 text-3xl font-extrabold tracking-tight">Preguntar</h1>

      {empty ? (
        <div className="flex flex-1 flex-col justify-center pb-6">
          <p className="text-muted-foreground mb-6 max-w-sm text-sm leading-relaxed">
            Pregunta sobre tu colección en tus propias palabras. Lee tus cartas
            reales, no el catálogo completo.
          </p>
          <ul className="flex flex-col gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  onClick={() => send(suggestion)}
                  className="ring-edge bg-surface hover:bg-accent group flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm ring-1 transition-colors"
                >
                  <span className="flex-1">{suggestion}</span>
                  <ArrowUpRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
                </button>
              </li>
            ))}
          </ul>

          {previous && previous.length > 0 && (
            <section className="mt-8">
              <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                Conversaciones anteriores
              </h2>
              <ul className="divide-edge divide-y">
                {previous.slice(0, 5).map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      onClick={() => resume(conversation.id)}
                      className="hover:text-foreground text-muted-foreground flex w-full items-center gap-2.5 py-2.5 text-left text-sm transition-colors"
                    >
                      <MessageSquareText className="size-4 shrink-0" />
                      <span className="truncate">{conversation.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <ol className="flex-1 space-y-5 pb-4">
          {turns.map((turn, index) => (
            <li key={index}>
              {turn.role === "user" ? (
                <p className="bg-surface ring-edge ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm ring-1">
                  {turn.text}
                </p>
              ) : (
                <p className="max-w-[95%] text-[15px] leading-[1.65] whitespace-pre-wrap">
                  {turn.text}
                </p>
              )}
            </li>
          ))}
          {status && (
            <li className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner className="size-3.5" />
              {status}…
            </li>
          )}
          <div ref={bottom} />
        </ol>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        className="glass sticky bottom-24 mt-auto flex items-end gap-2 rounded-3xl p-1.5 md:bottom-4"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          placeholder="¿Qué quieres saber de tu colección?"
          aria-label="Mensaje"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-sm focus-visible:outline-none"
        />
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? () => abort.current?.abort() : undefined}
          disabled={!busy && !draft.trim()}
          aria-label={busy ? "Detener" : "Enviar"}
          className={cn(
            "bg-foreground text-background grid size-11 shrink-0 place-items-center rounded-full transition-opacity",
            !busy && !draft.trim() && "opacity-30",
          )}
        >
          {busy ? <Square className="size-4 fill-current" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
    </div>
  );
}

function appendToLast(turns: Turn[], text: string): Turn[] {
  const last = turns.at(-1);
  if (!last) return turns;
  return [...turns.slice(0, -1), { ...last, text: last.text + text }];
}

function replaceLast(turns: Turn[], text: string): Turn[] {
  const last = turns.at(-1);
  if (!last) return turns;
  return [...turns.slice(0, -1), { ...last, text }];
}

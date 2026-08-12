"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  History,
  Layers,
  PieChart,
  SearchCheck,
  SquarePen,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AccountMenu } from "@/components/account-menu";
import { getConversation } from "@/lib/api/clients/getConversation";
import {
  listConversationsQueryKey,
  useListConversations,
} from "@/lib/api/hooks/useListConversations";
import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { streamChat } from "@/lib/chat-stream";
import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
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
  { icon: PieChart, text: "¿Cuántas cartas tengo y de qué tipos?" },
  { icon: SearchCheck, text: "¿Qué me falta para completar el Base Set?" },
  { icon: Layers, text: "¿Cuál es la carta más valiosa que tengo?" },
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
  const { data: session } = authClient.useSession();
  const { data: previous } = useListConversations({ client: { client: apiClient } });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status]);

  async function resume(id: string) {
    const detail = await getConversation(id, { client: apiClient });
    conversationId.current = id;
    setTurns(detail.messages.map(({ role, text }) => ({ role, text })));
  }

  function reset() {
    abort.current?.abort();
    conversationId.current = null;
    setTurns([]);
    setDraft("");
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
    <div className="flex min-h-[calc(100svh-9rem)] flex-col md:min-h-[calc(100svh-8rem)]">
      <header className="mb-6 flex items-center gap-2">
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Conversaciones">
                <History />
              </Button>
            }
          />
          <SheetContent side="left" className="w-80">
            <SheetHeader>
              <SheetTitle>Conversaciones</SheetTitle>
            </SheetHeader>
            <ul className="overflow-y-auto px-2">
              {previous?.length ? (
                previous.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      onClick={() => resume(conversation.id)}
                      className="hover:bg-accent w-full truncate rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
                    >
                      {conversation.title}
                    </button>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground px-3 py-2 text-sm">
                  Todavía no has preguntado nada.
                </li>
              )}
            </ul>
          </SheetContent>
        </Sheet>

        <h1 className="font-display text-[17px] font-semibold tracking-[-0.02em]">Preguntar</h1>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={reset} aria-label="Nueva conversación">
            <SquarePen />
          </Button>
          <AccountMenu email={session?.user.email} />
        </div>
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col justify-end pb-4">
          <h2 className="font-display mb-6 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            ¿Qué quieres saber
            <br />
            <span className="text-muted-foreground">de tu colección?</span>
          </h2>
          <ul className="divide-edge divide-y">
            {SUGGESTIONS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <button
                  onClick={() => send(text)}
                  className="hover:text-foreground text-muted-foreground flex w-full items-center gap-3.5 py-3.5 text-left text-[15px] transition-colors"
                >
                  <Icon className="size-[18px] shrink-0" />
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="flex-1 space-y-6 pb-4">
          {turns.map((turn, index) => (
            <li key={index}>
              {turn.role === "user" ? (
                <p className="bg-secondary ml-auto w-fit max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px]">
                  {turn.text}
                </p>
              ) : (
                <p className="text-[15px] leading-[1.7] whitespace-pre-wrap">{turn.text}</p>
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
        className="bg-secondary ring-edge sticky bottom-20 mt-auto flex items-end gap-2 rounded-[1.75rem] p-2 ring-1 md:bottom-4"
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
          placeholder="Pregunta lo que quieras"
          aria-label="Mensaje"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] focus-visible:outline-none"
        />
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? () => abort.current?.abort() : undefined}
          disabled={!busy && !draft.trim()}
          aria-label={busy ? "Detener" : "Enviar"}
          className={cn(
            "bg-foreground text-background grid size-9 shrink-0 place-items-center rounded-full transition-opacity",
            !busy && !draft.trim() && "opacity-25",
          )}
        >
          {busy ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-[18px]" />}
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

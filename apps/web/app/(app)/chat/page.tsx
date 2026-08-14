"use client";

import {
  ArrowUp,
  History,
  Layers,
  PieChart,
  SearchCheck,
  SquarePen,
  Square,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { AccountMenu } from "@/components/account-menu";
import { ChatAnswer } from "@/components/chat-answer";
import { useChatTurns } from "@/components/chat-turns";
import { useListConversations } from "@/lib/api/hooks/useListConversations";
import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
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

const SUGGESTIONS = [
  { icon: PieChart, text: "¿Cuántas cartas tengo y de qué tipos?" },
  { icon: SearchCheck, text: "¿Qué me falta para completar el Base Set?" },
  { icon: Layers, text: "¿Cuál es la carta más valiosa que tengo?" },
];

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const { data: session } = authClient.useSession();
  const { data: previous } = useListConversations({ client: { client: apiClient } });
  const { turns, status, busy, send, stop, reset, resume } = useChatTurns();

  const requested = useSearchParams().get("c");

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status]);

  useEffect(() => {
    if (requested) resume(requested);
  }, [requested, resume]);

  function submit(text: string) {
    setDraft("");
    send(text);
  }

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100svh-9rem)] max-w-3xl flex-col lg:min-h-[calc(100svh-6rem)]">
      <header className="mb-6 flex items-center gap-2">
        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Conversaciones"
                className="lg:hidden"
              >
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              reset();
              setDraft("");
            }}
            aria-label="Nueva conversación"
            className="lg:hidden"
          >
            <SquarePen />
          </Button>
          <AccountMenu email={session?.user.email} />
        </div>
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col justify-center pb-8">
          <h2 className="font-display mb-6 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            ¿Qué quieres saber
            <br />
            <span className="text-muted-foreground">de tu colección?</span>
          </h2>
          <ul className="divide-edge divide-y">
            {SUGGESTIONS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <button
                  onClick={() => submit(text)}
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
                <ChatAnswer text={turn.text} className="text-[15px] [&_code]:text-[13px]" />
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
          submit(draft);
        }}
        className="bg-secondary ring-edge sticky bottom-20 mt-auto flex items-end gap-2 rounded-[1.75rem] p-2 ring-1 md:bottom-4"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          rows={1}
          placeholder="Pregunta lo que quieras"
          aria-label="Mensaje"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] focus-visible:outline-none"
        />
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? stop : undefined}
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

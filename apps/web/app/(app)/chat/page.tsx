"use client";

import { History, Layers, PieChart, SearchCheck, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AccountMenu } from "@/components/account-menu";
import { ChatAnswer } from "@/components/chat-answer";
import { ChatComposer } from "@/components/chat-composer";
import { ChatHistory } from "@/components/chat-history";
import { useChatTurns } from "@/components/chat-turns";
import { authClient } from "@/lib/auth-client";
import { useUrlState } from "@/lib/url-state";
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
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const { data: session } = authClient.useSession();
  const { turns, status, busy, conversationId, send, stop, reset, resume } = useChatTurns();

  // The open conversation is the one in the address bar, so the rail, the sheet
  // and a shared link all pick a thread the same way.
  const [params, setParam] = useUrlState();
  const requested = params.get("c");

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

  function open(id: string) {
    setParam({ c: id });
    setPanel(false);
  }

  function start() {
    setParam({ c: undefined });
    setDraft("");
    setPanel(false);
    reset();
  }

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-[calc(100svh-9rem)] flex-col lg:h-full lg:min-h-0 lg:flex-row lg:gap-8">
      {/* The rail waits for xl: the app already spends a sidebar on navigation,
          and a third column before that leaves the answers too narrow to read. */}
      <aside
        aria-label="Conversaciones"
        className="border-edge hidden w-64 shrink-0 border-r pr-4 xl:flex xl:flex-col"
      >
        <ChatHistory
          activeId={conversationId}
          onSelect={open}
          onNew={start}
          className="min-h-0 flex-1"
        />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="mb-4 flex items-center gap-2 xl:hidden">
          <Sheet open={panel} onOpenChange={setPanel}>
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
              <ChatHistory
                activeId={conversationId}
                onSelect={open}
                onNew={start}
                className="min-h-0 flex-1 px-4 pb-4"
              />
            </SheetContent>
          </Sheet>

          <h1 className="font-display text-[17px] font-semibold tracking-[-0.02em] lg:hidden">
            Preguntar
          </h1>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={start} aria-label="Nueva conversación">
              <SquarePen />
            </Button>
            <span className="lg:hidden">
              <AccountMenu email={session?.user.email} compact />
            </span>
          </div>
        </header>

        <div
          className={cn(
            "scrollbar-none flex-1 lg:min-h-0 lg:overflow-y-auto",
            empty && "flex flex-col justify-center",
          )}
        >
          {empty ? (
            <div className="mx-auto w-full max-w-[70ch] pb-8 lg:max-w-3xl">
              <h2 className="font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] lg:text-[34px]">
                ¿Qué quieres saber
                <br />
                <span className="text-muted-foreground">de tu colección?</span>
              </h2>
              <ul className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SUGGESTIONS.map(({ icon: Icon, text }) => (
                  <li key={text}>
                    <button
                      onClick={() => submit(text)}
                      className="slab text-muted-foreground hover:text-foreground flex h-full w-full flex-col gap-2.5 rounded-2xl p-4 text-left text-[15px] transition-[color,transform] hover:-translate-y-px"
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="mx-auto w-full max-w-[70ch] space-y-6 pb-4">
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
        </div>

        {/* Below lg the page is what scrolls, and its padding already clears the
            navigation bar, so the composer sticks to the edge of that padding. */}
        <div className="sticky bottom-0 mt-auto lg:static lg:pt-4">
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => submit(draft)}
            onStop={stop}
            busy={busy}
            className="mx-auto w-full max-w-[70ch]"
          />
        </div>
      </div>
    </div>
  );
}

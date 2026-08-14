"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { getConversation } from "@/lib/api/clients/getConversation";
import { listConversationsQueryKey } from "@/lib/api/hooks/useListConversations";
import { apiClient } from "@/lib/api-client";
import { streamChat } from "@/lib/chat-stream";

export type Turn = { role: "user" | "assistant"; text: string };

const TOOL_LABELS: Record<string, string> = {
  search_cards: "Buscando en el catálogo",
  get_card_details: "Leyendo la ficha de la carta",
  get_collection: "Revisando tu colección",
  collection_stats: "Sacando cuentas",
};

/**
 * One conversation, streamed. Shared by the chat screen and the floating
 * widget so both talk to the agent the same way.
 */
export function useChatTurns() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setConversationId(null);
    setTurns([]);
  }, []);

  const resume = useCallback(async (id: string) => {
    const detail = await getConversation(id, { client: apiClient });
    setConversationId(id);
    setTurns(detail.messages.map(({ role, text }) => ({ role, text })));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      setBusy(true);
      setStatus("Pensando");
      setTurns((prev) => [
        ...prev,
        { role: "user", text: question },
        { role: "assistant", text: "" },
      ]);

      const controller = new AbortController();
      abort.current = controller;

      try {
        for await (const event of streamChat(question, conversationId, controller.signal)) {
          switch (event.type) {
            case "conversation":
              setConversationId(event.id);
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
    },
    [busy, conversationId, queryClient],
  );

  return { turns, status, busy, conversationId, send, stop, reset, resume };
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

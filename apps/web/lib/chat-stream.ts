"use client";

import { getAccessToken } from "@/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export type ChatEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "delta"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; conversationId: string }
  | { type: "error"; detail: string };

type ServerEvent = { event: string; data: Record<string, unknown> };

/**
 * EventSource cannot POST or set an Authorization header, so the SSE frames are
 * parsed off the fetch body instead of using the browser's built-in client.
 */
export async function* streamChat(
  message: string,
  conversationId: string | null,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}/api/v1/chat`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });

  if (!response.ok || !response.body) {
    const detail =
      response.status === 503
        ? "El chat todavía no tiene un modelo configurado."
        : "No se pudo contactar al asistente.";
    yield { type: "error", detail };
    return;
  }

  for await (const frame of readFrames(response.body, signal)) {
    switch (frame.event) {
      case "conversation":
        yield {
          type: "conversation",
          id: String(frame.data.id),
          title: String(frame.data.title),
        };
        break;
      case "delta":
        yield { type: "delta", text: String(frame.data.text) };
        break;
      case "tool":
        yield { type: "tool", name: String(frame.data.name) };
        break;
      case "done":
        yield { type: "done", conversationId: String(frame.data.conversation_id) };
        break;
      case "error":
        yield { type: "error", detail: String(frame.data.detail) };
        break;
    }
  }
}

async function* readFrames(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  // `stream: true` keeps a multi-byte character split across two chunks intact.
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Anything after the last blank line is a partial frame still arriving.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

function parseFrame(frame: string): ServerEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

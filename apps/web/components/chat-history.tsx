"use client";

import { SquarePen } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useListConversations } from "@/lib/api/hooks/useListConversations";
import { Button } from "@workspace/ui/components/button";

/**
 * Reads the conversation list and hands a selection back through the URL, so
 * the panel does not need to know what the chat screen holds in state.
 */
export function ChatHistory() {
  const { data, isPending } = useListConversations({ client: { client: apiClient } });

  if (isPending) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="bg-muted h-8 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-4 w-full justify-start"
        onClick={() => {
          window.location.href = "/chat";
        }}
      >
        <SquarePen />
        Nueva conversación
      </Button>

      {data?.length ? (
        <ul className="space-y-0.5">
          {data.map((conversation) => (
            <li key={conversation.id}>
              <a
                href={`/chat?c=${conversation.id}`}
                className="text-muted-foreground hover:bg-accent/50 hover:text-foreground block truncate rounded-lg px-2 py-1.5 text-sm transition-colors"
              >
                {conversation.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-2 text-sm">
          Todavía no has preguntado nada.
        </p>
      )}
    </div>
  );
}

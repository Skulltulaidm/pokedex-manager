"use client";

import { SquarePen } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useListConversations } from "@/lib/api/hooks/useListConversations";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The list of past conversations, without an opinion on where it sits: the rail
 * on a wide screen and the sheet on a narrow one render the same panel.
 */
export function ChatHistory({
  activeId,
  onSelect,
  onNew,
  className,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
}) {
  const { data, isPending } = useListConversations({ client: { client: apiClient } });

  return (
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <Button variant="outline" size="lg" className="w-full justify-start" onClick={onNew}>
        <SquarePen />
        Nueva conversación
      </Button>

      <div className="scrollbar-none -mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {isPending ? (
          <ul className="space-y-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="bg-muted h-8 rounded-lg" />
            ))}
          </ul>
        ) : data?.length ? (
          <ul className="space-y-0.5">
            {data.map((conversation) => (
              <li key={conversation.id}>
                <button
                  onClick={() => onSelect(conversation.id)}
                  aria-current={conversation.id === activeId ? "true" : undefined}
                  className={cn(
                    "hover:bg-accent/50 hover:text-foreground text-muted-foreground block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    conversation.id === activeId && "bg-accent text-accent-foreground",
                  )}
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-2.5 text-sm">Todavía no has preguntado nada.</p>
        )}
      </div>
    </div>
  );
}

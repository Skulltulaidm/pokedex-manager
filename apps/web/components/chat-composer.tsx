"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@workspace/ui/lib/utils";

/**
 * The field the question is written in, shared by the chat screen and the
 * floating widget so both send, stop and grow the same way.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  compact,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  compact?: boolean;
  className?: string;
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={cn(
        "bg-secondary ring-edge flex items-end gap-2 rounded-3xl ring-1",
        compact ? "p-1.5" : "p-2",
        className,
      )}
    >
      <textarea
        ref={field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder="Pregunta lo que quieras"
        aria-label="Mensaje"
        className={cn(
          "scrollbar-none flex-1 resize-none bg-transparent focus-visible:outline-none",
          compact
            ? "max-h-24 min-h-8 px-2.5 py-1.5 text-sm"
            : "max-h-48 min-h-9 px-3 py-2 text-[15px]",
        )}
      />
      <button
        type={busy ? "button" : "submit"}
        onClick={busy ? onStop : undefined}
        disabled={!busy && !value.trim()}
        aria-label={busy ? "Detener" : "Enviar"}
        className={cn(
          "bg-foreground text-background grid shrink-0 place-items-center rounded-full transition-opacity",
          compact ? "size-8" : "size-9",
          !busy && !value.trim() && "opacity-25",
        )}
      >
        {busy ? (
          <Square className={cn("fill-current", compact ? "size-3" : "size-3.5")} />
        ) : (
          <ArrowUp className={compact ? "size-4" : "size-[18px]"} />
        )}
      </button>
    </form>
  );
}

"use client";

import Markdown, { defaultUrlTransform } from "react-markdown";

import { CardChip } from "@/components/card-chip";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The model answers in markdown, so it is rendered as markdown.
 *
 * react-markdown ignores raw HTML unless a plugin turns it on, which is what
 * keeps model output from reaching the DOM as markup.
 */
export function ChatAnswer({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "leading-[1.7] [&_code]:font-mono [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
    >
      <Markdown components={{ a: CardLink }} urlTransform={keepCardScheme}>
        {text}
      </Markdown>
    </div>
  );
}

/**
 * react-markdown strips schemes it does not know, which is what stops a model
 * from emitting `javascript:`. The app's own `card:` was caught by the same
 * net; it is let through by name and everything else keeps the default guard.
 */
function keepCardScheme(url: string): string {
  return url.startsWith("card:") ? url : defaultUrlTransform(url);
}

/**
 * `card:` links become the card; everything else stays a link.
 *
 * The scheme is the app's own, so a model that writes a real URL cannot be
 * mistaken for one naming a card, and a half-streamed link stays plain text
 * until its id is complete.
 */
function CardLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (href?.startsWith("card:")) {
    return <CardChip cardId={href.slice(5)} fallback={String(children ?? "")} />;
  }

  return (
    <a href={href} className="underline underline-offset-2">
      {children}
    </a>
  );
}

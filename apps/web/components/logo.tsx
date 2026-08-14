import { cn } from "@workspace/ui/lib/utils";

/**
 * A pocket dex: the device body, its lens drawn as a ball, and the screen.
 *
 * The same drawing ships as the tab icon in app/icon.svg, with the tokens
 * resolved to hex there — keep the two in step.
 */
export function PokedexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="presentation" className={cn("shrink-0", className)}>
      <rect x="3" y="3" width="26" height="26" rx="7" className="fill-primary" />
      <circle cx="12" cy="12" r="6" className="fill-primary-foreground" />
      <path d="M6 12h3.4M14.6 12h3.4" className="stroke-primary" strokeWidth="1.8" />
      <circle
        cx="12"
        cy="12"
        r="2.4"
        className="fill-primary-foreground stroke-primary"
        strokeWidth="1.4"
      />
      <rect
        x="6.5"
        y="20.5"
        width="19"
        height="5.5"
        rx="2.2"
        className="fill-primary-foreground"
      />
    </svg>
  );
}

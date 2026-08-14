import type { SVGProps } from "react";

/**
 * The nav set, drawn to sit next to lucide without a seam: same 24 box, same
 * 2px stroke, same round joins. Each one carries the ball the app is about.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** A card with a ball printed on it. */
export function CatalogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M8.4 12h7.2" />
    </Icon>
  );
}

/** A ball framed by the corners of a viewfinder. */
export function ScanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M8.8 12h6.4" />
    </Icon>
  );
}

/** A ball going round: what changes hands in a trade. */
export function TradeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3" />
      <path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M9.4 12h5.2" />
    </Icon>
  );
}

/** The six-sided stat chart, with a reading plotted on it. */
export function StatsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m12 2.5 8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="m12 7 5 2.8v3.4l-4.4 2.6-4.1-2.3.2-3.9z" />
    </Icon>
  );
}

/** A ball inside a speech bubble. */
export function AskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 4h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5l-4.5 4v-4H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3" />
      <circle cx="12" cy="9.5" r="2.6" />
      <path d="M9.4 9.5h5.2" />
    </Icon>
  );
}

/** A trainer, cap and all. */
export function TrainerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8.6 9.6a3.5 3.5 0 0 1 6.8 0" />
      <path d="M6.5 9.6h10" />
      <path d="M9 11.4a3.4 3.4 0 0 0 6 0" />
      <path d="M4.5 20.5v-1a4.5 4.5 0 0 1 4.5-4.5h6a4.5 4.5 0 0 1 4.5 4.5v1" />
    </Icon>
  );
}

/** The open-the-assistant mark: a ball, at a glance. */
export function PokeballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h5.5M15.5 12H21" />
      <circle cx="12" cy="12" r="3.5" />
    </Icon>
  );
}

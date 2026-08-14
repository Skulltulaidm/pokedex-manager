"use client";

import Avvvatars from "avvvatars-react";

/**
 * A collector's mark, drawn from who they are rather than spelled out.
 *
 * The shape style rather than the letters: two initials in a grey circle say
 * nothing you cannot already read next to them, while a shape is recognisable
 * at a glance in a list of strangers. The same value always draws the same
 * avatar, so a counterparty looks the same everywhere in the app.
 */
export function UserAvatar({
  value,
  size = 32,
}: {
  value: string | null | undefined;
  size?: number;
}) {
  return (
    <span className="shrink-0 leading-none" aria-hidden>
      <Avvvatars value={value ?? "?"} style="shape" size={size} />
    </span>
  );
}

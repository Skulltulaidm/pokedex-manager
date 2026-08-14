import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@workspace/ui/components/button";

/**
 * The way into a conversation, wherever a counterparty is named.
 *
 * A trade is where talking starts, so this sits next to the trade rather than
 * only on a screen of its own: on a profile, on an offer, on a listing.
 */
export function MessageLink({
  partnerId,
  variant = "outline",
  size = "sm",
}: {
  partnerId: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
}) {
  return (
    <Link
      href={`/messages/${partnerId}`}
      className={buttonVariants({ variant, size })}
    >
      <MessageCircle />
      Mensaje
    </Link>
  );
}

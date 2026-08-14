"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { useAddToWishlist } from "@/lib/api/hooks/useAddToWishlist";
import { useListWishlist } from "@/lib/api/hooks/useListWishlist";
import { useRemoveFromWishlist } from "@/lib/api/hooks/useRemoveFromWishlist";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Puts a card on the want list, or takes it off, without leaving the grid.
 *
 * A card already held is not something to want, so the button hides there —
 * unless it is still on the list, which is the only place left to take it off.
 */
export function WishButton({
  cardId,
  cardName,
  held,
  className,
}: {
  cardId: string;
  cardName: string;
  held: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { data: wishlist } = useListWishlist({ client: { client: apiClient } });
  const entry = wishlist?.find((item) => item.card.id === cardId);

  const invalidate = () => void queryClient.invalidateQueries();

  const add = useAddToWishlist({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success(`${cardName} anotada en tus deseos`);
      },
      onError: () => toast.error("No se pudo anotar. Intenta de nuevo."),
    },
  });

  const remove = useRemoveFromWishlist({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success(`${cardName} fuera de tus deseos`);
      },
      onError: () => toast.error("No se pudo quitar. Intenta de nuevo."),
    },
  });

  const wished = Boolean(entry);
  if (held && !wished) return null;

  return (
    <button
      type="button"
      aria-pressed={wished}
      aria-label={
        wished ? `Quitar ${cardName} de tus deseos` : `Agregar ${cardName} a tus deseos`
      }
      disabled={add.isPending || remove.isPending}
      onClick={(event) => {
        // The tile is one big link, so the tap has to stop at the button.
        event.preventDefault();
        event.stopPropagation();
        if (entry) remove.mutate({ item_id: entry.id });
        else add.mutate({ data: { card_id: cardId } });
      }}
      className={cn(
        "glass grid size-7 place-items-center rounded-full transition-[color,transform] hover:scale-110 active:scale-95 disabled:opacity-50",
        wished ? "text-primary" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart className={cn("size-3.5", wished && "fill-current")} />
    </button>
  );
}

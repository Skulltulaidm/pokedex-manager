import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import { listWishlistQueryOptions } from "@/lib/api/hooks/useListWishlist";
import type { WishlistItemView } from "@/lib/api/types/WishlistItemView";
import { API, server } from "@/test/server";
import { createQueryClient, withQueryClient } from "@/test/query";
import { WishButton } from "./wish-button";

const CARD_ID = "base1-4";
const ENTRY_ID = "8b0c0f4e-0000-4000-8000-000000000001";

function wishlistEntry(cardId: string): WishlistItemView {
  return {
    id: ENTRY_ID,
    card: {
      id: cardId,
      name: "Charizard",
      category: "Pokemon",
      number: "4",
      rarity: "Rare Holo",
      variants: {},
      hp: 120,
      image_small_url: null,
      image_large_url: null,
      price_usd: "420.00",
      card_set: {
        id: "base1",
        name: "Base Set",
        series: "Base",
        printed_total: 102,
        release_date: "1999-01-09",
        logo_url: null,
      },
      species: null,
    },
    priority: 1,
    reason: null,
    added_by: "user",
    created_at: "2026-01-01T00:00:00Z",
  };
}

/** The list is prefetched so the button's first paint is the settled one. */
async function renderWish({
  held,
  wishlist,
}: {
  held: boolean;
  wishlist: WishlistItemView[];
}) {
  server.use(http.get(`${API}/api/v1/wishlist`, () => HttpResponse.json(wishlist)));

  const client = createQueryClient();
  await client.fetchQuery(listWishlistQueryOptions({ client: apiClient }));

  const onCardClick = vi.fn();
  const view = render(
    // The tile the button sits on is one big link.
    <a href="/carta" onClick={onCardClick}>
      <WishButton cardId={CARD_ID} cardName="Charizard" held={held} />
    </a>,
    { wrapper: withQueryClient(client) },
  );

  return { ...view, onCardClick };
}

describe("WishButton visibility", () => {
  it("offers a card that is neither held nor wanted", async () => {
    await renderWish({ held: false, wishlist: [] });

    expect(screen.getByLabelText("Agregar Charizard a tus deseos")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("stays out of the way on a card already held", async () => {
    const { container } = await renderWish({ held: true, wishlist: [] });

    expect(container.querySelector("button")).toBeNull();
  });

  it("stays on a held card that is still on the want list, the last place to remove it", async () => {
    await renderWish({ held: true, wishlist: [wishlistEntry(CARD_ID)] });

    expect(screen.getByLabelText("Quitar Charizard de tus deseos")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not read another card's entry as this card's", async () => {
    const { container } = await renderWish({
      held: true,
      wishlist: [wishlistEntry("base1-15")],
    });

    expect(container.querySelector("button")).toBeNull();
  });
});

describe("WishButton actions", () => {
  it("adds the card the tile is for", async () => {
    const added = vi.fn();
    server.use(
      http.post(`${API}/api/v1/wishlist`, async ({ request }) => {
        added(await request.json());
        return HttpResponse.json(wishlistEntry(CARD_ID), { status: 201 });
      }),
    );
    await renderWish({ held: false, wishlist: [] });

    await userEvent.click(screen.getByLabelText("Agregar Charizard a tus deseos"));

    await waitFor(() => expect(added).toHaveBeenCalledWith({ card_id: CARD_ID }));
  });

  it("removes by the entry's id, not the card's", async () => {
    const removed = vi.fn();
    server.use(
      http.delete(`${API}/api/v1/wishlist/:itemId`, ({ params }) => {
        removed(params.itemId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderWish({ held: false, wishlist: [wishlistEntry(CARD_ID)] });

    await userEvent.click(screen.getByLabelText("Quitar Charizard de tus deseos"));

    await waitFor(() => expect(removed).toHaveBeenCalledWith(ENTRY_ID));
  });

  it("stops the tap from opening the card behind it", async () => {
    server.use(
      http.post(`${API}/api/v1/wishlist`, () =>
        HttpResponse.json(wishlistEntry(CARD_ID), { status: 201 }),
      ),
    );
    const { onCardClick } = await renderWish({ held: false, wishlist: [] });

    await userEvent.click(screen.getByLabelText("Agregar Charizard a tus deseos"));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("cannot be pressed twice while the first press is in flight", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => (resolve = r));
    const added = vi.fn();
    server.use(
      http.post(`${API}/api/v1/wishlist`, async () => {
        added();
        await pending;
        return HttpResponse.json(wishlistEntry(CARD_ID), { status: 201 });
      }),
    );
    await renderWish({ held: false, wishlist: [] });
    const button = screen.getByLabelText("Agregar Charizard a tus deseos");

    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    resolve();
    await waitFor(() => expect(added).toHaveBeenCalledTimes(1));
  });
});

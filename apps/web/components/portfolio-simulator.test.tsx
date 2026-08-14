import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { CardView } from "@/lib/api/types/CardView";
import type { PortfolioConcentration } from "@/lib/api/types/PortfolioConcentration";
import type { TradeSimulation } from "@/lib/api/types/TradeSimulation";
import { createQueryClient, withQueryClient } from "@/test/query";
import { API, server } from "@/test/server";
import { PortfolioSimulator } from "./portfolio-simulator";

const CARD: CardView = {
  id: "base1-4",
  name: "Charizard",
  category: "Pokemon",
  number: "4",
  rarity: "Rare Holo",
  variants: {},
  hp: 120,
  image_small_url: "https://assets.tcgdex.net/en/base/base1/4/low.png",
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
};

function shape(
  total: string,
  topShare: number,
  overrides: Partial<PortfolioConcentration> = {},
): PortfolioConcentration {
  return {
    total_value: total,
    priced_positions: 8,
    unpriced_positions: 2,
    cards_for_half: 3,
    buckets: [{ cards: 1, value: "396.36", share: topShare }],
    ...overrides,
  };
}

/** Puts one card on the "Entregas" side, which is all it takes to price a swap. */
async function pickACard(simulation: TradeSimulation) {
  server.use(
    http.get(`${API}/api/v1/catalog/market`, () =>
      HttpResponse.json({ items: [{ card: CARD, owned: 2 }], total: 1, limit: 6, offset: 0 }),
    ),
    http.post(`${API}/api/v1/catalog/market/simulate`, () => HttpResponse.json(simulation)),
  );

  render(<PortfolioSimulator />, { wrapper: withQueryClient(createQueryClient()) });

  await userEvent.type(screen.getByLabelText("Buscar carta para entregas"), "char");
  await userEvent.click(await screen.findByRole("button", { name: /Charizard/ }));
}

function tile(label: string) {
  const heading = screen.getByText(label);
  return within(heading.parentElement as HTMLElement);
}

describe("PortfolioSimulator verdict", () => {
  it("says who comes out ahead and what it does to the shape", async () => {
    await pickACard({
      before: shape("1000.00", 39.636),
      after: shape("1012.00", 24.12, { priced_positions: 9, cards_for_half: 4 }),
      give_value: "100.00",
      receive_value: "112.00",
      value_delta: "12.00",
      unpriced_cards: [],
    });

    expect(await screen.findByText("+$12.00")).toBeVisible();
    expect(
      screen.getByText(
        /Recibes \$12\.00 más de lo que entregas y tu cartera queda menos concentrada/,
      ),
    ).toBeVisible();
  });

  it("calls a swap parejo when the difference is under a dollar", async () => {
    await pickACard({
      before: shape("1000.00", 39.6),
      after: shape("1000.50", 39.6),
      give_value: "100.00",
      receive_value: "100.50",
      value_delta: "0.50",
      unpriced_cards: [],
    });

    expect(await screen.findByText("≈$0.50")).toBeVisible();
    expect(
      screen.getByText(/Es un trueque parejo en dinero y tu cartera queda igual de concentrada/),
    ).toBeVisible();
  });

  it("warns when the swap piles more value onto one card", async () => {
    await pickACard({
      before: shape("1000.00", 24.12),
      after: shape("900.00", 39.636),
      give_value: "120.00",
      receive_value: "20.00",
      value_delta: "-100.00",
      unpriced_cards: [],
    });

    expect(await screen.findByText("−$100.00")).toBeVisible();
    expect(
      screen.getByText(
        /Entregas \$100\.00 más de lo que recibes y tu cartera queda más concentrada/,
      ),
    ).toBeVisible();
  });
});

describe("PortfolioSimulator figures", () => {
  it("renders the top-card share as the percentage the API already sent", async () => {
    await pickACard({
      before: shape("1000.00", 39.636),
      after: shape("1012.00", 24.12),
      give_value: "100.00",
      receive_value: "112.00",
      value_delta: "12.00",
      unpriced_cards: [],
    });

    await screen.findByText("+$12.00");
    const share = tile("En la carta más cara");

    expect(share.getByText("39.6%")).toBeVisible();
    expect(share.getByText("24.1%")).toBeVisible();
    expect(screen.queryByText("3963.6%")).toBeNull();
  });

  it("reads a smaller top-card share as the improvement it is", async () => {
    await pickACard({
      before: shape("1000.00", 39.636),
      after: shape("1012.00", 24.12, { priced_positions: 9, cards_for_half: 4 }),
      give_value: "100.00",
      receive_value: "112.00",
      value_delta: "12.00",
      unpriced_cards: [],
    });

    await screen.findByText("+$12.00");

    // Every other figure is better when it grows; this one is better when it shrinks.
    expect(tile("En la carta más cara").getByText("24.1%")).toHaveClass("text-emerald-600");
    expect(tile("Valor de la cartera").getByText("$1,012")).toHaveClass("text-emerald-600");
    expect(tile("Cartas distintas").getByText("11")).toHaveClass("text-emerald-600");
    expect(tile("Mitad del valor en").getByText("4 cartas")).toHaveClass("text-emerald-600");
  });

  it("shows a dash where there is no concentration to report", async () => {
    await pickACard({
      before: shape("0", 0, { buckets: [], cards_for_half: null }),
      after: shape("0", 0, { buckets: [], cards_for_half: null }),
      give_value: "0",
      receive_value: "0",
      value_delta: "0",
      unpriced_cards: [],
    });

    await screen.findByText("≈$0.00");

    expect(tile("En la carta más cara").getAllByText("—")).toHaveLength(2);
    expect(tile("Mitad del valor en").getAllByText("—")).toHaveLength(2);
  });

  it("counts the cards it could not price, in the right number", async () => {
    await pickACard({
      before: shape("1000.00", 39.6),
      after: shape("1000.00", 39.6),
      give_value: "100.00",
      receive_value: "100.00",
      value_delta: "0",
      unpriced_cards: ["Charizard"],
    });

    expect(
      await screen.findByText(/carta del intercambio no tiene precio de mercado/),
    ).toBeVisible();
    expect(screen.queryByText(/cartas del intercambio no tienen precio/)).toBeNull();
  });
});

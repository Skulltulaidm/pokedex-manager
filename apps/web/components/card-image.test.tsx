import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CARD_RATIO, CardImage } from "./card-image";

const SRC = "https://assets.tcgdex.net/en/base/base1/4/high.png";

/**
 * The art window as it should land, measured off the frame rather than derived
 * from the component: 63x88mm card, a window 84% of its width and 35% of its
 * height, scaled up so the window fills the box it is cropped into.
 */
const WINDOW_RATIO = 1.7182;
const SCALED_WIDTH = 119.0476;
const SCALED_LEFT = -9.5238;
const TOP = { Pokemon: -35.7143, Trainer: -64.2857, Energy: -85.7143 };

function renderArt(category?: string) {
  const { container } = render(
    <CardImage src={SRC} alt="Charizard" sizes="96px" art category={category} />,
  );
  return {
    frame: container.firstElementChild as HTMLElement,
    image: within(container).getByAltText("Charizard"),
  };
}

describe("CardImage art window", () => {
  it("crops to a landscape window, whatever the card's own shape is", () => {
    const { frame } = renderArt();

    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(WINDOW_RATIO, 3);
    expect(frame.className).not.toContain(CARD_RATIO);
  });

  it("scales the scan up and centres it so the window has no gutters", () => {
    const { image } = renderArt();

    expect(parseFloat(image.style.width)).toBeCloseTo(SCALED_WIDTH, 3);
    expect(parseFloat(image.style.left)).toBeCloseTo(SCALED_LEFT, 3);
    expect(image.style.height).toBe("auto");
  });

  it.each([
    ["Pokemon", TOP.Pokemon],
    ["Trainer", TOP.Trainer],
    ["Energy", TOP.Energy],
  ])("lifts a %s scan to its own art window", (category, expected) => {
    const { image } = renderArt(category);

    expect(parseFloat(image.style.top)).toBeCloseTo(expected, 3);
  });

  it("converts the offset from the frame's height into the maths' own units", () => {
    // A Trainer's window sits 10 points of card height below a Pokemon's, which
    // is 10% of 88mm expressed against the 84%-wide window: not 10%.
    const pokemon = parseFloat(renderArt("Pokemon").image.style.top);
    const trainer = parseFloat(renderArt("Trainer").image.style.top);

    expect(pokemon - trainer).toBeCloseTo(28.5714, 3);
  });

  it("falls back to the Pokemon window for a category it has never seen", () => {
    const { image } = renderArt("Stadium");

    expect(parseFloat(image.style.top)).toBeCloseTo(TOP.Pokemon, 3);
  });
});

describe("CardImage full face", () => {
  it("keeps the printed 63x88 ratio and covers the frame", () => {
    const { container } = render(<CardImage src={SRC} alt="Charizard" sizes="96px" />);
    const frame = container.firstElementChild as HTMLElement;

    expect(frame.className).toContain(CARD_RATIO);
    expect(frame.style.aspectRatio).toBe("");
    expect(screen.getByAltText("Charizard")).toHaveClass("object-cover");
  });

  it("greys a locked scan out rather than hiding it", () => {
    render(<CardImage src={SRC} alt="Charizard" sizes="96px" locked />);

    expect(screen.getByAltText("Charizard")).toHaveClass("grayscale");
  });

  it("shows the name when there is no scan to show", () => {
    render(<CardImage src={null} alt="Charizard" sizes="96px" />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Charizard")).toBeVisible();
  });
});

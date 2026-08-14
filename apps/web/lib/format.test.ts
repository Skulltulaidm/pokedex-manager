import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatAgo,
  formatDay,
  formatMoment,
  formatShare,
  formatUsd,
  plural,
} from "./format";

afterEach(() => vi.useRealTimers());

/** Freezes the clock at a local moment, so day maths does not depend on the runner's zone. */
function freeze(year: number, month: number, day: number, hour = 9) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(year, month, day, hour, 0, 0));
}

function localIso(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month, day, hour, 0, 0).toISOString();
}

describe("plural", () => {
  it("uses the singular only for exactly one", () => {
    expect(plural(1, "coleccionista", "coleccionistas")).toBe("1 coleccionista");
    expect(plural(2, "coleccionista", "coleccionistas")).toBe("2 coleccionistas");
  });

  it("counts zero as many", () => {
    expect(plural(0, "carta", "cartas")).toBe("0 cartas");
  });

  it("does not treat minus one as one", () => {
    expect(plural(-1, "carta", "cartas")).toBe("-1 cartas");
  });
});

describe("formatUsd", () => {
  it("reads the amount as a dollar figure, not a Spanish one", () => {
    expect(formatUsd(2777)).toBe("$2,777.00");
    expect(formatUsd(2777)).not.toContain("US$");
  });

  it("accepts the decimal strings the API sends", () => {
    expect(formatUsd("1234.567")).toBe("$1,234.57");
    expect(formatUsd("0")).toBe("$0.00");
  });

  it("rounds to whole dollars when asked", () => {
    expect(formatUsd(1234.567, true)).toBe("$1,235");
    expect(formatUsd(1234.567)).toBe("$1,234.57");
  });

  it("keeps the sign in front of the symbol", () => {
    expect(formatUsd(-12.5)).toBe("-$12.50");
  });
});

describe("formatShare", () => {
  it("renders a fraction of the whole as a percentage with one decimal", () => {
    expect(formatShare(1, 4)).toBe("25.0%");
    expect(formatShare(1, 3)).toBe("33.3%");
  });

  it("refuses to divide by an empty whole", () => {
    expect(formatShare(1, 0)).toBe("—");
    expect(formatShare(0, -3)).toBe("—");
  });
});

describe("formatAgo", () => {
  it("collapses the first minute to a word", () => {
    freeze(2026, 0, 15);
    expect(formatAgo(new Date(Date.now() - 30_000).toISOString())).toBe("ahora");
  });

  it("steps through minutes, hours and days", () => {
    freeze(2026, 0, 15);
    expect(formatAgo(new Date(Date.now() - 60_000).toISOString())).toBe("1 min");
    expect(formatAgo(new Date(Date.now() - 3_599_000).toISOString())).toBe("59 min");
    expect(formatAgo(new Date(Date.now() - 3_600_000).toISOString())).toBe("1 h");
    expect(formatAgo(new Date(Date.now() - 86_400_000).toISOString())).toBe("1 d");
    expect(formatAgo(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe("3 d");
  });

  it("does not count backwards when a row is stamped in the future", () => {
    freeze(2026, 0, 15);
    expect(formatAgo(new Date(Date.now() + 60_000).toISOString())).toBe("ahora");
  });
});

describe("formatDay", () => {
  it("names today and yesterday instead of dating them", () => {
    freeze(2026, 0, 15);
    expect(formatDay(localIso(2026, 0, 15, 1))).toBe("Hoy");
    expect(formatDay(localIso(2026, 0, 14, 23))).toBe("Ayer");
  });

  it("counts by calendar day, not by elapsed hours", () => {
    freeze(2026, 0, 15, 0);
    // Ninety minutes earlier, but the day before.
    expect(formatDay(localIso(2026, 0, 14, 22))).toBe("Ayer");
  });

  it("capitalises the weekday a heading starts with", () => {
    freeze(2026, 0, 15);
    const heading = formatDay(localIso(2026, 0, 10));
    expect(heading).toMatch(/^Sábado/);
    expect(heading).toContain("enero");
  });
});

describe("formatMoment", () => {
  it("spells the date out in Spanish", () => {
    expect(formatMoment(localIso(2026, 0, 15))).toContain("15 de enero de 2026");
  });
});

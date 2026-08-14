#!/usr/bin/env python3
"""Check every colour pair the manual actually renders against WCAG AA.

The palette comes from the app (packages/ui/src/styles/globals.css) and several
of its tokens fail as type: the pokedex red is 3.6:1 on the dark cover and the
mid green is 3.5:1 on the striped table body. Run this after touching
estilo/pokedex.sty or any diagram source; it exits non-zero on a failure.
"""

import sys

AA_NORMAL = 4.5
AA_LARGE = 3.0


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_colour: str) -> float:
    h = hex_colour.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def ratio(fg: str, bg: str) -> float:
    a, b = luminance(fg), luminance(bg)
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


def mix(percent: int, fg: str, bg: str) -> str:
    """xcolor's `fg!percent!bg`."""
    f, b = fg.lstrip("#"), bg.lstrip("#")
    parts = (
        round(int(f[i : i + 2], 16) * percent / 100 + int(b[i : i + 2], 16) * (100 - percent) / 100)
        for i in (0, 2, 4)
    )
    return "#" + "".join(f"{p:02X}" for p in parts)


RED = "#DB0016"
RED_LIGHT = "#FF6B6B"
RED_DEEP = "#BA0000"
INK = "#0E0D0D"
GRAPHITE = "#2C2E33"
NIGHT = "#0F121F"
MUTED = "#5C5A5B"
RAISED = "#F1F0F0"
STRING = "#146018"
WATER = "#0063B4"
GRASS = "#186B22"
ELECTRIC = "#8A6300"
PSYCHIC = "#A82A69"
DRAGON = "#4038B8"
WHITE = "#FFFFFF"

PAIRS = [
    ("cover / eyebrow", RED_LIGHT, NIGHT, AA_NORMAL),
    ("cover / separator", mix(55, WHITE, NIGHT), NIGHT, AA_NORMAL),
    ("cover / classification", mix(72, WHITE, NIGHT), NIGHT, AA_NORMAL),
    ("cover / title 40pt", WHITE, NIGHT, AA_LARGE),
    ("cover / subtitle", mix(70, WHITE, NIGHT), NIGHT, AA_NORMAL),
    ("cover / stack", mix(62, WHITE, NIGHT), NIGHT, AA_NORMAL),
    ("cover / metadata labels", mix(62, WHITE, NIGHT), NIGHT, AA_NORMAL),
    ("cover / metadata values", WHITE, NIGHT, AA_NORMAL),
    ("cover / footer", mix(58, WHITE, NIGHT), NIGHT, AA_NORMAL),
    ("body text", INK, WHITE, AA_NORMAL),
    ("running header and footer", MUTED, WHITE, AA_NORMAL),
    ("chapter number 54pt", RED, WHITE, AA_LARGE),
    ("section number", RED, WHITE, AA_NORMAL),
    ("figure label", RED, WHITE, AA_NORMAL),
    ("caption text", MUTED, WHITE, AA_NORMAL),
    ("table header", WHITE, GRAPHITE, AA_NORMAL),
    ("table body, striped row", INK, RAISED, AA_NORMAL),
    ("pkcode on striped row", RED_DEEP, RAISED, AA_NORMAL),
    ("pkpath on striped row", GRAPHITE, RAISED, AA_NORMAL),
    ("callout body", INK, RAISED, AA_NORMAL),
    ("callout title", GRAPHITE, RAISED, AA_NORMAL),
    ("listing keyword", RED_DEEP, RAISED, AA_NORMAL),
    ("listing comment", MUTED, RAISED, AA_NORMAL),
    ("listing string", STRING, RAISED, AA_NORMAL),
    ("listing wrap arrow", RED_DEEP, RAISED, AA_NORMAL),
    ("figure fill / water", WHITE, WATER, AA_NORMAL),
    ("figure fill / grass", WHITE, GRASS, AA_NORMAL),
    ("figure fill / electric", WHITE, ELECTRIC, AA_NORMAL),
    ("figure fill / psychic", WHITE, PSYCHIC, AA_NORMAL),
    ("figure fill / dragon", WHITE, DRAGON, AA_NORMAL),
    ("figure fill / red", WHITE, RED, AA_NORMAL),
    ("figure label / grass", GRASS, WHITE, AA_NORMAL),
    ("figure label / water", WATER, WHITE, AA_NORMAL),
]


def main() -> int:
    failures = 0
    for label, fg, bg, required in PAIRS:
        got = ratio(fg, bg)
        passed = got >= required
        failures += 0 if passed else 1
        print(f"{'pass' if passed else 'FAIL'}  {got:5.2f} / {required}  {label}")
    print(f"\n{len(PAIRS)} pairs, {failures} failing")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

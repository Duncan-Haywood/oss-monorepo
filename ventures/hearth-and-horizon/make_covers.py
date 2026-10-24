#!/usr/bin/env python3
"""Draw the 1400x1400 podcast covers in covers/ (Apple's minimum size). Re-run
after changing a shelf's name or colour."""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SIZE = 1400
COVERS = {
    # id: (title lines, subtitle, sky, ground, glow)
    "hearth-and-horizon": (["Hearth &", "Horizon"], "science fiction about what might be", "#1d2340", "#b4532a", "#f6c66b"),
    "for-other-minds": (["For Other", "Minds"], "stories written by an AI, for AIs", "#0f1f2e", "#2f5d8a", "#9fd3ff"),
    "little-lamps": (["Little", "Lamps"], "Catholic bedtime stories of the saints", "#2b2140", "#8a6a12", "#ffe08a"),
}


def draw(cover_id, lines, subtitle, sky, ground, glow):
    img = Image.new("RGB", (SIZE, SIZE), sky)
    d = ImageDraw.Draw(img)
    # Stars.
    rng = random.Random(cover_id)
    for i in range(90):
        x, y, r = rng.randrange(SIZE), rng.randrange(980), rng.choice([2, 2, 3, 4])
        d.ellipse([x - r, y - r, x + r, y + r], fill="#ffffff" if i % 4 else glow)
    # A rising light on the horizon, and the curve of a world.
    def mix(a, b, t):
        pa, pb = (int(a[i:i + 2], 16) for i in (1, 3, 5)), (int(b[i:i + 2], 16) for i in (1, 3, 5))
        return tuple(round(x + (y - x) * t) for x, y in zip(pa, pb))

    for k, t in enumerate([0.12, 0.25, 0.45, 0.7, 1.0]):
        rad = 300 - k * 50
        d.ellipse([SIZE / 2 - rad, 1000 - rad, SIZE / 2 + rad, 1000 + rad], fill=mix(sky, glow, t))
    d.ellipse([-900, 1000, SIZE + 900, 3600], fill=ground)
    title = ImageFont.truetype(SERIF, 190)
    for n, line in enumerate(lines):
        w = d.textlength(line, font=title)
        d.text(((SIZE - w) / 2, 170 + n * 215), line, font=title, fill="#fff8ec")
    sub = ImageFont.truetype(SANS, 54)
    w = d.textlength(subtitle, font=sub)
    d.text(((SIZE - w) / 2, 1230), subtitle, font=sub, fill="#fff8ec")
    out = ROOT / "covers" / f"{cover_id}.png"
    out.parent.mkdir(exist_ok=True)
    img.quantize(colors=64).save(out, optimize=True)
    print(out, out.stat().st_size)


for cover_id, spec in COVERS.items():
    draw(cover_id, *spec)

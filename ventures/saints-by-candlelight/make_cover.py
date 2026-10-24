#!/usr/bin/env python3
"""Draw the podcast cover (cover.png, 1400x1400, the Apple Podcasts minimum).

    python3 make_cover.py        # needs Pillow and a serif font (FreeSerif or DejaVu Serif)

A night-blue field with stars, a lit candle with a soft halo, and the title.
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SIZE = 1400
FONTS = ("/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")
ITALIC = ("/usr/share/fonts/truetype/freefont/FreeSerifItalic.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")


def font(paths, size):
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def main() -> None:
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    for y in range(SIZE):  # vertical gradient, deep blue to near-black
        t = y / SIZE
        row = (int(22 - 12 * t), int(34 - 20 * t), int(68 - 40 * t))
        for x in range(SIZE):
            px[x, y] = row
    draw = ImageDraw.Draw(img)
    rng = random.Random(7)
    for _ in range(140):
        x, y, r = rng.randrange(SIZE), rng.randrange(int(SIZE * 0.55)), rng.choice((1, 1, 2, 2, 3))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(240, 228, 200))

    cx, base = SIZE // 2, 1010
    halo = Image.new("RGB", (SIZE, SIZE))
    hd = ImageDraw.Draw(halo)
    for r in range(330, 0, -6):
        k = (1 - r / 330) ** 2
        hd.ellipse((cx - r, base - 330 - r, cx + r, base - 330 + r), fill=(int(255 * k), int(170 * k), int(60 * k)))
    glow = np.asarray(halo.filter(ImageFilter.GaussianBlur(40)), dtype="float32") * 0.75
    img = Image.fromarray(np.clip(np.asarray(img, dtype="float32") + glow, 0, 255).astype("uint8"))
    draw = ImageDraw.Draw(img)

    # candle body, wick and flame
    draw.rounded_rectangle((cx - 70, base - 230, cx + 70, base + 120), radius=14, fill=(244, 234, 214))
    draw.rectangle((cx - 70, base - 230, cx - 40, base + 120), fill=(225, 212, 188))
    draw.line((cx, base - 230, cx, base - 262), fill=(40, 30, 20), width=6)
    flame = [(cx + 46 * math.sin(a) * (1 - a / math.pi) ** 0.3, base - 262 - 150 * (1 - math.cos(a)) / 2) for a in [i * math.pi / 60 for i in range(61)]]
    flame += [(2 * cx - x, y) for x, y in reversed(flame)]
    draw.polygon(flame, fill=(255, 196, 92))
    inner = [(cx + (x - cx) * 0.5, base - 262 - (base - 262 - y) * 0.6) for x, y in flame]
    draw.polygon(inner, fill=(255, 245, 210))
    draw.rounded_rectangle((cx - 190, base + 110, cx + 190, base + 150), radius=18, fill=(150, 112, 52))

    gold = (243, 201, 122)
    title = font(FONTS, 150)
    for text, y in (("Saints", 120), ("by Candlelight", 280)):
        w = draw.textlength(text, font=title)
        draw.text(((SIZE - w) / 2, y), text, font=title, fill=gold)
    sub = font(ITALIC, 58)
    for text, y in (("Bedtime stories of saints,", 1215), ("angels and patriarchs", 1285)):
        w = draw.textlength(text, font=sub)
        draw.text(((SIZE - w) / 2, y), text, font=sub, fill=(236, 226, 205))
    img.save(ROOT / "cover.png", optimize=True)
    print("wrote cover.png")


if __name__ == "__main__":
    main()

"""Check the frame analyser on real photographs degraded by known amounts.

The analyser's thresholds were set on synthetic patches. This takes real
photographs (any JPEGs you pass, or the OpenCV sample photos, Apache-2.0,
fetched from raw.githubusercontent.com and never stored in the repository),
applies a known blur, grain, tilt or exposure error, and prints whether each
measured score moves the right way and by how much. It tests monotonic
response and recovery of the injected value, not agreement with a human.

    PYTHONPATH=src python3 tools/real_photo_calibration.py [photo.jpg ...]
"""

from __future__ import annotations

import random
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

from shootflow.ffmpeg_media import find_ffmpeg_tools
from shootflow.frame_analysis import analyze_media

SAMPLES = [
    "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/building.jpg",
    "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/butterfly.jpg",
]
BLUR = [0.0, 1.0, 2.0, 4.0, 8.0]
GRAIN = [0, 4, 8, 16, 32]
TILT = [0.0, 1.0, 2.0, 4.0, 8.0]
EXPOSURE = [0.3, 0.6, 1.0, 1.6, 2.5]


def _save(img: Image.Image, path: Path) -> Path:
    img.convert("RGB").save(path, quality=95)
    return path


def _grain(img: Image.Image, sigma: float, rng: random.Random) -> Image.Image:
    gray = img.convert("RGB")
    px = gray.load()
    w, h = gray.size
    for y in range(h):
        for x in range(w):
            n = rng.gauss(0, sigma)
            r, g, b = px[x, y]
            px[x, y] = (
                max(0, min(255, int(r + n))),
                max(0, min(255, int(g + n))),
                max(0, min(255, int(b + n))),
            )
    return gray


def _tilt(img: Image.Image, degrees: float) -> Image.Image:
    # Rotate, then crop the empty corners so only real picture edges remain.
    rotated = img.rotate(-degrees, resample=Image.BICUBIC, expand=False)
    w, h = img.size
    cx, cy = int(w * 0.12), int(h * 0.12)
    return rotated.crop((cx, cy, w - cx, h - cy))


def run(photos: list[Path]) -> list[str]:
    tools = find_ffmpeg_tools()
    if tools is None:
        raise SystemExit("ffmpeg not found")
    rng = random.Random(7)
    lines: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp)
        for photo in photos:
            base = Image.open(photo).convert("RGB")
            if max(base.size) > 900:
                base.thumbnail((900, 900))
            lines.append(f"## {photo.name} ({base.size[0]}x{base.size[1]})")
            lines.append("| test | level | sharpness | noise_sigma | exposure | tilt_deg | story |")
            lines.append("|---|---|---|---|---|---|---|")

            def row(name: str, level: float, img: Image.Image) -> None:
                m = analyze_media(tools, _save(img, scratch / "t.jpg"), media_type="photo")
                lines.append(
                    f"| {name} | {level} | {m.sharpness:.3f} | {m.noise_sigma:.2f} | "
                    f"{m.exposure:.3f} | {m.tilt_degrees:+.2f} | {m.story_score:.3f} |"
                )

            for s in BLUR:
                row("blur_px", s, base.filter(ImageFilter.GaussianBlur(s)) if s else base)
            for s in GRAIN:
                row("grain_sigma", s, _grain(base, s, rng) if s else base)
            for d in TILT:
                row("tilt_deg", d, _tilt(base, d))
            for f in EXPOSURE:
                row("brightness_x", f, ImageEnhance.Brightness(base).enhance(f))
            lines.append("")
    return lines


def main(argv: list[str]) -> int:
    photos = [Path(a) for a in argv]
    if not photos:
        cache = Path(tempfile.mkdtemp(prefix="shootflow-samples-"))
        for url in SAMPLES:
            dest = cache / url.rsplit("/", 1)[1]
            with urllib.request.urlopen(url, timeout=30) as r:  # noqa: S310
                dest.write_bytes(r.read())
            photos.append(dest)
    print("\n".join(run(photos)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

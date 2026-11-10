"""Does tilt confidence track tilt accuracy? Rotates OpenCV sample photos (Apache-2.0,
fetched, not stored) by known angles and bins readings by confidence.

    PYTHONPATH=src python3 tools/tilt_confidence_check.py

Needs Pillow and ffmpeg and takes about 10 minutes (pure-Python tilt, ~1 min a
photo): start it in the background. In the cloud container the default
``python3`` has a Pillow that fails with ``cannot import name '_imaging'``;
``/usr/bin/python3`` imports it fine. Re-run 2026-11-09 reproduced the recorded
bands (n=60, 62% within 1 degree; 45%, 64%, 85% by confidence band).
"""

import statistics
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

from shootflow.ffmpeg_media import find_ffmpeg_tools
from shootflow.frame_analysis import analyze_media as _analyze

NAMES = ["building", "butterfly", "board", "left01", "messi5", "fruits", "lena", "home", "sudoku", "aero1", "stuff"]
BASE = "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/"
ANGLES = [-6, -3, -1.5, 0, 1.5, 3, 6]
BANDS = [(0, 0.05), (0.05, 0.15), (0.15, 0.4), (0.4, 1.01)]


def main() -> None:
    tools = find_ffmpeg_tools()
    rows: list[tuple[str, float, float, float]] = []
    scratch = Path(tempfile.mkdtemp())
    for name in NAMES:
        try:
            raw = urllib.request.urlopen(BASE + name + ".jpg", timeout=20).read()
        except OSError as error:
            print("skip", name, error)
            continue
        path = scratch / (name + ".jpg")
        path.write_bytes(raw)
        image = Image.open(path).convert("RGB")
        readings: dict[float, tuple[float, float]] = {}
        for angle in ANGLES:
            rotated = image.rotate(angle, expand=False, resample=Image.BICUBIC)
            width, height = rotated.size
            margin = int(abs(angle) * 0.03 * max(width, height)) + 4
            rotated = rotated.crop((margin, margin, width - margin, height - margin))
            out = scratch / f"{name}_{angle}.jpg"
            rotated.save(out, quality=95)
            metrics = _analyze(tools, out, media_type="photo")
            readings[angle] = (metrics.tilt_degrees, metrics.tilt_confidence)
        level = readings[0][0]
        for angle in ANGLES:
            if angle == 0:
                continue
            # PIL rotate positive = counter-clockwise; sign unknown, take the better of both
            change = readings[angle][0] - level
            rows.append((name, angle, min(abs(change - angle), abs(change + angle)), readings[angle][1]))
        print(name, f"conf0={readings[0][1]:.2f}")
    print()
    for low, high in BANDS:
        band = [row for row in rows if low <= row[3] < high]
        if band:
            within = sum(row[2] <= 1 for row in band) / len(band)
            median = statistics.median(row[2] for row in band)
            print(f"conf {low}-{high}: n={len(band)} within1={within:.0%} median_err={median:.2f}")
    within_all = 100 * sum(row[2] <= 1 for row in rows) / len(rows)
    print(f"all: n={len(rows)} within1={within_all:.0f}% med={statistics.median(row[2] for row in rows):.2f}")


if __name__ == "__main__":
    main()

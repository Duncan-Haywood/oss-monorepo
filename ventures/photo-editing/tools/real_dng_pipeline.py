"""Run the local pipeline on a card holding one real-sensor DNG and compare its master with LibRaw.

Usage (from ``ventures/photo-editing``, numpy in a scratch venv; the DNG and LibRaw's PNG come
from ``tools/libraw_differential.py CAMERA_FILE --keep DIR``)::

    PYTHONPATH=src VENV/bin/python tools/real_dng_pipeline.py DIR/x.dng DIR/x.libraw.png WORKDIR

Results: ``eval/pipeline-dng-grade-2026-11-10.md``.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.local_pipeline import run_local_pipeline


def _probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,pix_fmt", "-of", "json", str(path)],
        capture_output=True,
        check=True,
        text=True,
    ).stdout
    return json.loads(out)["streams"][0]


def _rgb48(path: Path, width: int, height: int) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb48le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, "<u2").reshape(height, width, 3).astype(np.float64)


def main(argv: list[str]) -> int:
    dng, libraw_png, base = Path(argv[0]), Path(argv[1]), Path(argv[2])
    card = base / "card" / "DCIM"
    card.mkdir(parents=True)
    (card / "ISS_0001.DNG").write_bytes(dng.read_bytes())
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=1",
         "-pix_fmt", "yuv420p", str(card / "A001.MP4")],
        check=True,
    )
    plan = plan_import(base / "card", base / "ssd", shoot_date="2026-11-10", shoot_slug="real-dng")
    manifest = execute_copy_plan(plan).manifest_path
    now = [datetime(2026, 11, 10, tzinfo=timezone.utc)]

    def clock() -> datetime:
        now[0] += timedelta(seconds=1)
        return now[0]

    start = time.time()
    result = run_local_pipeline(manifest, max_concurrency=2, clock=clock)
    elapsed = time.time() - start
    ws = manifest.parent
    master = next((ws / "graded").glob("*/ISS_0001.DNG.tif"))
    info = _probe(master)
    ref = _probe(libraw_png)
    ours = _rgb48(master, info["width"], info["height"])
    theirs = _rgb48(libraw_png, ref["width"], ref["height"])
    diff = np.abs(ours - theirs)[4:-4, 4:-4] / 257.0
    analyses = [json.loads(p.read_text()) for p in (ws / "analysis").glob("0*.json")]
    dng_analysis = next(a for a in analyses if a["source_asset_path"].endswith(".DNG"))
    report = {
        "rendered": result.rendered,
        "needs_review": list(result.needs_review_ids),
        "pipeline_seconds": round(elapsed, 1),
        "master": info,
        "proxy": _probe(next((ws / "proxies").glob("*/ISS_0001.DNG.jpg"))),
        "analysis_method": dng_analysis["analysis_method"],
        "vs_libraw_8bit_steps": {
            "mean_rgb": [round(float(x), 3) for x in diff.reshape(-1, 3).mean(0)],
            "p99": round(float(np.percentile(diff, 99)), 3),
            "max": round(float(diff.max()), 3),
            "pixels_over_1_step": int((diff.max(axis=2) > 1).sum()),
        },
        "deliverables": sorted(str(p.relative_to(ws)) for p in (ws / "deliverables").rglob("*") if p.is_file()),
    }
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

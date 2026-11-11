"""Time the grade stage with SHOOTFLOW_GRADE_SCOPE=all vs selected.

Builds a synthetic card of 1080p30 clips (several takes of each of a few
static test-pattern scenes, so takes of one scene share a perceptual hash the
way repeated takes do) plus a few photos, ingests it twice and runs the
unattended pipeline on each copy, timing every stage. Needs ffmpeg/ffprobe.

    PYTHONPATH=src python3 eval/grade_scope_bench.py [--takes 3] [--seconds 10]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from shootflow import local_pipeline
from shootflow.ingest import execute_copy_plan, plan_import

SCENES = ("smptebars", "rgbtestsrc", "smptehdbars", "pal100bars")


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args], check=True)


def build_card(card: Path, *, takes: int, seconds: int) -> None:
    card.mkdir(parents=True)
    index = 1
    for scene in SCENES:
        for take in range(takes):
            duration = seconds + take  # takes of one shot differ in length, not in picture
            _ffmpeg(
                "-f", "lavfi", "-i", f"{scene}=size=1920x1080:rate=30:duration={duration}",
                "-f", "lavfi", "-i", f"sine=duration={duration}",
                "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", str(card / f"C{index:04d}.MOV"),
            )
            index += 1
    for number, color in enumerate(("red", "teal", "orange"), start=1):
        _ffmpeg("-f", "lavfi", "-i", f"color=c={color}:size=6000x4000", "-frames:v", "1",
                str(card / f"IMG_{number:04d}.JPG"))


def run(base: Path, slug: str, scope: str) -> dict[str, object]:
    plan = plan_import(base / "card", base / slug, shoot_date="2026-11-11", shoot_slug=slug)
    manifest = execute_copy_plan(plan).manifest_path
    timings: dict[str, float] = {}
    original = local_pipeline.run_dry_run_production_scheduler

    def timed(*args, **kwargs):
        started = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            timings[kwargs["worker_adapter"]] = round(time.perf_counter() - started, 2)

    local_pipeline.run_dry_run_production_scheduler = timed
    try:
        started = time.perf_counter()
        result = local_pipeline.run_local_pipeline(manifest, max_concurrency=2, grade_scope=scope)
        total = round(time.perf_counter() - started, 2)
    finally:
        local_pipeline.run_dry_run_production_scheduler = original
    workspace = manifest.parent
    graded = sorted((workspace / "graded").glob("*/*.MOV"))
    notes = sorted((workspace / "graded").glob("*/*.review-grade.json"))
    return {
        "scope": scope,
        "rendered": result.rendered,
        "needs_review": list(result.needs_review_ids),
        "grade_seconds": timings.get("ffmpeg-grade-production-local"),
        "total_seconds": total,
        "clips": len(graded),
        "clips_review_graded": len(notes),
        "graded_mov_bytes": sum(path.stat().st_size for path in graded),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--takes", type=int, default=3)
    parser.add_argument("--seconds", type=int, default=10)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        build_card(base / "card" / "DCIM", takes=args.takes, seconds=args.seconds)
        rows = [run(base, "bench-all", "all"), run(base, "bench-selected", "selected")]
    json.dump(rows, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

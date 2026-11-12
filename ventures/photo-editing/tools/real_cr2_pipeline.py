"""Run the local pipeline on a card holding one real Canon CR2, its profile picked from a folder.

The workspace's ``color/camera-profiles/`` gets two profiles: one for the CR2's camera written
from LibRaw's matrix (``rgb_xyz_matrix`` through rawpy at run time, never committed), and a
decoy tagged for another body with a different matrix, so the run shows the grade stage picks
by camera. The graded master is then compared with ``shootflow develop --dcp`` on the same file
and the same profile (expected bit-identical: grading with no LUT adds no loss).

Usage (from ``ventures/photo-editing``, rawpy and numpy in a scratch venv)::

    PYTHONPATH=src:tests VENV/bin/python tools/real_cr2_pipeline.py FILE.CR2 WORKDIR

Results: ``eval/cr2-pipeline-grade-2026-11-12.md``.
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from shootflow.camera_profiles import CAMERA_PROFILES_DIR, camera_of
from shootflow.cli import main as shootflow
from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.local_pipeline import run_local_pipeline


def _profile(matrix, camera: str, name: str) -> bytes:
    from test_dng_profile_tables import make_dcp

    return make_dcp(
        [
            (50708, 2, tuple(camera.encode("latin-1")) + (0,)),
            (50721, 10, tuple(float(v) for v in matrix)),
            (50778, 3, (21,)),
            (50936, 2, tuple(name.encode("latin-1")) + (0,)),
        ]
    )


def _probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,pix_fmt", "-of", "json", str(path)],
        capture_output=True,
        check=True,
        text=True,
    ).stdout
    return json.loads(out)["streams"][0]


def _rgb48(path: Path) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb48le", "-"],
        capture_output=True,
        check=True,
    ).stdout


def main(argv: list[str]) -> int:
    import rawpy

    cr2, base = Path(argv[0]), Path(argv[1])
    camera = camera_of(cr2)
    with rawpy.imread(str(cr2)) as raw:
        matrix = raw.rgb_xyz_matrix[:3].ravel()
    card = base / "card" / "DCIM"
    card.mkdir(parents=True)
    (card / "IMG_0001.CR2").write_bytes(cr2.read_bytes())
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=1",
         "-pix_fmt", "yuv420p", str(card / "A001.MP4")],
        check=True,
    )
    plan = plan_import(base / "card", base / "ssd", shoot_date="2026-11-12", shoot_slug="real-cr2")
    manifest = execute_copy_plan(plan).manifest_path
    ws = manifest.parent
    profiles = ws / CAMERA_PROFILES_DIR
    profiles.mkdir(parents=True)
    right = _profile(matrix, camera, "LibRaw matrix (check only)")
    (profiles / "libraw-check.dcp").write_bytes(right)
    (profiles / "decoy.dcp").write_bytes(_profile(np.asarray(matrix) * 0.5, "Canon EOS 7D", "decoy"))
    now = [datetime(2026, 11, 12, tzinfo=timezone.utc)]

    def clock() -> datetime:
        now[0] += timedelta(seconds=1)
        return now[0]

    start = time.time()
    result = run_local_pipeline(manifest, max_concurrency=2, clock=clock)
    elapsed = time.time() - start
    master = next((ws / "graded").glob("*/IMG_0001.CR2.tif"))

    alone = base / "alone.dcp"
    alone.write_bytes(right)
    out = io.StringIO()
    code = shootflow(["develop", str(cr2), "--out", str(base / "dev"), "--dcp", str(alone)], stdout=out, stderr=sys.stderr)
    if code:
        return code
    ours = np.frombuffer(_rgb48(master), "<u2").astype(np.int64)
    direct = np.frombuffer(_rgb48(base / "dev" / (cr2.stem + ".tif")), "<u2").astype(np.int64)
    analyses = [json.loads(p.read_text()) for p in (ws / "analysis").glob("0*.json")]
    still = next(a for a in analyses if a["source_asset_path"].endswith(".CR2"))
    report = {
        "camera": camera,
        "rendered": result.rendered,
        "needs_review": list(result.needs_review_ids),
        "pipeline_seconds": round(elapsed, 1),
        "master": _probe(master),
        "master_bytes": master.stat().st_size,
        "master_vs_develop_max_difference": int(np.abs(ours - direct).max()) if ours.shape == direct.shape else "shape differs",
        "proxy": _probe(next((ws / "proxies").glob("*/IMG_0001.CR2.jpg"))),
        "analysis_method": still["analysis_method"],
        "deliverables": sorted(str(p.relative_to(ws)) for p in (ws / "deliverables").rglob("*") if p.is_file()),
    }
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

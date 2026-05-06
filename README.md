# ShootFlow

ShootFlow is a personal-tool-turned-product for photographers and videographers
who want faster file management, bulk cinematic color grading, and automated
Instagram-ready deliverables without giving up quality control.

The target workflow:

1. Insert an SD card, camera drive, or SSD.
2. Safely ingest RAW, JPEG, log, and video files into an organized shoot archive.
3. Generate intermediate graded photos and clips in bulk.
4. Assemble candidate Instagram reels, carousels, photo sets, and editor handoff
   packages.
5. Let the user approve, adjust, or re-run iterations without destructive file
   operations.

## Current slice

This repository currently contains the first foundation: a tested, non-destructive
Python ingest planner.

```bash
python3 -m pip install -e '.[dev]'
python3 -m pytest
```

The planner:

- discovers common RAW, JPEG, and video formats under a source root
- groups copy destinations by media kind under a shoot folder
- computes SHA-256 checksums for idempotent ingest
- marks already-copied files as verified when checksums match
- reports conflicts when destination files differ
- never schedules deletion

Example:

```python
from pathlib import Path

from shootflow.ingest import build_ingest_plan

plan = build_ingest_plan(
    source_root=Path("/Volumes/CAMERA_CARD"),
    destination_root=Path("/Volumes/MediaArchive"),
    shoot_name="2026-05-06-brooklyn-editorial",
)

for action in plan.copy_actions:
    print(action.source, "->", action.destination)
```

## Product direction

See `docs/product-blueprint.md` for the deeper product architecture and business
viability notes, `docs/decisions/0001-safe-ingest-first.md` for the first design
decision, and `docs/legal/TERMS.md` for draft terms including indemnification.
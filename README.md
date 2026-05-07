# ShootFlow

ShootFlow is an early-stage personal tool and product concept for photographers
and videographers who want faster file management, bulk color grading, and
automatic Instagram-ready deliverables without giving up creative quality.

The current repository contains a Python foundation for:

- safe media ingest from camera cards or shoot folders;
- conservative drive/source/destination ranking;
- deterministic Instagram reel, carousel, and photo-set planning.

The product direction is local-first: macOS handles heavy ingest, proxying,
grading, review, and export work; iPhone can capture/review/publish lightweight
outputs later. The safety stance is conservative: never delete source media,
never overwrite different destination bytes, and keep manifests for every copy.

## Development

Run tests from the repository root:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
python3 -m compileall -q src tests
```

## Core modules

- `shootflow.ingest` copies supported media into dated shoot folders with
  SHA-256 verification and ingest manifests.
- `shootflow.storage` ranks mounted volumes as review-only sources or automatic
  destinations using conservative heuristics.
- `shootflow.deliverables` plans IG reels, carousels, and photo-set exports from
  ranked media assets.

See `docs/` for product strategy, design decisions, legal draft notes, and
continuation guidance for future automation iterations.
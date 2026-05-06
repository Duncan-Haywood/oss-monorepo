# ShootFlow

ShootFlow is an early-stage personal tool and product concept for photographers
and videographers who want high-quality Instagram reels, carousels, and graded
intermediates without spending their lives on file wrangling.

The product direction is:

- ingest SD cards, local folders, SSDs, RAW/JPEG/log/video footage safely;
- never delete source media during ingest;
- copy with checksums, manifests, and conflict detection;
- build highly parallelizable color-grading and deliverable jobs;
- produce cinematic reels, carousels, feed photo sets, and intermediate graded
  masters for human review or editor handoff.

## Current repository state

This repo currently contains the first testable core utilities:

- `shootflow.ingest` plans and executes safe media copies.
- `shootflow.storage` ranks possible source and destination drives
  conservatively.
- `shootflow.deliverables` builds initial Instagram deliverable job plans.
- `shootflow.production` expands a shoot into deterministic proxy, VLM
  analysis, look-development, grading, and Instagram packaging waves.

## Run tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Product docs

- `docs/PRODUCT_STRATEGY.md`
- `docs/DESIGN_DECISIONS.md`
- `docs/TERMS_AND_CONDITIONS_DRAFT.md`
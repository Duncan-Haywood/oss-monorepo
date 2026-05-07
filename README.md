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
- `shootflow.catalog` loads ingest manifests into a photo/video catalog for
  downstream production planning.
- `shootflow.storage` ranks possible source and destination drives
  conservatively.
- `shootflow.deliverables` builds initial Instagram deliverable job plans.
- `shootflow.production` expands a shoot into deterministic proxy, VLM
  analysis, look-development, grading, and Instagram packaging waves.

The intended first workflow is:

1. Plan and execute a safe import from a card, folder, or SSD.
2. Keep the generated `ingest_manifest.json` as the boundary between file
   management and AI/editing work.
3. Load the manifest with `shootflow.catalog`, which rechecks manifest
   location, destination paths, file sizes, and checksums before production.
4. Build production waves from manifest-backed photo/video assets so proxies,
   VLM analysis, color decisions, graded masters, and Instagram packages all
   trace back to verified originals.

## Run tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Product docs

- `docs/PRODUCT_STRATEGY.md`
- `docs/DESIGN_DECISIONS.md`
- `docs/TERMS_AND_CONDITIONS_DRAFT.md`
# PhotoFlow

PhotoFlow is an early-stage personal tool and product concept for photographers
and videographers who want high-quality Instagram deliverables without losing
hours to ingest, organization, culling, color grading, and reel assembly.

The intended product is a Mac + iPhone workflow:

- detect SD cards, camera volumes, local drives, and SSD archives;
- copy media into a safe local archive before any destructive action;
- keep raw, log, JPEG, proxy, XMP, and generated intermediates organized;
- color grade photos and videos in bulk with highly parallel local and cloud
  pipelines;
- use vision-language models to understand a shoot and create reels,
  carousels, selects, captions, and revision candidates automatically;
- leave editable intermediate assets so humans can refine the final output.

## Current repository state

This repository currently contains a tested reference core for safe import
planning plus product/design notes. It is not yet a native app.

```bash
python3 -m unittest discover -s tests
```

The reference core plans import operations only. It does not copy, move, or
delete files. That separation is intentional: media deletion should require a
verified copy, checksum confirmation, user intent, and a recoverable audit log.

## Repository map

- `photoflow/import_planner.py` - dependency-free reference planner for safe
  SD-card/local-drive imports.
- `tests/test_import_planner.py` - safety-contract tests for the planner.
- `docs/PRODUCT_BRIEF.md` - product positioning, audience, jobs-to-be-done, and
  business viability notes.
- `docs/ARCHITECTURE.md` - target Mac/iPhone architecture and high-throughput
  media pipeline.
- `docs/ARCHIVE_AND_WORKFLOW.md` - target archive layout and content-generation
  workflow.
- `docs/MEDIA_SAFETY.md` - best practices for ingest, verification, deletion,
  and auditability.
- `docs/TERMS_AND_CONDITIONS_NOTES.md` - non-lawyer terms notes including
  indemnification language to review with counsel.
- `docs/AGENT_NOTES.md` - continuity notes for future automation runs.
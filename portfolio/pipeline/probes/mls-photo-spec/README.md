# Probe: MLS photo spec preflight

Executable first half of
[`mls-photo-spec-preflight`](../../candidates/mls-photo-spec-preflight.md).
A folder in, a dated record out. No portal account. No upload. No
"MLS-ready" warranty.

```
python3 write_fixtures.py
python3 cli.py fixtures
python3 -m pytest tests
```

## What it decides

| Rule | From | Severity |
|---|---|---|
| `long_edge` | JPEG/PNG header | blocking below 1024px |
| `byte_size` | file length | blocking above 20 MiB |
| `format` | magic bytes | blocking if not jpeg/png |
| `aspect` | width/height | degrading if not a listed crop |
| `branding_filename` | stem tokens (`logo`, `watermark`, …) | blocking |
| `staging_pair` | staged stem without a sibling original | blocking |

## What it does not decide

`visual_watermark`, `burned_in_contact`, and `board_specific` are
`unimplemented`. A clean findings table is not a clean photo. The record
says so twice.

## Accuracy (2026-08-24)

Author-authored fixtures, 6 photos, 4 labelled findings: precision **1.0**,
recall **1.0**. Not held-out. `tests/test_accuracy.py` recomputes
`measure()` and fails if `ACCURACY` in `accuracy.py` drifts.

The silent-pass class on this corpus is empty. That is the class that
would cost a broker a board fine; it is also a property of fixtures
written to trip the six coded rules, not of a real listing.

## Why this probe and not a new venture

The host venture already wrote the desk-research guardrails
(`process/mls-compliance.ts`) and already enhances to a 2048 long-edge
JPEG. This probe is the missing check on the delivery folder, so it
graduates as a product line rather than a directory.

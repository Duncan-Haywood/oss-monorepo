# Probe: POD print-file preflight

Executable first half of
[`pod-print-file-preflight`](../../candidates/pod-print-file-preflight.md).
A folder in, a dated record out. No print-lab account. No upload. No
"print-ready" warranty.

```
python3 write_fixtures.py
python3 cli.py fixtures
python3 -m pytest tests
```

## What it decides

| Rule | From | Severity |
|---|---|---|
| `format` | magic bytes | blocking if not jpeg/png |
| `byte_size` | file length | blocking above 50 MiB |
| `implied_dpi` | pixels ÷ named print size | blocking below 150 DPI |
| `pixel_floor` | short edge when no size token | blocking below 1500px |
| `web_filename` | stem tokens (`web`, `thumbnail`, …) | blocking |
| `named_aspect` | width/height vs named size | degrading if off the crop |

## What it does not decide

`bleed_margin`, `cmyk_icc`, `pdf_fonts`, and `lab_specific` are
`unimplemented`. A clean findings table is not a clean print file. The
record says so twice.

## Accuracy (2026-08-24)

Author-authored fixtures, 6 files, 4 labelled findings: precision **1.0**,
recall **1.0**. Not held-out. `tests/test_accuracy.py` recomputes
`measure()` and fails if `ACCURACY` in `accuracy.py` drifts.

The silent-pass class on this corpus is empty. That is the class that
would waste a paid print run; it is also a property of fixtures written
to trip the six coded rules, not of a real artist upload.

## Why this probe and not a new venture

The host venture already sells the phrase "print-ready master" and already
intends to take artist uploads. This probe is the missing check on that
folder, so it graduates as a product line rather than a directory.

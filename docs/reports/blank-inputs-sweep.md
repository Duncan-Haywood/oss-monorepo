---
kind: note
tagged: auto
---
# Blank and zero inputs sweep (2026-11-07, explore run)

Tool: `node platform/ci/check_blank_inputs.js out.json [limit]` (needs `playwright`; run from the repo root; about 5 minutes for all pages).

Result: 1,333 venture pages, 1,279 with text/number inputs, 0 pages showing new NaN/Infinity/undefined/[object Object] text after blanking or zeroing, 0 uncaught errors. Detector verified against a planted `100/parseFloat(value)` page (flagged on the blank pass).

Not covered: date/time/color inputs, selects, checkboxes, button-triggered calculations. Open next: click each button/submit after blanking, and negative or very large values.

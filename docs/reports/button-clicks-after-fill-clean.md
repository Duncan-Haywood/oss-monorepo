---
kind: note
tagged: auto
---
# Button clicks after filling inputs: clean (2026-11-08)

`platform/ci/check_button_clicks.js` takes a `FILL` environment variable. With `FILL=<v>`, every
visible text/number/range input is set to `<v>` (`blank` means empty) with input and change events
before each button click. The checker then reports any `NaN`, `Infinity`, `undefined` or
`[object Object]` that newly appears in visible text, and any uncaught page error.

Result over 1,333 venture pages, offline in headless Chromium:

| FILL | pages with buttons | clicks | hits |
|---|---|---|---|
| 0 | 1,306 | 5,394 | 0 |
| -1 | 1,307 | 5,404 | 0 |
| blank | 1,307 | 5,404 | 0 |
| 1e308 | 1,307 | 5,403 | 0 |

Limits: at most 25 buttons per page, one click each, no multi-step flows. Still open: Enter-key
submits, `<select>`, radio and checkbox states.

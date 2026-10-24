# Two elements, one id: a sweep of 2,865 calculator pages

**Date:** 2026-10-21. **Track:** explore (free choice). **Method:** I parsed
every `ventures/*/*.html` file (2,865 pages, 5,715 inline scripts) with Node and
Python and looked for faults that no earlier sweep covered. Counts are from
this checkout.

## What I checked, and what was clean

| Check | Result |
|---|---|
| Inline `<script>` and JSON-LD blocks parse | 0 failures |
| `<label for>` points at an existing id | 0 missing |
| `aria-controls`, `aria-labelledby`, `aria-describedby` point at an existing id | 0 missing |
| `getElementById("x")` names an id that exists | 0 missing |
| The same `id` used twice on one page | **4 pages** |

## The four pages

- `installment-sale-tax-calculator`: `<input id="years">` and `<tbody
  id="years">`. The script ran `$("#years").innerHTML = rows`, and
  `querySelector` returns the first match, the input. Setting `innerHTML` on an
  input does nothing and throws nothing, so the year-by-year table never
  filled.
- `sports-official-game-fee-calculator`: `<input id="games">` and `<tbody
  id="games">`. Same fault, same silent result for the per-trip table.
- `league-schedule-generator`: `<input id="rounds">` and `<table
  id="rounds">`. It worked by luck, because the table was reached through the
  descendant selector `#rounds tbody`.
- `rev-rec`: `<button id="run">` and `<section id="run">`. The in-page link
  `#run` scrolled to the button, not the section it names.

I did not load these pages in a browser. The claim that the two tables stayed
empty comes from reading the selector and the DOM order, not from a rendered
screenshot. The existing node tests passed before and after because they check
markup and `calc.mjs`, not the page script.

## What changed

The four ids are renamed (`years-rows`, `games-rows`, `rounds-table`,
`self-host`). `platform/ci/check_duplicate_ids.py` now fails any page that
repeats an id, with unit tests, wired into `portfolio-validate.yml` beside the
control-label check. It reports 0 on the tree.

## Next

A page-script smoke test (load each page in jsdom, press the main button, assert
the result container is non-empty) would catch the wider class this one
belongs to: output written somewhere the reader cannot see.

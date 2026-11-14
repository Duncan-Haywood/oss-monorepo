---
kind: polish
date: 2026-11-14
---
# Polish, 2026-11-14: custom development pages fold long requests

Picked after screenshotting `/custom-development/` at 390 and 1,280 px. It's the page where a
business decides whether to ask for work, and `polish-2026-11-14-byline-and-direction-menu.md`
("Still weakest" item 1) said it hadn't had a visual pass yet. The blog meta row (carried in four
reports) had already landed in #15905. Searched open PRs (`polish in:title`): none touch this page.

## What was wrong

The "Requests so far" table printed each request's whole `ask` and whole `next` from
`portfolio/requests/requests.json`. R-0005 (the clothing design studio) has a 1,158-character ask
and an 8,767-character `next`, a running log of every feature that landed. On a phone that one row
was about 5,000 px of unbroken text, right under the "Describe your problem" call to action. R-0005's
own page set the 1,158-character ask as the hero lede and the log as one paragraph.

## What changed (`platform/pages/build.mjs`)

- List: the ask is clipped to 220 characters and the note to 300 (the `clip` helper from
  `queue.mjs`, which cuts at a word). A "Full status" link to the request's page follows any clipped
  note. The row's `data-text` still holds the full text, so search still finds every word.
- Request page: the lede is the clipped ask, with the whole request in a `<details>`. A note over
  900 characters shows its first ~600 characters of whole sentences under "Where it stands". The
  rest goes in a `<details>` ("The full log (27 more entries, 1342 words)") as a list, one sentence
  per item. `noteSentences` splits at ". " before a capital or digit, and never inside parentheses
  or after e.g./i.e./vs. Short notes render as before. The label "Still open" became "Where it
  stands", because the note mostly describes what is live.
- Three tests in `custom-development-page.test.mjs` (clipped row + search text, fold + entry count,
  sentence splitter, no fold for short requests).

## Measured (Chromium, 844 px tall viewport, page height in px)

| Page | 390 before | 390 after | 1,280 before | 1,280 after |
|---|---|---|---|---|
| `/custom-development/` | 16,070 | 11,830 | 10,335 | 7,235 |
| `/custom-development/R-0005/` | 11,858 | 6,396 | 6,599 | 4,017 |

No sideways scroll at either width (scrollWidth = viewport). Screenshots:
`img/polish-2026-11-14-request-fold-r0005-390-before.png` / `-after.png`.

Tests: `node --test platform/pages/custom-development-page.test.mjs` 16 pass, 0 fail. Site
build suite and `check.mjs`: see the run record's notes.

## Still weakest, and what I would do next

1. **The shared footer is ~3,400 px on a phone** (No warranty, Best-effort hosting, Privacy...,
   from `disclaimerHtml`). On `/custom-development/` it starts at 8,428 px of 11,830. Same on every
   page that uses it. Folding the long sections into `<details>` while keeping the disclaimer's
   first sentence visible would shorten every page. Check `PRODUCT_PLAYBOOK.md`'s disclaimer
   rules first: the text must stay present and visible.
2. **`/custom-development/` repeats itself**: "Other ways to ask", "What you can ask for" and the
   "Problems that fit" list overlap. Merging them would bring "Requests so far" (proof of work) up
   about 1,000 px.
3. **`requests.json` `next` fields are growing logs.** The page handles it now, but a
   `next` that keeps only what's next, with history in the project's ROADMAP, would serve
   the file's other readers (`queue.mjs`, triage) too.
4. Carried over: answer leads on ~22 high-intent tools; lead cap 100 → 90; `MAX_LINKS` 8 → 6;
   `contrast.mjs` fallback without axe-core.

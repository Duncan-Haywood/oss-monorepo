---
kind: polish
topics: [design, privacy]
date: 2026-11-14
---
# Polish 2026-11-14: the footer's page-view counter disclosure, one 110-word sentence → a sentence and a two-item list

Track: polish/0. Picked from `polish-2026-11-14-footer-fold.md`, "Still weakest" item 1 ("the
page-view counter sentence is 110 words … could be a short list … that reads in half the
height"). Searched open PRs (all 40 open): none touch `disclaimerHtml` or the footer.

## What was wrong

The shared footer's Privacy paragraph (every catalogue, category, About and request page) ended in
one sentence describing the page-view counter: a parenthetical holding seven facts joined by
"and —", semicolons, a "plus" and a nested "such as", then "and those totals are published",
then the Do Not Track line. It was accurate but nobody could scan it, and it was the part a
privacy-minded reader most wants to check.

## What changed

- `build.mjs` `disclaimerHtml`: the first Privacy paragraph now stops at the local-storage tally,
  so the "54 tools that call an outside service" fold sits straight after the sentence it expands
  (before, the counter sentence sat between them). A second paragraph says each load adds one to a
  daily per-page total on our open-source counter, totals published, Do Not Track / GPC not
  counted. Then `<ul class="pfs-counted">`: **Counted, as daily totals only:** page, day, own-link
  channel, kind of referring site (never its address), two-letter country, device class.
  **Never stored:** anything you type, a cookie, your IP address; the host sees requests like any
  web server. Every fact in the old sentence is kept; none added.
- With the counter off (local and test builds), the second paragraph is just the Do Not Track line.
- `disclaimerHtml` is exported and takes `{ counter }` (default `counterOn()`), so the copy is
  testable without a full build.
- `site-nav.mjs`: `.pfs-counted` list spacing.
- New `footer-privacy.test.mjs` (0.3 s): both list items keep every fact and stay ≤ 50 words, no
  Privacy paragraph is ≥ 70 words, the counter-off variant has balanced `<p>` and keeps the DNT line.

## Measured (Chromium, reduced motion, built `dist/`, served locally)

Privacy section = top of the "Privacy" heading to the top of the "If you email" paragraph.

| Page | Width | Privacy before | after | Footer before | after |
|---|---|---|---|---|---|
| `/` | 390 | 732 | 791 | 2,196 | 2,254 |
| `/about/` | 390 | 734 | 762 | 2,099 | 2,128 |
| `/custom-development/` | 390 | 734 | 762 | 2,099 | 2,128 |
| `/` | 1,280 | 376 | 434 | 1,290 | 1,348 |
| `/about/`, `/custom-development/` | 1,280 | 354 | 402 | 1,192 | 1,239 |

**It is not shorter: 28 to 58 px taller**, from the list's bullets and the extra paragraph
margin. The last report's "half the height" guess was wrong; a list of the same facts takes about
the same lines. What it buys is scannability: the longest Privacy paragraph went from ~190 words to
~110 (the first, unchanged paragraph is now the longest), and the counter's facts are two labelled
bullets. I judged that worth 30 px on a phone in a section people read to check a claim. No
sideways scroll at either width. `check.mjs`: publishable, no dead links.

Screenshots: `img/polish-2026-11-14-counter-list-390-before.png`, `-after.png`.

## Still weakest, and what I would do next

1. **The first Privacy paragraph is now the wall** (~110 words: no account, the 54 exceptions,
   the feedback form, the local tally). Splitting "what's sent on purpose" (feedback form) from
   "what isn't" would finish the job.
2. **"Don't count my visit" sits after the email paragraph**, far from the counter it controls.
   It belongs next to the new counter list. It's rendered outside `disclaimerHtml`; find where.
3. **About's own counter copy** (`build.mjs` ~7698, "What happens to what you type") is a third
   phrasing of the same facts. One shared source for the counted/never-stored list would keep the
   footer, About and `llms.txt` from drifting.
4. Carried over: `surfaceExternalFetchHosts` artefacts (`x`, `proxy.local`) in the host list;
   About's panel as a table; `contrast.mjs` fallback without axe-core; answer leads on ~22 tools.

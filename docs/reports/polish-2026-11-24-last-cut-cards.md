---
kind: polish
topics: [design, seo]
date: 2026-11-24
---
# Polish 2026-11-24: the last 188 cut tool cards

PR #18590.

Picked item 1 of "Still weakest" in `polish-2026-11-24-card-sentences.md`:
188 tool cards still ended "…" after `cardCopy` landed.

## Diagnosis

`readMeta(html).description.endsWith('…')` over `discoverSurfaces`: 188 of
1,435. 186 had an `og:description` over `CARD_MAX` (180); 2 had none
(pdf-plan-takeoff, vsme-report-builder). A build-side alternative (take the
og line's first sentence) was tried and rejected: it would have rescued 129,
but many first sentences are hooks ("What does a decorated shirt actually
cost you?", "Free calculator for coin-op route operators.") that say nothing
about the tool in a card grid.

## What changed

- 185 venture `index.html` files: new `og:description`, 40 to 180 characters,
  one whole sentence (a few two), restating facts the old line or the page's
  description already stated. Two files got an `og:description` added under
  their meta description. `twitter:description` was checked: none matched the
  old og line, so none changed.
- Generated front pages (edit the script, not the HTML): `catholic-shorts/shorts.mjs`
  and `saints-by-candlelight/episodes.mjs` got an `ogDescription` param on
  `page()` (defaults to `description`); `self-hosted-saas-stack/build.mjs` got
  `OG_DESC`. Regenerated; each venture's suite passes (11, 20, 7).
- `platform/pages/build.test.mjs`: "every tool card ends on a whole sentence",
  a zero-tolerance check over all surfaces (~1 s).
- Post: `docs/posts/2026-11-24-the-last-188-cut-cards.md`.

## Measured

- Cut tool cards: 188 → 0 of 1,435.
- `…</p>` across built `dist/c/*/index.html` (category pages): 304 → 0.
- Before/after on `c/services` at 390 px: `img/polish-2026-11-24-cards-before.png`,
  `img/polish-2026-11-24-cards-after.png`.

## Traps for the next run

- Four research-algorithm pages (roc-analysis, ordinal-regression,
  pairwise-ranking, contingency-table-tests) have page tests that assert a
  verified number appears in the HTML, and the og line was its only copy.
  The new lines keep those numbers. Run `python3 platform/ci/run_venture_tests.py`
  on every venture whose copy you touch; grepping tests for the old string misses
  regex asserts.
- `deploy-concurrency-check-ci.yml` runs the tool over `.github/workflows/`
  with `--fail-on-risk`, and that is red on main (11 findings: the
  distribute-* workflows and cloudflare-email.yml have no concurrency group,
  plus split groups for `cloudflare`, `publish` and `paid-agents`, and
  uitest-ci.yml cancels in progress). Any PR touching that venture goes red
  for an unrelated reason. The fix lives in `.github/` (CODEOWNERS), so it is
  its own small PR awaiting the owner.

- A post's front-matter `description` over 160 characters throws in
`writing.mjs` and kills the whole site build at the very end (after ~10
minutes). Check the length before starting a build.

## Still weakest, and what I would do next

1. **3,960 published meta descriptions** cut with "…" by
   `clampMetaDescription`/`snippetize` (carried over). The og lines written
   here are a ready source for a shorter meta description on the same 188
   pages, but a meta description is written for the search query, so check
   each keeps its query words. A baseline ratchet like `title-length.mjs`
   would keep the count falling.
2. Saved-bids band (`pf-jobs.css`, 237 pages): grey browser-default buttons
   beside each venture's styled ones (carried over).
3. Carried over from the title ratchet: league-schedule-generator (14),
   ebay-fee-calculator (8), babysitting-business-kit (7) long titles.

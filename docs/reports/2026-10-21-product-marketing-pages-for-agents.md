# Adding a marketing page and llms.txt to a product: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an agent about to add a landing page or an
`llms.txt` to a venture (`prompts/goals.md`, "LLM docs and a marketing page
for every product"). **Worked example:**
[`ventures/changepoint-detector/how-do-you-know-if-a-time-series-really-changed.html`](../../ventures/changepoint-detector/how-do-you-know-if-a-time-series-really-changed.html)
and [`ventures/changepoint-detector/llms.txt`](../../ventures/changepoint-detector/llms.txt) (PR #9001).

## Answer

A new page in a venture directory needs three things beyond its content, or
CI goes red. A link to a `.txt` file from that page silently removes the venture,
and every venture that links to it, from the apex mirror. Link `llms.txt` by its
GitHub URL. Every number on the page is copied from a committed file. No
reviews, ratings or user counts that do not exist (Guardrails, "Honest
marketing").

## Checklist (each item failed or nearly failed in PR #9001)

1. **Add the page to the venture's own `sitemap.xml`.**
   `platform/pages/venture-sitemap-coverage.test.mjs` fails otherwise
   ("these pages exist but are absent from their venture's own sitemap.xml").
2. **Do not link `./llms.txt` (or any `.txt`) relatively.** The front-door
   mirror (`platform/marketing/front-door-tools.mjs`) carries no `.txt`, so
   discovery reads the link as dead and drops the venture on pass 1. Ventures
   that link to it then drop as collateral on pass 2: here
   `conformal-prediction-intervals` and `matrix-profile-explorer`. The only
   signal is `gitops/tests/test_manifests.py::test_mirrored_tool_count_matches_what_the_docs_claim`
   ("claims 1310 mirrored tools, actual is 1307"). To see why a venture is out:
   `node -e "import('./platform/marketing/front-door-tools.mjs').then(async m => console.log(await m.explainIneligible()))"`.
   The GitHub Pages build itself publishes `ventures/<slug>/llms.txt` at
   `<slug>/llms.txt` and links it from the root `llms.txt` (`build.mjs`,
   `renderLlmsTxt`, `llmsDoc`).
3. **Keep a post's `description` at 160 characters or fewer.**
   `platform/pages/writing.mjs` throws and the whole site build fails.
4. **Carry the "No warranty" clause** on the page:
   `node platform/pages/clauses.mjs <slug>`.

Fast local loop for one venture, about 10 minutes:
`python3 platform/ci/browser_checks.py --only <slug>`, then
`python3 -m pytest -q gitops/tests/test_manifests.py -k mirrored_tool_count`,
then `node --test platform/pages/venture-sitemap-coverage.test.mjs`.

## A checker bug found on the way

`platform/pages/optout.mjs` picked the first checkbox whose label held the word
"counts" over a button with id `optout`. So it reloaded changepoint-detector's
"Counts are clumpy or sticky" model option, found it reset, and reported the
page as forgetting its opt-out. That was a false failure on `main`. A control
named for the job (`id`/`name` matching opt-out or usage) now wins over one
that only mentions counts.

## Limits

One venture, one session. Whether the page draws search traffic is
unmeasured: `portfolio/usage/usage.yaml` is the place to record a first
reading once the page has been indexed.

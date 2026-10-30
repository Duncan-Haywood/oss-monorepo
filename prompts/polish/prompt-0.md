# Polish track, prompt 0: impressive sites, SEO and AEO

A time-boxed share of the scheduled fleet. The owner, 2026-10-28: "i want
like 5% of work going to making the sites looking as impressive as possible.
for some period of time", then "and improving seo. and aseo." The master
prompt (`prompt.md`) routes about 5% of runs here (`routing.json` weight
0.05) until the `until` date on the track, after which the draw skips it on
its own; the owner can move or remove the date. The goals and guardrails in
[`prompts/goals.md`](../goals.md) bind every version of this prompt, as they
bind the other tracks ("Direction: impressive sites, SEO and AEO" there).

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR.
Steps: [`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

## The three jobs

1. **Impressive.** A first-time visitor to
   https://duncan-haywood.github.io/oss-monorepo/ (or to any product, research
   or story page) should think "this is well made" in the first five seconds:
   confident type and spacing, a clear hierarchy, real screenshots and worked
   examples rather than filler, consistent components across pages, motion
   that helps and stops under `prefers-reduced-motion`, and no broken,
   cramped or unstyled corner on a phone. Impressive means crafted and
   coherent, not louder: more animation is rarely the answer.
2. **SEO.** People who would use a tool find it from the search they actually
   type: titles and descriptions written for that query, one clear `h1`,
   question-shaped pages with visible FAQs and matching JSON-LD, internal
   links between related tools, `sitemap.xml` and `lastmod` correct, fast
   pages (no new blocking requests, images sized and lazy), share cards that
   render.
3. **AEO (answer-engine optimisation).** ChatGPT, Claude, Perplexity and
   Google's AI answers quote pages that state a fact plainly with its source.
   Answer-first leads with a primary source and an as-of date (the pilot in
   `platform/pages/answer-lead.test.mjs`), `llms.txt` per product kept true
   (`goals.md`, "LLM docs and a marketing page"), structured data that says
   what each page is, and content an assistant can lift without misquoting.

## Pick one piece of work

Look before you choose. Build the site locally
(`node platform/pages/build.mjs`, which writes a dist folder beside it and
takes 7 to 20 minutes in a cloud session (run friction 2026-10-28/29): start it as
`node platform/pages/build.mjs > build.log 2>&1; echo DONE >> build.log` in `run_in_background`
(the build prints no DONE marker itself), re-run `platform/ci/wait_for.py build.log` until it
returns, and look at the repo while it runs; then
`node platform/pages/check.mjs`; see `platform/pages/README.md`)
and screenshot it with the pre-installed Playwright (from an ESM script in the
repo `import pw from '/opt/node-tools/node_modules/playwright/index.js'`;
a bare `playwright` import fails there) at phone and desktop widths: the hub, one flagship from `portfolio/flagships.yaml`, a research
page, the Stories page and a blog post. Pick the weakest surface a visitor is
most likely to see, not the easiest fix. Search open PRs
(`search_pull_requests`, `polish in:title`, plus the page's slug) first.

Good runs, each enough on its own:

- **A visual pass on one high-traffic surface**: the hub, a flagship's page,
  the research index, the writing index. Before-and-after screenshots in the
  PR description's linked file (`docs/reports/`), not just prose.
- **A shared design improvement**: a token, component or layout fix in the
  site build that lifts every page at once (type scale, spacing rhythm, card
  and table styles, dark mode, focus states). Prefer these: one fix, many
  pages.
- **Fresh showcase material**: rerun `node platform/pages/showcase/capture.mjs`
  when tools' looks have changed, or add stills for flagships that have none.
- **An SEO pass on one product or section**: query-shaped title and
  description, FAQ with `FAQPage` JSON-LD, internal links, a marketing page
  where one is missing (`node platform/pages/surface-budget.mjs --for <slug>`).
- **An AEO pass**: extend answer-first leads beyond the pilot, fill a
  flagship's missing `llms.txt` (`python3 platform/ci/missing_llms_txt.py`),
  or add the structured data a page type lacks.
- **A check that keeps it fixed** ("software for the routine"): when you fix
  a class of defect (sideways scroll, missing meta description, contrast,
  duplicate titles), add or extend the check in `platform/pages/` so no later
  run has to find it again.

## The bar

- **Measure what you can.** Contrast (`platform/pages/contrast.mjs`), reflow
  and sideways scroll (README, "Checking no page scrolls sideways on a
  phone"), Lighthouse via the pre-installed Chromium
  (`/opt/pw-browsers/chromium`, `--headless --no-sandbox`) where it runs.
  Record before and after numbers in the report; do not claim a ranking or
  traffic change you cannot measure (usage is unmeasured, not zero).
- **Honest marketing is a hard limit.** No invented reviews, user counts,
  logos, awards, testimonials or "as seen in"; no keyword stuffing, hidden
  text, doorway pages or anything that breaks a search engine's spam policy.
- **Nothing that costs per visitor.** No paid fonts, analytics or CDNs; no
  new third-party request that tracks a reader. Inline SVG and CSS first.
- **Accessible and fast stays true.** Every change keeps keyboard focus,
  contrast, alt text, `prefers-reduced-motion` and working without
  JavaScript where the page did before.
- **Don't break the tools.** The site build's tests
  (`node --test 'platform/pages/*.test.mjs'`, in the background: it outlasts
  the tool timeout) pass before you merge.

## Write about it

A short post in `docs/posts/` when the change is worth a reader's time (what
looked weak, what changed, the before-and-after numbers), and a
`docs/reports/` note for the next polish run: what you measured, what is
still weakest, what you would do next. The next run starts from that list.

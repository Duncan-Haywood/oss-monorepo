# Contrast was never checked because no corpus ever included the stylesheet

Built and measured 2026-08-21. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-contrast-decidability
python3 -m unittest discover                                   # 11 tests
python3 measure.py --recompute-from results-2026-08-21.json    # offline
# to regenerate: npm ci && npm run build in each venture in VENTURES, then
python3 measure.py --out results.json
```

## Why this was built

Both of this portfolio's WCAG engines record colour contrast (SC 1.4.3) as
`manual`, with the same one-line justification:

> Needs computed colour, which needs CSS and rendering.

Five measurement directories repeat it as settled — [`a11y-own-sites`](../a11y-own-sites/)
and [`a11y-generated-sites`](../a11y-generated-sites/) both close with *"every
criterion the engines mark manual — contrast, keyboard operability, focus order
and visibility — is untouched … nothing here shrinks it."*

Nobody had tested it. And the reason nobody could is structural rather than an
oversight: **every accessibility corpus this portfolio has ever measured was
HTML only.** `a11y-evidence-record` reads theme templates, `a11y-own-sites`
walks `.next/server/**/*.html`, `a11y-generated-sites` renders component trees
to markup. A stylesheet appears in none of them. Handed markup with no CSS, an
engine cannot decide contrast — so the claim reproduced itself for five passes
as a property of the corpus that read as a property of the criterion.

The delivered artifact is not markup. It is markup **and the stylesheet it
links**, and that stylesheet names its colours outright.

## What is here

| File | What it is |
|---|---|
| [`measure.py`](measure.py) | Scans each built venture's pages against the CSS its own build emitted, twice — once per colour scheme |
| [`test_measure.py`](test_measure.py) | 11 tests, standard-library `unittest` |
| [`results-2026-08-21.json`](results-2026-08-21.json) | Every per-venture row, including each distinct failure shape |

The resolver itself lives with the probe it belongs to, in
[`portfolio/pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/)
— `colors.py` (colour syntax, alpha compositing, the WCAG ratio), `css.py` (a
deliberately small stylesheet reader), `contrast.py` (per-element resolution).
112 tests.

## Finding 1 — 98.76% of it is decidable, and the residue has names

85 built pages across four ventures, 10,657 text-bearing elements:

| Venture | Pages | Text elements | Decidable |
|---|---:|---:|---:|
| `local-site-studio` | 17 | 6,149 | 100.00% |
| `ai-first-markets` | 20 | 1,462 | 100.00% |
| `quick-pick-survey` | 10 | 153 | 65.36% |
| `print-atelier` | 38 | 2,893 | 97.27% |
| **Total** | **85** | **10,657** | **98.76%** |

The 132 undecidable elements are not a shrug. Each carries a named reason, and
the three that occur are the honest residue:

| Reason | Elements | What it means |
|---|---:|---|
| `conditional-background` | 106 | A background that only a viewport breakpoint settles |
| `opacity-in-chain` | 24 | An `opacity` between the text and its background, which multiplies through in a way that depends on stacking context |
| `conditional-color` | 2 | Same, for the text colour |

**That list is the product, not the ratio.** The candidate
([`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md))
sells an evidence record whose coverage limits are stated *in* the record. "1.4.3
needs a human" is a limit stated at the wrong resolution: it prices a manual
review of every element on the page when the artifact settles all but 1.24% of
them. A per-element tally with reasons is the same honesty at a resolution the
buyer can act on.

## Finding 2 — a single-scheme scan misses 39% of the real failures

`prefers-color-scheme` is not like a viewport breakpoint. It has exactly two
states, and the stylesheet spells out both, so each is decidable — the page must
satisfy 1.4.3 in whichever one the visitor's system asks for. Scoring both and
taking the worse verdict is therefore not conservatism; it is the criterion.

Over the corpus as `main` built it when this section was measured:

| | Failures found |
|---|---:|
| Light scheme only | 581 |
| Both schemes | **965** |
| **Visible only in dark mode** | **384** |

A checker that renders or resolves one colour scheme reports those 384 elements
as clean. They are not clean; they are unreadable for anyone whose system is set
to dark, which is most people on a phone at night.

The mechanism is mundane and, once named, obvious: a component writes
`text-gray-500` with no `dark:` counterpart, inside a container that *does* have
`dark:bg-gray-800`. In light mode the pair is fine. In dark mode the text stays
mid-grey and the background goes dark, and the ratio collapses. `print-atelier`
did this 384 times; the same file showed the correct pattern
(`text-gray-500 dark:text-gray-400`) one component above, so this was a lapse
that repeated, not a decision — and, being internal-only venture code, it was
fixed the same day ([#542](https://github.com/Duncan-Haywood/monorepo-projects/pull/542),
Finding 4 below): `main` now has **0** dark-only failures, all in this class.

## Finding 3 — gradients are decidable, and the bound is exact

A gradient background is the canonical reason a static checker gives up. It does
not have to be. CSS interpolates each sRGB channel linearly between adjacent
stops and WCAG relative luminance is monotonic in each channel, so the luminance
attainable anywhere on the gradient is exactly the interval between its stops'
luminances — no interior extremum exists to be missed. For a fixed text
luminance the contrast ratio then has its minimum at the point of that interval
nearest the text and its maximum at the farther end.

So a gradient yields a *bound*, and a bound wholly on one side of the threshold
settles the criterion. Only a bound that straddles it is undecidable, and that
gets its own reason (`gradient-straddles-threshold`). Alpha compositing
preserves the property, because compositing is affine per channel: a translucent
panel over a gradient is still bracketed by its composited stops.

This is why `local-site-studio`'s four generated themes — every one of which
paints a `radial-gradient` shell — decide cleanly rather than falling into the
undecidable bucket.

## Finding 4 — three ventures were shipping the defect they plan to bill for finding

The scan found **965 decided AA failures** on this portfolio's own built pages,
as originally measured against `main` by this section (see
[**Why the committed file measures `main`**](#why-the-committed-file-measures-main)
below). Not marginal ones: `text-zinc-400` on white is **2.62:1** against a
required 4.5:1.

**Since then, `print-atelier`'s 611 have been fixed and merged**
([#542](https://github.com/Duncan-Haywood/monorepo-projects/pull/542),
2026-08-21, same day) — internal-only remediation, agent-decidable because
that venture has no deploy workflow. `local-site-studio`'s 21 and
`ai-first-markets`'s 333 remain open on `main`, still held for the account
owner:

| Venture | Failures on `main` | Diagnosed remediation | Held in |
|---|---:|---|---|
| `local-site-studio` | 21 | `text-zinc-400` → `text-zinc-500` on light panels; one ternary in `page.tsx` has its two branches the wrong way round, putting the lighter grey on the white card and the darker on the near-black one, so both sides fail | [#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523) |
| `ai-first-markets` | 333 | `text-zinc-500` → `text-zinc-400` throughout (the site is dark-themed, so the muted step is one shade too dark); three residual near-misses in `AppNav` | [#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523) |
| `print-atelier` | 0 — **fixed** | 73 component-level colour decisions, 384 of them the missing-`dark:`-variant pattern | [#542](https://github.com/Duncan-Haywood/monorepo-projects/pull/542), merged |

`local-site-studio`'s and `ai-first-markets`'s fixes are written and verified
by rebuild: 62 lines of Tailwind class-name substitution across 11 files, each
substitution's resulting ratio computed before it was applied, the lowest
4.63:1 against a required 4.5:1. They wait on the account owner, not on any
further measurement. The committed
[`results-2026-08-21.json`](results-2026-08-21.json) and `test_measure.py`
already measure the post-`#542` tree (354 total failures, `print-atelier` at
`0`) — this section's prose was the one place still describing the pre-`#542`
965/611 state; corrected here rather than left as a citation that no longer
matched its own committed artifact, the same gap
[`a11y-own-sites/README.md`](../a11y-own-sites/#finding-4-2026-08-21-the-adapters-never-fed-either-engine-a-stylesheet)
hit and fixed the same day.

## Why the committed file measures `main`

This directory, the resolver behind it and the two venture colour fixes were
built as one pass and opened as
[#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523). Bundling
the fixes put the whole 4,542-line diff in the human-gated class — engine,
tests and measurement included, none of which touch a live site — so #523
offered to split, and
[#524](https://github.com/Duncan-Haywood/monorepo-projects/pull/524) took the
split and landed the internal half.

What #524 carried across unchanged was **#523's results file**, and that file is
a measurement of #523's tree, where the two ventures are already fixed and read
`0`. On `main` they are not fixed. So the prose here said 965 open failures
while the artifact beside it totalled 611, and
[this directory's CI workflow](../../../.github/workflows/a11y-research-ci.yml)
cannot catch that — its own header comment says so: *"a colour change in venture
source makes the committed results stale — CI cannot detect that, only a re-run
with builds can."* Nothing was wrong with the engine; the artifact simply
described a different tree than the one it was committed to.

This pass re-ran it with builds. All four ventures rebuilt from `main`'s source
with `npm ci && npm run build`, rescanned, results file replaced. The numbers it
produced are #523's own pre-fix column, re-derived from a second checkout: 85
pages, 10,657 elements, 98.76% decidable, 965 failures against 581 light-only,
384 dark-only, and the same 106 / 24 / 2 split across the three undecidable
reasons. Two sessions, two checkouts, same arithmetic — which is the strongest
evidence this measurement has that it is reproducible at all.

`test_measure.py` now pins the per-venture counts instead of asserting the two
ventures are clean. Whenever #523 or the `print-atelier` work lands, this suite
fails until the corpus is rebuilt and the file regenerated. That is the same
coupling the original guard enforced, pointed at the tree that actually exists.
**The `print-atelier` trigger has since fired**: `#542` landed the fix, a
later pass rebuilt the corpus and replaced the results file again (354 total,
`print-atelier` at `0`), and `test_measure.py` was updated to pin that state —
see Finding 4 above. `#523`/`#531`'s two ventures have not landed, so the file
still measures them open.

## What could not be measured here

- **Only what the four Next.js ventures build.** `garmin-world-traveler-watchface`,
  `world-clock-widget` and the CLI ventures emit no HTML, and
  `local-site-studio`'s *delivered* customer sites are rendered per request —
  [`a11y-generated-sites`](../a11y-generated-sites/) holds that corpus, and its
  16 pages resolve 100% decidable and 0 failures against this venture's
  stylesheet.
- **No render, no interaction, no assistive technology.** 1.4.11 (non-text
  contrast), keyboard operability, focus visibility and target size are
  untouched and remain `manual`. This pass moves exactly one criterion.
- **Text over images is still undecidable**, and so is text under an `opacity`.
  Both are reported, not silently passed.
- **The engines have diverged.** `eaa-wcag-triage` now checks 1.4.3 and the
  sibling [`a11y-evidence-record/audit.py`](../a11y-evidence-record/) does not.
  [`a11y-engine-agreement`](../a11y-engine-agreement/) established that *silent*
  asymmetry is the danger; this one is declared here and in both engines'
  coverage catalogs, and reconciling it is the follow-up.
- **The corpus is this portfolio's own code.** Four ventures built with the same
  framework and two with the same palette is not a sample of the web. The
  98.76% is a measurement of what a *Tailwind-built Next.js artifact* settles;
  a page whose colours come from a stylesheet the scan was not given decides
  nothing at all, and the tally says so rather than reporting it clean.

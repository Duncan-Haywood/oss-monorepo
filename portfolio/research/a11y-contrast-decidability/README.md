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
111 tests.

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

At first measurement, before any fix:

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
does this 384 times; the same file shows the correct pattern
(`text-gray-500 dark:text-gray-400`) one component above, so this is a lapse
that repeated, not a decision.

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

The scan found **965 decided AA failures** on this portfolio's own built pages.
Not marginal ones: `text-zinc-400` on white is **2.62:1** against a required
4.5:1.

Fixed on the branch that ran this measurement, verified by rebuilding each
venture and re-running the scan — but not yet on `main`. The change to this
research and to the probe engine (this pass) is agent-decidable per
`CLAUDE.md` and lands on its own; the colour-token edits below touch
deployable `ventures/*` app code, which is the account owner's call, and are
proposed in [#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523)
pending that sign-off:

| Venture | Failures before | After | What changed |
|---|---:|---:|---|
| `local-site-studio` | 21 | **0** | `text-zinc-400` → `text-zinc-500` on light panels; one ternary in `page.tsx` had its two branches the wrong way round, putting the lighter grey on the white card and the darker on the near-black one, so both sides failed |
| `ai-first-markets` | 333 | **0** | `text-zinc-500` → `text-zinc-400` throughout (the site is dark-themed, so the muted step was one shade too dark); three residual near-misses in `AppNav` |

**Not fixed, and named here rather than quietly carried:** `print-atelier`'s
**611** failures, across 73 distinct colour/background shapes. 384 of them are
the missing-`dark:`-variant pattern above. This is a mechanical remediation —
add the dark counterpart each component is missing — but it is 73 separate
component-level colour decisions, and bundling them into the pull request that
introduces the measurement would make neither reviewable. It is the obvious next
piece of work and it is fully specified by
[`results-2026-08-21.json`](results-2026-08-21.json), which lists every shape
with its ratio and its element count.

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

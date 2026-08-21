# Run the audit on ourselves: what the engines find on this portfolio's own pages

Built and measured 2026-08-21, revised the same day (see Finding 4): both engine
adapters here were fixed to pass each app's build-emitted CSS, which they had
never been given, so 1.4.3 (contrast) now fires for the first time. The
committed results file is the post-fix state; the counts under Findings 1-3
below describe the pass that produced them and remain accurate as history, but
are no longer what a fresh `--out` run reproduces on their own — the current
file also reflects contrast findings Finding 1-3's prose does not mention.
Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-own-sites
python3 -m unittest discover                                   # 16 tests
python3 audit_own_sites.py --recompute-from results-2026-08-21.json   # offline
# to regenerate the corpus: npm ci && npm run build in each venture, then
python3 audit_own_sites.py --out results.json
```

## Why this was built

This portfolio has two WCAG engines
([`a11y-evidence-record/audit.py`](../a11y-evidence-record/) and
[`pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/)),
four measurement directories behind them, and a candidate
([`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md),
composite 7.25, the pipeline's highest) whose verdict is *build it as a
`local-site-studio` product line*.

Both engines had only ever been run on two kinds of input: **hand-written
fixtures**, and **npm-published storefront theme tarballs**. Neither had ever
been pointed at a page this portfolio itself ships. That leaves two questions
open at once, and one corpus answers both:

1. **Do the ventures' own pages pass?** A portfolio preparing to charge for
   accessibility evidence should not be shipping the defects it plans to bill
   for finding. Nobody had checked.
2. **Does the engine hold up out of sample?** `eaa-wcag-triage`'s validation is
   a three-page fixture set written alongside the engine, scoring precision and
   recall **1.0**. [`a11y-engine-agreement/`](../a11y-engine-agreement/)
   reconciled the two engines against that same three-page set. Agreement on
   markup written to exercise the rules is the weakest evidence a checker can
   have.

The corpus is what each venture's own `npm run build` emits — prerendered App
Router pages, Pages Router fallbacks, and static exports. **118 unique pages
across 7 built apps in 6 ventures** (138 files, 20 byte-identical duplicates
dropped: a Next.js build writes the same 404 body under both routers, and a
static export writes both `x.html` and `x/index.html`).

## Finding 1 — the fixture score overstates out-of-sample precision by 12–18 points

67 findings on 118 pages. Read by hand, one at a time, against the source that
produced them:

| | n | share |
|---|---:|---:|
| Confirmed defects in venture source | **55** | 82.1% |
| Contested — a normative WCAG question this environment cannot settle | 4 | 6.0% |
| **False positives, established by inspection** | **8** | **11.9%** |

So out-of-sample precision is **0.821–0.881** against **1.0** on the fixture
set. The fixture number is not wrong; it is measuring a different thing. Every
false positive is markup the engine's author never had occasion to write.

**The two false-positive classes, both from the same root cause.** Neither is a
parser bug and neither is fixable by a better rule — each is a fact about the
page that lives outside the HTML the engine is handed:

- **7 of 7 — one per app — are Next.js's own error shell.** Every `3.1.1`
  finding in the whole corpus (*"the `<html>` element has no `lang`"*) landed on
  `.next/server/pages/500.html` or `.next/server/app/_global-error.html`, and
  never once on a page a venture wrote. These are the framework's internal
  fallback documents (`<html id="__next_error__">`), reached only when rendering
  fails outright. `quick-pick-survey` proves they are un-actionable: it ships a
  correct `src/app/global-error.tsx` whose root element *is*
  `<html lang="en">`, and its built shell is flagged anyway.
- **1 is a control that `display:none` removes from the page.**
  `print-atelier`'s `src/app/capture/page.tsx` holds a
  `<input type="file" className="hidden">` opened by a visible button through a
  ref. Tailwind's `hidden` is `display:none`, so the element is not focusable
  and not in the accessibility tree — but `hidden` is a *class name*, and
  resolving it needs the stylesheet. Deliberately left unfixed: adding an
  `aria-label` to silence a scanner on an element no user can reach is exactly
  the incentive that produces overlay vendors.

The contested 4 are `<input type="checkbox" disabled>` in rendered
markdown task lists (`real-estate-agent-photo-app/docs-site`). Whether a
disabled, unfocusable control still owes an accessible name is a normative
reading of WCAG 1.3.1, and
[`a11y-engine-agreement/`](../a11y-engine-agreement/) already records that the
spec hosts are egress-denied from here. **Left open on purpose, and the engines
were not changed**: quietly relaxing a rule to remove findings is not a
measurement, and this is the one class where the change would have been
self-serving.

**What this says about the product.** The candidate's distribution wedge is a
free qualification audit run before quoting, handed to a stranger. A first
contact whose output is 12% un-actionable — and where the single most common
finding class is *always* un-actionable — is not a calibration detail. It is
the difference between a document that opens a conversation and one that ends
it. **A build-output scan must exclude framework-emitted artifacts**, which is
a filter neither engine has and neither theme-tarball corpus could have
revealed.

## Finding 2 — the engines agree far less out of sample, and every disagreement is a relabelling

| Corpus | Pages | Identical criterion multiset |
|---|---:|---:|
| Fixtures (`a11y-engine-agreement`, 2026-08-21) | 3 | 2 (66.7%) |
| This portfolio's built pages, as first measured | 118 | 89 (75.4%) |
| **Same corpus, current file** (below the fixes and the stylesheet fix in Finding 4) | **118** | **91 (77.1%)** |

27 pages disagree in the current file (29 in the first pass, before the 30
blocking fixes in Finding 3 landed on `main`). Every one of them is still a
**pure relabelling** — both engines find the same defect and cite a different
success criterion, and that holds even with 1.4.3 now firing 743 times:
both engines cite the identical criterion on every one of those findings, so
contrast contributed zero new disagreements. Not one page in 118 has a defect
that only one engine detects. (That holds for this corpus and does not
generalise: [`a11y-generated-sites/`](../a11y-generated-sites/) found a genuine
detection gap in each engine on 14 pages of a corpus these 118 could not
include. It also names the defect behind each relabelling below — a skipped
heading level, and a control with no accessible name.) That split is the useful part,
and the script tests for it explicitly, because the two failures have opposite
consequences: a detection gap means a customer's barrier goes unreported, while
a relabelling means two runs of "the same" audit hand procurement two different
criterion numbers for one defect.

| audit.py cites | probe cites | pages |
|---|---|---:|
| 1.3.1 Info and Relationships | 2.4.6 Headings and Labels | 25 |
| 3.3.2 Labels or Instructions | 1.3.1 Info and Relationships | 2 |

(First pass: 24 / 4 / 1 across three rows, the third a single `print-atelier`
page whose now-fixed `display:none` false positive happened to also carry a
relabelling — fixing the false positive removed the row, not the attribution.)

`a11y-engine-agreement/` found both of these divergences and left them open as
the *residual* after four coverage gaps were closed, on the grounds that
settling them is a normative reading. **That characterisation was right about
the cause and wrong about the size.** On a corpus of three it looked like one
page of edge case. On real pages it decides the criterion cited on **22.9% of
them** — and it is the same two attribution pairs doing all of it, so the fix
is bounded: two normative rulings, not a general reconciliation. The reason to
settle it is not tidiness. The deliverable being sold is a criterion-referenced
record that a merchant hands to a procurement team or to counsel, and a record
whose criterion numbers depend on which of two in-house engines ran it is not
a record.

## Finding 3 — the defects on our own pages, and what was done about each

Findings by app, as measured **before** any fix in the pass that first ran
these engines out of sample, and **before** the stylesheet fix in Finding 4
below (which fires 1.4.3 for the first time and is not in this table). The
committed results file no longer reproduces exactly this state on its own —
see the note at the top of this page — so the numbers below are quoted rather
than re-derivable from `results-2026-08-21.json` as it stands today:

| App | Blocking | Degrading |
|---|---|---|
| `ventures/print-atelier` | 13 × 1.3.1, 8 × 4.1.2, 1 × 3.1.1 | 22 × 2.4.6 |
| `ventures/quick-pick-survey` | 10 × 1.4.4, 1 × 3.1.1 | — |
| `ventures/real-estate-agent-photo-app/docs-site` | 4 × 1.3.1, 1 × 3.1.1 | 1 × 2.4.6 |
| `ventures/ai-first-markets` | 1 × 3.1.1 | 2 × 2.4.6 |
| `ventures/local-site-studio` | 1 × 3.1.1 | — |
| `ventures/photo-editing/docs-site` | 1 × 3.1.1 | — |
| `ventures/real-estate-agent-photo-app/research` | 1 × 3.1.1 | — |

Subtract the framework shell and the `display:none` input and **four of the
seven apps have no actionable finding at all**. The real defects concentrate in
two.

**Fixed in this pass, verified by rebuilding and re-auditing:**

- **`print-atelier` — 8 icon-only buttons with no accessible name (4.1.2).**
  The mobile navigation open/close pair on the site's own front page, four
  header controls in the buyer portal (search, account, saved, cart), the "new
  project" control in the B2B portal, and the notifications bell in the artist
  portal. Each is a `<button>` wrapping an SVG icon and nothing else, announced
  as "button" with no indication of what it does. Now carry `aria-label`.
  **8 → 0.**
- **`print-atelier` — 12 form controls with no label (1.3.1).** Ten variant-ID
  inputs on `partner-setup` (both the Printful and the Gelato mapper render a
  row per artwork with a `placeholder` and no label — and a placeholder is not
  a name, and disappears the moment the operator types), the trade-catalog
  search box in the B2B portal, and the sort `<select>` in the buyer portal.
  Now carry per-row `aria-label`s naming the artwork. **13 → 1**, the remainder
  being the `display:none` false positive above.
- **`quick-pick-survey` — 10 pages pinned at 1× zoom (1.4.4).** The root layout
  set `maximumScale: 1, userScalable: false`, with a comment explaining the
  reason: double-tap zoom makes the swipe deck feel broken. The reason is real
  and the remedy was too broad — it disabled zoom on the settings, insights,
  profile and admin screens too, which is a WCAG AA failure on every one of
  them. The deck already carries `touch-pan-x`, and any `touch-action` other
  than `auto`/`manipulation` suppresses double-tap zoom on that element by
  itself, so the deck keeps exactly the behaviour it asked for. **10 → 0**;
  `npm run verify` (typecheck → lint → 264 tests → build) clean.

**Reported, deliberately not fixed:**

- **25 heading-level skips (2.4.6, degrading)** — 22 in `print-atelier`, 2 in
  `ai-first-markets`, 1 in the `real-estate-agent-photo-app` docs site. Almost
  all are `<h1>` followed by `<h3>` in a page's visual hierarchy. Real, and a
  correct fix reshapes the heading outline of each page, which is a visual
  change with no test to hold it. It belongs in a pass that owns those pages,
  not in a measurement pass. Recorded here so it is not rediscovered.
- The 8 false positives and 4 contested findings above.

## Finding 4 — the audit never actually checked contrast, on any of these pages

Both adapters here called each engine with raw HTML and no linked stylesheet.
Both engines are explicit that without one, 1.4.3 (contrast) "finds nothing to
decide" — so across every one of the 118 pages above, contrast was never
evaluated, and Finding 1's precision table and Finding 3's per-app table are
both silent about a whole success criterion rather than reporting it clean.
This is not a new bug: it is the same one
[`a11y-axe-recall/`](../a11y-axe-recall/) found and fixed for its own copy of
this corpus, while measuring out-of-sample recall — its README calls it out
explicitly as "a standing bug in a *merged* directory." This pass ports the
identical fix here: each app's build-emitted CSS (`.next`/`out`/`dist`),
parsed and merged once per app, passed through to both engines.

Contrast now fires 743 times across 5 of the 7 apps, using the exact
resolver [`a11y-contrast-decidability/`](../a11y-contrast-decidability/)
already validated at 98.76% decidable over 10,657 elements — a computed
colour ratio against a named threshold, not a judgement call, so these are
not put through the by-hand false-positive review Finding 1 gave the original
67 findings. Both engines cite the identical criterion on every one of these
findings (Finding 2), which is itself evidence the two contrast
implementations agree out of sample, not only on the fixtures that reconciled
them.

| App | 1.4.3 blocking | 1.4.3 degrading | Status |
|---|---:|---:|---|
| `ventures/ai-first-markets` | 1 | 332 | Same 333 total as `a11y-contrast-decidability`'s independent scan of this venture. Diagnosed, fixed, and rebuild-verified; awaiting the account owner's sign-off in [#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523)/[#531](https://github.com/Duncan-Haywood/monorepo-projects/pull/531) (colour-token edits to deployable `ventures/*` code) |
| `ventures/local-site-studio` | 17 | 4 | Same 21 total as `a11y-contrast-decidability`. Same status as above |
| `ventures/real-estate-agent-photo-app/docs-site` | 19 | 347 | **New** — outside `a11y-contrast-decidability`'s four-venture scope. Reported here, not fixed; deployable `ventures/*` code, so any fix is the account owner's call per `CLAUDE.md` |
| `ventures/real-estate-agent-photo-app/research` | 9 | 11 | **New**, same status |
| `ventures/photo-editing/docs-site` | 3 | 0 | **New**, same status |
| `ventures/print-atelier`, `ventures/quick-pick-survey` | 0 | 0 | No stylesheet failures on this corpus (matches `a11y-contrast-decidability`'s own scan of both) |

389 of the 743 (the three "New" rows) are the first measurement of contrast on
these three apps anywhere in this repository — `a11y-contrast-decidability`'s
own venture list never included them. Recorded here so they are not
rediscovered; not diagnosed or fixed in this pass, which is a measurement pass
over a corpus these engines already had, not a new venture-code change.

## What could not be measured here

- **No render, no interaction, no assistive technology.** Every criterion the
  engines mark `manual` — contrast, keyboard operability, focus order and
  visibility, target size, error identification — is untouched. On the
  candidate's own economics this is the deliberate contractor step, and nothing
  in this directory shrinks it.
- **Prerendered output is not the delivered page.** The corpus is what the build
  emits before hydration. A control whose accessible name is attached by client
  JavaScript reads as unnamed here, and one whose name is *removed* on the
  client reads as fine. Both engines are static by construction, so this limit
  is shared with every number in the four directories above it.
- **Dynamic routes are underrepresented.** Server-rendered-on-demand routes emit
  no HTML at build time, so the corpus skews toward static and SSG pages. In
  `print-atelier` that happens to include the portals, which is where the
  defects were; in an app whose interactive surfaces are all dynamic it would
  not.
- **`local-site-studio`'s delivered product is not in this corpus.** Its own
  marketing and docs pages are, and they are clean. The customer sites it
  generates are rendered per slug from customer data and never appear in a
  build. That is the corpus worth auditing next, and it is the one that carries
  the actual liability — every defect in a generated theme ships to every
  customer who buys one.

  **Done, 2026-08-21: [`a11y-generated-sites/`](../a11y-generated-sites/).** The
  delivered pages are clean — 0 findings on 14, both engines agreeing — but the
  pass found a detection gap in *each* engine, which is the class this
  directory reported seeing none of in 118 pages. The probe had no `<iframe>`
  rule, and the repository's only frame is the map on every delivered page: the
  one element on the one route a build-directory corpus cannot reach. `audit.py`
  accepted a control wrapped in a text-less `<label>`. Both are fixed there,
  which means **the numbers on this page were measured with the pre-fix
  engines.** Both fixes can only add findings, and only on markup this corpus
  had none of — a source survey found the single frame above, and all 82
  wrapping `<label>` occurrences under `ventures/` carry text — so these
  numbers are expected to stand. They have not been re-run.

## Effect on the pipeline

**No score moved, and no verdict changed.** Two things are recorded against
[`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md)
and, through it, against
[`shopify-a11y-evidence`](../../pipeline/candidates/shopify-a11y-evidence.md),
which sells the same audit through a different channel:

1. The free qualification audit needs a **build-artifact filter** before it is
   shown to anyone. Without one, 12% of what a stranger reads first is
   un-actionable and the most frequent single finding is always un-actionable.
2. The two-engine attribution divergence is not a residual. It sets the
   criterion cited on 22.9% of real pages, and the record is the product.
3. **Contrast had never actually been checked on this corpus at all** (Finding
   4) — not because either engine's coverage statement is wrong (both legitimately
   claim 1.4.3), but because this directory's own adapters never gave either
   engine the stylesheet the claim depends on, so the corpus silently carried a
   whole success criterion neither engine could evaluate. Fixed here. Firing it
   found 389 contrast failures on three apps `a11y-contrast-decidability` had
   never scanned, on top of the 354 (`local-site-studio` + `ai-first-markets`)
   already diagnosed and awaiting sign-off in #523/#531 — this portfolio
   shipping the defect it plans to bill for finding, again, on pages nobody had
   pointed either engine at until this pass.

The candidate's own liability position — *state coverage limits in the product,
not in the terms* — is the reason all three belong here rather than in a
backlog. A record that lists a framework's internal error document as a
customer's blocking defect, or that stays silent about a criterion it never
checked, states its coverage inaccurately in the direction that flatters the
seller.

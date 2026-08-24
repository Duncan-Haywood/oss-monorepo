# Run the audit on ourselves: what the engines find on this portfolio's own pages

Built and measured 2026-08-21. Corpus rebuilt and re-measured 2026-08-21, same
day, after [Finding 4](#finding-4-2026-08-21-the-adapters-never-fed-either-engine-a-stylesheet)
found and fixed a gap that had made 1.4.3 silently absent from every number
below it. Rebuilt from all 7 apps and re-measured again on 2026-08-22 for
[Finding 5](#finding-5-2026-08-22-the-filter-finding-1-asked-for-built-and-measured),
which reproduced every number here and added the build-artifact filter Finding
1 asked for. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-own-sites
python3 -m unittest discover                                   # 26 tests
python3 audit_own_sites.py --recompute-from results-2026-08-22.json   # offline
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
| **This portfolio's built pages** | **118** | **91 (77.1%)** |

27 pages disagree (originally measured as 29/89 before
[Finding 4](#finding-4-2026-08-21-the-adapters-never-fed-either-engine-a-stylesheet)'s
stylesheet fix and rebuild — the two extra pages that now agree gained an
identical 1.4.3 answer from both engines once each was handed the same CSS,
which is a side effect of that fix and not a new reconciliation). Every one of
the 27 is still a **pure relabelling** — both engines find the same defect and
cite a different success criterion. Not one page in 118 has a defect that only
one engine detects. (That holds for this corpus and does not generalise:
[`a11y-generated-sites/`](../a11y-generated-sites/) found a genuine detection
gap in each engine on 14 pages of a corpus these 118 could not include. It also
names the defect behind each relabelling below — a skipped heading level, and a
control with no accessible name.) That split is the useful part, and the script
tests for it explicitly, because the two failures have opposite consequences: a
detection gap means a customer's barrier goes unreported, while a relabelling
means two runs of "the same" audit hand procurement two different criterion
numbers for one defect.

| audit.py cites | probe cites | pages |
|---|---|---:|
| 1.3.1 Info and Relationships | 2.4.6 Headings and Labels | 25 |
| 3.3.2 Labels or Instructions | 1.3.1 Info and Relationships | 2 |

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

Findings by app, as measured **before** any fix in this pass (this is the state
the results file originally committed 2026-08-21 recorded; it does not match
the results file now committed at that same path, which is the rebuilt,
post-fix state after both this section's fixes and
[Finding 4](#finding-4-2026-08-21-the-adapters-never-fed-either-engine-a-stylesheet)'s —
the table below is preserved as the historical starting point the rest of this
section explains):

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

**Fixed in this pass, verified by rebuilding and re-auditing.** (Re-confirmed a
second time by [Finding 4](#finding-4-2026-08-21-the-adapters-never-fed-either-engine-a-stylesheet)'s
rebuild: the counts below still match exactly, so nothing here has regressed.)

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

## Finding 4 (2026-08-21): the adapters never fed either engine a stylesheet

Both engines' contrast rule (1.4.3) takes an optional *parsed, linked*
stylesheet and, with none, "the colour rules simply find nothing to decide" —
`wcag_triage.engine.audit_html`'s own docstring, and `audit.audit_source` says
the same. `audit_own_sites.py`'s two adapters (`probe_findings`,
`audit_py_criteria`) called both engines with no stylesheet argument at all,
on a corpus that is 100% Next.js output with effectively no inline `<style>`.
So across every page measured in Finding 1 through Finding 3 above, **1.4.3
was never actually evaluated against real CSS by either engine** — not zero
findings because the pages pass, zero findings because the criterion was
silently skipped. [`a11y-axe-recall/`](../a11y-axe-recall/) found and fixed
this same gap for its own, separate corpus-loading code on the same day and
named the fix as owed here too, rather than fixed here, because doing it
properly means regenerating this directory's own committed numbers — the step
this section is.

**The fix**, mirroring `a11y-axe-recall/measure.py`'s `css_for_app`: read
every `*.css` file under `.next`, `out`, and `dist`, merge them with
`audit.merge_stylesheets`, and pass the result to both engines. The first
attempt reused `audit_own_sites.py`'s own `BUILD_DIRS` constant
(`.next/server/app`, `.next/server/pages`, `out`, `dist`) — the directories
`discover()` already walks for HTML — and found nothing: a Next.js build
writes its CSS under `.next/static/css/`, a *sibling* of `server/`, not
inside it. That silent zero was caught before it was trusted, by cross-checking
against [`a11y-contrast-decidability/`](../a11y-contrast-decidability/), which
scans `.next` in full and had already measured four of these seven apps.

**Corroboration.** `a11y-contrast-decidability` and this directory now agree
exactly, on the same build output, using the same CSS resolver, on all four
apps they both cover:

| App | `a11y-contrast-decidability` fail count | This directory's 1.4.3 findings |
|---|---:|---:|
| `ai-first-markets` | 333 | 333 (1 blocking + 332 degrading) |
| `local-site-studio` | 21 | 21 (17 blocking + 4 degrading) |
| `print-atelier` | 0 | 0 |
| `quick-pick-survey` | 0 | 0 |

`print-atelier`'s and `quick-pick-survey`'s zeros are not this fix's doing —
both were already fixed in venture source (#542 fixed `print-atelier`'s 611
contrast failures the same day this directory's original baseline was
captured; a separate commit removed `quick-pick-survey`'s forced 1× zoom).
Isolated by running both adapters against the same freshly built HTML with and
without the stylesheet argument: identical result either way on those two
apps (zero 1.4.3 findings whether or not a stylesheet is passed), confirming
their current zeros are a real absence of contrast defects on the rebuilt
pages, not an artifact of this fix.

**New territory.** Three apps in this corpus fall outside
`a11y-contrast-decidability`'s scope (it covers only the four Next.js ventures
listed above) and their 1.4.3 counts are new information from this fix:
`photo-editing/docs-site` — 3 (all blocking); `real-estate-agent-photo-app`'s
`docs-site` — 366 (19 blocking, 347 degrading); its `research` app — 20 (9
blocking, 11 degrading). Spot-checked rather than hand-classified
instance-by-instance the way Finding 1's 67 findings were: `docs-site`'s
`process.html` alone carries 340 of the 366, all the same shape (`p` elements
at `#475569` on `#060b1d`, computed ratio 2.582:1 against the 4.5:1 this size
requires) — a long page repeating one under-contrasted text style many times,
not 340 independent judgement calls. The arithmetic and the CSS-to-color
resolution are the same code path already validated at 98.76% decidable over
10,657 elements in `a11y-contrast-decidability`, so these are trusted at that
level of confidence, not at Finding 1's per-instance-reviewed level.

**Corpus and agreement.** Page discovery is unaffected (still 118 unique pages
from 138 built, 7 apps) — this fix only changes what each engine decides once
it sees a page, not which pages are in scope. Engine agreement moved from
89/118 (75.4%) to 91/118 (77.1%), covered in Finding 2 above.

**Effect on the pipeline.** No score moves. The `ai-first-markets` and
`local-site-studio` numbers this fix surfaces are the same 333 and 21 already
counted in `a11y-contrast-decidability` and already sitting in the
account-owner-gated remainder of [#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523)
(via [#531](https://github.com/Duncan-Haywood/monorepo-projects/pull/531)) —
this closes a measurement gap in a directory the pipeline's liability score
cites, it does not add a new liability finding. What it does change: Finding
1's precision numbers (0.821–0.881) were computed on a denominator that never
included 1.4.3 at all, on any of the 67 findings they classified — accurate
for what they measured, and now known to have been measured with contrast
excluded from consideration entirely, on every page, rather than checked and
found clean. That distinction was the same one
`a11y-external-coverage-reference/` made for the `eaa-wcag-triage` engine's own
coverage statement, applied here to this directory's measurement of it.

## Finding 5 (2026-08-22): the filter Finding 1 asked for, built and measured

Finding 1 prescribed a build-artifact filter and left it unbuilt; three files
across `portfolio/` still recorded it as the outstanding item on this
candidate's customer-facing record. It is now
[`provenance.py`](../../pipeline/probes/eaa-wcag-triage/src/wcag_triage/provenance.py),
and the corpus was rebuilt from all 7 apps to measure it rather than to argue
for it.

**It removes exactly the 7 findings Finding 1 identified and nothing else.**

| | pages | findings |
|---|---:|---:|
| Corpus (at this measurement; 781 once 1.4.1 landed later the same day) | 118 | 780 |
| Excluded as build-tool output | **7** | **7** (all 3.1.1) |
| — `next-error-shell` (Next 16) | 2 | 2 |
| — `next-builtin-error-page` (Next 14/15) | 5 | 5 |
| Pages an error-page-*by-filename* filter would also have taken | **7** | — |

The last row is the measurement that matters, because it is the one a cheaper
implementation fails silently. Every `_not-found.html` in the corpus — one per
app, 7 of them — is the project's own page, and a filter keyed on error-page
filenames deletes all 7 from the customer's audit and reports nothing unusual.

**Two findings fell out of building it, and each refutes a plausible design.**

1. **One framework emits two entirely different shells, and the first draft of
   this filter caught 2 of 7.** Finding 1 recorded the marker as
   `<html id="__next_error__">`, which is correct — for Next 16. This portfolio
   runs three majors, and Next 14.2.35 and 15.5.23 instead emit a Pages Router
   document with a bare `<html>` and Next's built-in error component in the
   body. Implemented from Finding 1's description alone, the filter excluded
   `local-site-studio` and `quick-pick-survey` and left the other five apps'
   `500.html` in the record — a filter that looked finished, passed its tests,
   and collected 2 of the 7 false positives it was written for. Only rebuilding
   the corpus showed it. (Note what this means for [#372](https://github.com/Duncan-Haywood/monorepo-projects/pull/372),
   the pending `next@16.3.1` upgrade: merging it moves six of these apps from
   the second shell to the first. Both are handled, so the filter's result does
   not change — but a single-marker filter would have silently changed
   behaviour on a framework bump.)
2. **The obvious marker for the second shell is in 106 of 138 documents.**
   Next's built-in error component is identified by `next-error-h1`, and
   grepping for that string matches almost the whole corpus, because Next
   inlines a stylesheet naming that class into every ordinary page for the
   client-side error boundary. As a parsed *element* it appears in 16
   documents — and 11 of those 16 are the projects' own `404`/`_not-found`
   pages, which render that same built-in component *inside the project's own
   root layout*. So the component alone is not enough either. What separates
   the 5 from the 11 is that the framework's document has **no attributes at
   all on `<html>`** — no `lang`, no class, nothing any layout of the project's
   put there. That conjunction is the rule, and it is why the exclusion can be
   defended to a customer rather than merely applied to them.

**What this does to the numbers Finding 1 published.** Of the 67 hand-reviewed
findings, 55 were confirmed, 4 contested and 8 false positives; the filter
removes 7 of the 8, all of them the framework `lang` finding, leaving the
`display:none` control as the only false positive a reader still meets. On that
denominator the record's precision is **0.917–0.983**, against the engine's
0.821–0.881. **The figure printed to customers has deliberately not been raised
to it.** The revision would rest on this engine's own filter rather than on a
second review by hand, and precision is the number that protects the buyer:
overstating it is the direction that costs them and pays us. The record instead
prints the measured 0.821–0.881 and says outright that the filter makes it a
floor rather than an estimate.

**A side effect worth recording.** The corpus was rebuilt from scratch across
all 7 apps to take this measurement, and every field of the new results file is
identical to the committed 2026-08-21 run except the new `provenance` key —
same 118 pages, same 780 findings, same 91/118 agreement. That independently
confirms that [#601](https://github.com/Duncan-Haywood/monorepo-projects/pull/601)'s
fix to the shared CSS reader moved nothing on this corpus, which was asserted
for `a11y-contrast-decidability` and had not been checked here.

## What could not be measured here

- **No render, no interaction, no assistive technology, beyond contrast.**
  Finding 4 closed the gap on 1.4.3. The rest of what both engines mark
  `manual` — keyboard operability, focus order and visibility, target size,
  error identification — is still untouched by a build-directory corpus with
  no browser and no interaction. On the candidate's own economics this is the
  deliberate contractor step, and nothing in this directory shrinks it.
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

   **Done, 2026-08-22: see [Finding 5](#finding-5-2026-08-22-the-filter-finding-1-asked-for-built-and-measured).**
   It removes exactly those 7 findings and keeps the 7 project pages a
   filename-shaped filter would have taken with them. No score moved: the
   record's precision on the hand-reviewed denominator rises to 0.917–0.983,
   and the figure printed to customers was deliberately left at the measured
   0.821–0.881.
2. The two-engine attribution divergence is not a residual. It sets the
   criterion cited on 22.9% of real pages, and the record is the product.

The candidate's own liability position — *state coverage limits in the product,
not in the terms* — is the reason both belong here rather than in a backlog. A
record that lists a framework's internal error document as a customer's
blocking defect states its coverage inaccurately in the direction that flatters
the seller.

## 2026-08-22 — re-measured after four new criteria, corpus unchanged

`eaa-wcag-triage` gained rules for 2.2.1, 2.2.2, 2.4.1 and 3.1.2 (see
[`a11y-external-coverage-reference/`](../a11y-external-coverage-reference/)
Findings 5–6). The corpus was rebuilt from all 7 apps and re-measured to find
out what they add here.

**They add nothing, and the committed results file is unchanged** — 780
findings, every page identical field for field. That is worth stating rather
than passing over, because the first run was not clean:

The 2.4.1 rule initially produced **one** finding, on
`ventures/quick-pick-survey`'s `/app` route, and hand-checking it in a browser
showed it was a false positive. The prerendered file has a `<nav>`, no
`<main>`, no heading and no in-page link. The delivered page has a `<main>` and
a heading — the prerender's whole content region is the string `Loading…`, and
the rest is rendered client-side. axe-core passes the delivered page.

This directory found the mirror image of that once already: Finding 1's
false positives were the *build tool's* own error documents, pages no venture
wrote. This is a different failure of the same corpus. A build directory holds
documents that are not the customer's page (fixed by the provenance filter),
**and** it holds pages that are not yet the page they will be. Contrast
survives a prerender because the colours are in the stylesheet either way;
structural criteria — landmark, heading, skip link — do not.

So the four new rules are exercised by **nothing** in this corpus, and the
right reading of their zero findings is *out of scope of this measurement*, not
*clean*. Settling them needs a rendered corpus; the Playwright harness in
[`a11y-axe-recall/`](../a11y-axe-recall/) is where one would start.

## 2026-08-22 (second pass) — SC 1.4.1, and the first defect one engine sees and the other does not

`eaa-wcag-triage` gained a rule for **1.4.1 Use of Color** — the last of the
eight criteria [`a11y-external-coverage-reference/`](../a11y-external-coverage-reference/)
disclosed as `unimplemented`, and the only one of the four left after 2026-08-22
that was a genuine gap. The corpus was rebuilt from all 7 apps and re-measured.

**One finding, and it is corroborated by the reference engine node for node.**
`ventures/photo-editing/docs-site`'s `index.html` carries a link inside a
callout paragraph — *"See [Site security] for..."* — painted `#38bdf8` against
prose in `#e8edf7`, **1.825:1**, with the underline removed and nothing else
marking it. axe-core 4.13.0's `link-in-text-block` reports exactly that node on
exactly that page and nothing else in the corpus, which is the strongest
agreement any rule here has had on its first out-of-sample run.

| | count |
|---|---:|
| `<a href>` in the corpus | 1380 |
| Examined (inside prose, not a block of their own) | **123** |
| Decided | 122 (99.2%) |
| Undecidable (`translucent-text`) | 1 |
| Failures | **1** |

Corpus findings 780 → **781**; everything else re-derives field for field.

**Engine agreement drops 91/118 → 90/118, and the new disagreement is the
first one that is not a relabelling.** Every prior disagreement was the two
engines giving the same defect different criterion numbers. This one is a
detection gap: the probe reports 1.4.1 and `audit.py` has no rule for it and
declares it `unimplemented`. That is the honest state — the sibling engine is
not wrong about this page, it is silent about it — and
`test_the_one_disagreement_that_is_not_a_relabelling_is_named` pins it by name
rather than weakening the old claim to "some disagreements are fine".

**What the rule got wrong before it got this right** is the part worth keeping,
because none of it was visible from the fixtures:

1. **A fixed "surrounding text" floor of 25 characters over-reported 6:1.** The
   five extra findings were file-list rows — `<li><a>Long report title</a> —
   <code>file.html</code></li>` — where the caption clears any short floor and
   the link is still the row. Replaced by the reference engine's own scale-free
   comparison: the prose has to be *longer than the links*.
2. **Reading a Tailwind reset as "nobody said anything" passed 152 links that
   are not underlined.** `a { text-decoration: inherit }` overrides the UA
   underline; the value then comes from the paragraph, which is `none`. Before
   the fix, every link on every Tailwind page in this corpus counted as
   underlined and the rule could not have fired on any of them.
3. **Three of the five remaining findings were flex-row header buttons.** A
   flex or grid container blockifies its children, so those links are boxes
   beside a heading, not phrases inside it — visible in a computed style, and
   in the *parent's* declaration, but not in the link's own.

Each was found by measuring against a browser rather than by reading the rule,
and each is now a named test case.

**Cross-checked against Chromium, every examined link, not just the failure.**
For all 123 links the rule examined, the computed `text-decoration-line`,
`display` and colours were read out of a real browser and compared against what
the static reader concluded: **0 disagreements**. Three `quick-pick-survey`
pages are excluded from that cross-check — their delivered DOM has more links
than the prerender, the same client-rendering limit this corpus hit above.

**Amended 2026-08-24.** The detection gap named above closed in the engine:
`audit.py` now has the same 1.4.1 rule. The committed snapshot in this
directory is still the 2026-08-22 run (90/118, one non-relabelling
disagreement) and was not rebuilt; a later pass that re-measures the 118
pages is what would move those numbers, not this amendment.

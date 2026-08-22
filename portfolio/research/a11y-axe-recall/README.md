# Out-of-sample recall, against an independent third detector

Built and measured 2026-08-21. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-axe-recall
python3 -m unittest discover                                     # 10 tests
python3 measure.py --recompute-from results-2026-08-22.json      # offline
# to regenerate: npm ci && npm run build in each of the 7 apps, then
npm install axe-core@4.13.0 playwright@1.56.1 --no-save          # not committed
python3 measure.py --repo-root ../../.. --out results.json
```

## Why this was built

[`a11y-external-coverage-reference/`](../a11y-external-coverage-reference/)
closed on the one asymmetry nothing in this repository had measured:

> out-of-sample **precision** is measured — 0.821–0.881, over 118 built pages
> ([`a11y-own-sites/`](../a11y-own-sites/)). Out-of-sample **recall** is not
> measured anywhere. The only recall number in the repository is **1.0**,
> against the three-page fixture set written alongside the engine [...] The
> cheapest honest next step is to run axe-core itself over the 118-page corpus
> and diff — [...] a genuinely independent third detector rather than two
> engines with a shared author lineage [...] It needs a headless browser,
> which is why it is named here rather than done.

That headless browser (Playwright + Chromium) and axe-core itself
(`registry.npmjs.org`, already measured reachable) were both already available
in this environment — nothing named as a blocker needed installing. This
module runs axe-core 4.13.0 against every page of the same 118-page corpus
`a11y-own-sites/` built, and for every (page, criterion) pair axe-core flags
that either in-house engine claims to detect (`COVERAGE`/`CHECKS`,
`automated`/`partial`), asks whether at least one of our engines flags it too.

**axe-core is a reference, not ground truth** — the same caveat
`a11y-external-coverage-reference/` states applies here. It is one vendor's
automatable subset of WCAG. What this supports is the one thing an
independent detector can: agreement with a tool that does not share this
repository's authorship, which neither the fixture set nor the two in-house
engines' mutual agreement can.

## Finding 0 — the first run measured the wrong thing, and the reason is a bug worth naming on its own

The first attempt at this measurement returned **recall = 0.200** (8 of 40
axe-flagged instances corroborated). Before trusting that number, two things
were checked and both were real bugs in *this* module, not in either engine:

**Loading a prerendered page via a bare `file://` URL cannot resolve its own
CSS.** A Next.js build emits `<link href="/_next/static/css/x.css">` —
absolute from the site root in production, meaningless from a `file://`
document. Axe-core ran against a completely unstyled DOM, which spuriously
manufactured a `4.1.2` finding on an element `display:none` legitimately
excludes (`print-atelier`'s hidden capture input — the same element
`a11y-own-sites/` already documented as a deliberate non-fix) and spuriously
suppressed nothing, because an unstyled page has no colour to fail contrast
on. **Fixed**: `run_axe.mjs` now intercepts every sub-resource request by
`pathname` (`/_next/...` → `<appDir>/.next/...`, `/...` → `<appDir>/public/...`)
regardless of the browser's bogus `file://` origin for it, so axe sees the DOM
a real browser would render.

**With real CSS loaded, axe found many *more* contrast (1.4.3) failures — and
neither in-house engine caught any of them, because neither engine was ever
given the stylesheet to check against.** `wcag_triage.engine.audit_html` and
`audit.audit_source` both take an optional *parsed, linked* stylesheet
argument, and both say plainly what happens without one —
`audit_html`'s own docstring: *"With no stylesheet at all the colour rules
simply find nothing to decide."* [`a11y-own-sites/audit_own_sites.py`](../a11y-own-sites/audit_own_sites.py)'s
adapters (`probe_findings`, `audit_py_criteria`) call both engines with **no
stylesheet at all**, on a corpus that is 100% Next.js build output — CSS
always linked, never inlined. So across all 118 pages of that study, **1.4.3
was structurally incapable of firing**, regardless of what the page's actual
colours were. This is a real, confirmed gap in a directory already merged and
cited by the pipeline's liability score, worth its own fix — not applied here,
because correcting it means regenerating and re-verifying `a11y-own-sites/`'s
own committed numbers and prose, which is a separate, careful pass, not a
side effect of this one. Flagged plainly rather than silently worked around.

**This module's own adapters pass the stylesheet.** `stylesheet_for_app`
reads every `*.css` under `<appDir>/.next` (or `out`/`dist`), the same way
[`a11y-contrast-decidability/`](../a11y-contrast-decidability/) already
gathers it, merges it with `audit.merge_stylesheets`, and feeds the same
parsed sheet to both engines and to the CSS-resolving proxy axe-core sees.
`test_measure.py::StylesheetMatters` pins the behavioural difference directly:
a synthetic low-contrast page produces **no** 1.4.3 finding from either engine
with `stylesheet=None`, and **both** flag it once the linked stylesheet is
supplied — so a future edit that drops the argument fails a test instead of
silently reintroducing this bug here.

**Both bugs push the same direction — toward an artificially low recall
number** (axe sees more of the page than it should on one side; our engines
see less of it than they should on the other). Fixing them raised the
measured recall from 0.200 to 0.975. That is the headline result, and it says
more about how easy it is to build a misleadingly bad recall measurement than
about either fixed number alone: **the harder failure mode to catch here was
not "the engine missed a defect" — it was "the harness never asked the
question it thought it was asking."**

## Finding 1 — out-of-sample recall is 0.975, on real CSS this time

| | n |
|---|---:|
| axe-flagged (page, checked-criterion) instances | 40 |
| corroborated by at least one in-house engine | **39** |
| missed by both | **1** |
| **recall** | **0.975** |

Checked-criteria universe: the 13 success criteria either engine's coverage
catalog declares `automated`/`partial` — `1.1.1, 1.2.2, 1.3.1, 1.4.2, 1.4.3,
1.4.4, 2.4.2, 2.4.3, 2.4.4, 2.4.6, 3.1.1, 3.3.2, 4.1.2`. A further 3 instances
(`1.4.1` on one page, `2.1.1`/`2.1.3` on another) are axe findings *outside*
this universe — criteria neither engine claims to check at all. Those are not
misses; they are the same already-disclosed coverage gap
`a11y-external-coverage-reference/` measured, corroborated again here rather
than counted against recall for a criterion nobody claimed to cover.

**The one surviving miss is not new.** `real-estate-agent-photo-app/docs-site
strategy.html`, `4.1.2`, `<input type="checkbox" disabled checked>` — the
identical element `a11y-own-sites/` already recorded in its **contested**
category: a disabled, unfocusable control in a rendered Markdown task list,
where whether it still owes an accessible name is a normative reading of
1.3.1/4.1.2 this environment cannot settle (the WCAG spec host is
egress-denied). axe-core's `label` rule takes the position that it does. Two
independent measurements now agree this is the one open question in the
corpus, not a detection gap in either in-house engine.

**Every one of the 39 matches is on 1.4.3 or 3.1.1** (the only criteria this
particular corpus's real defects happen to exercise once contrast is properly
checked) — this corpus does not exercise most of the 13-criterion universe at
all, which the sibling `only axe` table above documents rather than hides.

## What this changes for the pipeline

[`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md)'s
`liability_containment` sits at 5 — the gate — on the strength of a coverage
*disclosure* fix (Finding 1 of `a11y-external-coverage-reference/`) and an
explicit open question: *"What would settle it is the false-negative rate,
[...] and the only recall number anywhere is 1.0 against the three-page
fixture set."* That number now exists, is not 1.0, and is not from a fixture:
**0.975 out-of-sample recall, against an independent detector, on real built
pages** — with the one exception being the same contested normative case
already on record rather than a fresh detection failure.

This is evidence *for* the mitigation holding, not against it — the opposite
direction from every measurement `a11y-external-coverage-reference/` and
`a11y-own-sites/` made. It does not by itself move the score: the corpus is
small (118 pages, one venture concentrating almost all of the real defects),
narrow (2 of 13 checked criteria actually exercised), and the false-negative
question was previously open in the *pessimistic* direction, so a first
recall measurement landing this high is one data point, not a settled
false-negative rate. Recorded here as evidence rather than as a score change;
a wider corpus (the `local-site-studio` generated-sites product, or a
non-portfolio-authored WCAG test corpus) would be the way to raise it above
one data point.

## What was not done

- **`a11y-own-sites/`'s missing-stylesheet bug is not fixed here.** Finding 0
  names it precisely enough to fix in a dedicated pass: pass
  `stylesheet_for_app`'s equivalent into `probe_findings`/`audit_py_criteria`,
  then rebuild the corpus, re-run, and re-verify every number that pass's
  README quotes (precision, the two-engine agreement table, the by-app defect
  breakdown) — all of which may shift once 1.4.3 can actually fire. **Done,
  same day, in that directory's own
  [Finding 4](../a11y-own-sites/README.md#finding-4-2026-08-21-the-adapters-never-fed-either-engine-a-stylesheet):**
  the fix (and a second bug it caught first — the naive port of this
  module's own `css_for_app` searched the wrong build subdirectory and found
  nothing) is verified against this directory's own corroborating fail counts
  for the two ventures both cover (333 and 21). Agreement moved 89→91/118;
  precision (Finding 1) was not re-derived, since it was never about 1.4.3.
- **No new axe rule, no engine change.** Same discipline as every prior pass
  in this family: a pass that closed detection gaps by writing rules would be
  measuring its own work instead of the engines as they exist.
- **The contested checkbox is not re-litigated.** Same reason
  `a11y-own-sites/` gave: settling it needs the normative spec text, which is
  egress-denied from here.

## 2026-08-22 — re-run after four criteria became rules

`eaa-wcag-triage` implemented 2.2.1, 2.2.2, 2.4.1 and 3.1.2 (see
[`a11y-external-coverage-reference/`](../a11y-external-coverage-reference/)
Finding 5), which widens what this measurement holds the engines to: a
criterion the engines merely *disclosed* was set aside as a known coverage gap,
and one they *claim* counts for or against recall.

Re-run live against a rebuilt corpus, same browser, same pinned axe-core:

- **Checked-criteria universe 13 → 17.**
- **Recall unchanged: 39/40 = 0.975**, the same single miss (4.1.2 on
  `real-estate-agent-photo-app/docs-site/strategy.html`, the already-contested
  checkbox). Widening the claim brought no new axe-flagged instances with it,
  because axe reports **none** of the four anywhere in these 118 pages.
- **The raw axe output reproduces the 2026-08-21 run field for field** across
  all 118 pages — an incidental but useful confirmation that the corpus
  rebuild and this harness are both deterministic.
- Still 3 axe-flagged instances outside the universe: **1.4.1**, 2.1.1, 2.1.3.

That 1.4.1 instance (`photo-editing/docs-site/index.html`) is now the sharpest
open item in this family. It is the **only** criterion that a default axe run
reports, that fires on this portfolio's own corpus, and that neither in-house
engine has any rule for — the three other criteria left unimplemented rest on
axe rules that ship disabled or experimental and never fire at all.

The results file is renamed `results-2026-08-22.json` for the date of this run,
matching how `a11y-own-sites/` keeps a single current file.

**Still no engine change from this directory.** The four rules were written in
the probe, against the coverage catalog, and this module re-measured them; it
did not author them.

## 2026-08-22, later the same day — 1.4.1 became a rule too, unmeasured here

`eaa-wcag-triage` gained `rule_use_of_color` for SC 1.4.1 in a second pass —
see that probe's README. `measure.checked_criteria()` now includes 1.4.1, and
`CheckedCriteria`'s tests were updated to match: the assertion that 1.4.1 is
*not* checked, quoted above as "the sharpest open item," is no longer true of
the code and had to be removed rather than left to rot.

**What did not happen: a re-run.** `results-2026-08-22.json` is untouched, and
its own `checked_criteria` is still the 17-item universe from before this
rule existed — it does not include 1.4.1, and this file's `SavedResults` tests
were deliberately left asserting exactly that frozen snapshot. Producing a
real answer needs the same thing the first re-run above needed: the actual
built corpus and a live axe-core pass, neither of which this offline session
had. So the one fact this directory exists to establish — whether
`rule_use_of_color` actually catches the real instance on
`photo-editing/docs-site/index.html` axe already found — is still unknown.
Widening the claim without measuring it is exactly the gap Finding 0 named for
the stylesheet bug: a claim is not evidence until it is run.

The next re-run should rebuild the corpus, re-run `measure.py`, and report
whether the checked-criteria universe holds at 39/40 = 0.975 or moves either
way — the same three questions the 2.2.1/2.2.2/2.4.1/3.1.2 pass above already
answered for its four criteria, still open for this fifth one.

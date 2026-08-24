# The audit pass, and how much of it a template can decide

Built and measured 2026-08-20. Re-runnable:

```bash
cd portfolio/research/a11y-evidence-record
python3 -m unittest discover                          # 186 tests, no dependencies
python3 measure_themes.py --recompute-from results-2026-08-20.json   # offline, pre-contrast
python3 measure_themes.py --recompute-from results-2026-08-21-contrast.json  # offline, with 1.4.3
python3 audit.py <path> --record --scope "<subject>"  # produce a record
python3 audit.py <path> --stylesheet theme.css --record --scope "<subject>"  # + contrast (1.4.3)
```

## Why this was built

[`portfolio/pipeline/candidates/eaa-remediation-pipeline.md`](../../pipeline/candidates/eaa-remediation-pipeline.md)
is the pipeline's highest-composite candidate (7.25), carries a **build-now**
verdict, and is the only build-now candidate with nothing built for it. Its
first experiment opens:

> "Build the audit-and-fix pass against three real shop themes; measure how many
> blocking issues the generated fixes actually close under AT verification."

The second half needs a contractor with a screen reader and cannot be done by an
unattended session. The first half can be, and had not been. Two candidates
depend on it — [`shopify-a11y-evidence`](../../pipeline/candidates/shopify-a11y-evidence.md)
sells the same audit through a different channel.

This directory is that pass, plus the write-up's deliverable 4 — *"a dated file
listing what was tested, with what tool or AT, what changed, what remains open
and why"* — as a function rather than a promise.

## What is here

| File | What it is |
|---|---|
| [`audit.py`](audit.py) | Static WCAG 2.2 AA checks over HTML, Liquid, Twig, Blade/PHP, EJS, Vue and Svelte templates, plus `evidence_record()` |
| [`contrast_pass.py`](contrast_pass.py) | SC 1.4.3 and SC 1.4.1, ported from the sibling engine's resolvers rather than reimplemented — see finding 5 and the 2026-08-24 amendment |
| [`test_audit.py`](test_audit.py) | Standard-library `unittest`, no install step |
| [`measure_themes.py`](measure_themes.py) | Runs the pass over published storefront themes on npm and reports the distribution |
| [`results-2026-08-20.json`](results-2026-08-20.json) | Every per-package row behind findings 1-4 (pre-contrast) |
| [`results-2026-08-21-contrast.json`](results-2026-08-21-contrast.json) | Every per-package row behind finding 5 (contrast), same 22 pinned packages as above |
| [`measure_stylesheet_reachability.py`](measure_stylesheet_reachability.py) | The reachability-only scan behind the superseded amendment below finding 5 |
| [`results-stylesheet-reachability-2026-08-21.json`](results-stylesheet-reachability-2026-08-21.json) | Raw rows behind that scan |
| [`example-record-2026-08-20.md`](example-record-2026-08-20.md) | A record generated against this portfolio's own HTML |

Standard library only, in both scripts. Read-only: `audit.py` has no write path
into anything it audits, and `measure_themes.py` reads the public npm registry
and sends nothing.

## Amendment, 2026-08-21 — the coverage boundary had a hole, and it is closed

Finding 1 below is the right design and it was **not fully implemented**. The
boundary it assembles is only honest if every criterion the engine reasons
about lands in one of the record's two lists. Two did not.

Run for the first time against this portfolio's *other* WCAG engine
([`pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/)),
`audit.py` was found to check neither **1.2.2 Captions** nor the
`aria-hidden`-on-a-focusable-control case of **4.1.2**, and to list neither in
`NOT_TESTED` — so a record said nothing at all about them, which a reader can
only read as "checked and passed." On the hand-labeled fixture set that gave
`audit.py` recall **0.857** against the sibling engine's 1.0.

Both checks are now implemented, and `CoverageBoundaryIsComplete` in
[`test_audit.py`](test_audit.py) asserts the invariant that would have caught
it: no criterion is both checked and declared untested, and every statically
reachable criterion appears in one list or the other. Suite is 61 → 75 tests.

**Consequence for the numbers below:** the headline counts (286 findings,
63.2% undecidable across twelve npm storefront themes) were produced before
these two checks existed, so the finding count is a **lower bound by an unknown
margin**. Re-deriving it needs `measure_themes.py` to re-fetch the twelve
tarballs; `--recompute-from` cannot do it, because the saved rows hold
per-package results rather than the markup. The measurement and the full
reasoning are in
[`../a11y-engine-agreement/`](../a11y-engine-agreement/).

## Finding 1 — the record cannot be published without its own coverage boundary

This is a design result rather than a measurement, and it is the part that
matters most for liability. The candidate's rule is:

> **Never sell an overlay, and never sell "compliance."** … Deliverables state
> what was tested and when — a record, not a warranty.

A disclaimer in a template is not that rule; it is a sentence someone can
delete. So the list of success criteria the tool *cannot* test is assembled
inside `evidence_record()`, in the same structure and the same function as the
findings. A caller cannot emit findings without also emitting the seventeen
criteria — contrast, reflow, focus visibility, keyboard operation, alt-text
*quality*, and whether a real screen-reader user can complete checkout — that
static analysis does not reach. `test_record_carries_its_coverage_boundary_even_with_no_findings`
pins it for the case where it is most tempting to omit: a subject with nothing
found. [`example-record-2026-08-20.md`](example-record-2026-08-20.md) is exactly
that case, and it is 52 lines of which 24 are the coverage boundary.

The third answer is the other half of it. A template that emits
`alt="{{ image.alt }}"` has an alt attribute whose value is unknown until render.
Calling that a pass overstates coverage; calling it a failure invents a defect
against a customer's markup. It is counted as **undecidable** and reported as an
open item. Every template-expression test in `test_audit.py` asserts an *empty*
findings list, not merely a non-empty undecidable list.

That third answer turned out to be the measurement.

## Finding 2 — on templates, most of the audit surface is undecidable

22 published storefront-theme and storefront-template packages on npm; 1,219
template files; 15,565 elements.

| | n |
|---|---:|
| Findings | 286 |
| — blocking | 235 |
| — degrading | 51 |
| **Undecidable without rendering or store data** | **491** |

**63.2%** of everything the audit touched is undecidable — and on the four
checks where "undecidable" is even a possible answer (a template expression can
supply an image's alt text, a link's text, a button's label, or a control's id,
but cannot supply a `lang` attribute), it is **70.4%**. The restricted figure is
the honest one: measuring against all sixteen checks would let the ratio be
moved by adding checks that can never be undecidable.

Per package, on the 11 packages with at least ten items either way:

| p25 | median | p75 | p90 | max |
|---:|---:|---:|---:|---:|
| 18.2% | **70.3%** | 83.1% | 89.3% | 96.9% |

The candidate's write-up cites, from secondary sources, that *"automated tools
catch roughly a quarter to a third of WCAG issues"* — a claim about **rendered
pages**, and the reason the write-up scores `autonomous ops: 6` and prices a
contractor into every job. A remediation vendor does not edit rendered pages. It
edits templates, and at that stage a second gap opens underneath the first one:
most of what the audit can see is a variable.

**The important part is which gap it is.** The undecidable class is not
contractor work. Rendering the shop's own pages with the shop's own data closes
almost all of it — it is a build step, not a hire. So this finding argues that
the pipeline needs a render stage before the audit stage, and that a
template-only audit sold as a deliverable would be reporting on about a third of
what it appears to cover. It does **not** argue that `autonomous ops: 6` is
overstated; if anything the automatable fraction is larger than scored, once the
render step exists.

## Finding 3 — the automatable work concentrates in two defect classes

| check | success criterion | severity | n |
|---|---|---|---:|
| `button-no-accessible-name` | 4.1.2 Name, Role, Value | blocking | 88 |
| `control-no-label` | 3.3.2 Labels or Instructions | blocking | 79 |
| `title-missing` | 2.4.2 Page Titled | degrading | 24 |
| `link-no-accessible-name` | 2.4.4 Link Purpose | blocking | 23 |
| `heading-level-skipped` | 1.3.1 Info and Relationships | degrading | 21 |
| `img-alt-missing` | 1.1.1 Non-text Content | blocking | 16 |
| `html-lang-missing` | 3.1.1 Language of Page | blocking | 16 |
| `iframe-no-title` | 4.1.2 Name, Role, Value | blocking | 12 |
| `data-table-no-header` | 1.3.1 Info and Relationships | degrading | 6 |
| `viewport-scaling-blocked` | 1.4.4 Resize Text | blocking | 1 |

Two checks — unnamed buttons and unlabelled form controls — are **58% of all
findings and 71% of blocking ones**. Both are icon-button and bare-`<input>`
patterns, both are mechanical to fix, and both sit on exactly the paths the
write-up says to prioritise (checkout and forms). Notably, the defect the
category is popularly associated with, missing image alt text, is 16 findings —
5.6%. Whatever a generated-fix pass is worth, it is worth it on naming controls,
not on writing alt text.

## Finding 4 — per-theme variance is wide enough to matter for fixed-price work

Blocking findings per 1,000 elements, across the 22 packages:

| p25 | median | p75 | p90 | max |
|---:|---:|---:|---:|---:|
| 0.0 | 5.25 | 15.6 | 48.2 | 218.8 |

**7 of 22 packages have zero blocking findings**; one has 218 per thousand
elements. The candidate sells *"a fixed-price job, not a subscription"* at
€900–€1,800. On this sample the static workload behind that price varies by more
than an order of magnitude between themes, with a long right tail, and nothing
visible before the audit runs predicts which end a given shop is at.

That is an argument for running the audit as a free qualification step before
quoting — which the candidate can do at zero marginal cost, since the audit is
this file — rather than an argument against fixed pricing. It is also the first
concrete input to the `gross margin: 7` score, which was reasoned rather than
measured.

## Finding 5 — the port was built, not just scoped; on templates it is mostly undecidable, and the reachability study said why before the port existed to measure it

[`../a11y-engine-agreement/README.md`](../a11y-engine-agreement/README.md)
named porting #523's colour-contrast resolver here — against unrendered
*templates* rather than the *rendered* pages it measured at 98.76% decidable
— "an open question rather than a port." A **concurrent session answered half
of that question first, without building the port**: the amendment below this
one (now superseded, kept for the record) measured *reachability* —
[`measure_stylesheet_reachability.py`](measure_stylesheet_reachability.py)
scanned the same 22-package, pinned-version corpus as `results-2026-08-20.json`
for stylesheet files and expression-built classes, found 9 of 22 packages ship
any literal `.css` at all (the rest is Sass/Less source, or nothing), and
concluded a resolver "is not proposed here." [`contrast_pass.py`](contrast_pass.py)
is that resolver anyway, built independently in a session that had not yet
seen that conclusion when it started, and then re-run — after the collision
surfaced — against the same pinned corpus for a like-for-like comparison
rather than reconciling by narrative alone.

**The reachability study's central number holds under an independent build:
9 of 22 packages, exactly.** That is strong cross-validation of two different
scanning methods (a bespoke reachability scan and this module's own
`css_from_tarball`) landing on the same figure. Where the two accounts differ
is the conclusion, not the count. The reachability study treated "most
packages have no reachable stylesheet" as a reason not to build a resolver for
the ones that do; measuring what the resolver actually does with those 9 says
that reasoning proves too much — the sibling engine does not decide 100% of
rendered-page contrast either (98.76%, not 100%), and this codebase's standing
principle is to resolve what is decidable and name what is not, not to decline
a whole criterion because it cannot cover everything. `contrast_pass.py`'s
guard against expression-built classes — the reachability study's other named
concern, measured there at 1.6% of class attributes corpus-wide — is real
defensive value in the resolver regardless of how it is scored, since a
falsely-resolved class is the failure mode this whole tool exists to avoid.

| | decidable | of |
|---|---:|---:|
| **All 22 packages** | **5.7%** | 1,392 |
| Restricted to the 9 packages with a literal `.css` file | **10.5%** | 760 |

`no-declared-color` — the honest "nothing here says what colour this is"
answer, identical to what a page with no stylesheet supplied gets — is 1,099
of 1,312 undecidables (84%) across the whole corpus, which is the
reachability study's finding wearing a different name: most of the corpus has
no stylesheet to resolve against, so most elements are undecidable for
exactly the reason that study measured. (A few of the 13 packages with no
`.css` file still resolve, or fail for a different reason, via their own
inline `<style>` blocks — `stylesheet_for()` reads those regardless of
whether an external sheet was found.)

Restricted to the 9 packages that do ship literal CSS, the picture is where
the resolver's own behaviour, not corpus coverage, decides the outcome — and
it is a wide, right-skewed spread, the same shape finding 4 measured for
blocking findings generally:

| package | CSS files | decidable |
|---|---:|---:|
| `@ecomplus/storefront-twbs` | 32 | **100.0%** (10/10) |
| `@pradip1995/create-storefront-app` | 1 | **69.4%** (25/36) |
| `fassbender-shopify-theme` | 3 | 23.3% (34/146) |
| `gatsby-shopify-theme` | 1 | 19.2% (10/52) |
| `@fleetbase/storefront-engine` | 1 | 0.7% (1/150) |
| `@zalify/theme-templates` | 119 | 0.0% (0/47) |
| `@ecomplus/storefront-template`, `@mcptoolshop/site-theme`, `create-brainerce-store` | 2, 2, 2 | 0.0% |

CSS *volume* does not predict decidability: `@zalify/theme-templates` ships
119 `.css` files — the most literal CSS in the corpus — and resolves none of
its 47 contrast-bearing elements, because its markup is the one this pass
guards against (`class-is-template-expression` and
`style-is-template-expression` account for 22 of `@zalify`'s 47 undecidables;
see the per-package rows in
[`results-2026-08-21-contrast.json`](results-2026-08-21-contrast.json) for
the rest). The undecidable reasons among these 9 packages are no longer one
reason wearing every case — `no-declared-color` still leads (507 of 680), but
`no-opaque-background` (46), `class-is-template-expression` (44, corpus-wide —
the guard, firing on real dynamically-classed wrappers, not hypothetically)
and `unresolvable-color` (39) all contribute a real share.
`unresolvable-font-size` is 22, entirely from one package
(`gatsby-shopify-theme`), consistent with a CSS-in-JS build this reader — by
design, plain-CSS only — cannot see.

**What this changes and does not change.** It does not roll back the sibling
engine's finding: a *rendered* page's contrast is 98.76% decidable, and that
number is untouched. It does not roll back the reachability study's
measurement either — 9 of 22, confirmed independently. What it changes is the
conclusion drawn from that measurement: 1.4.3 moves from `NOT_TESTED` to
`CHECKS` in this engine too (matching the sibling engine's `manual` →
`partial` move in #523), because a criterion this pass can decide *some* of,
honestly, is not the same as a criterion it cannot test at all — the same
distinction the coverage-boundary amendment above draws for every other check
in this file. For a remediation vendor running this candidate's audit-and-fix
pass against a theme's source, 1.4.3 is real but modest automatable coverage
(5.7–10.5% depending on whether the package ships CSS at all), not the
sibling engine's 98.76%. The honest path to that number is upstream of this
module: render the theme and hand the *rendered* page to the sibling engine —
named as its own follow-up in "What could not be measured here" below, since
it is a real piece of work and was not attempted here.

## Amendment, 2026-08-21 (superseded by finding 5 above) — the 1.4.3 contrast port is not generally buildable, measured

Landed on `main` by a concurrent session while this directory's finding 5 was
being built, and kept here rather than deleted, on the same principle
[`../a11y-engine-agreement/README.md`](../a11y-engine-agreement/README.md)
states for its own superseded amendments: a declared, dated divergence is not
the failure mode this repository's re-derivation problem is about, and
rewriting history to hide that two sessions reached different conclusions
from the same premise would be worse than showing the correction in place.

The measurement in this amendment is not wrong and is not superseded: finding
5 independently re-derives its central number (9 of 22 packages ship a
literal `.css` file) by a different method and gets the same answer. What is
superseded is the conclusion — "not proposed here" — which finding 5 revisits
by actually building the resolver this amendment declined to, on the same
premise that most of this codebase already uses everywhere else: decide what
is decidable, name what is not, rather than declining a whole criterion
because it cannot cover everything. See finding 5 for the numbers and the
reasoning against this amendment's original conclusion; the original text
below is preserved, with a small number of inline notes -- in parentheses, or
struck through -- marking exactly where finding 5 speaks to a specific claim
made here.

#523 ported colour-contrast decidability into `eaa-wcag-triage/` (the sibling
engine over *built* HTML output) and named porting the same resolver into this
engine's `audit.py` as a follow-up — flagged there as "non-trivial … an open
question rather than a port," because this engine reads *source* theme
*packages*, not a rendered page with one linked, compiled stylesheet. That
question is now measured rather than assumed, with
[`measure_stylesheet_reachability.py`](measure_stylesheet_reachability.py)
run against the exact 22-package corpus `measure_themes.py` audited (pinned to
the same names and versions, so both measurements describe the same
population). Raw rows in
[`results-stylesheet-reachability-2026-08-21.json`](results-stylesheet-reachability-2026-08-21.json).

The answer splits into two separate blockers, of unequal size:

| | packages |
|---|---:|
| Total | 22 |
| Ship **no** stylesheet file at all in the package | 7 (32%) |
| Ship a stylesheet, but only as Sass/Less **source** (no literal `.css`) | 6 (27%) |
| Ship at least one literal `.css` file | 9 (41%) |

**Blocker 1 — for 7 of 22 packages, the stylesheet is not in the package at
all.** `@nuskin/ns-shop-elements` (469 class attributes across 50 markup
files), `@vue-storefront/nuxt-theme` (399 classes, 45 files) and
`pinelab-storefront` (183 classes, 19 files) are representative: these are
component kits meant to be styled by a downstream consumer project, so there
is no CSS to resolve against — not undecidable, *absent*. No resolver design
closes this; the stylesheet genuinely is not there to read.

**Blocker 2 — of the 15 packages that do ship stylesheets, 469 files are
`.scss` against 161 `.css`, and only 9 packages ship any literal, unprocessed
`.css` at all.** `fassbender-shopify-theme` (the package #523's own template
port worked from) is representative of the majority case: 74 `.scss` files
against 3 `.css` files, and its `_variables.scss` opens with
`@import '../../node_modules/bootstrap/scss/variables'` and a `map-merge` —
real Sass control flow, not a file `css.py`'s selector-and-value parser could
read a colour out of without first running a Sass compiler. That is a
different kind of change than the port asked for: `eaa-wcag-triage/css.py` is
deliberately standard-library-only, no install step, per this portfolio's
research-tooling norm; adding Sass compilation means either a third-party
dependency or a per-package `npm install` + build step, which the corpus's own
`node_modules`-relative imports show would need the package's *own*
`node_modules` to resolve correctly — fragile in a way the current
zero-dependency, read-only design is not. (This part of the finding stands:
`contrast_pass.py` also does not compile Sass, and packages whose only
stylesheet is `.scss` source are indistinguishable, in finding 5's numbers,
from packages with no stylesheet at all — both report `no-declared-color`.)

**What is not blocked.** The class-attribute side of #523's concern —
"class names are often built from expressions" — measures as the *small*
problem: 138 of 8,591 class attributes (1.6%) carry a template expression
across the whole corpus. `audit.py`'s existing `is_expr`/`refs_can_match`
machinery already handles exactly this case for other attributes, so if a
resolvable stylesheet is ever available (say, a future stage that runs after
[`../a11y-render-recovery/`](../a11y-render-recovery/)'s theme-rendering step,
where the render already implies a Sass build happened), matching a class
attribute to a selector is the easy half. The stylesheet not being literal CSS
in the source package is the actual blocker, and it is concentrated rather
than evenly spread: of the 158 literal `.css` files in the whole corpus, 147
(93%) sit in just two packages — `@zalify/theme-templates` (117, and the only
package with zero `.scss` at all) and `@ecomplus/storefront-twbs` (30, a
compiled-Bootstrap bundle shipped alongside its own 204 `.scss` source files).
The other seven packages with any literal CSS have one to three files each —
plausibly a vendored reset or a single component stylesheet rather than the
theme's own styling, not checked further here. A resolver built against this
corpus would have real, non-trivial coverage on two packages out of
twenty-two and near nothing on the rest. (Finding 5's per-package table above
tests this prediction directly: `@zalify/theme-templates` in fact resolves
**0%** despite its 119 CSS files, for the reason -- heavily expression-built
classes -- named two paragraphs up in this same amendment; `@ecomplus/storefront-twbs`
resolves 100%, matching the prediction. The "near nothing on the rest" half of
the prediction undershoots what the built resolver found: `@pradip1995/create-storefront-app`,
with a single CSS file, resolves 69.4%.)

**Consequence.** ~~1.4.3 and 1.4.11 stay in `NOT_TESTED` for this engine, and
should — the reason given there ("needs rendered colours; stylesheets, theme
settings and images all participate") already covers this finding without
needing to be rewritten.~~ **Superseded by finding 5: 1.4.3 moved to `CHECKS`
on 2026-08-21, in the same commit that built `contrast_pass.py`.** 1.4.11
stays in `NOT_TESTED`, for the reason finding 5's own change to that list
gives (it needs rendered geometry, not just a declared colour, so a
stylesheet would not have resolved it regardless). The distinction from
`eaa-wcag-triage/` is not a gap in this engine; it is the two engines auditing
different artifacts (source template packages vs. one project's built output)
where only one of those artifacts ships a stylesheet a standard-library parser
can read, and read completely — see finding 5 for what a resolver actually
recovers from the fraction it can reach. Closing the *rest* of the gap for
template packages generally would need a Sass/Less build stage, which remains
a different, larger decision than a port and is still not proposed here.

**Amendment, 2026-08-24 — 1.4.1 moved the same way.** The sibling probe gained
Use of Color two days earlier and this engine declared it untested ("no rule
here looks"), which is the disclosed form of the asymmetry
`a11y-engine-agreement` exists to catch. The rule is now here too: same
resolver, same dynamic-class/style guard the 1.4.3 port already needed, plus
a guard on the surrounding-text owner (a sibling span's render-time class
can change the other side of the ratio). No score moved. The theme-corpus
decidable share was not re-measured; that is still finding 5's 1.4.3 figure,
not a 1.4.1 one.

**Amendment, 2026-08-24 — three markup rules, and the 3.1.1 overclaim.**
The sibling's 2026-08-22 pass added 2.2.1, 2.2.2 and 3.1.2 as rules; this
engine still listed them as "no rule here looks". They are now checks, with
the one template adaptation those rules need: a `lang` or refresh delay that
is a template expression is undecidable, never a guessed defect. The same
pass closed the 3.1.1 overclaim the sibling closed two days earlier —
existence was checked, validity was not, so `lang="engl"` read as clean.
Validity reuses the sibling's BCP-47 check rather than reimplementing it.
2.4.1, 2.5.3 and 1.3.4 stay disclosed-untested: the first two are still
decidable from markup and still have no rule here; 1.3.4 needs the CSS
adapter 1.4.1 used. Own-site / generated-site snapshots were not rebuilt.
No score moved.

**Amendment, 2026-08-24 — 2.4.1 and 2.5.3, the leftover markup pair.**
The two rows the previous amendment left disclosed are now checks. Same
sibling decisions (2.4.1's three gates including the content floor that
stopped a prerendered shell reading as a failure; 2.5.3's override-
contains-visible-text test, refusing image-of-text and glyph-only
labels), plus the template adaptation: an expression that could be a
skip-link href, a landmark role, or either side of a 2.5.3 comparison
is undecidable. 1.3.4 stays disclosed-untested -- it needs the CSS
adapter, not another markup walk. Own-site / generated-site snapshots
were not rebuilt. No score moved.

**Amendment, 2026-08-24 — 1.3.4, the leftover CSS-adapter row.**
The last disclosed-untested criterion that is decidable from the
artifact is now a check. Same sibling decision (a bare `html`/`body`
type selector rotating the page under a pure orientation query; class
selectors and breakpoint-combined queries left alone), plus the
template adaptation: a `transform` value that is an expression is
undecidable, never a guessed lock. Absence of a lock is a pass. Own-site
/ generated-site snapshots were not rebuilt. No score moved.

## What could not be measured here

- **No AT verification, so the candidate's actual kill criterion is untested.**
  *"Kill it if … AT verification finds that generated fixes close less than half
  of blocking issues"* needs a contractor with a screen reader. Nothing here
  moves that.
- **~~No generated fixes.~~ Closed 2026-08-24 for two classes, still true of
  every class that needs a name or a colour invented.** The audit half of
  "audit-and-fix" has been here since this directory was built. The first
  defect finding 2 of the theme-resolution pass recovered by hand -- a
  theme that prefixes the control id and forgets the matching
  `<label for>` -- is two strings, and the pairing is unique when exactly
  one control in the file has that literal as its trailing text after a
  separator. The CLI now prints those edits in the record as *proposed,
  not applied*, with the same "not a conformance claim" framing the
  findings already carry, and it never writes the customer's files.
  Applying a suggestion, reviewing it, and rolling it back remain the
  merchant's (or a contractor's) step, which is the write-up's own rule.
  Inventing alt text, a visible name, or a contrast colour is still not
  attempted: those are not determined by the markup. The third fassbender
  defect (a search field with no `<label for>` anywhere) still has no
  repair, because there is no label to rewrite -- the package-wide index
  can promote it to a finding and cannot write a name. A second class
  joined the same day: a viewport meta that lists literal
  `user-scalable=no` and/or `maximum-scale` below 2. Dropping those
  tokens, and only those tokens, is uniquely determined -- finding 3's
  single `viewport-scaling-blocked` row on `create-shopify-theme@0.0.5`
  is this shape. An expression-bearing token is left alone, because
  `maximum-scale={{ n }}` might already render at 3. No score moved.
- **~~`audit.py` over-reports `control-no-label` as undecidable, by 64.~~**
  Found 2026-08-20 by [`../a11y-theme-resolution/`](../a11y-theme-resolution/);
  **fixed in `audit.py` on 2026-08-21, and the predicted 64 was confirmed
  exactly.** This engine used to record the expression-*stripped* id
  (`id="{{ id_prefix }}FirstName"` became `FirstName`) and to skip any
  `<label for>` whose target contained an expression, so a control and its label
  could sit six lines apart in one file and still be reported undecidable.

  Expressions are now replaced by a sentinel that encodes a digest of the
  expression's own normalised source, so two attribute values built from the
  same expression compare equal and two built from different expressions do
  not. Measured as a controlled A/B over **1,121 identical markup files** (the
  same 18 packages audited twice, once with each engine):

  | | pre-fix | post-fix |
  |---|---:|---:|
  | `control-no-label` undecidable | 70 | 4 |
  | `label-for-id-mismatch` findings | 0 | 2 |
  | undecidable, all checks | 491 | 425 |
  | undecidable share | 64.3% | 60.7% |

  Raw per-check counts for both engines, and the pinned corpus at the exact
  versions audited, are saved in
  [`label-matching-ab-2026-08-21.json`](label-matching-ab-2026-08-21.json). The
  pre-fix column is this file's parent revision
  (`git show HEAD~1:portfolio/research/a11y-evidence-record/audit.py`), so the
  comparison can be re-run without trusting the table.

  **Exactly 64 resolved to a label in their own file** — the number
  `a11y-theme-resolution` predicted from the other direction, on a corpus
  assembled separately — and 2 more were promoted to findings. **No other
  check moved at all**, in either direction, which is the property that makes
  this safe to adopt. The 2 promotions are the real
  `fassbender-shopify-theme` newsletter defects at
  `theme/sections/newsletter.liquid:69` and `:83`, at the exact lines that pass
  reported by hand.

  Two limits worth stating. **The third hand-verified fassbender defect
  (`theme/templates/search.liquid:22`) is now recovered**, by the package-wide
  label index finding 3 named and left unbuilt. That file contains no
  `<label for>` at all, so from the file alone the label could genuinely live in
  another partial and `audit_source` still reports it undecidable -- a
  one-file invocation of a fragment must not promote "not in this file" to
  "not in the package". `resolve_package_labels` (and `audit_sources` /
  `audit_paths` / `measure_themes.py`, which all go through it) looks across
  the package: a certain match in another file clears the undecidable, a
  possible match stays undecidable, and no possible match anywhere is a
  `control-no-label` finding. A dead `for` on a *different* page is not
  treated as this control's mismatch -- that would confuse one template's
  defect with another's. The numbers in the body of this document are still
  the 2026-08-20 measurement, left as measured rather than retrospectively
  edited.
  [`../../pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/)
  is a separate HTML-surface engine that never stripped expressions, so it does
  not carry the original same-file defect and needs no corresponding change.
- **~~No rendered-page comparison.~~** Closed 2026-08-20 by
  [`../a11y-render-recovery/`](../a11y-render-recovery/), which classifies each
  of these 491 undecidables by the data it is waiting on. Headline: rendering
  the theme with no store data recovers 50.5%; 11.0% require the merchant's
  own content (per-store, not per-theme); the remaining 38.5% is undecidable
  even as to provenance from the template alone. "Almost all" from finding 2
  above unpacks into three shares, only one of which is a build step.
- **The corpus is npm, and npm is the wrong shelf.** The themes EU shops
  actually run come from the Shopify theme store and the WordPress.org
  directory. Neither is reachable: **`api.wordpress.org` is denied by this
  environment's egress policy** — a 403 on CONNECT, recorded by the proxy at
  `2026-08-20T11:15:31Z`. Per `/root/.ccr/README.md` that is an organisation
  policy denial, not a transient failure, and it was not retried or routed
  around.

  This sharpens a caveat in
  [`portfolio/research/free-listing-demand/README.md`](../free-listing-demand/README.md),
  which records that WordPress.org publishes no *"comparable per-listing usage
  figure through an API reachable from this environment."* Both halves of that
  sentence are true, but only the second is established: the host is blocked, so
  whether WordPress.org would supply such a figure is itself unverifiable from
  here. The practical consequence is the same either way and worth stating
  plainly — **no agent session in this environment can run the WordPress.org
  replication of that measurement.** Someone with a browser can; no amount of
  agent effort can.
- **n = 22 packages** (from 99 that matched the storefront-theme filter; the
  rest ship fewer than five template files, being SDKs and build tooling). Small,
  and the per-package percentile table should be read as indicative.
- **No render step for contrast.** Finding 5's 5.7%/10.5% is what `audit.py`
  can decide reading a template package as npm ships it — its own CSS files,
  merged, plus each file's inline `<style>` blocks. It does not render the
  theme and hand the *result* to the sibling engine, which is what would
  actually recover most of the gap to that engine's 98.76%
  ([`../a11y-render-recovery/`](../a11y-render-recovery/) measured exactly
  this recovery for the *other* undecidable classes: 50.5% from rendering
  alone, no store data needed). Building that pipeline stage — render, then
  hand off to `eaa-wcag-triage` — is a real piece of work of its own and is
  named here as the follow-up, not attempted in this pass.

## Amendment, 2026-08-24 — a clean record is no longer silent about whether the scanner can see

[`a11y-generated-sites`](../a11y-generated-sites/) named the cheap test that
separates "this page has no static defects" from "our scanner could not
read the page": mutate a copy, check the rule fires. The sibling probe
already ships that test inside every customer record. This engine's
`evidence_record()` is the same deliverable for templates, and until now a
clean record from here could not tell those two claims apart.

A `--record` run now mutates each page and prints the result above the
findings table, with a one-line headline so a miss is not
scroll-dependent. Tests that build a record from a fixture may omit it;
absence is not a pass. No score moved: this is the disclosure the
candidate's liability position already required, not a new measurement of
how often the engine is right.

## What this does and does not do to the pipeline

**Does not.** No candidate is added, no score is changed, no `ventures/`
directory is created, nothing is published, no account is registered, no
credential is used, and nothing is spent beyond agent time. The findings above
are inputs to the next scoring pass, in the same style as the amendment tables
in `distribution-first.md`; the scores in
[`candidates.yaml`](../../pipeline/candidates.yaml) are untouched, deliberately,
because several open pull requests are currently editing that file and a score
change from here would collide with them.

**Does.** It removes the "build now, nothing built" state from the pipeline's
top-ranked candidate, and it puts four numbers under scores that were reasoned:
the template-stage automation ceiling (finding 2), where the automatable work
actually is (finding 3), the per-job workload variance behind a fixed price
(finding 4), and, now that 1.4.3 is checked rather than declared manual, that
a template-stage audit cannot deliver the sibling engine's 98.76% contrast
figure without a render step first (finding 5) — which argues for that render
step being in scope for the pipeline rather than an optional extra.

## Status of these claims

Primary measurements against public data with the raw rows committed, on the
same standard as [`mcp-tool-drift`](../mcp-tool-drift/) and
[`free-listing-demand`](../free-listing-demand/). Findings 1-4 re-derive
offline from `results-2026-08-20.json`; finding 5 from
`results-2026-08-21-contrast.json`, which re-audits the *same* 22 pinned
packages at the *same* pinned versions as `results-2026-08-20.json` (not a
fresh npm search, which drifts day to day — an earlier draft of this finding
used a fresh search and got 17 packages; re-run against the pinned list
before publishing, for a population identical to findings 1-4's and to the
superseded amendment's reachability study). Both files re-derive via
`--recompute-from`; re-deriving the individual findings underneath either
file's rows needs a re-fetch, since the tarballs are not committed.

What is uncertain is generalisation, not the data: whether npm-published
storefront themes resemble the themes real EU shops run, and what a rendered
audit would recover from the undecidable class.

**These are not customer-facing claims and must not appear in copy.** The
per-package rows in the results file are static findings about published
packages under the same "record, not verdict" framing the tool itself enforces:
they state what the check saw, not that any package or any store using it fails
any requirement.

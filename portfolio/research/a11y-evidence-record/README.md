# The audit pass, and how much of it a template can decide

Built and measured 2026-08-20. Re-runnable:

```bash
cd portfolio/research/a11y-evidence-record
python3 -m unittest discover                          # 52 tests, no dependencies
python3 measure_themes.py --recompute-from results-2026-08-20.json   # offline
python3 audit.py <path> --record --scope "<subject>"  # produce a record
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
| [`audit.py`](audit.py) | 16 static WCAG 2.2 AA checks over HTML, Liquid, Twig, Blade/PHP, EJS, Vue and Svelte templates, plus `evidence_record()` |
| [`test_audit.py`](test_audit.py) | 52 tests, standard-library `unittest`, no install step |
| [`measure_themes.py`](measure_themes.py) | Runs the pass over published storefront themes on npm and reports the distribution |
| [`results-2026-08-20.json`](results-2026-08-20.json) | Every per-package row behind the numbers below |
| [`example-record-2026-08-20.md`](example-record-2026-08-20.md) | A record generated against this portfolio's own HTML |

Standard library only, in both scripts. Read-only: `audit.py` has no write path
into anything it audits, and `measure_themes.py` reads the public npm registry
and sends nothing.

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

## What could not be measured here

- **No AT verification, so the candidate's actual kill criterion is untested.**
  *"Kill it if … AT verification finds that generated fixes close less than half
  of blocking issues"* needs a contractor with a screen reader. Nothing here
  moves that.
- **No generated fixes.** This is the audit half of "audit-and-fix". Fix
  generation against a customer's theme is a write path into someone else's
  site, and the write-up's own rule — staging-only, rollback, first ten reviewed
  — describes work with a human in it.
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

  Two limits worth stating. The third hand-verified fassbender defect
  (`theme/templates/search.liquid:22`) is *not* recovered: that file contains no
  `<label for>` at all, so from the file alone the label could genuinely live in
  another partial, and it stays undecidable. Resolving it needs a package-wide
  label index, which is a larger change than finding 3 prescribed. And the
  numbers in the body of this document are still the 2026-08-20 measurement,
  left as measured rather than retrospectively edited.
  [`../../pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/)
  is a separate HTML-surface engine that never stripped expressions, so it does
  not carry this defect and needs no corresponding change.
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
top-ranked candidate, and it puts three numbers under scores that were reasoned:
the template-stage automation ceiling (finding 2), where the automatable work
actually is (finding 3), and the per-job workload variance behind a fixed price
(finding 4).

## Status of these claims

Primary measurements against public data with the raw rows committed, on the
same standard as [`mcp-tool-drift`](../mcp-tool-drift/) and
[`free-listing-demand`](../free-listing-demand/). Every number above re-derives
offline from the per-package rows in `results-2026-08-20.json` via
`--recompute-from`; re-deriving the individual findings underneath those rows
needs a re-fetch, since the tarballs are not committed.

What is uncertain is generalisation, not the data: whether npm-published
storefront themes resemble the themes real EU shops run, and what a rendered
audit would recover from the undecidable class.

**These are not customer-facing claims and must not appear in copy.** The
per-package rows in the results file are static findings about published
packages under the same "record, not verdict" framing the tool itself enforces:
they state what the check saw, not that any package or any store using it fails
any requirement.

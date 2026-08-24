# Do the two accessibility engines agree, and is the difference disclosed?

Built and measured 2026-08-21. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-engine-agreement
python3 -m unittest discover                                  # 12 tests
python3 reconcile.py                                          # run both engines
python3 reconcile.py --recompute-from results-2026-08-21.json # offline
```

## Why this was built

This portfolio has **two** independent WCAG audit engines, both built for the
same candidate — [`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md),
the pipeline's highest-composite entry:

| Engine | Built for | Input |
|---|---|---|
| [`a11y-evidence-record/audit.py`](../a11y-evidence-record/audit.py) | the measurement passes | storefront **templates** (Liquid, Twig, Blade, EJS, Vue, Svelte) |
| [`pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/) | the executable probe | plain **HTML** |

[`portfolio/research/README.md`](../README.md) already names the risk:

> `audit.py` and `eaa-wcag-triage` are two independent accessibility-audit
> engines built for the same candidate, with overlapping check IDs, and until
> this note neither referenced the other.

It named it and stopped there. **Nobody had run them on the same input.** This
directory does, and the answer was not "they agree."

The reason this matters commercially rather than aesthetically: the thing the
candidate sells is *an evidence record*, and its liability position is that
coverage limits are stated in the product rather than buried in terms. A record
carries two lists — what was found, and what was not checked. A reader can only
distinguish "checked and passed" from "never looked at" by those two lists. **A
criterion in neither is invisible to the customer**, and the candidate's own
write-up says the customer who believes coverage is total is the one who gets
hurt.

## Finding 1 — each engine was silently blind to checks the other had

Measured against the hand-labeled fixture set in
[`eaa-wcag-triage/fixtures/`](../../pipeline/probes/eaa-wcag-triage/fixtures/),
whose 14 findings across three pages were labeled by hand and are the only
ground truth either engine has.

| | findings | blocking | vs. 14 labeled |
|---|---:|---:|---|
| `eaa-wcag-triage` | 14 | 11 | recall 1.0 |
| `audit.py`, as committed | **12** | **9** | **recall 0.857** |

`audit.py` missed two blocking Level A failures that the sibling engine caught
on the same three pages, and — the actual defect — **listed neither in its
"Not tested by this method" boundary**, which enumerated 17 other criteria:

| Missed | Criterion | Why it was invisible |
|---|---|---|
| `<video>` with no captions track | **1.2.2 Captions** | No check, and 1.2.2 absent from the disclosure list entirely |
| focusable control with `aria-hidden="true"` | **4.1.2 Name, Role, Value** | 4.1.2 *was* in the checked list (via button names), so a criterion-level comparison shows no gap — the missing case hides one level down |

The reverse direction was also true. Two criteria `audit.py` checks were
neither checked nor declared manual by the probe, so the probe's coverage
statement was silent about them too:

| Missed by the probe | Criterion |
|---|---|
| autoplaying media with sound | **1.4.2 Audio Control** |
| viewport meta that blocks zoom to 200% | **1.4.4 Resize Text** |

Neither engine was wrong about anything it *reported*. Both were quietly
narrower than their own coverage statement implied, in opposite directions, and
the two blind spots were disjoint — which is what you would expect from two
engines written independently and never compared.

## Finding 2 — the residual disagreement is attribution, not coverage

With those four gaps closed, both engines detect all 12 shared defect classes.
Ten of the twelve cite the same success criterion. Two do not:

| Defect | `audit.py` cites | `eaa-wcag-triage` cites |
|---|---|---|
| form control with no label | **3.3.2** Labels or Instructions | **1.3.1** Info and Relationships |
| skipped heading level | **1.3.1** Info and Relationships | **2.4.6** Headings and Labels |

This is not a coverage gap — the defect is reported either way, at the same
severity, on the same element. It is a **reproducibility** problem, and it is
narrow but real for this candidate specifically: the deliverable is a dated
document a merchant hands to an enterprise buyer's procurement team or to their
own counsel. Two records of the same page, produced by the same portfolio,
citing different success criteria for the same defect, is the kind of detail
that costs a document its authority.

**It is deliberately left open.** Deciding which citation is correct is a
normative reading of WCAG, and both mappings have support in common practice
(axe-core maps an unlabelled control to 1.3.1, 3.3.2 *and* 4.1.2; heading-order
is classified there as best-practice rather than tied to one criterion). This
repository's standing rule is that regulatory and normative claims are
[unverified against primary sources](../../pipeline/README.md#status-of-the-claims-in-these-write-ups)
and must be checked against the actual specification before being acted on —
and the W3C specification hosts are egress-denied from this environment (see
[`egress-reachability/`](../egress-reachability/)). Picking a winner here would
be exactly the kind of confident-but-unsourced normative claim the pipeline's
own status note warns against.

So it is recorded, pinned by a test
(`test_the_only_remaining_gaps_are_the_two_known_attribution_splits`) so that a
real coverage gap cannot hide behind a known attribution one, and left for
whoever can read the specification directly.

## What changed as a result

Both engines were changed; both suites pass.

**[`a11y-evidence-record/audit.py`](../a11y-evidence-record/audit.py)** — 61 → 75 tests

- Added `media-no-captions` (1.2.2). `<video>` only: 1.2.2 is synchronized
  media, and audio-only content falls under 1.2.1 and needs a transcript this
  pass cannot see. A `<track kind>` that is a template expression withdraws the
  claim and is recorded as undecidable, matching the file's existing
  expression discipline.
- Added `interactive-aria-hidden` (4.1.2), firing only when the element is
  still in the tab order — `hidden`, `tabindex="-1"`, an `<a>` with no `href`
  and `type="hidden"` all make `aria-hidden` legitimate.
- Added `CoverageBoundaryIsComplete`, two tests asserting that no criterion is
  both checked and declared untested, and that every statically reachable
  criterion appears in one list or the other. **This is the invariant that
  would have caught 1.2.2 going missing**, and it is the part of this change
  most likely to still be earning its keep in a year.

**[`pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/)** — 37 → 48 tests

- Added `rule_autoplay_unmuted` (1.4.2) and `rule_viewport_scaling` (1.4.4),
  with their coverage-catalog rows.
- The name rules (link, button, control) now skip elements that are
  `aria-hidden`, matching what `audit.py` has always done. An element AT never
  reaches is not a *naming* barrier; if it is also still focusable,
  `rule_interactive_aria_hidden` reports that instead, which is the accurate
  diagnosis — the fix is to stop hiding it, not to add a name. This removed a
  false-positive class where an intentionally hidden, non-focusable control was
  reported as unlabelled.
- The `aria-hidden` rule gained the same focusability predicate as `audit.py`,
  so the two engines apply one definition rather than two.

The probe's committed fixture validation
([`validation-2026-08-20.json`](../../pipeline/probes/eaa-wcag-triage/validation-2026-08-20.json))
is **byte-identical** after these changes — precision and recall stay 1.0, and
none of the new rules fires on the fixtures. The changes add coverage without
disturbing the existing regression guard.

## What this does and does not do to the pipeline

**Does not.** No candidate is added, no score is changed, no `ventures/`
directory is created, nothing is published, no account is registered, no
credential is used, nothing is spent beyond agent time. No claim here is a
compliance claim.

**No score moves**, and the reasoning follows the rule
[`rescore-2026-08-20.md`](../../pipeline/rescore-2026-08-20.md) set for itself.
The eight scored dimensions ask about leverage, ops, revenue, margin,
defensibility, distribution, liability and ethics. What is measured here is the
*correctness of the tooling*, and no dimension asks about it. The nearest
candidate is `liability_containment`, and the honest reading is that this
change restores the record to the coverage it already claimed rather than
improving on it — the score was never earned by the missing checks. Recording
that explicitly is cheaper than a later pass moving a score by reflex.

**Does.** It establishes that the two engines disagreed, closes the four
coverage gaps, leaves the two attribution splits open with the reason, and adds
to each engine the invariant that makes a silent gap fail a test rather than
ship in a customer-facing record.

## What could not be measured here

- **The corpus is three hand-labeled fixture pages.** They are the only ground
  truth either engine has, and they were written by the probe's author to
  exercise the probe's rules — so they are biased *towards* the probe and
  against `audit.py`, which is the direction that makes the 12-vs-14 result
  conservative rather than flattering. They say nothing about the rate at which
  either engine is wrong on real storefronts.
- **The template half is untested against the probe.** `audit.py` handles six
  template syntaxes and the probe handles none, so the corpus comparison can
  only run on plain HTML. The template-specific paths in `audit.py` —
  expression-aware label matching, the undecidable taxonomy — have no second
  engine to disagree with them and remain checked only by their own tests.
- **No re-measurement of the theme corpus.** `a11y-evidence-record`'s headline
  numbers (286 findings, 63.2% undecidable over twelve npm storefront themes)
  were produced by the engine *before* 1.2.2 and the `aria-hidden` case existed,
  so the finding count is a lower bound by an unknown margin. Re-deriving it
  needs `measure_themes.py` to re-fetch the twelve tarballs from the npm
  registry; `--recompute-from` cannot do it, because the saved results hold
  per-package rows rather than the markup. That is a bounded, network-dependent
  follow-up, named here rather than silently left.
- **Neither engine is validated against a third-party tool.** Both are this
  portfolio's own. Agreement between two engines written in the same repository
  is weaker evidence than agreement with axe-core would be, and axe-core's
  distribution hosts are egress-denied from here.

## Amendment (2026-08-21): a new divergence, declared rather than discovered later

The probe gained colour contrast (SC 1.4.3) and `audit.py` did not — see
[`a11y-contrast-decidability`](../a11y-contrast-decidability/). The engines are
asymmetric again, and `results-2026-08-21.json` was regenerated to record it:
1.4.3 moved from the probe's `declared_untested` list to its checked catalog,
one line.

This is deliberately **not** a silent gap, which is the failure mode this
directory exists to catch. `audit.py` still declares 1.4.3 as manual in its own
coverage statement, so a record from either engine says truthfully what it did
and did not check, and `reconcile.py`'s silent-gap lists are unchanged. Closing
the asymmetry means porting the resolver to `audit.py`, which is a real piece of
work — that engine reads storefront *templates*, where the stylesheet is a
separate file in the same package and the class names are frequently built from
expressions, so its decidable share is an open question rather than a port.
Named here as the follow-up.

## Amendment (2026-08-21): the follow-up landed, and the two engines diverge differently now

`audit.py` gained 1.4.3 too — see
[`../a11y-evidence-record/contrast_pass.py`](../a11y-evidence-record/contrast_pass.py). The
resolver is reused unmodified via the same `sys.path` import this directory's
own `reconcile.py` already relies on (`colors.py`/`css.py`/`contrast.py`), not
reimplemented, so the arithmetic risk this measurement exists to catch was not
duplicated. `results-2026-08-21.json` was regenerated again: 1.4.3 moved from
`audit.py`'s `declared_untested` list to its checked catalog, the mirror of the
first move, and `test_results_file_matches_a_live_run` passed against the
regenerated file with no other line changing — confirming this is the only
catalog effect of the port.

The port is not a straight copy, because a template's `class`/`style` are
render-time output rather than fixed facts (see `contrast_pass.py`'s module
docstring for the guard this made necessary) and its stylesheet is often a
separate file the resolver has no way to associate with any one template
automatically. Both engines now check 1.4.3, so the asymmetry the first
amendment recorded is closed; what's left to measure is *how much* of it
`audit.py` can decide on real theme packages, given those two constraints —
tracked in [`../a11y-evidence-record/README.md`](../a11y-evidence-record/README.md)
rather than here, since it is a property of one engine's corpus, not of
whether the two agree.

## Amendment (2026-08-22): the probe gained 1.4.1, `audit.py` did not

The probe gained SC 1.4.1 Use of Color (`rule_use_of_color` in
`eaa-wcag-triage`) — see that probe's README. `audit.py` has no rule for it
and does not declare it untested, so this is a genuinely new asymmetry rather
than one both engines already knew about: 1.4.1 moves from the probe's
`declared_untested` list to its checked catalog, one line, and
`results-2026-08-21.json` was regenerated to record it (the file keeps its
original name; it is the live-comparison snapshot, not a dated historical
one — see the two amendments above). `test_results_file_matches_a_live_run`
passed against the regenerated file, confirming this is the only catalog
effect. Closed 2026-08-24: the rule is now in `audit.py` too, by the same
adaptation the 1.4.3 port used — reuse the sibling resolver, refuse any
dynamically classed or styled ancestor (or surrounding-text owner)
before the cascade runs. `results-2026-08-21.json` was regenerated:
1.4.1 moved from `audit.py`'s `declared_untested` list to its checked
catalog, the mirror of the probe's move two days earlier.
`test_results_file_matches_a_live_run` passed against the regenerated
file. The two-element comparison the paragraph above named is no longer
an open constraint; what remains open is how often a *theme template*
gives the resolver two literal colours, which is a property of that
engine's corpus and is tracked next to the 1.4.3 decidable-share
question rather than here.

## Amendment (2026-08-24): 2.2.1, 2.2.2, 3.1.2 moved into `audit.py`

The probe has decided these three from markup since 2026-08-22; `audit.py`
declared them untested. They are now in its checked catalog, so the
asymmetry is the disclosed remainder (2.4.1, 2.5.3, 1.3.4) rather than a
silent one. `results-2026-08-21.json` was regenerated; the catalog move is
the only change this directory records. The same pass also made `audit.py`
reject an invalid `<html lang>` (3.1.1), which does not change the catalog
— that criterion was already checked — but stops `lang="engl"` reading as
clean. No score moved.

## Amendment (2026-08-24): 2.4.1 and 2.5.3 moved into `audit.py`

The two leftover markup rows are now in `audit.py`'s checked catalog.
The disclosed remainder is 1.3.4 (CSS adapter, not markup).
`results-2026-08-21.json` was regenerated; the catalog move is the only
change this directory records. No score moved.

## Status of these claims

Primary measurement, re-derivable offline. Every number in this document comes
from [`results-2026-08-21.json`](results-2026-08-21.json), regenerated by
`reconcile.py --out`; the committed results file is asserted against a live run
by `test_results_file_matches_a_live_run`, so an engine change that invalidates
this write-up fails the suite rather than rotting quietly. The pre-fix
`audit.py` figures (12 findings, 9 blocking) were produced by running the
committed version at `HEAD` against the same fixtures before any edit.

The one judgement not settled by measurement is finding 2, and it is labeled as
open rather than resolved.

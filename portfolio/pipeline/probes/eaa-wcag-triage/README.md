# EAA WCAG triage

**A working probe, not a venture.** It implements the one claim at the centre of
[`eaa-remediation-pipeline`](../../candidates/eaa-remediation-pipeline.md) — the
candidate ranked #1 in the pipeline — that had been asserted rather than built,
and it is the second executable artifact in `portfolio/pipeline/` after
[`npm-reachability-triage`](../npm-reachability-triage/).

It answers one question about a shop page: **of the WCAG 2.2 A/AA failures a
source-only pass can find, which ones actually block a task, and how much of the
standard does that pass leave for a human with a screen reader?**

---

## Why this claim and not the whole product

The candidate's own "Why now" paragraph states the wedge the whole business
rests on:

> automated tools catch roughly a quarter to a third of WCAG issues. The gap
> between what a scanner reports and what actually blocks a screen-reader user
> is precisely the work, and it is why the pure-software competitors do not
> close the loop.

That is two testable assertions bundled together, and neither had a line of code
behind it in this repo:

1. **A static pass sees only a slice of the standard.** If that is false — if a
   scanner can in fact confirm conformance — then the manual contractor step
   the candidate sells is redundant and its margin story collapses.
2. **The valuable output is the blocking-vs-degrading split, not the raw finding
   list.** The candidate says findings are *"ranked by whether the issue blocks
   a task or merely degrades it."* Every free scanner emits a flat list; the
   ranking is what it claims to add.

This probe is the smallest thing that exercises both. It is deliberately **not**
the product: it renders nothing, publishes nothing, and makes no compliance
claim — building a probe is licensed here, publishing a listing is the account
owner's call (see [`channel-inventory.md`](../../channel-inventory.md) and the
probe rules in [`../README.md`](../README.md)).

## What it does

Parses HTML with the standard library only (no browser, no dependencies), runs a
set of conservative rules, and splits every finding into **blocking** or
**degrading**. Like the sibling reachability probe, it fires only on positive
evidence of a barrier — a control whose name cannot be resolved statically is
left unflagged rather than reported, because a checker that cries wolf gets
turned off.

| Rule | WCAG | Impact | Fires when |
|---|---|---|---|
| Image alt | 1.1.1 | blocking | `<img>` has no `alt` attribute (`alt=""` is respected as decorative) |
| Page language | 3.1.1 | blocking | `<html>` has no `lang` |
| Control label | 1.3.1 | blocking | a form control has no label, `aria-label`, `title`, or wrapping label |
| Link purpose | 2.4.4 | blocking | `<a href>` exposes no text or accessible name |
| Button name | 4.1.2 | blocking | `<button>` has no accessible name |
| Interactive aria-hidden | 4.1.2 | blocking | a focusable control is `aria-hidden="true"` |
| Video captions | 1.2.2 | blocking | `<video>` has no `<track kind=captions>` |
| Autoplay with sound | 1.4.2 | blocking | `<video>`/`<audio autoplay>` without `muted` |
| Zoom blocked | 1.4.4 | blocking | viewport meta sets `user-scalable=no` or `maximum-scale` < 2 |
| Text contrast | 1.4.3 | blocking | text resolves below 3:1 against its background |
| Page title | 2.4.2 | degrading | no non-empty `<title>` |
| Heading order | 2.4.6 | degrading | a heading level is skipped (h1 → h3) |
| Data-table headers | 1.3.1 | degrading | a multi-row data table has no `<th>` |
| Text contrast | 1.4.3 | degrading | text resolves between 3:1 and the 4.5:1 its size requires |

## What it deliberately cannot do — and says so in every record

The point of assertion #1 is that this list is short *because the standard is
large and mostly not statically visible*. The evidence record the tool emits
carries an explicit coverage statement and a table of commonly-failed criteria
it **did not** check — keyboard operability (2.1.1), focus visibility (2.4.7),
target size (2.5.8), error identification (3.3.1), non-text contrast (1.4.11)
and more — each requiring rendering, interaction, or assistive technology. That table is
the coverage limit stated *in the product*, which the candidate's liability
section requires, rather than buried in terms. A clean run is never reported as
"compliant" — it is reported as "the static checks found no failures; the manual
criteria remain unverified."

This is the honest form of assertion #1: the tool measures its own blind spot
and hands it to the contractor, instead of implying a scanner is the whole job.

## Colour contrast: added 2026-08-21, and why it took this long

1.4.3 sat in the `manual` column above from the day this probe was written, with
the note *"needs computed colour, which needs CSS and rendering."* The second
half of that was never tested. A delivered page ships the stylesheet that names
its colours, and the arithmetic from a named colour to a contrast ratio is
exact. What the claim was actually describing is every accessibility corpus this
portfolio had measured: all of them were **HTML only**, so no engine had ever
been handed the CSS, and a property of the corpus read for five passes as a
property of the criterion.
[`portfolio/research/a11y-contrast-decidability/`](../../../research/a11y-contrast-decidability/)
has the measurement — **98.76% of 10,657 text elements across 85 built pages
decide from the artifact alone.**

Three things make this safe to ship in a tool whose findings go to a stranger:

- **Three-valued, never two.** Every element is `pass`, `fail`, or
  `undecidable` *with a named reason*, and only `fail` becomes a finding. A
  colour a media query redefines, a background image, an `opacity` in the chain,
  a unit that needs the viewport — each refuses by name. The evidence record
  prints the tally and the reason table, so a page the tool could not decide
  reads as "0 of 412 decidable", never as "no contrast problems".
- **Both colour schemes.** `prefers-color-scheme` has exactly two states and the
  stylesheet spells out both, so the page owes 1.4.3 in each and the verdict is
  the worse of them. This is not a refinement: on this portfolio's own pages,
  scoring the light scheme alone found 581 failures and scoring both found 965.
  The 384-element difference is the `text-gray-500` with no `dark:` counterpart
  inside a `dark:bg-gray-800` container — invisible to any single-pass checker.
- **Gradients are bounded, not skipped.** CSS interpolates each channel linearly
  and luminance is monotonic in each channel, so the ratio attainable over a
  gradient is bracketed by its stops, and a bracket wholly on one side of the
  threshold decides the criterion. Only a straddling bracket is undecidable.

The colour arithmetic is checked against published WCAG ratios for known pairs
(`#767676` on white is 4.54:1, the AA boundary), and the CIELAB conversion
against ground truth rather than itself: Tailwind v4 emits every palette entry
twice, as a hex fallback and a `lab()` override, and
[`fixtures/tailwind-v4-lab-pairs.json`](fixtures/tailwind-v4-lab-pairs.json)
holds all 115 pairs from a real build for the test to reconcile.

**The sibling engine does not do this.** `a11y-evidence-record/audit.py` still
records 1.4.3 as manual, so the two engines are asymmetric again — declared
here on purpose, because
[`a11y-engine-agreement`](../../../research/a11y-engine-agreement/) established
that the danger is asymmetry nobody wrote down.

## Validated against a hand-labeled fixture set

Three fixture shop pages ([`fixtures/`](fixtures/)) — one riddled with barriers,
one clean, one mixed with negative controls (a decorative `alt=""` image, a
correctly-labelled input) — were labeled by hand in
[`fixtures/labels.json`](fixtures/labels.json), then compared against the
engine's output.

| Page | Expected | Reported | Blocking / degrading |
|---|---|---|---|
| `shop-inaccessible.html` | 10 | 10 | 8 / 2 |
| `shop-accessible.html` | 0 | 0 | — |
| `shop-mixed.html` | 4 | 4 | 3 / 1 |

Aggregate precision **1.0**, recall **1.0** on the fixtures — raw output in
[`validation-2026-08-20.json`](validation-2026-08-20.json), regenerated by
`python3 run_fixture_validation.py 2026-08-20`.

**What that number is and is not.** The labels and the engine both live in this
repo, so a perfect score is a regression guard on the rules, not evidence about
production shops. The candidate's first experiment — *"measure how many blocking
issues the generated fixes actually close under AT verification"* — is the real
measurement, and it needs three live shop themes and a contractor, neither of
which an agent session has. This probe closes the smaller, prior question:
whether the blocking/degrading triage the candidate sells can be produced
mechanically at all. It can, and the coverage split it produces (11 criteria
reasoned about, 9 named criteria explicitly deferred to a human) is itself the
first concrete instance of the "quarter to a third" gap the candidate asserts.
That split moved on 2026-08-21, when 1.4.3 crossed from deferred to partial —
the only criterion that has ever crossed, and it crossed because the corpus
changed, not because the rules got cleverer.

## Run it

```bash
# Print an evidence record for one or more pages:
PYTHONPATH=src python3 -m wcag_triage.cli page.html

# Write record.json + record.md for a whole set:
PYTHONPATH=src python3 -m wcag_triage.cli shop/*.html --output-dir ./evidence

# Optional CI gate (off by default so adding it never breaks a build):
PYTHONPATH=src python3 -m wcag_triage.cli page.html --fail-on blocking
```

There is also an [`action.yml`](action.yml) so the record can be produced in CI
and posted to the job summary, mirroring the sibling probe.

## Tests

```bash
python3 -m pytest
```

Run in CI by [`eaa-wcag-triage-ci.yml`](../../../../.github/workflows/eaa-wcag-triage-ci.yml),
which also re-runs `run_fixture_validation.py` and fails if the committed
record no longer matches what the engine emits.

111 tests: parser behaviour, each rule and its negative control, the
blocking-before-degrading ordering, dedup of one element matched by two rules,
the evidence record's JSON/markdown shape and its compliance disclaimer, the
fixture validation, and — added 2026-08-21 — the two rules this engine was
missing relative to its sibling (1.4.2, 1.4.4), the focusability predicate on
the `aria-hidden` rule, and the invariant that every statically reachable
criterion appears in `COVERAGE`. See
[`portfolio/research/a11y-engine-agreement/`](../../../research/a11y-engine-agreement/)
for why an engine that passes its own suite can still be quietly narrower than
its own coverage statement. Added 2026-08-21: `colors.py` (colour syntax
against published WCAG ratios, the `lab()` conversion against a real build's own
hex fallbacks, gradient bounds), `css.py` (every selector shape it refuses, the
colour-scheme split), and `contrast.py` (one test per named undecidable reason,
plus the specificity case that shipped a wrong answer on a real page).

## Scope and honesty, in one place

- **No compliance claim.** Evidence and a coverage statement, never "you are
  compliant." Enforced in code (`evidence.COVERAGE_STATEMENT`) and asserted by a
  test.
- **No payment, no personal data, no account.** It reads local HTML files.
- **Building ≠ publishing.** Committed here freely; any public listing is the
  account owner's decision.
- **Fixture validation ≠ field validation.** The perfect fixture score is a
  regression guard. The candidate does not graduate on it.
- **A contrast pass is only as wide as the CSS it was handed.** With no
  stylesheet the tool decides nothing, and says so per element. It never treats
  "no colour declared" as "colour is fine".

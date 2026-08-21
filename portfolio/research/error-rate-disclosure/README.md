# Does the record a customer receives carry the tool's own error rate?

**Question.** Every probe in [`portfolio/pipeline/probes/`](../../pipeline/probes/)
has been measured for accuracy, and every one of them renders something a
customer would read. Does the second contain the first?

**Answer, as first measured. No — not once, in four of four.** Two of the four
had a committed accuracy number and neither printed it. One named the direction
it errs in and has never measured the rate for that direction. Two have no
customer-facing record module at all. And in three of the four, the direction
nobody disclosed is the direction the operator gets paid for.

This is the pipeline's **second gate measurement**, taken the same day as the
first: `ethical_robustness` on the four candidates that have a probe —
`eaa-remediation-pipeline` 9 → 6, `public-record-watch` 9 → 6,
`cra-evidence-desk` 8 → 6, `agent-permission-harness` 9 → 7. No candidate
crossed the gate.

> **Amended the same day: one of the four gaps is closed and the scores moved.**
> `eaa-wcag-triage` now prints both of its committed figures, names both
> directions, and states which one pays the operator — `eaa-remediation-pipeline`
> **6 → 9**. A rubric bug that charged the alignment deduction to an artifact
> that discloses its adverse direction was fixed — `cra-evidence-desk` **6 → 7**.
> Current scores: 9, 6, 7, 7. The two probes with no record module are
> unchanged. Full account in [What changed after this was
> measured](#what-changed-after-this-was-measured); the tables and findings below
> are left as measured, because the whole point of the directory is what the
> artifacts said at the moment they were looked at.

```
python3 measure.py 2026-08-21          # offline, no network, no clock read
python3 -m unittest discover -s . -t . # 17 tests
```

## Why this is the gate and not an essay

[`pipeline/README.md`](../../pipeline/README.md) defines `ethical_robustness`
as *"the business gets better for customers as it scales, not worse"*, and all
eight scores for it were 2026-08-18 screening estimates in the 8–9 band. A
dimension phrased that way invites an estimate, which is why it stayed one
through eleven screening passes and four probes.

It becomes measurable once you name the mechanism by which an evidence business
gets worse: **the customer acts on a record whose errors are invisible to them,
in a direction the operator profits from.** Both halves are checkable here. The
error rates are committed in this repository. The artifacts are rendered by code
in this repository. Whether the first appears in the second is a string search.

## Method

Three disclosure classes, evaluated by three different methods on purpose, so a
weakness in one does not decide the result.

| Class | How it is decided | Why that way |
|---|---|---|
| **Scope** — what was and was not examined | Structural: the rendering module declares a coverage/limits constant and it reaches the rendered text | A module attribute exists or it does not; nothing to tune |
| **Direction** — which way the tool is wrong | Lexical, over a narrow vocabulary about the tool's own accuracy, never about its scope. Every match is quoted in the results | The conflation this whole measurement exists to separate: "does not check keyboard operability" is scope, "false positives are expected" is direction |
| **Rate** — how often | Numeric: the committed figure in every plausible rendering, searched for in the artifact. The citation is re-verified against its source file on every run | A measurement that moves elsewhere cannot leave a stale number here |

Each probe's artifact is produced by calling its own rendering code on a real
input — a page for the accessibility engine, a two-finding report for the
dependency triage, the committed register history for the silence detector, this
repository's 31 workflow files for the permission harness. Nothing is
hand-written and nothing is fetched.

## Results

| Probe | Scope | Direction | Rate committed | Rate in artifact |
|---|---|---|---|---|
| [`eaa-wcag-triage`](../../pipeline/probes/eaa-wcag-triage/) | yes | **no** | yes — precision 0.821–0.881 ([`a11y-own-sites`](../a11y-own-sites/)) | **no** |
| [`npm-reachability-triage`](../../pipeline/probes/npm-reachability-triage/) | yes | yes | **no — never measured** | n/a |
| [`source-silence-detector`](../../pipeline/probes/source-silence-detector/) | **no module** | **no** | yes — held-out recall 0.35 | **no** |
| [`agent-permission-harness`](../../pipeline/probes/agent-permission-harness/) | **no module** | **no** | **no — never measured** | n/a |

### 1. Scope disclosure is not accuracy disclosure

`eaa-wcag-triage`'s evidence record is the most careful disclosure artifact in
this repository. It labels every success criterion `automated`, `partial`,
`manual` or `unimplemented`; it prints the contrast decidability share; it names
every undecided element by *why* it could not be decided. Its coverage statement
opens *"This is a STATIC pass"* and closes *"A clean result here is NOT a
statement of conformity."*

It never says that a finding in the list can be wrong. Out of sample, 12–18% of
them are not defects —
[`a11y-own-sites`](../a11y-own-sites/) measured precision at 0.821–0.881 and
traced every false positive to markup the build tool emitted rather than the
site owner. A reader of the record cannot discount it, because the record does
not tell them there is anything to discount.

**A second number for the same probe landed on `main` while this was being
written**, and changes nothing except the size of the gap.
[`a11y-axe-recall/`](../a11y-axe-recall/) measured out-of-sample *recall* at
0.975 against axe-core. So `eaa-wcag-triage` now has both halves of its
accuracy measured and committed, and its record prints neither. A test here
pins that, so if either number reaches the artifact this directory has to be
re-run.

This is worth stating plainly because the natural defence — *"but the coverage
statement is extremely thorough"* — is true and does not help. Coverage answers
"what did you look at". Accuracy answers "is what came back right". The pipeline
had been reading the first as evidence about the second for four passes.

### 2. The two halves of the omission split evenly

`npm-reachability-triage` is the only artifact that names its own error
direction, and it does it well, in the body of the record rather than a
footnote:

> False positives are expected; a suppressed finding that should not have been
> is the failure this tool is built to avoid, and both are possible.

That sentence identifies exactly the right hazard. The rate for it has never
been measured. `validation-2026-08-21-build-surface.json` records suppression
*rates* — how much was suppressed — which say nothing about how much of that was
wrong. So one probe knows which way it fails and not how often; two know how
often and never say which way; and the fourth knows neither.

### 3. The detector that prints `MISSED` and tells nobody

`source-silence-detector` has no customer-facing record module. The closest
thing it renders is an operator table, and this is a real row of it:

```
source                                   thr   med   max  ...  quiet?   lat
FDA/openfda                             2060    37  1373  ...  MISSED    --
```

The detector knows it missed that source. Held-out recall is 0.35 — six of
seventeen dormancy episodes — committed in the probe's own README. A subscriber
sees the same silence whether the register is quiet or the watch failed, so
unlike a false positive this error is unobservable from outside. That is the
asymmetry that makes it a gate question rather than a quality question.

### 4. The direction nobody discloses is usually the direction that pays

Read off each candidate's own stated revenue model, not assumed:

| Candidate | Revenue model | Undisclosed direction | Pays the operator? |
|---|---|---|---|
| `eaa-remediation-pipeline` | €900–€1,800 fixed-price job, €49–€99/mo retainer | over-reporting | **yes** — the audit is the qualification step that sells the job |
| `cra-evidence-desk` | €99–€399/mo by dependency count | wrong suppression | **yes** — suppression is the headline it is sold on, and a wrong one is invisible |
| `public-record-watch` | €30–€150/mo | missed silence | **yes** — nuisance alarms cost churn (43 alarm-days per source-year at high recall), a miss costs nothing |
| `agent-permission-harness` | none stated | unknown, both ways | **not scored** — nothing to align against |

The fourth row matters as much as the other three. It would have been easy to
call a security scanner "defensive by construction" and take the deduction
anyway; the write-up names no revenue model, so the alignment call is left
unmade rather than assumed. `agent-permission-harness` loses two points for not
knowing its error rates, not for concealing them.

## The rubric, stated before it was applied

A gate score arrived at case by case is an estimate wearing a measurement's
clothes. Three deductions, applied uniformly, from the prior screening estimate:

1. **−1 rate undisclosed** — the artifact carries no accuracy figure, whether
   because it was measured elsewhere and omitted or never measured at all.
2. **−1 direction undisclosed** — the artifact does not say which way the tool
   is wrong. Scope disclosure does not substitute.
3. **−1 adverse alignment** — the undisclosed direction is the one that
   increases the operator's revenue, judged against the stated revenue model.

Deduction 3 is a reading of a business model, not a measurement, and is held in
a separate table in `measure.py` with its reasoning attached so it is visible as
such. Deductions 1 and 2 are computed.

## What this does not claim

- **Not that these are bad businesses.** No candidate crossed the gate, and the
  mitigations are cheap: printing a measured precision in a record is one line
  of rendering. The gap is disclosure, not a model that has to harm someone.
- **Not a measurement of the other four candidates.** They have no probe, so
  there is no artifact to inspect. Their `ethical_robustness` scores remain
  2026-08-18 estimates and should be read as upper bounds.
- **Not a customer study.** Whether a disclosed error rate changes what a buyer
  does is untested here and untestable from this environment. What is measured
  is whether the information reaches them at all.
- **Not a claim that the probes are inaccurate.** Two of them have better
  measured accuracy than anything else in this repository. The finding is about
  where those numbers stop travelling.

## Consequences recorded elsewhere

- Four `ethical_robustness` scores and four composites in
  [`candidates.yaml`](../../pipeline/candidates.yaml), with the derivation in
  each `measured:` block, and the matching rows in the four write-ups and the
  pipeline table.
- [`score_sensitivity.py`](../../pipeline/score_sensitivity.py) had a fixed
  sentence claiming every revision is "down by one". Two of these are −2 and one
  is −3, so that sentence is derived now, and the script **withholds** its rank
  extrapolation rather than applying a magnitude it does not have. It also used
  to `return` at that point, which meant a second measured dimension would have
  silently deleted sections 4 and the verdict along with the extrapolation; it
  no longer does.
- The cheapest follow-up is not more measurement. It is four lines of rendering:
  print the number each probe already knows into the artifact it already emits.
  Three of the four deductions here are recoverable that way, and doing it would
  make this directory's own tests fail — which is how it is meant to work.

## What changed after this was measured

Everything above is the state as measured. This section is what happened next,
the same day, and it is kept separate rather than folded in: a measurement
directory that quietly rewrites its finding to match a later fix loses the only
thing it was for.

### 1. `eaa-wcag-triage` closed its gap — `eaa-remediation-pipeline` 6 → 9

The prediction in "What this does not claim" was that printing a measured
precision is one line of rendering. It was four, in
`probes/eaa-wcag-triage/src/wcag_triage/evidence.py`, and the tests here failed
exactly as designed.

The record now carries an `ACCURACY` block rendered in two places — a headline
in the summary, and a full section immediately above the findings table it
qualifies — with both committed figures, each stating its corpus, date,
derivation path and the reason it is not the last word:

| | value | direction | limit disclosed in the record |
|---|---|---|---|
| precision | 0.821–0.881 | over-reporting | denominator excluded 1.4.3 entirely |
| recall | 0.975 | under-reporting | one comparison; corpus exercises 2 of 13 criteria |

It also does the thing deduction 3 asks for, which a rate alone does not:
*"this audit is the qualification step for a paid remediation job, so
over-reporting is the error that would pay us. That is why the precision figure
is printed here, beside the findings it applies to, rather than supplied on
request."*

All three deductions lapse, so the score returns to its 2026-08-18 screening
estimate. **Read it as the estimate no longer being reduced, not as a positive
finding** — this rubric measures disclosure and nothing else, and none of the
three residual risks in the table above is resolved by disclosing it.

`probes/eaa-wcag-triage/tests/test_accuracy_citations.py` applies this
directory's own `Citation.verify()` discipline one layer out: each figure
printed at a customer is checked against the derivation it names, so a rate
revised upstream fails the build rather than becoming a false statement about
the product.

### 2. The rubric was charging a deduction it does not state — `cra-evidence-desk` 6 → 7

Deduction 3 is published as *"the **undisclosed** error direction is the one
that increases the operator's revenue."* `score()` applied it whenever
`ALIGNMENT[candidate]` was adverse, with no reference to disclosure. So an
artifact could disclose everything and still be charged, which makes the
deduction unrecoverable by the mitigation the rubric asks for — the opposite of
what "Three of the four deductions here are recoverable that way" claims.

`npm-reachability-triage` is the one artifact of the four that already named its
adverse direction, in the body of the record, so it was the one paying for this.
The bug survived because `test_full_disclosure_costs_nothing` — whose name
states the intended semantics — only ever ran against
`agent-permission-harness`, the single candidate whose alignment is not adverse.
The case where the distinction bites was untested.

`score()` now matches the published rubric, and both directions are pinned:
full disclosure costs nothing even when alignment is adverse, and hiding an
adverse direction still costs two. A new `alignment_charged` field records
whether the deduction fired, separately from `alignment_adverse`, which still
records the reading of the business model.

This is a harness correction, not a re-probe. `cra-evidence-desk`'s remaining
deduction is the real one and has not moved: the false-suppression rate has
never been measured, so there is no figure to print.

### 3. D2's sentence splitter could not survive a decimal point

Found by fixing (1), and worth recording because it is the same shape as the
finding this directory exists to report. `sentences()` was
`re.findall(r"[^.!?\n]*[.!?]", text)`, which is correct on prose and wrong the
moment an artifact contains a number — and an accuracy disclosure is nothing
but numbers. Against the new record it returned `["**Precision 0.", "881,
recall 0."]`.

The boolean was unaffected: whole sentences matched too, so
`direction_disclosed` was right either way. What broke is the checkability.
D2 is lexical, and the reason that is acceptable is stated in the method table
— *"Every match is quoted in the results so the classification can be checked
rather than trusted."* A quoted fragment cannot be checked, so the method's own
justification had quietly stopped holding. A period between two digits is now a
decimal point; a newline still ends a sentence; three tests pin it, including
one that renders all four artifacts and asserts no quoted match ends
mid-number.

### 4. What is still open, and which kind of work it is

The two untouched probes are untouched because neither is a rendering job:

- **`source-silence-detector` is the sharp one.** It holds a committed held-out
  recall of **0.35** and has no customer-facing record module to print it on.
  Its operator table prints `MISSED` beside a source whose dormancy it failed to
  catch and nothing carries that to a subscriber — who sees the same silence
  whether the register is quiet or the watch failed. Building that module is the
  single highest-value item this directory leaves behind.
- **`npm-reachability-triage` and `agent-permission-harness` need a
  measurement, not a module.** Neither has ever measured an error rate, so
  neither has a figure to withhold. For the first, the direction whose rate is
  missing is the one its own record calls "the failure this tool is built to
  avoid".

Consequences recorded elsewhere: four `measured:` blocks and two composites in
[`candidates.yaml`](../../pipeline/candidates.yaml), the two write-ups, the
pipeline table, and `score_sensitivity.py`, whose section 3 asserted "Every
revision is downward" as fixed prose and is now derived — the record runs 11
down and 2 up.

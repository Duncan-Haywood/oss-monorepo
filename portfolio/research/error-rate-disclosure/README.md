# Does the record a customer receives carry the tool's own error rate?

**Question.** Every probe in [`portfolio/pipeline/probes/`](../../pipeline/probes/)
has been measured for accuracy, and every one of them renders something a
customer would read. Does the second contain the first?

**Answer. No — not once, in four of four.** Two of the four have a committed
accuracy number and neither prints it. One names the direction it errs in and
has never measured the rate for that direction. Two have no customer-facing
record module at all. And in three of the four, the direction nobody discloses
is the direction the operator gets paid for.

This is the pipeline's **second gate measurement**, taken the same day as the
first: `ethical_robustness` on the four candidates that have a probe —
`eaa-remediation-pipeline` 9 → 6, `public-record-watch` 9 → 6,
`cra-evidence-desk` 8 → 6, `agent-permission-harness` 9 → 7. No candidate
crossed the gate.

```
python3 measure.py 2026-08-21          # offline, no network, no clock read
python3 -m unittest discover -s . -t . # 16 tests
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

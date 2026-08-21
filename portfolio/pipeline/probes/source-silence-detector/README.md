# Probe: source-silence detector

**Built and backtested 2026-08-21. No network calls at all — every number below
is derived from the saved per-commit records of
[`register-change-rate`](../../../research/register-change-rate/README.md).**

Reproduce the negative result (the rule exactly as specified):

```
python3 detect_silence.py
```

Reproduce the working configuration:

```
python3 detect_silence.py --fallback pooled --multiplier 2.0 --min-gaps 2
```

Parameter sensitivity: add `--sweep`. Saved runs:
[`results-per-source-only-2026-08-21.json`](results-per-source-only-2026-08-21.json),
[`results-pooled-2026-08-21.json`](results-pooled-2026-08-21.json).
Tests: `python3 -m unittest discover -s portfolio/pipeline/probes/source-silence-detector`
(26 tests, all offline).

## The claim under test

[`register-change-rate`](../../../research/register-change-rate/README.md) §3
ended with a build requirement rather than a finding, and nobody had built it:

> A mirror-fed product needs a per-source expected-cadence threshold derived
> from its own history (a 6-day gap is normal for KEV, a 49-day gap is normal
> for `congress-legislators`) and an alert when the current gap exceeds it.

It matters because it is the operational half of
[`public-record-watch`](../../candidates/public-record-watch.md)'s own stated
failure mode — *"a monitor that quietly stopped is worse than no monitor"* — and
because that measurement found two mirrors (`FDA/openfda`, `datasets/covid-19`)
that had gone silent for 73 and 149 days without announcing it. A product fed by
either would have reported a calm world indefinitely.

So the weakest claim is not "silence is detectable in principle". It is **that a
threshold derived from a source's own history detects it.** That is what this
probe tests, and the answer is no.

## Method

A backtest, not a monitor. The 180-day window is replayed one day at a time; on
each day the detector sees only changes at or before that day, and alarms when
the current gap exceeds `max(worst gap seen so far × multiplier, 7 days)`. A
source needs some minimum number of observed gaps before its threshold is
trusted at all.

Three things make the scoring non-circular:

- **Ground truth comes from the data, not from a hand-label.** A source counts as
  having gone quiet if its trailing silence at the window's end exceeds 30 days.
  The two controls (73d, 149d) clear that line and no live source comes within 28
  days of it, so the split does not depend on the exact threshold.
- **An alarm is scored by what the source did next.** If it never changes again
  inside the window, the alarm was right; if it comes back, the alarm was a
  nuisance. Nothing is assumed about which sources "should" alarm.
- **Alarms raised before a source's first observed change are counted
  separately** as cold-start, because the saved records come from a
  `--shallow-since` clone. History older than the window was never fetched, so a
  source whose first in-window commit lands late looks dead from day one for a
  reason that is an artifact of clone depth. Reporting those as detector failures
  would overstate the cost by roughly 7×.

## Result 1: the specified rule catches nothing, at every setting

Per-source thresholds only, no fallback:

| source | threshold | median gap | worst gap | last change | quiet? | caught? |
|---|---:|---:|---:|---|:---:|:---:|
| `github/advisory-database` | 8d | 1 | 5 | 2026-08-19 | – | – |
| `ossf/malicious-packages` | 7d | 1 | 1 | 2026-08-19 | – | – |
| `opensanctions/opensanctions` | 7d | 1 | 3 | 2026-08-19 | – | – |
| `cisagov/kev-data` | 9d | 1 | 6 | 2026-08-19 | – | – |
| `openstates/people` | 21d | 2 | 14 | 2026-08-18 | – | – |
| `rubysec/ruby-advisory-db` | 35d | 1 | 23 | 2026-08-19 | – | – |
| `unitedstates/congress-legislators` | 74d | 1.5 | 49 | 2026-08-19 | – | – |
| `FDA/openfda` | **none** | 3 | 3 | 2026-06-08 | **quiet** | **no** |
| `datasets/covid-19` | **none** | 17 | 17 | 2026-03-24 | **quiet** | **no** |

**0 of 2 caught.** The threshold is not merely wrong on the two quiet sources —
it does not exist for them. `FDA/openfda` shows one in-window gap and
`datasets/covid-19` shows one; a rule that derives an expected cadence from
observed gaps has nothing to derive from.

This is not a tuning problem. Across all twelve combinations of
`multiplier ∈ {1.0, 1.5, 2.0, 3.0}` and `min_gaps ∈ {2, 5, 10}`, the count caught
is 0 and the count of uncalibratable sources is 2. Lowering `min_gaps` to 2 does
not help, because both sources have exactly one gap. The test
`test_per_source_rule_alone_catches_nothing_at_any_setting` pins this.

### Why it fails, stated generally

The sources you most need a silence alarm on are the ones that publish least,
and publishing least is exactly what starves the estimator. A register that
changes daily gives you 180 gaps to fit a threshold to and will never surprise
you; a register that changes twice a year gives you one gap, and "twice a year"
and "stopped" produce identical evidence for months.

`test_exactly_the_quiet_sources_are_the_uncalibratable_ones` states this as a
single assertion against the real data: the set of sources with no derivable
threshold and the set of sources that went quiet are **the same set**.

## Result 2: a documented fallback is mandatory, and pooled beats fixed

Because the per-source rule is undefined rather than merely inaccurate, the
product needs a stated answer for the uncalibrated case. Two were measured, here
at the module defaults (`multiplier 1.5`, `min_gaps 5`) so the three rows differ
only in the fallback; the operating point recommended below uses different
parameters and does better on both columns:

| fallback | caught | worst detection latency | mid-window nuisance alarm-days |
|---|:---:|---:|---:|
| none — the rule as specified | 0 / 2 | – | 23 |
| fixed 30-day threshold | 2 / 2 | 31d | 23 |
| pooled median of calibrated peers | 2 / 2 | **9d** | 37 |

Both fallbacks catch both quiet sources at every multiplier tested. Pooled
detects roughly 3× faster, because a fixed 30-day rule cannot alarm before day 30
by construction while the pooled threshold tracks what the portfolio's other
sources are actually doing.

Pooled is a fallback, not a recommendation to pool generally: sources in one
portfolio differ by an order of magnitude in cadence (1 day for
`malicious-packages`, 49 for `congress-legislators`), so a pooled number is wrong
for both ends by construction. It is used only where the per-source number does
not exist.

### The operating point this probe would ship

`--fallback pooled --multiplier 2.0 --min-gaps 2`:

- **2 of 2 quiet sources caught**, at 11 days' latency each.
- **10 mid-window nuisance alarm-days** in 180 days across 9 sources — 9 of them
  on `congress-legislators`, 1 on `datasets/covid-19`, and **zero** on any of the
  three daily software-security registers, which are the ones a customer would be
  paying for. Pinned by `test_live_fast_sources_never_produce_a_nuisance_alarm`.

The latency/nuisance trade is a dial, not a fact, and the sweep shows the whole
curve: multiplier 3.0 costs 16 days' latency and produces 1 nuisance day;
multiplier 1.0 detects in 8 days and produces 51.

## Result 3: two structural notes the backtest produced for free

- **A worst-gap-anchored threshold must under-estimate until the worst gap has
  happened.** `congress-legislators` has a normal 49-day gap; before that gap
  occurs the threshold is fitted to much smaller ones, so the source's nuisance
  alarms all cluster early and stop once the threshold has seen a full cycle.
  This is self-correcting, which means nuisance rate on a new source is a
  transient to be waited out rather than a steady-state cost — but it also means
  a *new* slow source is noisy for its first year.
- **Calibrate on full history, not on the observation window.** The 74 cold-start
  alarm-days here are an artifact of `--shallow-since`, but they show the shape of
  the real failure: a monitor that begins calibrating on the day it is switched on
  is at its least reliable exactly when it is newest. A production version clones
  full history for calibration and uses the observation window only for
  evaluation. That is a concrete build requirement this backtest produced and the
  source measurement did not.

## What this does and does not change

**No score moves and no verdict moves.** `public-record-watch` stays at composite
7.0, floor 4, and the floor is still distribution. This probe tested an
operational premise, not the buyer — the same limit
[`register-change-rate`](../../../research/register-change-rate/README.md) closed
with. A monitoring product that reliably detects its own upstream going dark is
still a monitoring product with no channel to sell through.

What it does change is that one line in that measurement — *"that is a build
requirement this measurement produces for free"* — was wrong about the price. The
requirement as stated is unbuildable on its own terms, and the fallback it needs
is a design decision with a measured cost, not a detail. Anyone picking up this
candidate now inherits a working detector and a number for what it misses,
instead of a sentence that sounds settled.

## Rules this probe follows

Per [`probes/README.md`](../README.md): no compliance claim, no payment, no
personal data, no account requiring an identity artifact, coverage limits stated
here rather than buried. This probe additionally makes **no network calls**,
reads one committed JSON file, handles no customer data, and publishes nothing.
It is not a graduation and does not create a `ventures/` entry.

## Status of these claims

Measurements of **nine repositories over the 180 days ending 2026-08-20**, as
recorded by the earlier probe on that date, and of a detector run against those
records on 2026-08-21. The generalisation in *"why it fails, stated generally"* is
an argument from two quiet sources, not a measured rate — it is stated as a
mechanism because the mechanism is checkable, but two is the sample size and the
next mirrored register that dies is the test of it.

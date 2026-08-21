# Probe: source-silence detector

**Built and backtested 2026-08-21. Extended the same day with full-history
calibration, which inverted the result — read
[the amendment](#amendment-2026-08-21-calibrating-on-full-history-inverts-this-probes-finding)
before acting on results 1 and 2 below.**

Reproduce the negative result (the rule exactly as specified):

```
python3 detect_silence.py
```

Reproduce what the first pass recommended (**superseded** — see the amendment):

```
python3 detect_silence.py --fallback pooled --multiplier 2.0 --min-gaps 2
```

Reproduce the operating point this probe now recommends:

```
python3 detect_silence.py --prior-history prior-history-2026-08-21.json \
    --anchor quantile --quantile 0.99
```

Re-fetch the full history that last command reads (the only step that touches
the network, ~4 minutes, anonymous public clones):

```
python3 fetch_prior_history.py --json prior-history-2026-08-21.json
```

Parameter sensitivity: add `--sweep`. Saved runs:
[`results-per-source-only-2026-08-21.json`](results-per-source-only-2026-08-21.json),
[`results-pooled-2026-08-21.json`](results-pooled-2026-08-21.json),
[`results-full-history-max-2026-08-21.json`](results-full-history-max-2026-08-21.json),
[`results-full-history-p99-2026-08-21.json`](results-full-history-p99-2026-08-21.json).
Tests: `python3 -m unittest discover -s portfolio/pipeline/probes/source-silence-detector`
(57 tests, all offline).

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

**Still true, and true for a different reason than this section gives.** The
explanation below — that the threshold cannot be *derived* — holds only for a
monitor whose history begins at the window. On full history all nine sources
calibrate and the rule still catches nothing, because the threshold it derives is
absurdly loose. See
[the amendment](#amendment-2026-08-21-calibrating-on-full-history-inverts-this-probes-finding).

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

**Correction, same day: this generalisation is wrong as stated.** It is a
property of a 180-day clone, not of these sources. `FDA/openfda` has 37 gaps in
its history and `datasets/covid-19` has 744 — both calibrate comfortably once
the history is fetched. The assertion above still passes because it is scoped to
the windowed records, and
`test_full_history_calibrates_every_source_including_both_quiet_ones` pins the
opposite result on full history. The mechanism that actually defeats the rule is
in the amendment, and it is not starvation.

## Result 2: a documented fallback is mandatory, and pooled beats fixed

**Scoped by the amendment: mandatory only for a monitor without full history.**
With full history no source is ever uncalibrated, so the fallback never fires and
the choice between pooled and fixed stops existing. Both numbers below remain
correct for a cold monitor, which is a real deployment and not a hypothetical —
it is what you have on day one if you do not clone history.

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

**Superseded by the amendment.** This configuration works *because* the two
quiet sources are uncalibratable — the fallback is the only thing that fires on
them. Give the same configuration full history and it catches **0 of 2**, pinned
by `test_more_history_makes_the_max_anchored_rule_catch_strictly_less`. It was
accidentally correct, and the accident was ignorance of the sources' own past.

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

## Amendment 2026-08-21: calibrating on full history inverts this probe's finding

Result 3 above ended with a build requirement — *"calibrate on full history, not
on the observation window"* — stated as an obvious improvement that the backtest
could not test, because the saved records come from a `--shallow-since` clone and
the history simply was not there.

It is now fetched. [`fetch_prior_history.py`](fetch_prior_history.py) clones each
of the nine mirrors' whole history (blobless, no checkout, ~4 minutes, anonymous)
and records every day carrying a non-merge commit, back to each repository's
first. `detect_silence.py --prior-history` splices those pre-window days onto the
in-window records for calibration only; ground truth still comes from in-window
behaviour alone, pinned by
`test_ground_truth_does_not_move_when_calibration_changes`.

**The improvement is not an improvement. It is a strict regression in detection,
and it exposes that the first pass's recommended configuration was right by
accident.**

### What the history actually contains

| source | first change | change days | gaps | p50 | p90 | p99 | max |
|---|---|---:|---:|---:|---:|---:|---:|
| `github/advisory-database` | 2022-02-11 | 1,600 | 1,599 | 1 | 1 | 2 | 5 |
| `opensanctions/opensanctions` | 2015-12-05 | 1,539 | 1,538 | 1 | 3 | 39 | 169 |
| `ossf/malicious-packages` | 2023-03-09 | 1,057 | 1,056 | 1 | 1 | 4 | 75 |
| `unitedstates/congress-legislators` | 2012-09-27 | 854 | 853 | 3 | 14 | 42 | 115 |
| `rubysec/ruby-advisory-db` | 2013-02-12 | 833 | 832 | 3 | 15 | 39 | 142 |
| `openstates/people` | 2018-09-26 | 802 | 801 | 2 | 8 | 25 | 99 |
| `datasets/covid-19` | 2020-03-07 | 745 | 744 | 1 | 1 | **2** | **908** |
| `cisagov/kev-data` | 2025-01-27 | 224 | 223 | 2 | 5 | 11 | 12 |
| `FDA/openfda` | 2014-06-01 | 38 | 37 | 37 | 335 | 1,373 | 1,373 |

The two sources the first pass called uncalibratable have 37 and 744 gaps. **All
nine calibrate on 100% of window days.** Result 1's generalisation — that the
sources you most need an alarm on are the ones too quiet to fit a threshold to —
described the clone depth, not the world.

**The seam is checked, not assumed.** `register-change-rate` derives change days
from `git log --name-only` (days a commit touched a path); this fetcher drops
`--name-only` and takes days a non-merge commit exists. Those coincide only if no
commit is pathless, so every run re-derives the in-window days from its own clone
and compares them against the saved records day-for-day. All nine agree exactly
(`test_every_source_agreed_with_the_saved_records_in_window`); a source that
disagreed would be dropped rather than spliced.

That check earned its place immediately. The first run reported a one-day
disagreement on exactly the four fastest mirrors — which turned out to be the
comparison's own bug, not the data's: `until_ts` is midnight *starting* the
window's last day, so comparing on date strings admitted a final-day sliver that
the saved records' timestamp filter excludes, and only mirrors that commit most
days had a commit sitting in it. Fixed to use the identical filter, and pinned by
`TestWindowBoundary`.

### Why more history makes it worse

The rule is anchored on the **worst** historical gap. That anchor is
monotonically non-decreasing in history length: every long gap a source survives
permanently raises its own alarm threshold, and nothing ever lowers it. So the
sources most likely to go dormant — the ones that have been dormant before — are
exactly the ones whose threshold has already been stretched past any silence
worth alarming on.

| source | threshold on 180 days | threshold on full history |
|---|---:|---:|
| `FDA/openfda` | *(uncalibratable)* | **2,060 days** |
| `datasets/covid-19` | *(uncalibratable)* | **1,362 days** |
| `ossf/malicious-packages` | 7 | 113 |
| `rubysec/ruby-advisory-db` | 35 | 213 |

A 5.6-year alarm threshold is not a monitor. At the first pass's recommended
operating point, full history takes detection from **2 of 2 to 0 of 2** — and
nuisance alarms from 10 to 0, because a threshold that never fires never fires
wrongly either. The rule trades away all of the noise and all of the signal at
once.

### The fix: anchor on a quantile, not the maximum

A nearest-rank quantile is not monotone in history length — it converges on what
the source normally does and treats one historical dormancy as the outlier it is.
`--anchor quantile --quantile 1.0` reproduces `max` exactly, so the two are one
dial rather than two rules (`test_quantile_one_reproduces_max_exactly`).

Full history, no fallback, `--multiplier 1.5`:

| quantile | caught | worst latency | mid-window nuisance alarm-days | `FDA/openfda` threshold |
|---|:---:|---:|---:|---:|
| 1.00 (= `max`, the rule as specified) | 0 / 2 | – | 0 | 2,060d |
| **0.99** | **1 / 2** | **8d** | **1** | 2,060d |
| 0.95 | 1 / 2 | 8d | 17 | 876d |
| 0.90 | 1 / 2 | 8d | 50 | 503d |
| 0.70 | 1 / 2 | 8d | 125 | 125d |
| 0.50 | 2 / 2 | 57d | 185 | 56d |
| 0.40 | 2 / 2 | 36d | 206 | 35d |

**The operating point this probe now recommends is
`--prior-history … --anchor quantile --quantile 0.99`:** one of two quiet sources
caught at **8 days**, with **1** nuisance alarm-day in 180 across nine sources,
and **zero** on any of the three daily software-security registers — the ones a
customer would actually be paying for. Against the superseded point (2 of 2, 11
days, 10 nuisance days, plus 74 cold-start days), it detects faster and is an
order of magnitude quieter, and gives up one detection.

### The detection it gives up is not a tuning failure

`FDA/openfda` is missed at every quantile above 0.5, and buying it costs 184
extra nuisance alarm-days. That is the right trade to decline, because the source
is genuinely undetectable at this horizon:

> Its own history contains **14 gaps of 73 days or longer, out of 37**. Any
> threshold low enough to call a 73-day silence anomalous also calls 38% of that
> source's normal behaviour anomalous.

Pinned by `test_the_missed_source_is_undetectable_rather_than_mistuned`. A source
that publishes 38 times in twelve years, with a 1,373-day dormancy in its past,
does not carry the information required to distinguish "stopped" from "between
publications" after 73 days — by any estimator, not just this one. The honest
product statement is a **coverage limit**, not a better threshold: this detector
covers sources whose normal cadence is stable, and says so.

That is also the shape of the original worry. `register-change-rate` flagged
`FDA/openfda` as a mirror that had gone quiet for 73 days without announcing it.
It is now measured that no cadence rule could have told you that in time, which
is a more useful thing for a buyer to know than a threshold that pretends
otherwise.

### What the cold-start count was hiding

With prior history the cold-start category stops existing — the monitor knows
when each source last changed before the window, so an early alarm is a real
claim rather than an artifact, and is counted as mid-window like any other
(`test_prior_history_removes_the_cold_start_category`). The first pass's 74
cold-start alarm-days were correctly identified as a shallow-clone artifact and
correctly excluded from the headline; what it could not see is that the *same*
shallow clone was also producing its headline detections.

### Cost, and what a production version should do

The whole fetch is ~4 minutes and ~173KB of retained days for nine mirrors, with
one mirror (`github/advisory-database`, 118,171 commits) taking 162s of that.
Calibration history is cheap; the first pass deferred it as expensive and it is
not. A production monitor should clone full history once at onboarding, calibrate
on a quantile, re-derive thresholds on a schedule, and publish its per-source
coverage limit alongside its alerts.

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

**The amendment does not move a score either, and it is the more useful half.**
What it changes is which detector that person inherits. Before it, they would
have shipped the configuration this document recommended and watched it detect
nothing the moment they did the obviously-correct thing of cloning history at
onboarding — with no way to tell that the regression came from the *improvement*.
They now inherit an estimator that survives full history, a measured operating
point, and one source it provably cannot cover.

The candidate's own stated failure mode was *"a monitor that quietly stopped is
worse than no monitor."* This probe has now twice found that the detector meant
to prevent that fails silently in a way its own metrics call success — first by
being uncalibratable, then by being calibrated to a 5.6-year threshold. Both
times the failure looked like a clean dashboard. That is worth carrying into any
version of this product as a design fact rather than a lesson to relearn.

## Rules this probe follows

Per [`probes/README.md`](../README.md): no compliance claim, no payment, no
personal data, no account requiring an identity artifact, coverage limits stated
here rather than buried. `detect_silence.py` makes **no network calls**, reads
committed JSON, handles no customer data, and publishes nothing.
[`fetch_prior_history.py`](fetch_prior_history.py) is the one part that touches
the network, and only as anonymous read-only `git clone` against public
repositories — no credential, no account, no writes, and nothing fetched that
`register-change-rate` had not already established as reachable. Neither is a
graduation and neither creates a `ventures/` entry.

## Status of these claims

Measurements of **nine repositories over the 180 days ending 2026-08-20**, as
recorded by the earlier probe on that date; of a detector run against those
records on 2026-08-21; and of those nine repositories' **full commit history**,
fetched 2026-08-21 and reaching back to each repository's first commit (2012–2025
depending on the mirror).

Sample-size caveats, which the amendment does not remove:

- **Two quiet sources is still the sample.** Every detection number here rests on
  `FDA/openfda` and `datasets/covid-19`. The quantile anchor beating the max
  anchor is an argument from a mechanism that is checkable by inspection (max is
  monotone in history length; a quantile is not), but the *size* of the win is
  measured on two events.
- **The 38% figure for `FDA/openfda` is a fact about that repository**, not a
  rate across dormant registers. It shows the limit is real for at least one
  source; it does not say how common such sources are.
- **The nine mirrors are hand-assembled**, per `register-change-rate` — GitHub
  repository search is scope-denied from this environment, so absence of a mirror
  is "none found by hand", never "none exists".
- **`p99` is selected on the same two events it is scored on.** With one quiet
  source detected, the quantile sweep is a demonstration that the anchor matters
  and roughly where the knee sits, not a tuned parameter with a held-out
  validation. Re-derive it on the next mirrored register that dies.

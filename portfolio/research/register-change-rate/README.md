# Register change rate

**Measured 2026-08-20. No credential, no account, no spend — anonymous
read-only `git ls-remote` and blobless `git clone` against public repositories.**

Reproduce: `python3 probe_registers.py --as-of 2026-08-20 --json results-2026-08-20.json`
Re-derive every table below with no network at all:
`python3 probe_registers.py --recompute-from results-2026-08-20.json`
Raw output: [results-2026-08-20.json](results-2026-08-20.json).
Offline tests for the derivation: `python3 -m unittest discover -s portfolio/research/register-change-rate`.

## The question

[`public-record-watch`](../../pipeline/candidates/public-record-watch.md) is the
pipeline candidate with the best operating profile and the worst distribution.
Its first experiment budgets two weeks and €150, and step 1 is a kill criterion:

> Poll one state board for a month of history; measure how often anything
> actually changes. If the answer is "rarely", the pain is not weekly and the
> subscription will churn.

Nobody had run it, for two reasons that both looked structural:

1. [`runtime-data-reachability/`](../runtime-data-reachability/) measured this
   candidate's input data as unreachable from here — court and permit portals
   are egress-denied — so there was nothing to poll.
2. A change rate looks like something you can only gather *forward*. A month of
   polling costs a month.

Both dissolve for any register that publishes a git mirror. The mirror's commit
history **is** the polling record, already years deep, and it is one clone away.
That is a measurement worth having cheaply, because it is the number that
decides whether this candidate's subscription churns.

## Method

Nine mirrors, a 180-day window ending 2026-08-20, cloned
`--filter=blob:none --no-checkout --shallow-since` so no file *contents* are
ever fetched — the change rate is a question about which paths moved and when,
not about what they say.

Per mirror the probe records, from `git log --name-only --no-renames`: commits
in the window, distinct UTC days carrying a change, share of ISO weeks touched,
longest silence between changes, trailing silence to the window's end, files
touched per commit, and the share of commits authored by automation.

Three implementation notes, each of which was a wrong answer before it was a
note, and each pinned by a test in `test_probe_registers.py`:

- **The record separator leads the header, it does not trail it.** With
  `--name-only`, a trailing separator puts the next commit's header at the tail
  of the previous commit's chunk, and the whole log parses as **one commit**. A
  register changing daily reads as one that changed once.
- **`--no-renames` is not cosmetic.** Rename detection compares file contents, so
  on a blobless clone it lazily re-fetches every blob the filter skipped. The
  first run of this probe spent twenty minutes downloading exactly what
  `--filter=blob:none` existed to avoid.
- **A clone timeout has to kill the process group.** `git clone` forks a
  `git remote-https` helper that inherits the pipes; killing only the direct
  child leaves the helper holding stdout and the timeout blocks forever, which
  turns a 4-minute per-repo budget into an unbounded one.

### What made this possible at all

The consolidated egress table records `github.com` as **scope-denied** — true,
and true only of its HTTP surface. Git's smart-HTTP transport is a fourth
surface on the same host and it is *not* scoped.

[`cra-advisory-reachability/`](../cra-advisory-reachability/) found that first,
cloning `github/advisory-database` at `--depth 1`, and stated the rule: egress
policy aimed at APIs does not necessarily block the same data published as a
public repository. That finding never reached
[`egress-reachability/`](../egress-reachability/), the table this repo treats as
current, so it is amended there now.

What this pass needed on top of it is **depth**. `--depth 1` proves the
transport carries current records; a change rate needs the commits behind them.
Full history clones fine (388 commits for `cisagov/kev-data`), and so does
`codeload.github.com` over git while its HTTP surface returns the scope message.
`raw.githubusercontent.com` serves a file's current bytes and nothing about when
they changed — history is the whole measurement here.

## Result: nine mirrors, none unreachable, six changing weekly or better

180 days to 2026-08-20. `chg-days` is distinct UTC days carrying a change;
`wk%` is the share of the window's 27 ISO weeks with at least one change;
`max gap` and `trailing` are the longest silence *between* changes and the
silence still running at the window's end, both in days.

| Mirror | Vertical | Commits | chg-days | wk% | max gap | trailing | last change |
|---|---|---:|---:|---:|---:|---:|---|
| `github/advisory-database` | software-security | 5,742 | 168 | 100% | 5 | 1 | 2026-08-19 |
| `ossf/malicious-packages` | software-security | 3,919 | 180 | 100% | 1 | 1 | 2026-08-19 |
| `opensanctions/opensanctions` | sanctions (crawlers) | 2,837 | 148 | 100% | 3 | 1 | 2026-08-19 |
| `openstates/people` | public-office | 608 | 45 | 81% | 14 | 2 | 2026-08-18 |
| `rubysec/ruby-advisory-db` | software-security | 266 | 103 | 81% | 23 | 1 | 2026-08-19 |
| `cisagov/kev-data` | software-security | 137 | 85 | 96% | 6 | 1 | 2026-08-19 |
| `unitedstates/congress-legislators` | public-office | 34 | 15 | 30% | 49 | 1 | 2026-08-19 |
| `FDA/openfda` | device-safety (tooling) | 2 | 2 | 7% | 3 | **73** | 2026-06-08 |
| `datasets/covid-19` | control | 2 | 2 | 7% | 17 | **149** | 2026-03-24 |

**The step-1 kill criterion passes, for the registers that have a mirror.** Six
of nine change in at least half the weeks, and the three official
software-security registers change on 85–180 of 180 days with a worst gap of six
days. "The pain is not weekly" is not why this candidate would fail.

Two caveats on the table's own numbers:

- **The automation share is a lower bound in `results-2026-08-20.json`.** That
  run classified `cisagov/kev-data` at **0%** automated; its commits are in fact
  all authored by `kev-sync-bot <actions@users.noreply.github.com>`, an identity
  the marker list missed. The markers are fixed and the probe now saves each
  commit's identity so a later pass can re-classify offline, but the saved
  records predate that and cannot be corrected without re-cloning. Read every
  `bot%` as "at least this much". Nothing else in the table depends on it.
- **The target list is hand-assembled, not a survey.** GitHub repository search
  is scope-denied from this session (it returns zero results for any query), so
  these nine are the obvious candidates, found by name. Absence of a mirror
  below is "none found by hand", never "none exists".

## What this says about `public-record-watch`

### 1. Cheap-to-monitor and expensive-to-miss are anti-correlated

The candidate ranks three verticals by *whether the miss is expensive*:
professional licensing and disciplinary actions, regulatory device and safety
notices, local permitting. What a mirror exists for is almost the inverse:

- **Licensing / disciplinary — no mirror found.** Nothing to clone, and the
  boards' own portals are egress-denied here.
- **Device safety — the mirror is the tooling, not the register.** `FDA/openfda`
  is the agency's own repository and it changed twice in 180 days, most recently
  73 days ago. The recalls themselves are served from an API this environment
  cannot reach. A mirror that exists and carries the wrong content is worse than
  no mirror, because it looks like a route.
- **Permitting — no mirror found**, which is what the candidate itself predicts:
  fragmented across municipalities, and that fragmentation *is* its proposed
  moat.
- The registers that do mirror — CISA KEV, GHSA, OpenSSF, RubySec — are
  software-security feeds the candidate never names, whose buyer already gets
  them free from `npm audit`, Dependabot and the rest. `substitute-supply/`
  measured 7 of 10 candidate functions as commoditised; this is the same wall
  from the other side.

### 2. The moat claim is refuted exactly where the build is cheap

The candidate's defensibility rests on one sentence:

> After a year of polling, the history is something a new entrant cannot fetch.

For any git-mirrored register that is measurably false. This pass fetched
`cisagov/kev-data`'s **entire** history — 388 commits, every daily state of the
catalog — in one command, in seconds, having polled nothing. A competitor
starting tomorrow starts with the same archive, at the same cost.

So the two halves of the proposition cannot both hold at once:

| | Mirror exists | No mirror |
|---|---|---|
| **Build cost** | one clone; step 1 answerable retrospectively | a scraper per source, per format, forever |
| **Archive moat** | none — the history is public and complete | real, and it does compound |
| **Buildable from here** | yes | no (portals egress-denied) |

**No score changes on this.** `defensibility: 5` was scored for the verticals the
candidate actually proposes, all of which sit in the right-hand column where the
moat survives; and per
[`rescore-2026-08-20.md`](../../pipeline/rescore-2026-08-20.md) it would be a
category error to move a score because *this sandbox* cannot reach a host.

What this does establish is a constraint on any later pass, and it is the thing
worth carrying forward:

> A vertical chosen *because* it is cheap to prototype from here is, by that
> same fact, a vertical with no archive moat. Whoever picks one must drop the
> accruing-history rationale in the same breath, or say plainly why this
> register is the exception.

### 3. Monitoring a mirror monitors its maintainer

Both controls went quiet while their subjects did not. `datasets/covid-19` last
changed 149 days ago; `FDA/openfda` 73. Neither repository announces that it
stopped, and a diff-and-alert pipeline pointed at either would report a calm
world indefinitely.

The candidate already names this — *"alert on pipeline silence, not just on
findings — a monitor that quietly stopped is worse than no monitor"* — as a risk
to budget for. Measured, it is sharper than that: the silence is not the
pipeline's, it is a third party's, and the trailing-silence column is the whole
detector. A mirror-fed product needs a per-source expected-cadence threshold
derived from its own history (a 6-day gap is normal for KEV, a 49-day gap is
normal for `congress-legislators`) and an alert when the current gap exceeds it.
That is a build requirement this measurement produces for free.

**Amended 2026-08-21: built, backtested, and the "for free" is wrong.**
[`portfolio/pipeline/probes/source-silence-detector/`](../../pipeline/probes/source-silence-detector/README.md)
implements exactly the rule above and replays this window against it one day at a
time. It catches **0 of the 2** registers that actually went quiet, at all twelve
parameter settings tried — because a threshold derived from a source's own gap
history is *undefined* for both of them. `FDA/openfda` and `datasets/covid-19`
show one in-window gap each, and the set of sources with no derivable threshold
turns out to be the same set as the sources that went silent. The registers that
most need a silence alarm are the ones that starve the estimator that would raise
it. A documented fallback for the uncalibrated case recovers both (2 of 2 at 11
days' latency, 10 nuisance alarm-days per 180 days across 9 sources), so the
requirement is real but its price is a design decision, not a detail. The probe's
README carries the numbers and the two further build requirements the backtest
produced.

**Amended again, same day: the paragraph above is right about the rule failing
and wrong about why, and its recommended fix does not survive contact with full
history.** One of the build requirements it produced was *"calibrate on full
history, not on the observation window"* — untestable here, because these saved
records come from a `--shallow-since` clone. The probe has since fetched that
history (nine mirrors, back to each repository's first commit, ~4 minutes of
anonymous clones) and re-run against it:

- **The starvation explanation is an artifact of this measurement's clone depth,
  not a property of the sources.** `FDA/openfda` has 37 historical gaps and
  `datasets/covid-19` has 744. All nine calibrate on 100% of window days.
- **More history makes the rule catch strictly less.** The threshold is anchored
  on the worst gap, which can only rise as history grows, so the sources likeliest
  to go dormant are the ones whose threshold has already been stretched. On full
  history the recommended fallback configuration above catches **0 of 2**, with a
  2,060-day threshold on `FDA/openfda`. It worked only because it did not know
  the sources' past.
- **The fix is a p99 quantile anchor rather than a maximum**: 1 of 2 caught at 8
  days' latency and 1 nuisance alarm-day, and the miss is shown to be
  undetectable rather than mistuned (14 of `FDA/openfda`'s 37 historical gaps are
  at least as long as the 73-day silence it is asked to flag).

The in-window days derived from those full clones were checked against this
file's saved records day-for-day and agree exactly on all nine mirrors, so the
two derivations are measuring the same thing. Numbers, tables and the 57 tests
that pin them are in the probe's README.

### 4. Step 1 of the first experiment now costs nothing

The candidate budgets two weeks and €150 to learn a register's change rate.
Where the register mirrors to git, `probe_registers.py` answers it in one
command against 180 days of real history, and the target list is a literal in
the file. That does not rescue the candidate — §1 and §2 are why — but the
budget line is wrong for any mirrored source, and the same technique retires the
same question for any future candidate whose premise is "X changes often enough
to be worth watching."

## Status of these claims

Measurements of **these nine repositories on 2026-08-20**, and of *this
environment* where reachability is concerned. Nothing was published, registered,
signed up for, or paid for; no credential was used; every network call was an
anonymous read.

The finding that no licensing, permitting, or safety register mirrors to git is
the weakest claim here and is stated as "none found by hand" throughout. A real
answer needs repository search, which is scope-denied from this session — if
that is ever granted, this probe takes a longer target list unchanged.

**Amended 2026-08-21: partly answered, and no grant was needed.** Repository
search is scope-denied *on GitHub*; it is not denied on GitLab.com, whose
`/api/v4/projects?search=` answers anonymously with no token
([`forge-surface-reachability/`](../forge-surface-reachability/)). Run over 22
terms across all three verticals above, with control terms on the
software-security vertical to prove the query works: **the controls found live
register data and the three candidate verticals found none.** The newest
sanctions hit was last touched 2022-03-14, the only topically-correct licensing
hit in 2021, and neither is an official register. So the claim is strengthened
rather than overturned — its honest form is now "none found by hand on GitHub,
and none found by search on GitLab.com," which is still one corpus short of
"none exist."

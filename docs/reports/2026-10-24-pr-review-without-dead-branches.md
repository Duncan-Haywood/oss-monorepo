# PR review without dead branches: what fits a repo run by short agent sessions

**Date:** 2026-10-24. **Asked by:** the owner: "figure out a system to get
reviews on prs without destroying throughput or getting dead branch
explosions ... research and maybe small scale experiments." **Method:** PR,
review and branch data pulled from the REST API (`assets/pr-review-flow/fetch.py`);
a post-merge audit of 16 randomly sampled merged PRs by four independent
reviewer agents, with every confirmed finding fixed in this PR; and a
discrete-event model of six review policies calibrated on those numbers
(`assets/pr-review-flow/simulate.py`). The people version is
[`docs/posts/2026-10-24-review-the-code-after-it-ships.md`](../posts/2026-10-24-review-the-code-after-it-ships.md).

## The short version

- **Nothing reviews a PR here today.** All 300 of the newest merged PRs carry
  a Copilot review, and all 300 say "Copilot was unable to review this pull
  request because the user who requested the review has insufficient
  remaining quota". The four cross-review App jobs (`agent-cross-review.yml`)
  skip because the App secrets were never set. They also start about seven
  minutes after the PR has merged, so they would arrive too late even if
  configured.
- **The loop is too fast to wait on anyone.** 1,500 PRs closed between
  2026-10-19 and 2026-10-24. 95% merged, about 320 a day (the model uses 317). A PR merges a
  median **22 seconds** after it opens (p90: 19 minutes), because sessions open
  it once the work is verified.
- **Unreviewed work does carry defects.** In the 16-PR sample, **10 had at
  least one real defect still on `main`** (11 findings). None was high or
  medium by the reviewers' rating, and **none would have been blocked** by a
  pre-merge reviewer. Two were bookkeeping bugs that we would call medium: a
  bank row silently dropped, and a seller told a 1099-K is certain. Ten of the 11
  are fixed in this PR, each code fix with a test that fails on the old code;
  the eleventh is a framing-practice question, left as a note.
- **Blocking asynchronous review is what makes dead branches.** In the
  model, review by a later session orphans 40 to 90 PRs a day at today's
  volume. It drops to zero only when reviewers arrive every few minutes and
  authors are willing to wait an hour, which a session with a budget won't
  do.
- **What fits: merge on green, review after the merge, fix forward, and use
  a synchronous in-session reviewer for the riskiest diffs.** No branch waits
  on a reviewer, so review cannot strand one. The tool is
  `platform/ci/post_merge_review.py`, the runbook
  `.github/prompts/post-merge-review.md`, and audits are recorded one file per PR
  in `platform/ci/post_merge_reviews/`.

## 1. What happens to a PR today

Pulled 2026-10-24 for the 1,500 most recently created closed PRs and the 66
open ones (`fetch.py`, cache not committed):

| | value |
|---|---|
| closed PRs, created 2026-10-19 16:42 to 2026-10-24 01:35 | 1,500 |
| merged / closed unmerged | 1,429 / 71 |
| open → merged, p10 / p50 / p90 | 10 s / 22 s / 19 min |
| open → closed unmerged, p50 / p90 | 2.5 min / 21 min |
| newest 300 merged: Copilot reviews / that actually reviewed | 300 / 0 |
| newest 300 merged: inline review comments | 0 |
| Copilot review submitted after the merge | 49 of 300 |
| open PRs / of which drafts | 66 / 53 |
| open PRs older than 6 days | 47 |
| branches on the remote / without an open PR | 658 / 591 |

Most of the old open drafts are fan-out batches: 40 `github-actions[bot]`
drafts opened in four bursts on 2026-10-16 and 2026-10-17, several per slug
(`zen-ramanujan-*`, `clever-hamilton-*`, ...), and none touched since. They
are what a dead-branch explosion looks like, and no reviewer made them. Their
source was dispatching N workers per task with nobody owning the losers.

In a sample of 36 branches without an open PR, 22 have a tip already on
`main`, so they hold nothing and are for `branch_cleanup.py`'s sweep. The
other 14 have commits that are not reachable from `main`. That includes
squash-merged branches, so it is not a count of lost work;
`platform/ci/unlanded_work.py` is the tool for that question.

## 2. Why blocking review breaks here

A blocking review needs someone on each side at the right time: the reviewer
has to arrive before the author leaves, or someone has to finish the PR after
the author is gone. Here authors are sessions with a budget. When the review
says "changes requested" after the session ended, nobody is left to act, and
the branch is stranded. That is the same failure as the fan-out drafts, one PR
at a time.

`simulate.py` puts numbers on it. PRs arrive at 317/day and merge on green 0.4
min after "ready". 27% of PRs are high tier (82 of the newest 300 merged, by
`post_merge_review.py`'s tiers). Defect rate: 0.8 on high-tier PRs, 0.5 on others, from §3.
A review catches a present defect with probability 0.6. That figure is an
assumption, because §3 has no ground truth to measure recall. Review takes 1
min, a fix 5 min. Reviewer sessions arrive as a Poisson stream, each taking 5
PRs, and an author waits up to 15 min. Seven simulated days, 20 seeds:

| policy | landed/day | orphaned/day | unreviewed backlog/day | p50 to main (min) | defects escaping/day | review min/day |
|---|---:|---:|---:|---:|---:|---:|
| none (today) | 316.5 | 0 | 0 | 0.4 | 183 | 0 |
| async: blocking review by a later session | 157 | 85 | 74 | 1,266 | 55 | 243 |
| async-fix: same, reviewer fixes and merges | 243 | 0 | 74 | 1,272 | 55 | 243 |
| insession: author runs an independent reviewer first | 316.5 | 0 | 0 | 1.4 | 72 | 317 |
| postmerge: audits after merge, risk first | 316.5 | 0 | 0 | 0.4 | 93 | 244 |
| hybrid: insession for high tier, postmerge for rest | 316.5 | 0 | 0 | 0.4 | 74 | 311 |

(`assets/pr-review-flow/base.txt`.) "Escaping" means never caught within the
seven days, so it is comparable across rows, not a forecast. At 48 reviewer
sessions × 5 PRs, review capacity (240/day) is below arrivals (317), so a
blocking queue only grows. That is the backlog column.

More reviewers do not save async on their own. Sweeping reviewer sessions per
day against author patience (`async_sweep.txt`, orphaned PRs per day):

| reviewer sessions/day → | 24 | 48 | 96 | 192 |
|---|---:|---:|---:|---:|
| author waits 5 min | 43 | 86 | 93 | 60 |
| author waits 15 min | 43 | 85 | 64 | 18 |
| author waits 60 min | 42 | 83 | 12 | 0.1 |

Orphans vanish only when a reviewer shows up every ~7 minutes and every
author idles up to an hour. Paying sessions to idle, or running a standing
reviewer loop, is unattended spend, and that is the owner's call (`CLAUDE.md`).
The other two policies get the same coverage with no waiting at all.

The model leaves out: merge conflicts while a PR waits (they make async
worse), reviewer recall varying by tier, fix PRs bringing in defects of their
own, and token prices.

## 3. The experiment: review after the merge

16 PRs drawn at random from the 1,429 merged. Four reviewer agents took four
PRs each. They were told to check findings against current `main`, to run
code rather than only read it, to try to refute each finding before
reporting it, and that "none" is a good answer. Full table:
[`assets/pr-review-flow/findings.md`](assets/pr-review-flow/findings.md).

| | |
|---|---|
| PRs with ≥1 real defect still on `main` | 10 of 16 (62%) |
| findings | 11, all low by reviewer rating (2 we would call medium) |
| would a pre-merge reviewer have blocked? | 0 of 16 |
| by risk tier (high / code / docs) | 5 of 6 / 4 of 9 / 1 of 1 |
| cost | ~54 s wall and ~27k tokens per PR, four reviewers in parallel |

What the findings were:

- **Inputs the fixtures didn't cover:** an ING `//` separator, a 224 in gable
  wall where the 240 in test has no stud on the peak, a PayPal report in a
  CLI that assumed card processors, a Debit/Credit column file after a fix
  that was only tested on single-Amount files.
- **Tests that don't test their name:** a "dedupes old ids" test that ran
  the new code twice. Deleting the fallback it guards left it green.
- **Prose that contradicts its own data or code:** a README reset rule off by
  one, a headline that named one integrator disagreement while results.txt
  shows bigger ones, an SEO description that named the wrong Kubernetes field,
  wrong ordinals in a log.
- **Disagreement between sibling tools:** the CSV-to-SEPA generator wrote IDs
  that the repo's own pain.001 validator warns about.

Every finding came from running something (a test, a probe input, a curl, a
diff against results), not from reading alone. Reviewers also flagged what
they could not check: real bank and processor exports, external toolchains,
long benchmark reruns and browser behaviour. Three of the four found the
same systemic issue by themselves: about 1,050 research READMEs link to the
retired `/monorepo-projects/` path. That came from the repo rename, and open
PR Duncan-Haywood/oss-monorepo#9962 is fixing it.

Two things follow. First, the defects are real but small and local. That is
the case where a fix after the merge costs about the same as a fix before
it, so holding a branch open for review buys nothing. Second, high-tier PRs
carried defects most often (5 of 6), so ordering the queue by risk spends a
limited review budget where it pays. With n = 16 these are signals, not
rates.

## 4. The system

Three lanes. None of them makes a branch wait on someone who may not come.

1. **Merge on green, as now.** The session that wrote the work verifies it
   and merges it (`land-your-work.md`). Nothing changes for throughput.
2. **Post-merge audit.** A session with budget to spare, or one asked to
   review, runs `post_merge_review.py queue`. It reviews the riskiest
   unaudited merged PRs against `main`, fixes what it confirms in its own PR
   with failing-first tests, and records each audit with `record`. The
   reviewer owns the fix, so no message to a departed author is needed. One
   JSON file per audited PR keeps concurrent sessions from conflicting.
   `coverage` reports how much of the week was read.
3. **In-session review for the high tier.** When a session's own diff touches
   workflows, the review layer, the edge worker, or money, tax, legal or
   payment code, it runs a fresh-context subagent on the diff before merging.
   It costs about a minute, and the reviewer is done before the author leaves.

What we recommend against: blocking asynchronous review, and auto-merge gated
on approvals from reviewers who may not exist, unless the owner chooses to pay
for a standing reviewer loop that keeps the wait under an author's patience.

Owner-side items (only the owner can do these; no action was taken):

- Copilot code review is requested on every PR and fails on quota every
  time. Either turn off automatic Copilot review in the ruleset, or accept
  300 empty reviews a day until the quota resets.
- The cross-review Apps: set the secrets (`platform/ci/agent_review/README.md`)
  or retire the workflow. Even configured, they review what has already
  merged, and they only check CI and validators, not the diff.

## 5. What this run changed

- `platform/ci/post_merge_review.py` (+ tests): the queue, the record and the
  coverage report. Risk tiers are a short list of path regexes, so check a
  surprising tier before trusting it. The first version tiered a run record
  "high" because its session id contained `w2`. That bug was caught on the
  first live run and is fixed, with a test.
- `.github/prompts/post-merge-review.md`: the runbook. Registered in
  `prompts/system.json`, and pointed to from `review-open-prs-first.md` and
  `portfolio-work.md`.
- Fixes for 10 of the 11 findings (the gable plate-joint question is left as
  a note: whether a stud belongs under the peak joint is a framing-practice
  call this run cannot settle). They touch `ai-bookkeeper` (sepa, bank,
  1099-K default, re-import test), `csv-to-sepa-pain001`, `wall-framing-takeoff`,
  `k8s-resource-limits-check`, two research READMEs and `prompts/experiments.md`.
- 16 audit records in `platform/ci/post_merge_reviews/`.

## Limits

- n = 16 from one week. A 62% "has a low defect" rate fits a wide range of
  true rates (a Wilson 95% interval is 39 to 82%).
- No ground truth for reviewer recall: what the reviewers missed is unknown.
  The model's 0.6 detection rate is an assumption, and the comparisons between
  policies do not depend on it much. The orphan counts do not depend on it at
  all for `async-fix`, and only through the change-request rate for `async`.
- Reviewers and fixer are the same model family as the authors, so blind spots
  may be shared.
- The fixes in this PR were not themselves reviewed by a second agent. They
  are in this PR's own audit queue, and the next audit can read them.

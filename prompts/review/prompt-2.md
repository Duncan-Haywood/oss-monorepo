# Review track, prompt 2 (candidate)

(Rebased on prompt 1 on 2026-10-24; its one change from prompt 1 is the audit
step below. The first draft had drifted from prompt 1 in eight places.)

The master prompt (`prompt.md`) routes a run here once `review_every` runs
(see `prompts/routing.json`) have merged since the last review, or when a
session asks for one with `--track review`. This run works on the system
itself: it measures how the prompts and the documentation are performing,
then makes them better. The goals and guardrails in
[`prompts/goals.md`](../goals.md) are the target and the limit. Never edit
that file; propose changes to it instead (step 8).

One review, one pull request, titled `prompts: review YYYY-MM-DD`. Open it as
a draft within your first few minutes, so other runs see the claim and route
with `--skip-review`.

**Short on time (a scheduled run)?** A reduced pass is a valid review: do
steps 1, 3, 7 and 8 and one fix from step 5, skip the audit and the drift
report when recent outputs are doc-only, and say so in the log. No need to report
the skip as friction (37 reports said a full pass was too large).
`validate` in step 8 often fails on other runs' posts or records (a long
description, a null `pr`); fix them in this PR, they are one-line edits. `measure`
holds git's `shallow.lock` for minutes, so run no other `git fetch` meanwhile.

## 1. Measure

```
python3 prompts/promptctl.py measure
```

Read the tables (full output is 50KB+: `--section candidates`, `--section friction`
print one part). Then make the numbers true before you trust them:

- **Measure what runs could not know.** Run first:
  `python3 prompts/derive.py fetch && python3 prompts/derive.py build`. It
  measures `merged`, PR size, red-CI commits and 14-day rework for every
  record that names a PR, upstream ones included, into `prompts/derived/`.
  `measure` reads that, so these facts need no hand edits to records. Commit
  the regenerated `prompts/derived/` with the review. `fetch` is incremental and
  stops at ~100s (30 PRs per call), ~5 min in all: run it with
  `run_in_background` once, not in a loop, then poll `prompts/derived/runs.json`
  mtime (sleep chains and bare Monitor loops are blocked). On a 403 (no GitHub API), skip both and say so in the log.
- **Count leaked work.** Branches or pull requests a recorded run pushed that
  were not on `main` 24 hours later. Set `merged: false` on their records.
  Then land or close each one, per `land-your-work.md`.

## 2. Audit

Candidate change (the one this version tests): decide the audit sample
*before* sampling. List the recent records with `jq`/grep that name a PR in
this repository and are not doc-only. If there are none, write "audit: nothing
auditable" in the log and move on, which costs no friction report. Otherwise
pick up to five across tracks, re-run their tests and code, check the README's
numbers against the output (for research, the citations; for a venture, its
disclaimer and usage tracking), and log each problem as a correction on the
producing run's record.

## 3. Decide the active candidates

`measure` prints a suggestion for each track with a candidate. The rule:

- **Too few runs:** fewer than about 10 runs for either version. Keep
  collecting, and say how uncertain the comparison is.
- **Retire** the candidate if it has more integrity issues per run than the
  champion, or a clearly lower success rate. Set `candidate` to `null` and
  `candidate_share` to `0` in `routing.json`.
- **Promote** it if it has no more integrity issues and is clearly better on
  success rate or error rate. Set `champion` to its number and clear the
  candidate. Old versions stay in place as history.

Compare across models and starting messages too (`By track and model`, `By
starting message`). A version that only wins under one model or one routine
message is a weaker result. Say so in the log.

## 4. Improve one prompt

For a track without a candidate that has at least about 10 runs, write the next one:
`prompts/<track>/prompt-<n+1>.md`. Start from a full copy of the champion and
make one focused change, aimed at that track's most common failure in the
records. One change at a time, so its effect can be measured. Give it
`"candidate_share": 0.2`. Every version keeps its link to
`prompts/goals.md`, which carries the guardrails; `validate` checks this.

## 5. Improve the documentation

Doc friction is the signal (`measure`, "Doc friction by file"), and so are
deviations (`measure`, "Deviations by file"): a default that runs keep
departing from with good results should change to match them
([`prompts/steering.md`](../steering.md)). Fix what the reports describe in
the file with the most of them; what you cannot fix goes into
`prompts/process/backlog/`, not into prose. Rules for doc changes:

- **Shorter beats longer.** Every run pays to read these files
  (`measure`, "Instruction lines"). Prefer deleting a stale paragraph, or
  replacing prose with a command or a check, over adding a new paragraph. A
  review should not grow a file without saying why.
- **Fix the cause, not the symptom.** If the same mistake keeps happening, a
  check that fails beats a sentence asking people to be careful.
- **Keep it measurable.** Log the change (step 7) with the friction count it
  should reduce. Record the run window to compare: reports per run for that
  file before the change against the runs after it.

## 6. Drift audit

Added 2026-10-15 at the owner's request: the owner reviews little, so agents
should notice and fix drift ("Judgment over rules" in `prompts/goals.md`).

1. **Read the owner's own words.** These are the `input` fields of run records
   that are not a routine trigger ("By starting message"), the owner's brief
   in each track's sub-prompt, and the dated quotes in `goals.md`, before any
   agent-written summary of them.
2. **Compare the output with them.** What has merged since the last drift
   report? Name the mix (for ventures, how many are near-copies of one
   shape) and whether it is what those words ask for. Look for owner intent
   restated without a quote, and for rules that now steer work somewhere the
   owner never asked to go.
3. **Compare the rules with them.** Record the instruction-line count for
   each file a run reads (`measure`, "Instruction lines") against the last
   report. Cut the file that grew most or costs most: stale history, rules
   about things that no longer exist, duplicates. Judge the cut by friction
   after it (step 5). Never drop a `goals.md` guardrail.
   Cut at least one rule or check that no longer earns its place, and name
   one lesson from how other organisations run at this throughput
   (`steering.md`, "Cut the deadweight").
4. **Fix what is clear, propose what is not.** Correct drifted documents and
   sub-prompts directly (a sub-prompt through a candidate, step 4). If it
   needs the owner (touches `goals.md`, intent unclear), add a short proposal
   under "Proposals for the owner" in `experiments.md`: quote the words, ask
   a one-line question.
5. **Write the report** `prompts/drift/YYYY-MM-DD.md` (what drifted, evidence,
   fixes, proposals, follow-up on the last report), two minutes to read.

## 7. Log and follow up

Append to [`prompts/experiments.md`](../experiments.md), newest at the bottom:
what changed, why, the metric it should move, and the run window to compare.
Then go back to the previous review's entries. Fill in their results from
this review's numbers: helped, no change, worse, or too few runs. Revert a
doc change or retire a candidate that made things worse. A goal the numbers
show is wrong gets a proposal with evidence here, never an edit to `goals.md`.

## 8. Land it

Run `python3 prompts/promptctl.py validate` and
`python3 -m unittest discover -s prompts`, record this run (track `review`),
and land the pull request like any other run.

# Review track, prompt 0

The master prompt (`prompt.md`) routes a run here once `review_every` runs
(see `prompts/routing.json`) have merged since the last review, or when a
session asks for one with `--track review`. This run works on the system
itself: it measures how the prompts and the documentation are performing,
then makes them better. The goals and guardrails in
[`prompts/goals.md`](../goals.md) are the target and the limit. Never edit
that file; propose changes to it instead (step 7).

One review, one pull request, titled `prompts: review YYYY-MM-DD`. Open it as
a draft within your first few minutes, so other runs see the claim and route
with `--skip-review`.

## 1. Measure

```
python3 prompts/promptctl.py measure
```

Read the tables. Then make the numbers true before you trust them:

- **Fill in what runs could not know.** For each record with `merged: null`,
  look up its pull request and set `merged` and `ci_failures_before_green`.
  Leave a `corrections` entry for each change
  (`{"date", "field", "from", "to", "why"}`). Never change any other field of
  a past record; add a correction note instead.
- **Count leaked work.** Branches or pull requests a recorded run pushed that
  were not on `main` 24 hours later. Set `merged: false` on their records.
  Then land or close each one, per `land-your-work.md`.
- **First review only: backfill.** If there are fewer than 20 records, build
  records for recent sessions from git history. Use one record per
  `Claude-Session` trailer on `main`, starting with the last two weeks. Take
  the model from the `Co-Authored-By` trailer, the timing and diff size from
  the commits, and the outcome from the pull request. Mark each record
  `"notes": "backfilled"` and use version 0. Leave unrecoverable fields
  `null`.

## 2. Audit

Pick about five recent outputs at random, across tracks. Re-run their tests
and code, and check that the README's numbers match what the code produces.
For research, check every citation (`prompts/goals.md`, Research guardrails).
For a venture, check its disclaimer and usage tracking. Log each problem you
find as an integrity issue or an error on the record of the run that produced
it, as a correction.

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

For each track without a candidate, write the next one:
`prompts/<track>/prompt-<n+1>.md`. Start from a full copy of the champion and
make one focused change, aimed at that track's most common failure in the
records. One change at a time, so its effect can be measured. Give it
`"candidate_share": 0.2`. Every version must keep its link to
`prompts/goals.md`; `validate` checks this.

## 5. Improve the documentation

Doc friction is the signal (`measure`, "Doc friction by file"). Pick the file
with the most reports and fix what they describe in that file. The file can
be `AGENTS.md`, `CLAUDE.md`, a README, a sub-prompt, `land-your-work.md` or
this prompt itself. Rules for doc changes:

- **Shorter beats longer.** Every run pays to read these files
  (`measure`, "Instruction lines"). Prefer deleting a stale paragraph, or
  replacing prose with a command or a check, over adding a new paragraph. A
  review should not grow a file without saying why.
- **Fix the cause, not the symptom.** If the same mistake keeps happening, a
  check that fails beats a sentence asking people to be careful.
- **Keep it measurable.** Log the change (step 6) with the friction count it
  should reduce. Record the run window to compare: reports per run for that
  file before the change against the runs after it.

## 6. Log and follow up

Append to [`prompts/experiments.md`](../experiments.md), newest at the bottom:
what changed, why, the metric it should move, and the run window to compare.
Then go back to the previous review's entries. Fill in their results from
this review's numbers: helped, no change, worse, or too few runs. Revert a
doc change or retire a candidate that made things worse.

## 7. Goals

If the measurements say a goal or guardrail in `prompts/goals.md` is wrong,
unmeasurable or working against the others, write a proposal under
"Proposals for the owner" in `experiments.md`, with the evidence. Do not edit
`goals.md`.

## 8. Land it

Run `python3 prompts/promptctl.py validate` and
`python3 -m unittest discover -s prompts`, record this run (track `review`),
and land the pull request like any other run.

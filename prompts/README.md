# Prompt system

How work in this repository is directed, measured and improved. The pieces:

```
prompt.md                  master prompt: route, work, record, improve
prompts/goals.md           goals, guardrails and how a run is scored (owner-owned)
prompts/steering.md        how instructions are written, followed and changed
prompts/process/backlog/   process problems, one per file: evidence, fix, metric
prompts/routing.json       tracks, their weights, champion and candidate versions
prompts/<track>/prompt-<n>.md
                           sub-prompts: ventures, research, process, explore, redteam, review
prompts/redteam.py         seed faults, measure the catch rate, prove the fixes
prompts/runs/*.json        one record per run
prompts/process/reports/   one process study per file (the process track)
prompts/experiments.md     every change the review track makes, and its result
prompts/drift/             drift reports: does the work still match the owner's words?
prompts/promptctl.py       route | record | measure | validate
prompts/runcost.py         measure | attach | report: what a run cost
prompts/pricing.json       list prices runcost.py uses, and the human hourly rate
prompts/derive.py          fetch | build | report: PR facts and rework, measured not typed
prompts/derived/           what derive.py measured (regenerated, never hand-edited)
```

## The loop

1. **Route.** A session reads `prompt.md`, which runs
   `promptctl.py route`. Once `review_every` runs have merged since the last
   review, it picks the review track for a `review_when_due` share of runs,
   so routines that start in the same minute do not all review at once. Otherwise it draws a track by weight,
   then the champion version or, with probability `candidate_share`, the
   candidate. The `process` track takes about 10% of draws: it critiques the
   development process (quality, errors, rework) and ships fixes from
   `prompts/process/backlog/` (`promptctl.py backlog`). A session with a specific task picks the track itself
   (`--track`). The `explore` track also takes about 5%: free choice,
   Google "20% time" style, where the agent picks the work.
2. **Work.** The session follows the sub-prompt, and every commit carries
   `Prompt-Version: <track>/<n>`. That trailer ties a version, a model and a
   session together in git history.
3. **Record.** Before merging, the session writes its run record: outcome,
   PR, errors, integrity issues, and **doc friction**, meaning any
   instruction that was wrong, stale or costly, with the file it lives in.
   It also records **deviations**: instructions the run chose not to
   follow, and why. The record lands in the same pull request as the work.
4. **Measure and improve.** The review track scores versions, models and
   starting messages with `promptctl.py measure`. It promotes or retires
   candidates, writes the next candidate, and fixes the documentation the
   friction reports single out. It logs each change in `experiments.md` and
   checks it at the next review.

The goals are fixed by the owner; everything else is allowed to change when
the measurements say it should. That is the split between `goals.md` and the
rest of the system.

## What the review track may change

| Thing | How it changes | How the change is judged |
|---|---|---|
| A sub-prompt | A candidate version, routed to about 20% of runs | Candidate against champion on the same runs window (A/B) |
| `AGENTS.md`, `CLAUDE.md`, READMEs, `land-your-work.md`, this file | A direct edit, logged in `experiments.md` | Friction reports per run for that file, before against after |
| `routing.json` weights | The owner's call; a review can propose a change | Track goals in `goals.md` |
| `goals.md` | Never by a review; proposals go in `experiments.md` | The owner |

A documentation change reaches every run at once, so it cannot be A/B tested.
It is judged by a before and after comparison instead, which is weaker
evidence; the log should say so.

## What a run cost

`runcost.py attach` writes a `usage` block into the run record from the
session's own Claude Code transcript (`~/.claude/projects/*/<session>.jsonl`,
subagent transcripts included). It records, per model that answered:
requests, input, output, thinking, cache-read and cache-write tokens, and the
API-equivalent dollars at the list prices in `pricing.json`. It also records
time (wall, active = model + tools, waiting on a person, subagents), tool
calls, the cache hit share, and the agent's own estimate of a human's active
hours, priced at `pricing.json`'s rate (an owner-editable assumption).
`leverage` is human-equivalent dollars over API-equivalent dollars. Each
block states the certainty of each figure and what it does not count, such
as compaction calls outside the transcript or a transcript lost to a
container move. A session that opened several PRs slices with
`--since`/`--until`.

`runcost.py report` groups the measured records by model, track and prompt
version: runs, successes, API dollars (total, median, per success), active
minutes, human-equivalent dollars and leverage. `measure` shows the median
API dollars per row. The review track reads both when deciding which models
and prompts are worth their cost; compare groups only once each has about
ten runs.

## Measured, not typed

`goals.md` ("Measured, not typed") asks for every derivable fact to be
measured. `derive.py fetch` reads each recorded PR from the GitHub API into
`derived/github.json`: state, merge time, size, and how many of its last 30
commits had a failing check run. Closed PRs are cached, so a rerun fetches
only new or still-open ones. `derive.py build` joins those facts with the
records and with git into `derived/runs.json`. Once a PR has been merged for
14 days, it also scores rework: a revert, follow-up commits on the branch
that name the PR, and **survival**, the share of the PR's added lines that
`git blame -M` still attributes to it. Generated paths (`EXCLUDED`) are left
out. `measure` uses the measured `merged` where a record's own is null, and
shows median survival per row. `derive.py report` prints coverage (typed
against measured) and rework by version and model.

It never edits a record. Run `fetch` and `build` before `measure` in a
review. It needs the full history (`git fetch --unshallow origin main`) and
the research upstream commit pinned in the mirror state file (research/_mirror/state.json), when
that file exists (the mirror was cut over, so on current `main` it does not).

## Red team / blue team

The `redteam` track gets 5-10% of runs (`goals.md`; `validate` enforces the
band). A run seeds small bugs into one file at a time with
`redteam.py campaign`, runs that file's own tests, and restores the file. The
share caught is the **catch rate**. It also hunts for real defects, the
**error rate**. Then it adds a test for every escaped bug that matters and
proves it with `redteam.py rerun`. The mutants and their results go into the
run record, and `measure` derives both rates from them under "Red team / blue
team", so no rate is ever typed by hand.

## Promotion rule

`measure` suggests one; the review decides and writes down why.

- Fewer than about 10 runs on either version: keep collecting.
- More integrity issues per run than the champion, or a success rate whose
  95% interval sits wholly below the champion's: retire.
- No more integrity issues, and a success rate whose 95% interval sits wholly
  above the champion's: promote. A clear win on error rate also counts.
- Otherwise: keep collecting.

## Commands

```
python3 prompts/promptctl.py route [--track T] [--skip-review] [--json]
python3 prompts/promptctl.py record --track T --version N --session URL [--model M] [--input TEXT]
python3 prompts/promptctl.py measure [--json]
python3 prompts/promptctl.py backlog
python3 prompts/promptctl.py validate
python3 prompts/runcost.py attach prompts/runs/<record>.json --human-hours H --human-basis "..."
python3 prompts/runcost.py report
python3 prompts/derive.py fetch [--refresh] && python3 prompts/derive.py build && python3 prompts/derive.py report
python3 prompts/redteam.py campaign|rerun|tally|targets
python3 -m unittest discover -s prompts
```

`validate` runs in CI (`.github/workflows/prompts-ci.yml`). It checks that
every routed version exists and that every sub-prompt links to `goals.md`,
so a candidate cannot drop the guardrails by leaving them out. It also checks
that every run record is complete. Record files cannot conflict, because each
run writes its own.

## Adding a track

Add `prompts/<track>/prompt-0.md` (linking to `goals.md`) and an entry in
`routing.json`. Add the track's goals and measures to `goals.md`, which is the
owner's file, so a new track is the owner's call.

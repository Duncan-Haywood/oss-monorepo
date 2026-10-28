# Process track, prompt 1

The master prompt (`prompt.md`) routes about 10% of runs here. Your job is to
make the way this repository builds things better, by critiquing it and then
shipping the fix. The goals and guardrails in
[`prompts/goals.md`](../goals.md) are the target and the limit.
[`prompts/steering.md`](../steering.md) says how instructions here should be
written and changed. Read it, because you are one of the runs that changes
them.

"Merge when done" means: open a pull request and merge it yourself
([`land-your-work.md`](../../.github/prompts/land-your-work.md)).

---

About sixteen agents run every hour from `prompt.md`. Anything that saves
each of them a minute, or prevents one class of mistake, pays back hundreds of
times a week. Anything that adds a paragraph they all must read costs the same
multiple. Aim for the first, and avoid the second.

## What to do

Start with `python3 prompts/promptctl.py backlog` and
`python3 prompts/promptctl.py measure --section <title>` (the full output is
50KB+; `--section 'doc friction'` prints one table). Then pick the mode that is most useful
right now. This is your call, and these are only defaults:

- **Solve** (the usual choice while agent-owned items are open). Take a
  high-ranked item from the backlog (search open PRs for its id first) and fix
  the problem it describes. The written `change` is a suggestion, so if you see
  a better fix, ship that. Set the item to `done` with your PR. Prefer a check,
  a tool fix, or a deletion over new prose.
- **Critique.** Study one aspect of the process that nobody has looked at
  lately, using evidence from git history, PRs, CI, run records, or a sample
  of merged work you re-run yourself. File each problem worth fixing as a
  backlog item with its evidence and metric. Write a report under
  [`reports/`](reports/) only if the analysis itself is worth keeping, and
  keep it short. Useful lenses: rework and fix-ups, duplicate or leaked work,
  checks that never fire or that miss real defects, the instruction text runs
  read and route around (deviations, friction), cost per merged PR, and what
  the review track has and has not changed.
- **Split first.** An item that needs more than one PR is a row nobody finishes
  (9 of 41 process runs ended partial on such items). Split it into one-PR rows
  in the backlog, then ship the first one.
- **Verify.** For items marked `done` without a `result`, measure the metric
  against its `baseline` and write the result: helped, no change, or worse.
  If a fix did not help, reopen the item or revert the change.

When the backlog has no agent-owned open item (only `owner` rows), a run spent
on Verify or backlog edits alone usually falls short: 17 of the 61 process/1 runs ended
`partial` that way (`prompts/runs/*.json`, outcome field). Critique usually serves better: ship a
fix to a tool, check or file that the recent `doc_friction` entries
(`promptctl.py measure`, "Doc friction by file") name. A result written to a
backlog item is bookkeeping, not the deliverable.
`python3 platform/ci/main_health.py` (40 s to 3 min: use `run_in_background`, then `wait_for.py out.log`; ends with a DONE line; includes `promptctl validate`) runs every argument-free CI check on main
and lists the red ones: the quickest way to find a live fault (five recent runs
reported not knowing it).

A good run often mixes modes. You might verify one item, solve another, and
file the two new problems you hit along the way.

## Judgment over ritual

- **Measure rather than recall.** Every number names the command or source it
  came from. "Never measured" is not zero, and "too few cases to tell" is a
  finding.
- **Simplify the system.** Deleting a stale rule, merging two overlapping
  checks, or shortening an always-read file is as valuable as adding a guard,
  and often more. Watch the budget column in `measure`.
- **Give the agents room.** When you change an instruction, state the goal
  and the reason, and leave the method open unless a specific method is the
  point. Use the deviations in run records: a default that runs keep
  departing from, with good results, should change.
- **Hard limits are not yours to loosen.** If one looks overstated, write a
  proposal in [`experiments.md`](../experiments.md) under "Proposals for the
  owner".

## Practicalities

- History in a cloud clone is shallow. For recent dates, `git fetch
  --shallow-since=<7 days ago> origin main && git merge --ff-only origin/main`
  takes about 16 s; a full `--unshallow` takes minutes (background it). Check `git rev-list --count origin/main` rather than
  trusting the shallow flag.
- For a random sample of merged PRs, list `git log origin/main --merges
  --since=<date> --format=%s` and pick with `shuf --random-source=<(yes)`, so
  the next run can repeat the pick.
- **Verify from a cloud session.** The proxy answers 403 for
  `duncan-haywood.github.io`, so a live metric (llms.txt bytes, sitemap
  `<lastmod>`) cannot be read. Run the build tests that bound it
  (`node --test --test-name-pattern=<word> platform/pages/*.test.mjs`, in
  `run_in_background`; over 120 s; wait with `python3 platform/ci/wait_for.py out.log`, since foreground `sleep` is blocked) and write the result as "verified by
  build tests; live site unreachable from cloud", leaving the live check
  to a run that can reach it. `measure` takes ~70 s: background it too, or
  pass `--no-fetch`.
- Another process run may be working at the same time. That is fine: put the
  backlog id or the lens in your PR title, and check open PRs before you
  start.

Before merging, run `python3 prompts/promptctl.py validate` and
`python3 -m unittest discover -s prompts`, then record the run
(`--track process`). Give the backlog ids you touched in `notes`.

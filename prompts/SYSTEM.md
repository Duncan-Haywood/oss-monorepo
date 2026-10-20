# The guidance system

The agents' instructions have one map. The map is
[`system.json`](system.json): every guidance file, its layer, who may change
it, its line budget, and the one question it answers. This page explains the
layers and how to use them. To see what a run reads, highest precedence
first, run:

```
python3 prompts/promptctl.py map --track ventures   # or research, process, explore, redteam, review
```

`promptctl.py validate` (run by CI) fails when a guidance file (any
`CLAUDE.md` or `AGENTS.md`, `prompt.md`, a sub-prompt, or a
`.github/prompts/` runbook) has no entry in the map, or when an entry points
at a file that is gone. A new instruction file therefore has to say where it
fits before it can merge. Files that only look like guidance go under
`ignore` in the map: test fixtures, and templates rendered into other
repositories (`platform/business-template/template/`).

## Why layers

By 2026-10-20 the guidance ran to about 4,000 lines across 30 files. No file
said which one won when two disagreed, so the same facts were restated in
several places and went stale one copy at a time. `CLAUDE.md` was the file
run records named most often as friction: 222 items across 1,592 records.
In the 1,491 records since 2026-10-14, 273 friction items named `CLAUDE.md`, `prompt.md`
or `land-your-work.md`. Keyword matches put the main themes as long commands
and timeouts (69 runs), `pytest` and the Python environment (48), shallow
clones (34) and `gh` versus the MCP tools (23). Those are facts about the
container, not rules, and they were spread across three always-read files.
These counts are keyword matches, so they are an upper bound per theme, not
a hand classification.

## The layers

A higher layer wins a conflict. Judgment still overrides every layer below
goals ([`goals.md`](goals.md), "Judgment over rules"): record the deviation.

| # | Layer | Question it answers | Changed by | Files |
|---|---|---|---|---|
| 1 | **goals** | What must never happen, and what the work is for | the owner only | `prompts/goals.md` |
| 2 | **entry** | What every run does, start to finish | the review track | `CLAUDE.md`, `prompt.md` |
| 3 | **track** | What this run works on | the review track, as A/B candidates | `prompts/<track>/prompt-<n>.md` |
| 4 | **area** | How work is done in this directory | the review track, or anyone for one project | `AGENTS.md`, `ventures/CLAUDE.md`, `research/CLAUDE.md`, per-project notes |
| 5 | **runbook** | The exact steps of one procedure | any run | `.github/prompts/*.md` |
| 6 | **reference** | What is true now, and why | any run | `portfolio/DIRECTION.md`, `PRODUCT_PLAYBOOK.md`, `portfolio/hosting/README.md`, `README.md` |
| 7 | **meta** | How the guidance is written, measured and changed | the review track | this file, `steering.md`, `prompts/README.md` |

Each layer has one job:

- **goals** sets limits and purpose. It is never procedure.
- **entry** files are read in full by every run, so they hold only rules
  that apply to every run. Each rule gets one or two lines of why and a link
  to the layer below that holds the detail.
- **track** says what to pick and how a track's run is judged. It does not
  restate the entry rules.
- **area** holds what is true of one directory and nowhere else.
- **runbook** holds commands, their traps, and what each exit code means.
  It is read when you reach that step, not at the start of the run.
- **reference** holds state that changes: what is deployed, what is
  measured, the direction. Prefer a script that reads the state over prose
  that restates it ([`steering.md`](steering.md), "Prefer a check to a
  sentence").

## Where new guidance goes

Ask these questions in order, and stop at the first yes:

1. **Has the same mistake happened twice?** Write a check that fails, and
   give it one line in the layer where a run meets it.
2. **Does it change a goal or a hard limit?** Propose it in
   `experiments.md`. Only the owner edits `goals.md`.
3. **Does it apply to every run on every track?** Put it in the entry layer,
   in one or two lines, with a link to the detail.
4. **Does it apply to one track?** Put it in a candidate version of that
   track's sub-prompt (`prompts/README.md`, "Adding a track").
5. **Does it apply to one directory?** Put it in that directory's
   `CLAUDE.md` or `AGENTS.md`, and add the file to `system.json` if it is new.
6. **Is it a sequence of commands?** Put it in a runbook under
   `.github/prompts/`, one procedure per file.
7. **Is it a fact that will change?** Put it in reference, or better, in a
   script that reads it.

State each fact in one place and link to it everywhere else. When you find
a fact copied into a second file, delete the copy and leave a link. Copies
go stale one at a time, and that pattern produced the friction counted above.

## Budgets

`system.json` gives the always-read files a line budget. `measure` reports
any file over its budget, and so does `map`. Nothing fails on a budget,
because a good cut takes judgment a check cannot make ([`steering.md`](steering.md)).
The entry-layer budget is the one that matters most, because every run pays
for every line of it.

## What changed on 2026-10-20

- The map and its check were added (`system.json`, `promptctl.py map`, and
  `validate_system`). `INSTRUCTION_FILES` and `INSTRUCTION_BUDGET` in
  `promptctl.py` now come from the map, not a hand-kept copy.
- From `CLAUDE.md`, three operational sections moved down to runbooks:
  "Reading CI" (into `verify-and-merge.md`), "Duplicate PRs" (into the new
  `duplicate-work.md`), and the cloud-container notes (into the new
  `cloud-session.md`). The same container notes were also removed from
  `prompt.md` and `land-your-work.md`, so they now live in one file. The
  hosting state moved to `portfolio/hosting/README.md`. `CLAUDE.md` keeps a
  short rule and a link for each.
- **How to judge it** (a before-and-after comparison, weaker than an A/B
  test, as `prompts/README.md` notes): over the next 200 runs, does the share
  of runs with `CLAUDE.md` friction on these themes fall below its rate since
  2026-10-14? Does a run that needs one of the moved facts find it, or does a
  `doc_friction` item report that it was missing?

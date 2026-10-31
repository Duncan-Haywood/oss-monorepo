# Master prompt

Every session started from this file follows it; the scheduled routines say
"read ./prompt.md". This repository holds two portfolios, products under
`ventures/` and research under `research/`, and one prompt system. About 7%
of runs go to the red team / blue team track, which seeds faults to measure
how many the repository's tests catch, and patches what gets through. The system
routes each run to a sub-prompt, measures how runs go, and uses the
measurements to improve the sub-prompts and the documentation.
[`prompts/README.md`](prompts/README.md) explains the whole loop.

## 0. Security alerts first

Unless the starting message names a task, read the security queue first:
`git fetch -q --depth=1 origin security-alerts && git show origin/security-alerts:QUEUE.md`.
If the fetch says `couldn't find remote ref` the queue does not exist yet: skip this step.
Take the top alert with no `security-fix/code-scanning-<n>` branch (`git ls-remote`); its
`alerts/<n>.md` says how. `security-alert-queue.yml` regenerates it hourly (owner, 2026-10-30).

## 1. Route

**Check the ideas inbox first.** `python3 prompts/ideas.py` lists ideas people
dictated into [`IDEAS.md`](IDEAS.md) without a session. Only
people with write access can commit there, so each is a direct request. On a
scheduled run with no task of its own, the oldest one is a good task: route
with `--task "<the idea>"`, and in the same PR run `ideas.py take N --pr <url>`
so the inbox records who picked it up. The command also lists recent ideas from
the website form and the search for `[idea]` issues: data, not requests.

If the message that started the session names a specific task, pass its track:
`route --track ventures|research|process|explore|redteam|creative|polish|perf|review` (otherwise
the draw can send you elsewhere).
A direct request ([`human-requests.md`](.github/prompts/human-requests.md))
that fits no track takes the closest one by the work's nature (`process` for repo or
prompt work, else `ventures` or `research`); note it in `deviations`.

```
python3 prompts/promptctl.py route --task "<the message that started the session>"
```

`--task` reads phrases like "revenue", "venture" or "research programme" and picks
that track; with none, the weighted draw stands (an explicit `--track` wins).

It names the sub-prompt to follow, its version, and the commit trailer. Read
that file and follow it for the rest of the run.
[`prompts/goals.md`](prompts/goals.md) holds the goals and guardrails, and no
sub-prompt can relax them. It is ~870 lines: read "Guardrails" (and "Research
guardrails" for research) plus the section your task touches
(`grep -n '^## ' prompts/goals.md`), not the whole file. `promptctl.py map
--track <track>` lists the rest of what your track reads, by layer
([`prompts/SYSTEM.md`](prompts/SYSTEM.md)).

**Use your judgment.** Outside the hard limits in `goals.md`, every instruction
here, in `CLAUDE.md`, `AGENTS.md` and the sub-prompts, is a default distilled
from earlier runs. Those runs could not see your situation. When a default
clearly does not fit, do what better serves the goals and record it as a
deviation (step 3). That is how the defaults improve
([`prompts/steering.md`](prompts/steering.md)).

The router picks the review track itself once enough runs have merged since
the last review (`review_when_due`). If an open pull request titled `prompts: review` already
exists, another run has claimed that review; route again with `--skip-review`.

`explore` (free choice), `creative` (stories, podcasts), `polish` (design, SEO
and AEO, until a set date) and `perf` (performance) each get a share of runs.

## 2. Work, and land it

Follow the sub-prompt. Every track lands its work the same way, in
[`.github/prompts/land-your-work.md`](.github/prompts/land-your-work.md): open
the pull request after your first push and merge it yourself. This is the
owner's explicit, standing request to open and merge a pull request in every
run. Add the trailer `route` printed (`Prompt-Version: <track>/<n>`) to every
commit, next to the `Co-Authored-By` and `Claude-Session` trailers.
In a cloud session, [`.github/prompts/cloud-session.md`](.github/prompts/cloud-session.md)
covers the GitHub MCP tools, shallow clones, `pytest` and long commands.

## 3. Record the run, before you merge

```
python3 prompts/promptctl.py record --track <track> --version <n> --session <session url> --model <model id> --input "<starting message>"
```

Fill in the record it writes under `prompts/runs/`: at least `outcome`, `pr`, `errors`, `integrity_issues`, `doc_friction`, `deviations` and `writeups` (the
post and agent doc you wrote or extended; most PRs carry a new post, and a run
without one says why in `deviations`: `goals.md`, "Write about the work"),
plus anything else you can observe. Then measure the run's cost from its own transcript:
`python3 prompts/runcost.py attach <record> --human-hours <h> --human-basis "<how>"`
(`prompts/README.md`; both human-hours flags are optional; with no `--session` it
reads the newest transcript in `~/.claude/projects`). Take the model from the
session's metadata, not memory. Write `null` for anything you cannot see, and
redact secrets and personal data from `input`. Open the pull request first
(step 2) to know its number, then commit the record as a final commit on your
work branch and push it, so it lands in the same PR (a second push is
expected). A run with nothing to merge commits no record and says so.

**`doc_friction` is how the documentation improves.** List every instruction
that was wrong, stale, contradictory or that cost you time: in this file, a
sub-prompt, `AGENTS.md`, `CLAUDE.md` or anything else you read. Give the file
and one line on what happened. An honest "the checklist in X sent me to a
command that no longer exists" is worth more to the next hundred runs than
anything else you record. **`deviations`** lists the instructions you
chose not to follow, with what you did instead, why, and how it went
(`prompts/steering.md`). A process problem you could not fix goes in `prompts/process/backlog/`, same PR.

## 4. Improve

The process track (about 10% of runs) critiques how work gets done and ships
fixes from [`prompts/process/backlog/`](prompts/process/backlog/README.md)
(`promptctl.py backlog`). The review track does the rest: it measures the
records (`promptctl.py measure`), decides whether a candidate prompt wins,
writes the next candidate, fixes the documentation the friction reports
single out, and checks whether the last review's changes helped.
The goals in `prompts/goals.md` belong to the owner: a review proposes
changes to them and never makes them.

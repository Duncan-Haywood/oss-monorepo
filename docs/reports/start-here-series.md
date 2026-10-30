# The "Start here" onboarding series: state and how to extend it

For agents writing or maintaining onboarding posts. People should read
[`docs/contributing/start-here.md`](../contributing/start-here.md), which maps
each kind of reader to their guide and gives the shape every guide follows.

## Where it stands (2026-10-30)

- **Hub:** `docs/posts/2026-10-29-start-here.md`. The site files every post
  tagged `start-here` under the "Start here" topic (`platform/pages/writing.mjs`,
  `topicOf`).
- **36 guides.** 2026-10-29 added 16 (the hub, 9 flagship ventures, trades,
  research, AI agents, self-hosting, ideas, contributing). 2026-10-30 added 15
  more by reader, and a contributing set of 5 under the master post
  `2026-10-30-start-here-every-way-to-help.md`:
  - ventures: open-tennis-robots, shed-designer, freelancer tax set-aside,
    LLM cost and safety tools;
  - research programmes: sim2real-inference, verifiable-training-mechanisms,
    lowcomm-training, verified-dse, llm-coding-inference, marine-hull,
    aerolog-scaling, heavy-hydraulics, the `house-*` projects, the `swe-*`
    agent-fleet measurements;
  - process: running agents on your own repository;
  - contributing: every way to help (master), report a wrong number, share
    real data, reproduce a result, your first pull request.
- **Check:** `platform/ci/check_start_here.py` (in `portfolio-validate.yml`)
  fails when a `start-here` post is missing from the hub, does not link back to
  it, or links to a post that does not exist. Contributing posts also link
  back to the master post by convention; the check does not enforce that.

## How the 2026-10-30 batch was written, and what to copy

Fifteen guides were drafted by five parallel subagents with one shared brief:
the 2026-10-29 posts as style models, a fixed section list, and the hard rule
that every figure, command and button label come from a file the writer read.
Writers ran the commands they quote where it took under a minute without
installing anything, and reported claims they left out. That report was the
most useful part of the hand-back; ask for it again.

What they found that the next writer should know:

- **Re-running an experiment can rewrite a tracked results file** with
  floating-point noise (`verified-dse/experiments/rung_bias`,
  `verifiable-training-mechanisms/experiments/collusion`,
  `house-open-design/experiments/summary.json` without ifcopenshell). Restore
  it with `git show HEAD:<path> > <path>` and do not commit the noise. The
  collusion `results.json` looks slightly stale compared with current code: a
  small follow-up for that programme.
- **READMEs contradict themselves as projects grow.** `ventures/shed-designer`'s
  "What it does not do" denies lean-to roofs and uplift checks that newer
  sections and `llms.txt` describe; the lowcomm README says citations are not
  machine-checked while its LOG says they were checked on 2026-10-29. Writers
  took the newer source and avoided the disputed specifics. Fixing those
  READMEs is real work for the projects' own runs.
- **Many README "Live page" lines still point at github.io.** The pages
  redirect, so they work, but the canonical host is now
  `https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/`. New
  posts link there directly.
- **pytest, numpy and torch are often absent in cloud containers.** Posts say
  "the README reports N tests" rather than claim a pass that was not seen.

## Readers not covered yet

Possible next guides, each with a project of real depth behind it: teachers
and students using a research project for coursework; accountants checking the
AI Bookkeeper's exports; the energy research (`energy-*`) for homeowners; the
self-replicating workshop research (`selfrep-*`); the open-source robotics
lines (`osrobot-*`, `robofab-*`, `buildbot-*`); the garment research
(`garment-*`). Before writing one, check `research/PROGRAMMES.md` and
`portfolio/flagships.yaml` for whether the project is still active, and add the
reader to the table in `docs/contributing/start-here.md`.

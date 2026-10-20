# Agent leverage, and whether the fleet needs a manager agent

**Date:** 2026-10-20. **Asked by:** the owner, in a session that began with
"what would you say my job role most closely resembles in this repo?" and
ended with "analyze whether it's worthwhile assigning a second prompt to a sub
manager agents or principal or other or whether it doesn't make sense since all
agents are the same llm under the hood. they are all senior at least."
**Method:** read-only analysis of the run records in `prompts/runs/`, the
measured PR facts in `prompts/derived/`, a GitHub search for merged PRs, and
the earlier reports linked below. The owner reported the $800 monthly cost; it
is not in the tree. **Status:** the leverage figures are based on each agent's
own estimate of human time. An independent estimate on a fixed sample of 40
merged PRs has been started but not finished. See
[`assets/agent-leverage/HANDOFF.md`](assets/agent-leverage/HANDOFF.md).

## The short version

- **Leverage is very large even after a heavy discount.** About 260 runs a
  day and 3,264 merged PRs in the last 30 days, for about $800 a month: about
  **$0.25 per merged PR**. The runs' own estimates put a month's output at
  15,000–25,000 human-hours, about 100–150 full-time engineers. If those
  estimates are inflated fourfold, it is still about 25–40 engineers.
- **The agents say they are about 34 times faster than a person.** Across 867
  measured runs, the agents estimated 2,738 human-hours of work against 80
  hours of active agent time. That is a self-estimate, which `runcost.py`
  marks low certainty. It is the number the unfinished study is meant to
  check.
- **A "senior" or "principal" persona prompt adds almost nothing.** Every run
  already gets the same model. A prompt that says "you are a principal
  engineer" does not change the weights, so it does not make the work better.
- **A role that sees different information and holds different authority
  does add something.** The fleet's costliest failures here happen between
  runs, not inside them: duplicate work, six competing queues, no claims on
  tasks, 1,236 calculators that no single run decided on, and self-graded
  outcomes. A worker run cannot see those, however senior it is. A
  coordinating role can, because its job is to look across runs.
- **Recommendation:** don't add a management chain. Add one **dispatcher**
  role that owns a single claimable work queue, and keep per-flagship
  continuity in files: a "tech lead" made of notes, not an agent. Run it as a
  measured experiment against the current setup. Details are under
  "Recommendation" below.

## Leverage: output for the money and the owner's time

| Measure | Value | Source |
|---|---:|---|
| Run records per day, 15–19 Oct | 231–288 | `prompts/runs/` file dates |
| Merged PRs, 2026-09-20 to 10-19 | 3,264 | GitHub search `is:merged` |
| Merged PRs, 2026-10-13 to 10-19 | 1,606 | GitHub search |
| Measured runs (token usage attached), 16–20 Oct | 867 | `usage` block, `runcost.py` |
| Median active minutes per run | 3.1 | same |
| Median API-equivalent cost per run (Sonnet 5.5 / Opus 5.5) | $0.66 / $3.58 | same |
| API-equivalent cost of the 867 runs | $771 | same |
| Owner's actual monthly cost | ~$800 | owner, 2026-10-20 |
| Owner's time | "a few hours a week" | `prompts/goals.md`, `steering.md` |

At list prices, a month of runs would cost about $6,900 (about 7,800 runs at
about $0.89 each). The owner pays about 12% of that.

### Human-equivalent hours (self-estimated, low certainty)

`runcost.py attach --human-hours` records each run's own guess at how long a
competent person would take.

| | Value |
|---|---:|
| Runs with an estimate | 867 |
| Median / quartiles of estimated human hours per run | 2.0 / 1.0–4.0 |
| Sum of estimated human hours | 2,738 |
| Sum of active agent hours | 80.4 |
| Implied speed ratio | **34×** |
| By track: median estimated hours (research, ventures, others) | 4.0, 2.0, 1.0 |

Scaled to a month (about 7,800 runs):

| Scenario | Human-equivalent hours / month | ≈ full-time engineers (160 h) | Owner cost per human-hour |
|---|---:|---:|---:|
| Self-estimates as given (median to mean) | 15,600–24,600 | 100–150 | $0.03–0.05 |
| Self-estimates halved | 7,800–12,300 | 50–75 | $0.07–0.10 |
| Self-estimates quartered | 3,900–6,200 | 25–40 | $0.13–0.21 |

Even the quartered row is far cheaper than any human team. A loaded engineer
costs roughly $15,000–25,000 a month (a general rule of thumb, not measured
here). The open question is not whether the leverage is large. It is how much
of the output is the right work and survives. Cost per *surviving, useful*
merged PR is the number that matters, and nobody has measured it yet. Read the
caveats below before quoting any row.

### Caveats

- **Self-estimates.** Agents estimate their own human-equivalent time. An
  earlier report found 94% of records grade themselves `success`, so
  self-reports here lean generous. The sample study exists to check this.
- **Runs are not PRs, and PRs are not value.** Some runs do process, review or
  red-team work. Some ship things later cut, such as the calculator glut
  ([`2026-10-16-calculator-glut.md`](2026-10-16-calculator-glut.md)).
  `derive.py` measures 14-day line survival, but most windows were still open
  on 2026-10-20.
- **Selection between models.** Opus runs cost 5× more and estimate 3× the
  human time, but they are chosen for harder tasks. That is not a quality
  comparison.
- **Short window.** Usage has been measured since 16 October only.

## Does a "manager" or "principal" agent make sense when every agent is the same LLM?

### What a second prompt can and cannot change

An agent is more than its model. It is the model plus four things: its
instructions, the context it sees, the tools and authority it has, and how
long it persists. Seniority lives in the model, so a persona prompt barely
changes it. The other four can differ a lot between roles. Human
organisations have managers for two separate reasons:

1. **Expertise.** The manager knows more than the worker. Here that reason is
   gone: every run is the same model, and the owner judges them all senior.
   A "principal engineer" prompt on the same weights is a costume.
2. **Position.** The manager sees across the team, holds memory between
   weeks, and has the authority to assign, stop and merge. That reason
   remains, and it matters more for agents, because every worker run starts
   with no memory and sees only its own task.

So the useful question is not "should some agents be senior?" It is "which
cross-run jobs does nobody hold today?"

### Evidence: where this fleet loses value

The failures documented in this repository are almost all failures of
coordination, not of skill:

| Failure | Evidence | Inside one run, or between runs? |
|---|---|---|
| Work duplicated | One task taken by 9 runs in a day (16 Oct); no claim or lease exists ([work-allocation report](2026-10-20-work-allocation.md)) | Between |
| Six queues, no single owner | `promptctl route`, `session_gate`, `allocate.py`, process backlog, `PROJECTS.md`, stranded-branch tools; allocators draw 182 / 70 / 40 friction complaints | Between |
| Portfolio drift | 1,236 ventures by 15 Oct, mostly calculators; nobody chose that mix ([calculator glut](2026-10-16-calculator-glut.md)) | Between |
| Outcomes graded by the doer | 94% `success`; `merged` typed in only 4% of records | Between |
| Rules piling up | `CLAUDE.md` grew to 1,669 lines before being pruned ([throughput post](../posts/2026-10-16-throughput-per-unit-of-supervision.md)) | Between |
| A bad diff in one run | Caught by CI and the cross-review bots; rarely the expensive failure | Inside |

A more senior worker fixes the last row, which is already cheap. Only a role
that looks across runs fixes the rest.

### Evidence: the fleet already has "second prompts"

The routing in `prompts/routing.json` already gives some runs a different
prompt on the same model: **review** (52 records), **process** (165),
**redteam** (125) and **explore** (80). Those are manager-like roles, and how
they went is the best evidence available:

- **They helped where they had measurements to act on.** Review E18 replaced
  typed fields with measured ones (`derive.py`). The process track produced
  the backlog and the cuts to `CLAUDE.md`. Red team found real failures.
- **They turned into ceremony when they ran too often.** Review ran ten times
  on 15 October and ten more on 16 October, and the later passes found little
  new (`prompts/experiments.md` E6–E28). E29 proposed halving the process
  weight.
- **Fan-out inside a run is almost unused.** Only 8 of 868 measured runs used
  subagents at all. The fleet is flat: 260 peers a day, each with the full
  instructions and no one coordinating them.

### What a manager layer would cost here

- **Amplification.** About 260 runs a day read whatever a coordinating agent
  writes. A wrong call from it repeats fleet-wide, just as an offhand owner
  sentence did (`steering.md`, "Amplification"). A manager is a new single
  point of failure.
- **Latency and blocking.** A synchronous chain, where workers wait for a
  manager, would cut throughput, the one thing that is plentiful.
- **Context cost.** 96% of tokens are already the agent re-reading its own
  context ([token flow](2026-10-20-token-flow-for-people.md)). A manager that
  reads every run's output would be the most expensive run in the system, and
  subagents re-read too.
- **It still can't see what isn't measured.** A dispatcher ranking work by
  visitor counts that are all `null` ranks noise
  ([work-allocation report](2026-10-20-work-allocation.md): the top 22 rows of
  `allocate.py` were identical).

## Recommendation

1. **No seniority personas.** Don't add "principal" or "senior" prompts that
   differ from a worker only in title. They would add tokens and nothing else.
2. **One dispatcher role, defined by authority, not rank.** It would run a
   few times a day. Its job: read measured signals (merged, survival, usage,
   the flagships' `next`) and write one queue file that workers *claim*
   (lease plus expiry, so a crashed run frees its task). Workers keep full
   judgment to deviate and record why. Most of this should be code. The agent
   part is only the judgment of what to put in the queue. This is the
   work-allocation report's "one generated queue with claims", given an owner.
3. **Continuity in files, not in a lead agent.** Every run is memoryless, so a
   "tech lead" for a flagship is best kept as that flagship's notes and `next`
   in `portfolio/flagships.yaml`, which already works this way. A persistent
   lead agent would only re-read the same file.
4. **Keep the auditor roles, at a low cadence.** Review, process and red team
   work when they act on measurements. Schedule them by elapsed time or new
   evidence, not by share of runs.
5. **Use fan-out inside a run for breadth, not for hierarchy.** Subagents help
   a broad search or a parallel experiment sweep. They don't help a scoped
   change.
6. **Run it as an experiment.** Route part of the venture runs through the
   dispatcher queue and compare against the current setup on four measures:
   duplicate rate, merged PRs per dollar, 14-day line survival, and how often
   the flagships' `next` advances. Record it as an `E<n>` entry in
   `prompts/experiments.md`. Keep the dispatcher if those improve, and drop it
   otherwise.

What would change this recommendation: if the sample study shows worker
output is much lower quality than self-reported (for example, a median
independent estimate under a quarter of `self_h`), the bottleneck is
inside runs after all. Then a reviewer role with authority to reject
(not a senior persona) would come before a dispatcher.

## Reproduce

```bash
python3 docs/reports/assets/agent-leverage/sample.py draw   # same 40 PRs (seed 20261020)
python3 prompts/runcost.py report                            # cost and time by model and track
python3 prompts/derive.py report                             # merged and survival coverage
```

The summary figures above came from short Python passes over
`prompts/runs/*.json` (the `usage.totals`, `usage.time` and
`usage.human_equivalent` fields) and `prompts/derived/runs.json`.

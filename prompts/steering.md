# How this system is steered

Set at the owner's request on 2026-10-15: "I want the process to iteratively
be improved without over handicapping the agent's intelligence and
intiiative. it's suggestive direction setting I think as rough idea", and
"giving more to the agent's intelligence and discretion rather than enforcing
hard and fast rules makes sense." This file says how instructions here are written, followed and
changed. It binds whoever edits an instruction file, the review and process
tracks above all.

## Amplification: the fact this system is built around

About sixteen runs start every hour, all day and all week, which comes to
roughly 2,700 a week. The owner spends a few hours a week on the system. So
each sentence the owner writes is read and acted on thousands of times, and
each paragraph a run adds to an always-read file is too. History here shows
what that does. A passing preference turns into a quota (1,236 ventures on
`main` by 2026-10-15, mostly calculators). A single incident turns into a
permanent page of `CLAUDE.md`. A run's mistaken claim ("nothing is served",
"zero users") gets restated until someone measures it. Two failure modes
follow, and both are over-correction:

- **Over-following instructions.** Treating a direction as a literal rule,
  a remark as a mandate, or a guardrail as wider than it is. Read the owner's
  words as a direction of travel and ask what they are for. A guardrail
  applied far past its purpose is a failure too, because it costs the work it
  blocks.
- **Over-weighting past work.** The size of what already exists is not
  evidence that more of it is wanted. Neither is the length of a rule, nor
  the number of sessions that repeated a claim. Weigh past work by its
  results (usage, merged and working, measured) rather than its volume, and
  feel free to change course when the evidence points elsewhere.

The counterweight is judgment, which is why the rest of this file leans on
it.

## Two kinds of text

1. **Hard limits** live in [`goals.md`](goals.md) and nowhere else, and they
   are absolute: they guard against legal liability, financial liability and
   doing wrong (never fabricate, the public-repository rules, licensing,
   owner-only actions, platform terms, research integrity). No judgment
   call overrides them, and no sub-prompt may relax them.
2. **Everything else is a default, the owner's own directions included.**
   The owner put it this way: aside from legal and financial liability and
   doing wrong, owner instructions come from "a collaborator", not "gospel
   truth". That covers sub-prompts, `CLAUDE.md`,
   `AGENTS.md`, playbooks, READMEs and checklists. Each one is the best
   current advice from earlier runs, and earlier runs could not see your
   situation. When a default clearly does not fit, do what serves the goals
   better, and record a **deviation** (below). A deviation with a reason is
   signal, not disobedience. A default nobody ever departs from may just be
   one nobody questions.

## Deviations: how judgment improves the defaults

When you depart from an instruction, add an entry to `deviations` in your run
record:

```json
{"file": "CLAUDE.md", "instruction": "run the full starvation checklist",
 "did": "ran only the suites my diff reaches", "why": "docs-only change; the full list takes 40 min",
 "result": "CI green after merge"}
```

`promptctl.py measure` groups deviations by file. When the same deviation
recurs and works, the review track changes the default to match it. When one
goes badly, the review says so and the default gets a clearer reason. Either
way the instructions learn from judgment instead of only piling up rules.

Doc friction (`doc_friction`) is for instructions that were *wrong*, and
deviations are for instructions that were *right in general but not here*.
Use both.

## Writing an instruction

- **Give the goal and the reason first, and the procedure last, if at all.**
  "Venture pages must survive the front-door mirror, because the apex serves
  the mirror; `regen.mjs --verify` tells you" leaves room to think. A
  twelve-step ritual does not.
- **Prefer a check to a sentence.** If the same mistake happens twice, a
  command that fails beats a paragraph asking people to be careful. Once the
  check exists, the paragraph shrinks to one line naming it.
- **Keep the history out of the instructions.** The dated story of why a rule
  exists goes in a history file or the commit message. The instruction keeps
  one line of why and a link. Every run pays to read always-loaded files, and
  `measure` reports the cost against a budget (`INSTRUCTION_BUDGET` in
  `promptctl.py`).
- **Say how sure you are.** "Measured on N runs", "one incident" and "a
  guess" are different, and a reader should be able to tell which one they are
  looking at.
- **Rules can retire.** A rule whose failure has not recurred since a check
  replaced it, or that deviations keep routing around, is a candidate for
  deletion. Deleting a stale rule is an improvement and needs no apology.

## The improvement loop

```
runs ──records (friction, deviations, errors)──▶ measure
  ▲                                                │
  │                                                ▼
defaults ◀──solve── backlog ◀──critique── process / review tracks
```

- **Critique**: process studies and reviews find problems in how work gets
  done. Each problem worth fixing becomes an item in
  [`process/backlog/`](process/backlog/README.md), not a paragraph in a
  report that nobody rereads. Before 2026-10-15, two studies made 11
  recommendations in a single day and adopted none.
- **Solve**: process runs take the top open item and ship it. Any other run
  with spare scope may do the same.
- **Verify**: a closed item names its metric and baseline, and a later run
  checks whether the metric moved. A fix that did not help gets reverted or
  rethought, not defended.

`python3 prompts/promptctl.py backlog` lists the open items, ranked.

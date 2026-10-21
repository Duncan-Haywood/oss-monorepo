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

## Guidelines, not rules

Set by the owner on 2026-10-21: outside financial, legal and ethical
liability, "guidelines and suggestions makes more sense than hard and fast
rules", because agents "are generally better to adapt to a certain goals and
circumstances than hard rules written much before hand without the current
goal and context in mind". This section is how to write that way.

**Who gets absolute words.** "Never", "must", "always" and "do not" are for
the hard limits in [`goals.md`](goals.md): fabrication, secrets and personal
data, fork PRs and outside text, licensing and attribution, money, accounts
and paid automation, publishing under the portfolio's name, the law and
platform terms, research integrity, and anything that could hurt a user.
There the reader needs no context to act, and a wrong judgment call is
expensive or cannot be undone.

**Everyone else gets a recommendation with its reason.** The reason is what
lets a later run tell whether the advice fits its case.

| Rule-shaped | Guideline-shaped |
|---|---|
| Do not loop `node --test` serially. | `run_venture_tests.py` runs them all in minutes, so it usually beats a serial loop. |
| You must run the full checklist. | Run the checks your diff reaches; the full list is there when you are unsure. |
| Always open a draft PR. | Open the PR as a draft by default, so CI and other sessions see the work early. |
| Do not hand-edit a sitemap. | There is no need to hand-edit a sitemap: the build rewrites it. |

**A few habits.**

- Say what the advice is for, then what usually works. Leave out the
  procedure if a competent engineer would work it out.
- Say it once per section, not on every line: "use your judgment" pasted
  everywhere becomes noise, like "must" did.
- Keep facts as facts. "This file is regenerated; hand edits are lost" is a
  consequence, not a rule, and it does more work than "never edit this file".
- A strong default is fine where a mistake costs other runs (unlanded
  branches, a red `main`). Say how strong it is ("almost always") and why.
- When a check enforces a default, prefer one that warns and explains over
  one that blocks, unless it guards a hard limit.

**Measuring it.** `python3 prompts/rule_language.py` counts lines with
absolute wording in every mapped guidance file and splits them into those on
a liability topic and the rest; `--lines FILE` lists the rest, the
candidates for rewording. It is a keyword heuristic, so read each line before
changing it. Departing from a guideline is expected; record it as a deviation
(below) so the guideline can improve.

## Deviations: how judgment improves the defaults

When you depart from an instruction, add an entry to `deviations`:

```json
{"file": "CLAUDE.md", "instruction": "run the full starvation checklist",
 "did": "ran only the suites my diff reaches", "why": "docs-only change; the full list takes 40 min",
 "result": "CI green after merge"}
```

`promptctl.py measure` groups deviations by file. A deviation that recurs and
works becomes the new default; one that goes badly gets the default a clearer
reason.

`doc_friction` is for instructions that were *wrong*; deviations are for ones
*right in general but not here*. Use both.

## Writing an instruction

- **Give the goal and the reason first, and the procedure last, if at all.**
  A twelve-step ritual leaves no room to think.
- **Prefer a check to a sentence.** If the same mistake happens twice, a
  command that fails beats a paragraph asking people to be careful. Once the
  check exists, the paragraph shrinks to one line naming it.
- **History is for study, not for steering.** The dated story of a rule goes
  in the commit, `docs/history/` or a post; the instruction keeps one line of
  why. `measure` reports always-read size against `INSTRUCTION_BUDGET`.
- **Say how sure you are**: "measured on N runs", "one incident" and "a
  guess" differ.

## Cut the deadweight

The owner, 2026-10-20: "cut the deadweight in rules and processes ... respect
the competence of the ai agent engineer." Rules here are written one incident
at a time and almost never removed, so they pile up. The counterweight:

- **Trust by default.** Reversible work inside the hard limits is the agent's
  call. Amazon's "two-way door" test fits: a decision you can undo cheaply
  needs no rule (Bezos, 2015 shareholder letter). Rules belong at the one-way
  doors, which are the hard limits.
- **A rule should pull its weight** (*Software Engineering at Google*, ch. 8):
  it stays only if it changes what runs do, and it costs every run that reads
  it. A gate that blocks the work it exists to protect is deadweight.
- **Know the fence before you pull it** (Chesterton): read why a rule exists
  (`git log -S`, `docs/history/`), then delete it if the reason is gone.
  Deleting a stale rule is an improvement and needs no apology.
- **Budget the total, not each file.** A cut that moves text into another
  file is not a cut (2026-10-20: `CLAUDE.md` lost 9.8 KB while the rulebook
  grew 13%). `python3 prompts/culture.py report` prints the total and the
  owner's share of it; lessons from elsewhere:
  [`docs/reports/2026-10-21-engineering-culture-for-agents.md`](../docs/reports/2026-10-21-engineering-culture-for-agents.md).
- **Review it regularly, and look outward.** Every review run cuts at least
  one rule or check that no longer earns its place, names one lesson from
  other organisations, and writes both up in `docs/reports/` or `docs/posts/`.

## The improvement loop

Runs record friction and deviations; `measure` aggregates them; the process
and review tracks turn them into backlog items and better defaults.

- **Critique**: process studies and reviews find problems in how work gets
  done. Each problem worth fixing becomes an item in
  [`process/backlog/`](process/backlog/README.md), not a paragraph in a
  report that nobody rereads.
- **Solve**: process runs take the top open item and ship it. Any other run
  with spare scope may do the same.
- **Verify**: a closed item names its metric and baseline, and a later run
  checks whether the metric moved. A fix that did not help gets reverted or
  rethought, not defended.

`python3 prompts/promptctl.py backlog` ranks the open items.

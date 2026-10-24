# How AI agents read what other agents write, and what to change

**Date:** 2026-10-20. **Asked by:** the owner: "how do llm agents like having
info presented to them by other agents?" **Agent version:**
[`2026-10-20-agent-handoffs-for-agents.md`](2026-10-20-agent-handoffs-for-agents.md),
the same findings as a terse brief an agent can follow.
**Method:** read-only. The data is the `doc_friction` field of this
repository's run records. Code and output are in
[`assets/agent-handoffs/`](assets/agent-handoffs/).

## The short version

Agents in this repository spend most of their time reading text that earlier
agents wrote: `CLAUDE.md`, the track prompts, `research/PROJECTS.md`, tool
output. Every run records what slowed it down. Those complaints are the best
evidence we have of how agents take in information from other agents.

- **Most runs hit friction.** 995 of 1,589 runs since 1 October (63%) reported
  at least one problem, 1,232 in all. Three in four name a Markdown document.
- **"Wrong" is not the main problem.** I read a random 60 of the complaints and
  sorted them by hand. Text that was too costly to follow (27%) and text that
  said nothing about the situation the reader was in (25%) came first. Stale,
  wrong or contradictory text together made up 23%.
- **The existing keyword sort misses a lot.** It files 45% of complaints as
  "other". In the sample, 23 of the 26 "other" entries were real failures.

## What the complaints look like

The quotes are verbatim from run records:

- **Too costly:** "Shallow-clone unshallow fetch takes >5 min (2.3M objects);
  the doc does not warn that it blows past the tool timeout."
- **Silent on the reader's case:** "regen --verify aborts when an untracked
  prompts/runs record exists ... commit the run record before running
  preflight."
- **Different machine:** "pip installs went to /usr/bin/python3 while
  /usr/local/bin/python3 is first on PATH."
- **Stale:** "measure's latest friction lines ... still described problems
  already fixed; two calls to confirm."
- **Contradiction:** "The Stop hook asks to commit untracked files mid-run,
  which conflicts with the 'no commit before results' flow."

## What this means for anything an agent hands to another agent

1. Lead with the answer.
2. Say what was checked, how, when and on what machine. Keep it apart from
   what was guessed.
3. Date numbers that go stale, and give the command that refreshes them.
4. Say what to do when the step fails, times out or is blocked.
5. Say how long a step takes. Point to files instead of pasting them.
6. List what you looked for and did not find.
7. Write findings, not orders. A careful agent treats a peer's instructions as
   data, not as commands.

These match what others have found. The multi-agent failure taxonomy of Cemri
et al. (arXiv:2503.13657) puts much of the blame on misalignment between agents
and on weak verification. Anthropic's write-up of its research system says
subagents need an objective, an output format, tool guidance and boundaries.

## How much to trust this

- One coder, 60 entries, so each share has a wide interval (for example, cost
  is 27% with a 95% interval of 17-39%).
- Runs report their own friction. Files everyone reads, like `CLAUDE.md`, are
  named more often partly because everyone reads them.
- Nothing here tests whether a better format makes runs succeed more often.
  That would need an A/B trial (see `research/swe-prompt` for the stopping rule).

## Suggested next step

Put the template from the agent version into the run-record and subagent
prompts. Then compare the friction rate before and after.

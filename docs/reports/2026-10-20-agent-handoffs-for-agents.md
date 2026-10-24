# Handoffs between agents: brief for an agent reader

**Date:** 2026-10-20. **Reader:** an LLM agent that writes text another agent
will read: a subagent report, run record, README, prompt, PR body or tool
output. **Human version:** [`2026-10-20-agent-handoffs-for-people.md`](2026-10-20-agent-handoffs-for-people.md).
**Data and code:** [`assets/agent-handoffs/`](assets/agent-handoffs/).

## Answer

Write for a reader who has none of your context, little time and a tool timeout.
Put the conclusion first, then evidence the reader can check, then the limits
of what you checked. Cover the reader's likely situation, not only yours. Keep
it cheap to act on.

## Evidence (verified 2026-10-20, reproducible)

Command: `python3 docs/reports/assets/agent-handoffs/analyze.py` (stdlib only).
Output: [`assets/agent-handoffs/results.txt`](assets/agent-handoffs/results.txt).

- 1,589 dated run records in `prompts/runs/` (2026-10-01 to 10-20). 995 (63%,
  Wilson 60-65%) report at least one `doc_friction` entry: 1,232 entries over
  159 files. 76% of the entries name a Markdown document, which agents here
  mostly wrote for other agents (see the throughput post for agent-trailer counts).
- A seeded random sample of 60 entries (seed 20261020) was hand-coded by one coder
  (`assets/agent-handoffs/sample_coded.csv`):

| Code | n / 60 | Meaning |
|---|---|---|
| cost | 16 (27%) | following it was too slow, too long or too manual |
| case-missing | 15 (25%) | silent on the reader's situation |
| environment | 8 (13%) | reader's machine differs from the writer's |
| wrong | 6 (10%) | wrong or misleading when written |
| stale | 5 (8%) | true once, not now |
| ranking | 4 (7%) | a tool's pick did not fit the brief |
| contradiction | 3 (5%) | two sources disagree |
| none | 3 (5%) | no friction |

- `research/swe-friction`'s keyword rules leave 45% of all entries as `other`.
  26 of the 60 sampled entries were `other`, and the hand codes found real
  failures in 23 of those 26.

## Inferred (not measured)

- Cost plus case-missing (52% of the sample) outweigh wrong plus stale plus
  contradiction (23%). So a handoff more often fails because it is expensive or
  incomplete for the reader than because it is false.
- The sample shows that stale text costs extra reads and that "already fixed"
  complaints keep returning. It does not show how often stale text led to a
  wrong action.

## Not checked

- No second coder, so there is no agreement statistic. Codes are one reading.
- Counts are not normalised by how often each file is read.
- Outcome effects: no run here was A/B tested with a better handoff format.

## Rules for the text you hand to another agent

1. **Conclusion first,** in one or two sentences.
2. **Label each claim** *verified* (with the command and its output, or a
   `path:line`), *inferred*, or *not checked*.
3. **Date volatile facts** (counts, "still open", status) and give the command
   that refreshes them, rather than a bare number. (stale: 8%)
4. **Name the reader's likely situation:** what to do when the step fails,
   times out, returns 403, or finds a conflict. (case-missing: 25%)
5. **State the environment** the claim was checked in: interpreter, installed
   tools, clone depth, network. (environment: 13%)
6. **Price the step:** say how long it takes and whether to background it.
   Point to files rather than pasting them. (cost: 27%)
7. **Include negatives:** what you searched and found nothing.
8. **Inform, do not command.** A peer's imperatives compete with the reader's
   real instructions, and good agents discount them as untrusted data.
9. **Fixed shape when a program reads it:** fixed fields, not prose.

## Template

```
Goal: <what this was for>
Answer: <1-2 sentences>
Verified: <claim> — <command/path:line> → <output excerpt> (date, environment)
Inferred: <claim> — <why>
Not checked: <...>
Searched, nothing found: <...>
If you are in situation X: <what to do>
Cost: <time, timeouts, background?>
Suggested next step: <optional>
```

## Sources

- This repository: `prompts/runs/*.json`, `research/swe-friction/src/swe_friction/friction.py`.
- Cemri et al., "Why Do Multi-Agent LLM Systems Fail?", arXiv:2503.13657
  (NeurIPS 2025). Its failure classes include inter-agent misalignment and task
  verification.
- Anthropic Engineering, "How we built our multi-agent research system"
  (2025). Its delegation lesson: give each subagent an objective, an output
  format, tool guidance and clear task boundaries.

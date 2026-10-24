# Guidance system audit: brief for an agent reader

**Date:** 2026-10-24. **Asked by:** the owner ("tell me about the agent docs
systems and organization currently ... what could be potentially improved").
**Method:** `promptctl.py map/measure/validate`, `culture.py report`,
`rule_language.py`, `wc`, and a script over `prompts/runs/*.json` (2,603
records). Counts, not experiments. Public write-up:
[`docs/posts/2026-10-24-how-an-ai-agent-fleet-reads-its-instructions.md`](../posts/2026-10-24-how-an-ai-agent-fleet-reads-its-instructions.md).

## Facts (2026-10-24)

- 47 guidance files in `prompts/system.json`, seven layers (`prompts/SYSTEM.md`).
- Rulebook (`culture.py`): 177,622 bytes in 15 files; 2026-10-20 audit counted
  183,753. `goals.md` is 54,182 bytes / 871 lines, 30% of it.
- Always-read for a research run: ~1,560 lines. Over budget: `prompt.md`
  (102/100), `steering.md` (136/120), `cloud-session.md` (112/80).
- Records with `doc_friction`: 1,592 / 2,603. Top files: `research/PROJECTS.md`
  290, `research/CLAUDE.md` 265, `CLAUDE.md` 243, `prompts/process/prompt-1.md`
  102, `portfolio/router/allocate.py` 87.
- Deviations: 654; 641 have no `result`; 637 have only `file` + `why`.
  213 are skipped write-ups; 90 are router overrides by scheduled routines.
- `writeups` filled in 154 of 788 records since 2026-10-21.

## Fixed in this PR

- `promptctl.py record` hint now asks for `did` and `result` on deviations
  (it asked for `file` + `why` only, which is why results are missing).
- `prompt.md`: `goals.md` is "~870 lines", not "~450".
- `system.json`: dropped the stale "~1,000 lines" from `DIRECTION.md`'s
  description (it is 171).

## Open, for later runs

1. Review track: when promoting a deviation to a default, use `result`
   (new records only; old ones have none).
2. Owner decision: split `goals.md` into hard limits (always read) and
   directions (on demand). Only the owner edits `goals.md`.
3. Rewrite the write-up default as a test of when one is worth it, plus a
   periodic digest run. 80% of runs already skip it with the same reason.
4. Scheduled routines should pass `route --track`; overrides currently pollute
   the track A/B windows.
5. Hand-typed sizes in `system.json` descriptions go stale; `map` measures
   them. Freshness checks for `flagships.yaml` items and `PROJECTS.md` next
   steps (skip ones whose PR merged) would address the top friction sources.

## How sure

Exact for what runs recorded; themes from keyword matches over-count.

# Perf, 2026-11-10: `promptctl.py measure` asks git one question instead of 490

Perf track. Third CI-pool reading of the day found no landable lever (P063 and
P064 are owner-gated), so this took the slowest local step in the review path.

**Before.** `python3 prompts/promptctl.py measure --no-fetch`: 31 s wall
(47 s with the default shallow deepen). `cProfile`: 1062 `git` subprocesses,
31 s of 32 s idle in `poll`; 492 of them are `git log -1 -- <path>` from
`_changed_note` (~50 ms each, 25 s), the rest `git rev-parse --git-path shallow`
and `git ls-files`.

**Change.** Per-process memo for the git lookups, and one
`git log --format=@%H %cI --name-only` pass (1.6 s) that indexes the newest
commit per path. Shallow-root commits are skipped when indexing (they "add"
every file) and any path not found falls back to the old per-file call.

**After.** 19 s wall (-39%); output `cmp`-identical to before. A first version
without the shallow-root skip was faster (10 s) but dated four files wrongly,
so it was dropped.

**Verification.** `pytest prompts/test_promptctl.py`: 72 pass; the one failure
(`test_the_real_prompt_system_is_valid`, a run record in the tree) fails on
`main` too. New test pins the batch index against the per-file call.

## Not changed (ranked)
1. The remaining 19 s is ~300 per-file fallbacks for files whose newest
   visible commit is a shallow root; dating those from one `git log` needs the
   deepened history `measure` fetches by default.
2. P063/P064 once the owner applies them.

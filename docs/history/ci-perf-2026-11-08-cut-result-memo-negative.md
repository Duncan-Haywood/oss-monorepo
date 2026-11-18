# Shed Designer gallery search: whole-result memo of cutWithinHaul (negative, 2026-11-08)

Perf track. Metric: wall time of `node ventures/shed-designer/make-gallery.mjs`
with `.gallery-stamp` removed.

## Tried

Item 1 of the 2026-11-07 "not changed" list: memoise `cutWithinHaul` by a key of
kerf, haul, stocks and every piece field (`len`, `mark`, `id`, `kind`), storing
and returning `structuredClone` copies because callers mutate boards (`why`).

## Result

Before 20.5 s; after 22.5 s (one run each). `gallery-data.mjs` stayed
byte-identical. The memo is slower: the key and two clones cost more than the
few hits save, because `mark` and `id` differ across candidates, so identical
cut lists are rare. Reverted; nothing shipped in code.

## Not changed (ranked)

1. A key on lengths only (marks reattached afterwards) could hit more often, but
   needs a rewrite of how marks are assigned; measure the hit rate first (the
   search runs outside the main process, so a counter on `globalThis` read
   nothing).
2. GC 3.1 s: `buildShed` allocates a full model per candidate.
3. `gambrelAnalysis`/`solveFrame` 2.7 s recomputed per candidate.
4. P063 (sparse checkout in ventures-tests.yml, ~22.7 s a job) still waits on the
   owner because the edit is under CODEOWNERS.

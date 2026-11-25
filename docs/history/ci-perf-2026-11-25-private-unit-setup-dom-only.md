# Private app unit suites: Testing Library loads only in DOM files (2026-11-25)

Perf track, version 0, item 3 ("the slowest local step an agent session
waits on"). Both open perf backlog rows wait for the owner (P063, P064, P086).
The public venture pages for the bets had passes in the last four days, so this
run went to the bets' own code in `private-monorepo` (private PR 188), where
every session building payapps (bet #1), cmmc (bet #4) or grants runs
`pnpm test:unit` several times.

## Reading (before)

`pnpm exec vitest run --config vitest.unit.config.ts`, 4 CPUs, warm transform
cache, 4-5 runs. Vitest's own breakdown put **setup at 39-54%** of summed time.
`test/unit/setup.ts` (the same file in payapps, cmmc and grants) imported
`@testing-library/jest-dom/vitest` and `@testing-library/react` for every
file, but only the `// @vitest-environment happy-dom` files render anything:
payapps 20 of 56, grants 52 of 164, cmmc 0 of 15. Each Node file loaded
react-dom just to register a `cleanup` it never needed.

## Change

`setup.ts` imports both only when `typeof document !== "undefined"`, using
top-level `await import()`. No Node-environment file uses a jest-dom matcher
or Testing Library (grep); if one ever does, it fails loudly (the matcher is
missing), so nothing passes silently.

## After

| app | before (median) | after (median) | tests, both runs |
|---|---:|---:|---:|
| payapps | 9.1 s | 7.2 s | 520 |
| cmmc | 2.3 s | 1.4 s | 232 |
| grants | 35.3 s | 30.6 s | 1609 |

About 7.5 s saved per run of all three. Setup went from 39-54% to 6-20%.

## Flaky tests found while measuring

- **grants, `integrations.test.ts`, "a tampered ciphertext"**: the test
  checked the *last* character of the base64url ciphertext but replaced the
  *second-to-last*. When that character was already `A` (1 in 64), the
  "tampered" text matched the original, decryption worked, and the test
  failed. It failed once in four suite runs here. Fixed by checking the
  character being swapped, plus an assertion that the text changed. The
  output is unpadded base64url, so the second-to-last character always holds
  6 full data bits; the swap always changes the ciphertext. 30 of 30 runs passed.
- **payapps, `sov-import.test.tsx`**: one `waitFor` took longer than Testing
  Library's 1 s default on the first, cold full-suite run (1 in 14 runs here).
  DOM files now set `asyncUtilTimeout: 3000`. The assertions are unchanged;
  they can only wait longer.

## Not changed, ranked for the next run

1. **seller-books' and jobshop-quote's unit suites** were not timed.
   seller-books' setup is already empty; jobshop-quote has no unit setup file.
2. **grants' "environment" share (17%)**: 52 happy-dom files each build a
   fresh DOM. Vitest's `isolate: false` for the DOM project might cut this,
   but it shares module state across files; that needs a careful audit first.
3. **Worker suites (`test:worker`)** were not measured this run. Each file
   re-applies the full schema DDL in `setup.ts`'s `beforeAll` unless the table
   already exists.
4. P063, P064 and P086 remain owner-gated.

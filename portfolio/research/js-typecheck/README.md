# What does TypeScript's checker find in 1,265 ventures of plain JavaScript?

*Measured 2026-10-16 at `10356f6549`, TypeScript 5.9.3. Script:
[`measure.mjs`](measure.mjs). Raw diagnostics:
[`results-2026-10-16.json`](results-2026-10-16.json).*

The portfolio's product code is plain, build-free JavaScript: 8,548 `.mjs`
files in the tree, none of them type-checked. The pages are served as
committed, with no build step, and that is worth keeping. TypeScript can check
JavaScript without changing that: `tsc --checkJs --noEmit` reads `.mjs` files
and JSDoc comments, reports problems, and writes nothing. The question was
whether turning it on would catch real bugs, or mostly produce noise.

**Short answer:** run over everything at once, it is almost all noise: 3,911
diagnostics, one user-visible bug. Run per file, on files that opt in, it costs
nothing, and most of the core logic already passes. So the rule is: opt in file
by file, starting with new code, and never as a fleet-wide flag.

## What was run

Every venture's own product `.mjs`/`.js` files: 3,410 files in 1,265
ventures. Test files and the ventures that are already TypeScript projects
(they have a `tsconfig.json`) were left out. Each venture was checked in its
own `tsc` process, with the options a shared config would use:

```
--allowJs --checkJs --noEmit --target es2022 --module nodenext
--lib es2023,dom,dom.iterable --types node --skipLibCheck
```

Strict mode was **off**. With it off, tsc reports only contradictions it can
prove from the code and its JSDoc, not missing annotations. Strict mode would
multiply the counts below and tell us nothing new.

```
node measure.mjs --tsc <tsc> --types-root <dir>/node_modules/@types --out results.json
node measure.mjs --recompute-from results-2026-10-16.json    # re-derive every number here
```

`tsc` and `@types/node` come from npm into a scratch directory. They are the
only things this script uses beyond the Node standard library, and it reads
the tree without changing it.

## What it found

| | |
|---|---:|
| Product files checked | 3,410 |
| Diagnostics | 3,911 |
| Files with at least one | 1,936 |
| Files clean as they stand | 1,474 (43%) |
| **Files clean once two browser globals are declared** | **2,721 (80%)** |
| `calc.mjs` / `engine.mjs` files (the core logic) clean, same condition | 763 of 1,132 (67%) |
| Ventures entirely clean, same condition | 723 of 1,265 |

Every category was reviewed by hand, reading the flagged lines in context:

| Diagnostics | Category | Real bugs |
|---:|---|---|
| 1,282 | `navigator.globalPrivacyControl` / `window.doNotTrack` are missing from TypeScript's DOM library. One line, in every copy of the shared `usage.mjs` | 0. One declaration file fixes all of them |
| 643 | A property is added to an object after the literal that created it (`summary.declared = …`) | 0 |
| 586 | A property is read off a union before narrowing it (`result.profit` where `result` may be `{ok:false, errors}`) | 0 found. The code narrows by a flag tsc does not follow |
| 565 | Inference limits: `[["\t", 3]]` read as `(string\|number)[][]`, `Date - Date`, default parameters such as `onError = () => {}` | 0 |
| 438 | JSDoc disagrees with the code, e.g. `@param {number}` on a value the form passes as `''` | 0 behaviour bugs. All of them are documentation that is wrong |
| 191 | `querySelector` returns `Element`, used as a form or input | 0 |
| 140 | Classic `<script>` globals shared between files, JSX in a `.js` file, CDN imports | 0 |
| 47 | Possibly `null`/`undefined` | 0 found |
| 16 | Other | 0 |
| **3** | **Duplicate object keys (TS1117)** | **2 bugs (one copied into two ventures), plus 1 redundant key** |

### The bug

`bai2-statement-reader` and `bai2-to-ofx-converter` (one was copied from the
other) build their summary as

```js
{ records: …, transactions: 0, credit: 0, …, accountList: [], transactions: [] }
```

The second `transactions` wins. A statement with transactions works anyway:
the first `summary.transactions++` coerces `[]` to 0, so the count comes out
right, and the test file only used such statements. A bank file with balances
but no transaction (16) records, which is a normal file on a quiet day, leaves
the `[]` in place, and the page shows *"2 accounts,  transactions"* with the
count missing. No test covered it, and nobody looking at the code would
notice. tsc flags it in under a second. It is fixed in both ventures, with a
regression test in each that fails on the old code.

`freelancer-schedule-c-categorizer` had `loan: "loan_principal"` twice in one
alias table, with the same value both times. It caused no harm and was removed.

## What this means

1. **The yield on existing code is low.** Over 3,410 files that already pass
   their tests, the checker found one user-visible bug. That is a real result,
   and its main point is that the existing tests are doing their job, not that
   the code is full of bugs nobody has seen. "Turn on `--checkJs` everywhere"
   would bury that one finding under 3,900 others and teach everyone to ignore
   the output.
2. **The cost of opting in is low too.** 80% of the files pass once the two
   privacy globals are declared ([`typecheck-globals.d.ts`](../../../platform/pages/typecheck-globals.d.ts)),
   with no other edit, and that includes two thirds of the calculators'
   `calc.mjs` files. For those files, opting in costs one line.
3. **The value is in code not yet written.** The checker's strength is the
   edit that renames a field in one place and not another, adds a duplicate
   key, or calls a method that doesn't exist (`Math.roundd`), which is exactly
   the mistake fast, agent-written code makes. It catches these at the moment
   they are made, and only in files that opted in.
4. **The 438 JSDoc mismatches matter, just not as bugs.** Agents read JSDoc to
   learn what a function takes. A `@param {number}` that is really
   `number | ''` misleads the next session. Once a file opts in, its JSDoc has
   to stay true.

## What changed because of it

- **Rule of thumb** in [`PRODUCT_PLAYBOOK.md`](../../../PRODUCT_PLAYBOOK.md)
  §4: venture JS stays build-free `.mjs`, and TypeScript is used only as a
  checker. New files start with `// @ts-check`. A file you edit gets it too,
  when `--candidates` says it already passes.
- **Check:** [`platform/pages/typecheck.mjs`](../../../platform/pages/typecheck.mjs)
  runs `tsc --noEmit` over the opted-in files of the ventures you name, using
  a pinned TypeScript installed outside the tree. `--candidates <slug>` lists
  which of a venture's files would pass today. The `ventures-tests` workflow
  runs it on every venture a PR touches, so an opted-in file stays clean.
- **Opted in:** the `usage.mjs` of the three ventures above, so the check has
  something to run on from the first PR.

## Limits

- This measures today's tree, which has already been through its tests and
  its fixes. It cannot say how many bugs the checker would have caught while
  the code was being written, which is the larger and unmeasured claim behind
  point 3.
- Categories were assigned by diagnostic code and message. "0 real bugs"
  means none was found in review: all 3 TS1117 findings and most of the ~110
  rarer high-signal ones (TS2304, TS2551, TS2554, TS2349, TS1131, TS1064, all
  71 TS2367) were read in context, and the large categories were sampled. Not
  all 3,911 lines were read one by one.
- Non-strict mode only. Strict mode finds more, but nearly all of it is
  missing annotations rather than contradictions.

---
title: "\"constructor\" is not a property type: one JavaScript lookup, four broken tools, 305 to watch"
seo_title: "Why \"constructor\" breaks a JavaScript object-map lookup"
date: 2026-11-11
tags: [javascript, mutation-testing, redteam, security, prototype]
description: "A plain object map finds Object.prototype for \"constructor\" or \"toString\". It broke four of our tools; a CI lint fails new ones and tracks 305 old."
---

Today's red-team run started where the code had changed most: the carry-over search in the
[league schedule generator](../../ventures/league-schedule-generator/), rewritten five times in
two days. It seeded eight faults into `carryover.mjs`, and the suite (389 tests, 78 seconds) caught
six. Neither of the two that got through could change anything a user sees. One is a dead store:
the `roundOf` table in the double round robin's venue search is written and never read. The other
is a `t >= n` in a helper whose only callers have already skipped every `t >= n`. So the catch
rate was 6 of 8 as measured and 6 of 6 on mutants that matter.

The bug came from reading the code around the search.

## One line, in four places

The page offers three ways to choose among the four searches: fair, balanced, fewest breaks. The
engine turns the name into a weight like this:

```js
carryOverPick: CARRY_OVER_PICK[f.carryOverPick] ?? CARRY_OVER_PICK.balanced
```

That reads as "the weight for this name, or balanced if there is none". It isn't quite that,
because `CARRY_OVER_PICK` is a plain object, and every plain object inherits from
`Object.prototype`. Look up `"constructor"` and you get the `Object` function back, not
`undefined`, so the `??` never fires. The search then scored every try as
`coe + Object * breaks`, which is `NaN`. Nothing is less than `Infinity` when the score is `NaN`,
so no try was kept, and `buildSchedule` crashed with
`Cannot read properties of undefined (reading 'map')`.

The page's select box can't send `"constructor"`, and the share-link decoder already accepted only
the three names. But the engine is also a library. Anyone can call it from the CLI or from a saved
file, and an agent can call it with any JSON it likes through the repository's
[tool server](../../platform/agents/tools.mjs), which exposes every tool's engine over MCP. For
that caller, the field is just text.

So we searched for the same shape elsewhere: an upper-case `const` bound to an object literal,
indexed by `something.field` read from input. Three more tools broke the same way:

| Tool | Input | Before | After |
|---|---|---|---|
| [Cost segregation calculator](../../ventures/cost-segregation-study-calculator/) | `propertyType: "constructor"` | every figure `null` | multifamily defaults, $231,636 first-year extra on $1M |
| [Clothing duty calculator](../../ventures/clothing-design-studio/) | `product: "toString"` | `TypeError` | "Choose a garment type." |
| [Freelance editor quote](../../ventures/freelance-editor-quote-calculator/) | `level: "constructor"` | accepted as a level of edit | "Choose a level of edit." |
| League schedule generator | `carryOverPick: "constructor"` | crash, no rounds | balanced |

Each fix is one call to `Object.hasOwn(MAP, key)` before the lookup, with a test that feeds in
`constructor`, `toString`, `__proto__` and `hasOwnProperty`. The test failed before the fix and
passes after it. The carry-over search also now refuses a `pick` that isn't a finite number of
zero or more. Before, a bad pick quietly returned a result with no rounds in it.

## 305 more, held by a ratchet

The same pattern search over all 1,337 ventures finds 305 lookups. Most look harmless: labels for
a tool's own findings (`SEVERITY_MARK[f.severity]`), where the worst case is a wrong word in a
report. Some are probably bugs like the four above. Reviewing 305 by hand is a job for several
runs, not one. Letting a 306th land in the meantime is avoidable.

So the guard is
[`platform/ci/inherited_keys.py`](../../platform/ci/inherited_keys.py). It scans a venture's
engine files and flags any such lookup that doesn't have an own-key check on the same line. The
305 existing ones are listed in a baseline file. A unit test fails if a baseline line no longer
matches anything, so a fix has to delete its line and the list can only get shorter. The check
also runs inside `run_venture_tests.py`, the script `ventures-tests.yml` already runs on every
pull request that touches a venture. A new unguarded lookup therefore fails CI in the PR that adds
it, without anyone editing a workflow and without waiting for the next red-team run. Run against
this morning's code, it flags all four lookups fixed above.

The check is a heuristic. It misses a lookup through a local variable, a map imported from another
file (the league scheduler's own case: the map lives in `carryover.mjs`, the lookup in `calc.mjs`),
and code in inline page scripts. It catches the common shape, and it's cheap.

Catch rate for the run: 6 of 8 before the fixes, with the 2 survivors triaged as equivalent, so
6 of 6 counted. Real defects: 4 found, 4 fixed.

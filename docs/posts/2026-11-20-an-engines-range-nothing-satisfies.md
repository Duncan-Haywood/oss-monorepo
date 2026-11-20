---
title: "An impossible engines range was called \"unbounded\": 150,000 random ranges against node-semver"
seo_title: "engines.node no version satisfies: a fix"
date: 2026-11-20
tags: [node-version-drift-check, semver, differential-testing, developer-tools]
description: "Node Version Drift Check's semver parser matched node-semver on 794,376 checks, but the test found a backwards message for impossible engines ranges."
---

[Node Version Drift Check](https://marisstella.app/node-version-drift-check/)
reads a repo's `engines.node`, `.nvmrc`, `.tool-versions`, Dockerfile and
GitHub Actions `setup-node`, and reports where they disagree. Underneath is a
small semver range parser written by hand, so the tool runs in the browser
with no dependencies. Until this run nothing checked that parser against the
library npm itself uses, [node-semver](https://github.com/npm/node-semver)
(ISC). So this run checked it.

## The test

`range.diff.test.mjs` generates seeded random ranges: carets, tildes, `~>`,
comparators with and without spaces, x-ranges, hyphen ranges, `||`, `v` and
`=` prefixes, and a few odd ones like `>*` and `<0.0.0`. It runs each range
through both parsers and compares the results. node-semver comes from the copy
bundled with npm (7.7.4 here). It is used only as the test oracle and is never
shipped. If it cannot be found, the test skips.

Over five seeds of 30,000 ranges each:

| Check | Compared | Disagreements |
|---|---:|---:|
| Ranges node-semver accepts that the tool also accepts | 146,605 | 0 |
| `satisfies(version, range)` on release versions | 794,376 | 0 |
| "can one version satisfy both ranges" vs `semver.intersects`, both satisfiable | 65,063 | 0 |

Ranges with prerelease tags were left out of the comparison. The tool reads
`22.0.0-rc.1` as `22.0.0` by design, and it says so.

So the matcher was right. The test still found three things.

## 1. An impossible range got the opposite message

Feed the tool `"engines": { "node": ">=20 <18" }` (a slip for `>=18 <20`).
No Node.js version satisfies that. The tool said:

> engines.node `>=20 <18` has no upper bound ... so any future Node.js major
> satisfies it untested.

That is the reverse of the truth. Internally, the range parsed to an empty
list of intervals, and "does every interval have an upper bound" is false for
an empty list. With an `.nvmrc` present, every pin was instead flagged as
"violating" the range, which points at the wrong file.

Now an empty range produces one risk, `engines-unsatisfiable`: "satisfied by
no Node.js version at all, so npm's engines check (EBADENGINE) fails on every
Node.js version". The pins under it are no longer blamed.

## 2. Leading zeros

`01.2.3` and `>=018` are not valid SemVer (section 2 forbids leading zeros),
and node-semver rejects them. The tool read `018` as 18. It now rejects them
too, and an `engines.node` written that way gets the "not a range this tool
understands" notice, matching npm, for which such a range matches nothing.

3,395 of the 150,000 ranges are still read by the tool even though
node-semver rejects them. These are corner cases of node-semver's regexes
(`==1.2.3` fails, `<==18` passes; `=2 - 3` passes, `=2.2.2 - 3` fails).
Copying those quirks would make the tool worse at reading what people mean,
so the test counts them instead of asserting on them.

## 3. Two node-semver behaviours worth knowing

**Empty ranges "intersect".** In 1,257 of 51,751 pairs where one range was
unsatisfiable, `semver.intersects` returned true. The tool says no version
satisfies both, which is literally correct. The test excludes these pairs and
pins the tool's answer on two examples (`<0.0.0` with `>=x.2.3`, and `>*` with
`^0`).

**`minVersion` across `||`.** node-semver 7.7.4 returns `null` for
`18.20.18 || <1.0.0 >10.0.0`, although `satisfies("18.20.18", ...)` is true.
Its `minVersion` takes the smallest lower bound over all `||` sets (here
`10.0.1`, from the empty set) and only then tests it against the whole range.
This happened for 3,955 of 132,396 random ranges. The test needed "is this
range empty?" from the oracle, so it now asks `minVersion` one set at a time.
We did not check whether newer node-semver releases (7.8.x) behave the same.

## What's next

The same harness could cover the pin side: `.nvmrc` aliases,
`.tool-versions` lines and Docker tags against what `nvm`, `asdf` and Docker
Hub actually resolve. Those resolvers need the network or real installs,
so they are a separate run.

Code: [`ventures/node-version-drift-check/`](../../ventures/node-version-drift-check/)
(MIT). Produced with AI assistance.

---
title: "Our license checker read \"Proprietary, limited use\" as MIT"
seo_title: "Testing three license checkers against npm's SPDX parser"
date: 2026-11-19
tags: [licenses, spdx, testing, differential-testing, open-source]
description: "Three license tools checked against npm's SPDX parser and every PyPI classifier: parsers agreed on 50,000 expressions; the word matching had bugs."
---

Three tools in this repository read the license field your dependencies
declare: [license-compat-check](../../ventures/license-compat-check/) asks
whether a dependency fits how you ship,
[lockfile-license-check](../../ventures/lockfile-license-check/) audits an npm
lockfile, and [license-drift-check](../../ventures/license-drift-check/) tells
you when a dependency's license changed between two snapshots. Each has its own
small parser for SPDX expressions like `(MIT OR Apache-2.0) AND BSD-3-Clause`.
None of them had been checked against a reference parser.

The npm that ships with Node bundles one:
[spdx-expression-parse](https://github.com/jslicense/spdx-expression-parse.js)
4.0.0, along with the full SPDX license and exception id lists. So this run
used it as an oracle.

## The parsers were right

I generated random valid expressions from all the SPDX ids npm ships, with
nested parentheses, `AND`, `OR`, `WITH` exceptions and `+` suffixes, and
compared each tool's reading with the oracle's tree. AND and OR are
associative, so the trees were flattened before comparison.

On 50,000 expressions there were no mismatches in license-compat-check's tree
and none in lockfile-license-check's category. Both handle precedence
(`WITH` binds tightest, then `AND`, then `OR`) correctly. Both comparisons now
run as tests (`spdx.diff.test.mjs`, 20,000 expressions each). I seeded one
precedence bug into each parser to check that the tests catch it, and both did.

## The words around the parsers were not

Real license fields often aren't SPDX. `pip-licenses`, which two of these
tools accept as input, reports the PyPI trove classifier name by default, for
example "GNU General Public License v2 or later (GPLv2+)". I ran all 89
`License ::` classifiers from the trove-classifiers package, every SPDX id, and
the 45 distinct license strings installed in this container through all three
tools.

**license-drift-check matched keywords inside words.** It labelled
"Proprietary, limited use" *permissive*, because "limited" contains "mit". It
labelled "CC0 1.0 Universal" and "Universal Permissive License"
*source-available*, because "Universal" contains "rsal" (the hint for the Redis
Source Available License). It labelled `D-FSL-1.0`, a German copyleft license,
source-available through the `fsl-1` hint. And it read `Elastic-2.0` as
*unknown*, even though Elastic's 2021 relicense is one of the four events its
README is built around. The hint only matched the phrase "elastic license".
Hints now match whole words, a short table pins the SPDX ids the hints get
wrong, and an expression is labelled by its most restrictive license, with
`WITH` exceptions skipped.

**lockfile-license-check read a multi-word name by its first word.**
"GNU General Public License v3 (GPLv3)" was categorised from "GNU" alone, so it
came out unknown instead of strong copyleft. Its "Public Domain" pattern could
never match at all. Now a field that doesn't parse as an expression is read
whole.

**license-compat-check sent trove names to review with no reason.** Fifteen
classifiers carry their SPDX id in a trailing parenthesis (`(MPL 2.0)`,
`(AGPLv3+)`, `(EPL-2.0)`), but the tool didn't look there. They now resolve.
Names without a version, such as "GNU General Public License (GPL)", still go
to review, because guessing a version would be worse than asking.

## npm's corrector is not an oracle for these

I first tried npm's other bundled package,
[spdx-correct](https://github.com/jslicense/spdx-correct.js), as the oracle for
messy strings. It's built to fix the spellings people type into
`package.json`, and on trove names its guesses often differ from the id in the
name's own parenthesis. With `upgrade: true` it maps "Eclipse Public License
2.0 (EPL-2.0)" to `EPL-1.0`, "GNU General Public License v2 or later (GPLv2+)"
to `GPL-2.0-only`, "MIT No Attribution License (MIT-0)" to `MIT`, the three
EUPL classifiers to `UPL-1.0`, and "GNU Free Documentation License (FDL)" to
`GPL-3.0-or-later`. That's a mismatch in purpose, not a defect: trove names
aren't its input. But it means a pipeline that runs trove names through it
before a license check can be wrong before the check starts.

## What it does not show

These are labelling tools, not legal opinions. The family and category tables
are judgment calls. This run tested the parsing and the matching, not whether
any license's category is the right one. A few ids moved from a lucky label to
an honest *unknown*: `Rdisc` had been called permissive only because its name
contains "isc". The next step would be running the same oracle over real
`pip-licenses` and `go-licenses` output from public projects.

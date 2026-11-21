---
title: "Our ReDoS checker missed a third of the exponential regexes"
seo_title: "Testing a static ReDoS checker against an exact oracle and V8"
date: 2026-11-21
tags: [security, redos, regex-redos-check, docker-cache-order-check, testing, automata]
description: "On 6,000 random regexes timed in V8, our shape rules caught 66% of the exponential ones. An exact automaton check now catches all and writes the attack."
---

[regex-redos-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/regex-redos-check)
finds regular expressions that can hang a program on one crafted string. Until
today it looked for known shapes: `(a+)+`, `(a|aa)+`, an inner repeat that can
swallow the next iteration's delimiter. Shapes are easy to explain, but we had no
measure of how many dangerous patterns they miss. So we built one.

## An answer key

A backtracking engine that fails to match tries every way of parsing the input.
That gets exponential exactly when the pattern can read some word `w` two
different ways inside a loop: then `prefix + w×n + "!"` has at least 2^n parses,
and every one of them fails at the `!`. Weideman, van der Merwe, Berglund and
Watson ([CIAA 2016](https://doi.org/10.1007/978-3-319-40946-7_27)) tie
backtracking time to this kind of automaton ambiguity. Allauzen, Mohri and
Rastogi ([IJFCS 2011](https://cs.nyu.edu/~mohri/pub/namb.pdf)) show how to test
for it: pair the automaton with itself and look for a strongly connected
component that holds both a "same state" pair and a "different states" pair.

One detail matters. In the ordinary position automaton, `(a*)*` looks harmless,
because both loops step from the same `a` to the same `a`. A backtracking engine
still tries both loops, so we count each step once for every way the parse can
take it. Repeats follow ECMAScript's rule that an iteration past the minimum
may not be empty. That rule is why `(a?)+` is *not* exponential, and V8 agrees:
30 `a`s and a `!` take 0.03 ms.

We wrote that oracle for a small grammar (`a`, `b`, `c`, `[ab]`, `|`, `*`, `+`,
`?`), drew 6,000 random patterns, and timed V8 on the oracle's own attack string
for every pattern it called exponential. A pattern counted as exponential only
if V8 actually slowed down.

## What the shape rules caught

| | exponential patterns caught | false alarms |
| --- | --- | --- |
| shape rules only | 1,938 of 2,929 (66%) | 29 of 3,034 |
| with the exact check | 2,929 of 2,929 | 0 of 3,034 |

The misses had a few shapes. Repeats nested directly around a compound body,
like `((?:bb)+)*`. Alternations with an optional branch, like `(a|a?)+`. Bounded
repeats inside a loop, like `(a{2,5})+$`. The false alarms were bodies with a
mandatory delimiter that the shape rules read straight through, such as
`(?:aab|a)+`.

The same exact test now runs inside the engine. When it finds an ambiguous loop,
the finding carries the attack string, and `--probe` tries that string first.
That changed the probe a lot. Before, it pumped single characters and confirmed
58 of 100 exponential patterns as exponential. With the witness it confirmed
100 of 100. When the check proves that no ambiguous loop exists, a shape rule's
"exponential" drops to a warning. The check gives up on lookaround,
backreferences, atomic groups and possessive repeats, and the shape rules still
cover those.

One honest wrinkle: 47 patterns were ambiguous, but V8 ran them fast. Each one
repeats a single character inside an alternation of three or more branches,
like `(a|b|a)+`, which V8 seems to merge into a character class. With two
branches, `(a|a)*`, it does not: 24 `a`s took 154 ms. We still flag them,
because another engine may not optimise them the same way.

## What it found at home

Our CI already sweeps every product's regexes with this engine. The shape rules
had flagged a pattern in
[docker-cache-order-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/docker-cache-order-check)
that matches `pip install --upgrade pip setuptools wheel` lines. The exact check
showed it was real and wrote the attack string. A version like `==1.0pip` could
end before `pip` or swallow it, so 18 copies of `PIPUV!*` took 23 ms, and every
two more copies took about four times as long. Tool names now need whitespace
between them, and 20,000 copies take under a millisecond.

The check also cleared a date phrase in our sales agent. An earlier run had
allowlisted it after another checker called it safe, and the proof let us delete
that entry. Across 14,714 distinct patterns in the repository, the check modelled
13,313 and proved 13,000 not exponential. It costs time: analysing the 11,696 distinct
patterns under `ventures/` went from 0.4 s to 2.1 s.

Method, the per-seed tables and the limits are in
[`eval/README.md`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/regex-redos-check/eval/README.md).
Next we want the polynomial side, the same test on triples of states, so that a
quadratic `\s+$` gets an attack string too.

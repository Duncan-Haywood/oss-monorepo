---
title: "CVSS 3.0 and 3.1 agree on every base score; a floating-point ceiling does not"
seo_title: "CVSS 3.0 vs 3.1 score differences, measured over every vector"
date: 2026-11-17
description: "All 259,200 CVSS base and temporal vectors score the same under 3.0 and 3.1. Environmental scores and naive 3.0 rounding are where they part."
tags: [cvss-vector-check, security, cvss, measurement]
---

Security teams hold vulnerability advisories scored under CVSS 3.0 and CVSS 3.1,
often side by side in one scanner report. Two questions come up again and again.
Can a 3.0 score be compared with a 3.1 score? And why do two advisories for the
same bug carry different numbers? We built
[cvss-vector-check](../../ventures/cvss-vector-check/README.md) to answer both
from the vectors themselves. Then we used it to score the whole formula space.

## The measurement

A CVSS v3 base vector has eight metrics, giving 2,592 combinations. Adding the
three temporal metrics gives 259,200. We scored every one of them under the v3.0
and v3.1 formulas. We also scored 200,000 random vectors with every environmental
metric set. Each score was checked against Red Hat's open-source `cvss` Python
package (version 3.6), which is a separate implementation. It agreed on every
score in both versions. The scripts are in the venture's `oracle/` folder, and
6,000 of the oracle's scores are committed as a test fixture that runs on every
change.

| Question | Result |
| --- | --- |
| Base score differs between 3.0 and 3.1 | 0 of 2,592 |
| Temporal score differs between 3.0 and 3.1 | 0 of 259,200 |
| Environmental score differs | 12,623 of 200,000 (6.3%), all with a Changed modified scope |
| Size of that difference | always 0.1: 11,155 higher under 3.1, 1,468 lower |
| Lands in a different severity band | 610 of 200,000 (0.3%) |
| Naive `Math.ceil(x*10)/10` 3.0 rounding wrong | 228 of 259,200 temporal scores, all +0.1; 0 base scores |

The random sample picks every metric value with equal odds. Real advisories are
not spread like that, so 6.3% is the share of the formula space, not of
published scores.

## What it means

**Base scores are interchangeable.** If both are computed correctly, a
`CVSS:3.0` vector and the same metrics labelled `CVSS:3.1` give the same base
score. So do their temporal scores. A different base score between two
advisories means they chose different metrics, not different versions.

**Environmental scores move only with a Changed modified scope.** CVSS 3.1
rewrote one formula, the Modified Impact for a Changed scope. Everywhere else the
two versions match. Where the formula does change, the shift is 0.1 either way.
That is small, but it moved one vector in 330 to a new severity band. One
example from the sample scores 7.0 (High) under 3.1 and 6.9 (Medium) under 3.0.

**A 3.0 calculator can be 0.1 high for a dull reason.** CVSS 3.0 says "round up
to one decimal" in words. In floating point, 5.0 × 0.92 is stored as
4.6000000000000005, so `Math.ceil(x * 10) / 10` gives 4.7. The oracle, and this
tool, give 4.6, which is what the arithmetic means. CVSS 3.1 redefined Roundup
with integer arithmetic to remove exactly this. The naive form is wrong on 228
temporal scores and on no base score, and none of those errors changes the
severity band.

Our own first draft of the engine used the naive ceiling for 3.0. The oracle
fixture caught it: 7 of the first 3,000 random 3.0 vectors disagreed. The fix
reads the 3.0 rule mathematically. The tool keeps the naive variant on hand,
so when an audited report states 4.7 for a vector worth 4.6, it can say where the
4.7 came from.

## The tool

[cvss-vector-check](../../ventures/cvss-vector-check/README.md) runs in the
browser and as a zero-dependency CLI. It does four things:

- It scores and explains one vector.
- It compares two vectors metric by metric and shows what each difference
  does on its own.
- It shows how the score would change if one metric changed.
- It audits a pasted report, CSV, or NVD or OSV JSON. Every vector is rescored
  and checked against the score and severity label written next to it. When a
  stated score is really the temporal score, the other version's score or the
  naive-rounding score, the tool says so.

`node cli.mjs --audit report.json --strict` exits 1 on a mismatch, so it can run
as a CI step over generated advisories.

While testing, a repository lint (`inherited_keys.py`) flagged a lookup in the
parser. A vector containing `AV:toString` parsed as valid because a plain
object's `in` check also sees `Object.prototype`. It now refuses it, and a test
covers it.

Next, if people use it: CVSS 4.0, which scores through FIRST's macrovector
lookup table rather than a formula, checked the same way against an independent
implementation.

*Produced with AI assistance. Not affiliated with FIRST, NIST, the NVD, MITRE or
Red Hat. A CVSS score measures technical severity, not risk.*

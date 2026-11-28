---
title: "Re-audit: the IDS checker read 77 °F as −688.8 K; fixed, and CI now gates its 334 conformance pairs"
seo_title: "Fahrenheit in IFC: IfcConversionBasedUnitWithOffset and IDS checks"
date: 2026-11-28
tags: [quality-audit, evaluation, construction, bim, ids-model-check]
description: "A re-check of IDS Model Check against its 2026-11-19 audit. Four of five defects are closed and CI now gates the 334 buildingSMART test pairs. A new one turned up: Fahrenheit models got the wrong verdict on every temperature check. It is fixed."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks an IFC
building model against a buildingSMART IDS 1.0 file in the browser or in CI.
The [2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-ids-model-check.json)
found its answers right but its tests weak. That audit listed five defects.
This re-check tested all five against the code on `main` today. The full record,
with every command, is in the
[re-audit file](../../portfolio/quality/audits/2026-11-28-ids-model-check-reaudit.json).

**Verdict: meets the bar.** Correctness, claims and verification each score 3,
and the median of the seven dimensions is 3. A senior BIM information manager
would use it, within the limits it states. That verdict counts a new
high-severity defect against correctness. This PR fixes it, but the scores are
from before the fix.

## What the earlier fixes closed

| 2026-11-19 defect | now |
|---|---|
| Unit conversion tested only for millimetre lengths; three seeded bugs survived | closed: all three now fail `engine.test.mjs` |
| The 334-pair conformance test and the BCF schema test skipped in CI | closed: `ci-fetch.sh` runs first in CI, and a failed fetch fails the build. 627 of 627 tests pass, none skipped |
| `llms.txt` said IDS schema validation was not covered | closed |
| README said unit conversion was tested | closed (true now) |
| README and `llms.txt` bury usage under changelog prose | open: the README grew from 73 KB to 160 KB |

## Checked again, independently

- **buildingSMART's 334 IDS test pairs**, scored by a runner written for this
  audit from buildingSMART's file names: all 307 valid cases right, and none
  of the 27 invalid ones passed.
- **IfcTester 0.9.0.post1**, the reference implementation, compared spec by spec
  on status, the count of elements the spec applies to, and the failing
  GlobalIds. The two agree on 54 of 54 specs on three buildingSMART IFC 4.3
  models, and on 13 of 14 on the sample house. The one difference is the
  documented case of multiple `xs:pattern` values, where this checker follows
  XSD.
- **BCF 2.1 export** validates against buildingSMART's XSDs.

## The new defect: Fahrenheit

IDS compares values in SI units, so a temperature has to be converted to
kelvin first. IFC4 defines Fahrenheit, in its own documentation of
`IfcConversionBasedUnitWithOffset`, as a factor of 1.8 on kelvin with an offset
of −459.67, from *f = k·1.8 − 459.67*. IfcOpenShell writes exactly that when
asked for a Fahrenheit unit. In such a model, 77 °F is (77 + 459.67) / 1.8 =
298.15 K. The checker read it as **−688.806 K**: it added the offset with the
wrong sign and took 1.8 as kelvins per degree. So on a Fahrenheit model, every
IDS temperature requirement got a wrong verdict. That matters for US MEP
models. IfcTester gets this case wrong too (it reads 138.6, ignoring the
offset), so comparing against the reference implementation could not have
caught it.

The fix reads SI = (value − offset) × factor. A temperature factor of 1.8 is
taken as the spec's example and inverted, since no temperature degree is 1.8 K
wide. The same model with a 5/9 factor gives 298.15 K too. The new test also
pins cubic prefixes (2,500,000,000 mm³ = 2.5 m³) and grams (1,500 g = 1.5 kg).
Seeded bugs in both of those had survived all 627 tests.

## What is not at the bar

- The README is a 160 KB changelog. The usage a BIM manager needs is buried in it.
- No real project's IDS and model have been run. The project's NEXT.md says so too.
- The IDS editor was not driven in a browser in this audit.

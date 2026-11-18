---
title: "Quality fixes: four tools that gave a confident wrong answer, and the tests that now stop them"
seo_title: "Quality fixes: four confident wrong answers, and tests to stop them"
date: 2026-11-11
tags: [quality-audit, testing, tax, web-performance]
description: "A fix-mode quality session closed six of 43 high-severity defects: an SUV write-off $2,504 short, Uber Eats deducted at 100%, a safe header failed."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in mode `fix`
(`python3 platform/ci/quality_audit.py mode`), which works the open-defect queue rather than drawing
new subjects. There are no new scores here: the audits keep the scores from before each fix, and
a later round re-audits.

## The number

The high-severity queue went from **43 open defects to 37**. Four were fixed in
[PR #14648](https://github.com/Duncan-Haywood/oss-monorepo/pull/14648). One had already been fixed by
PR #14327, which never recorded the fix in its audit, so the queue still listed it. Each code fix comes
with a test that fails on the old code and passes on the new.

## What was wrong, and what it is now

**Business vehicle depreciation calculator: a heavy-SUV write-off came out $2,504 short.** The
Section 179 limit for SUVs over 6,000 lb ($31,300 for 2025) was multiplied by the business-use
percentage. Under IRS Publication 946, chapter 2, the limit applies to the 179 deduction itself, on
the business-use basis, and is not prorated. Take an $80,000 SUV at 90% business use. The basis is
$72,000, 179 takes $31,300, and 20% MACRS on the remaining $40,700 adds $8,140, so year one is
**$39,440**. The tool showed $36,936. The new test pins both $39,440 and the under-the-cap case
($40,000 at 60%: all $24,000 expensed).

**Freelancer Schedule C categorizer: Uber Eats was deducted at 100% as travel.** The travel rule
matched `uber` before the meals rule could see `uber eats`, so delivery meals went on line 24a at
full value instead of line 24b at 50%. While writing the test, a second form turned up that the
audit had not named: card descriptors like `UBER *EATS HELP.UBER.COM` contain `uber.com`, which the
travel rule also took. Delivery apps (Uber Eats, DoorDash, Grubhub, Postmates) are now checked before
travel. An `UBER TRIP` line still goes to travel, and the test checks both.

**Cache-Control checker: a safe header failed the CI gate.** `Cache-Control: public, no-store` sent with
`Set-Cookie` was reported as DANGER, a possible cookie leak, and exited 1. Under RFC 9111 §5.2.2.5,
`no-store` forbids every cache from storing the response, so no cache can replay the cookie to
another visitor. The finding no longer fires when `no-store` is present. The old test that expected
this false alarm now checks a header that really is dangerous (`public, max-age=60`).

**PWA installability checker: it claimed to agree with Lighthouse, and it doesn't.** The README,
the code header and the FAQ said this tool and Lighthouse "should never disagree". Lighthouse 12
removed its PWA category in 2024, and Chrome's published criteria
([web.dev/articles/install-criteria](https://web.dev/articles/install-criteria)) list a 512x512 icon
and a `start_url`, which this tool treats only as notices. That claim is gone. Before this fix, a
page missing both passed with "the same criteria Lighthouse checks". It now passes with "No hard
install blocker found", followed by the two items the published list still asks for. One judgement
call: the auditor wanted those two promoted to failures. I left them as notices, because Chrome's
installer has accepted manifests without them and a CI gate that fails on an installable page is a
bug too. Instead, the pass message now says exactly what is missing. A later audit may disagree.

**World clock: already fixed.** The Reykjavik midsummer bug (sunset after midnight, daylight shown as
"-3h -51m") was fixed in PR #14327, with a test. That PR's audit never listed it in `fix_prs`. It does
now.

## What this says about the process

Three of the four wrong answers were domain rules: a tax limit, a tax line, an HTTP caching rule.
A unit test written by the same author would not have caught them, because the author believed the
wrong rule. Each one was caught by checking against a source the author did not write (Pub 946,
the Schedule C instructions, RFC 9111). That is the same pattern as
[last week's reflection](../../portfolio/quality/reflections/2026-11-10-where-quality-drops-off.md),
where `domain-rule` and `untested-core` dominate the open defects. The fifth shows a smaller problem
in the process: a fix that does not update `fix_prs` stays in the queue, and someone has to find it
again.

37 high-severity defects are still open (`python3 platform/ci/quality_audit.py queue --severity high`).
Most of the rest are research-design issues and untested core logic. They need more than a
one-line fix.

*These are free, MIT-licensed estimators, not tax or legal advice; check your own numbers with a
qualified professional.*

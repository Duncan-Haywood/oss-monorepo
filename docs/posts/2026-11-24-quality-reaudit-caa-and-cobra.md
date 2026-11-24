---
title: "Re-audit: two fixes held, and each tool still had a wrong answer nobody had found"
seo_title: "CAA reserved flag bits and COBRA in December: two re-audit findings"
date: 2026-11-24
tags: [quality-audit, evaluation, testing, dns, health-insurance]
description: "The CAA checker's CNAME fix and the COBRA calculator's 'always cheaper' fix both held, but each re-audit found a new wrong verdict a user would act on."
---

Two tools were re-audited today. Each had an earlier audit that listed one fix PR and marked no
defect with it, so the quality scoreboard counted every defect as fixed. The re-audit checks each
earlier defect against the code as it stands, then scores the tool again on the code as found.

**Neither tool meets the bar on arrival. Of 14 earlier defects, 5 were closed, 3 partly closed
and 6 still open.** Both re-audits also found a new wrong verdict, and this session fixed it
([PR #18601](https://github.com/Duncan-Haywood/oss-monorepo/pull/18601)).

## CAA record check

The [CAA record check](https://marisstella.app/caa-record-check/) tells you which certificate
authorities a domain's CAA records allow
([audit file](../../portfolio/quality/audits/2026-11-24-caa-record-check.json), prior:
[2026-11-08](../../portfolio/quality/audits/2026-11-08-caa-record-check.json)).

- **The fix held.** The high defect was CNAME handling. A subdomain pointing at a SaaS host under
  a restrictive parent was reported as "any CA may issue". The tool now follows RFC 8659 section 3:
  it checks CAA at the alias target, then climbs from the typed name's parent. A seeded mutant
  that brings back the old behaviour is caught.
- **Still open on arrival:** unquoted values such as `0 issue letsencrypt.org` were still rejected
  as malformed. Pasted URLs were queried verbatim. `accounturi` was still ignored in the verdict.
- **New finding:** RFC 8659 section 4.1 says an application MUST ignore reserved flag bits. The
  tool instead dropped a record like `1 issue "letsencrypt.org"` as malformed. With the only record
  gone, every CA read as allowed:

  ```
  as found:  authorized=true   reason=no-issue-property-in-set
  now:       authorized=false  reason=not-named
  ```

  A false "allowed" is the dangerous direction for this tool.
- **Scores on arrival:** correctness 3, claims 3, verification 2 (2 of 5 seeded bugs passed
  every test), domain 2.
- **This session's fix:** reserved bits are ignored and reported. Unquoted values parse.
  Hostnames are normalised. The tag grammar is tightened to RFC 8659 section 4.1. The `llms.txt`
  boilerplate is replaced. Tests for both surviving mutants are added, taking the suite from 78
  to 84 tests.
- **Still open:** account-bound issue records still read as "named". This is listed in the
  README's known gaps.

## COBRA vs marketplace calculator

The [COBRA vs marketplace calculator](https://marisstella.app/cobra-vs-marketplace-calculator/)
compares continuing an employer plan against a marketplace plan for the months you need cover
([audit file](../../portfolio/quality/audits/2026-11-24-cobra-vs-marketplace-calculator.json),
prior: [2026-11-12](../../portfolio/quality/audits/2026-11-12-cobra-vs-marketplace-calculator.json)).

- **The fix held.** The old high defect, the "always cheaper" verdict, is closed. The README
  example now gives "COBRA cheaper below $3,750", which matches a hand calculation.
- **What checked out:** an independent model agreed with the engine's verdict on 300 of 300
  random plan pairs.
- **The other high defect is only partly closed.** The January 1 plan-year reset was only a
  note. The worst case still counted one out-of-pocket maximum when the months crossed into a new
  year. In the README example the marketplace worst case read $10,460; two plan years allow
  $19,660.
- **New finding:** when coverage ended in December, the next plan year was priced with this
  year's deductible and out-of-pocket carry-over. Take two identical plans, with COBRA $50 a
  month dearer and the deductible already met this year. The tool said the cheaper plan "changes
  more than once as care rises (at about $375 ...)". The right answer is that the marketplace plan
  is cheaper at every level of care. I reran this myself on the code as found and after the fix.
- **Scores on arrival:** correctness 2, claims 2, verification 2, domain 2.
- **This session's fix:** the worst case adds an out-of-pocket maximum for each January 1 crossed.
  December losses drop the carry-over. New notes cover:
  - the 400%-of-poverty-line limit on the 2026 premium tax credit and reconciliation on Form 8962;
  - the gap date after a mid-month loss of coverage;
  - out-of-pocket amounts that don't add up.

  The suite goes from 27 to 35 tests and kills both real surviving mutants.
- **Still open:** the 29- and 36-month durations and the 102% premium check.

## What this says about the fix loop

Both earlier fix PRs fixed the headline defect, and both left most of the rest open while the
scoreboard counted them closed. This matches
[reflection 3](../../portfolio/quality/reflections/2026-11-24-the-blanket-rule-is-mostly-wrong.md).

A re-audit also does more than confirm a fix. Each one found a new wrong verdict in a path the
first audit had not exercised: reserved flag bits, and a December end date. Today's fixes are not
scored here. A later round re-scores both tools.

*These are free, open-source tools. Their results are estimates, not legal, tax, insurance or
security advice.*

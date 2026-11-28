---
title: "Re-audit: the COI tracker's fix closed 5 of 10 defects, and a GL policy could pass as workers' comp"
seo_title: "Subcontractor COI tracking: renewals, ACORD 25 headings, coverage"
date: 2026-11-28
tags: [quality-audit, evaluation, testing, construction, coi-expiry-gap-checker]
description: "A re-check of the free COI tracker: 5 of 10 earlier defects fixed, four untested bugs still passing, and a GL row read as workers' comp. Now fixed."
---

The [COI expiry and gap checker](https://marisstella.app/coi-expiry-gap-checker/) reads a list of
subcontractor insurance policies, one row per policy as copied off the ACORD 25 certificates. It
checks the list against a contract's requirements: limits, umbrella offset, additional insured,
waiver of subrogation, lead time before expiry, and gaps between a policy and its renewal. The
[2026-11-12 audit](../../portfolio/quality/audits/2026-11-12-coi-expiry-gap-checker.json) found ten
defects. Its fix PR, #15051, was recorded against all ten, so the audit counted all ten as fixed.
This re-audit ([audit file](../../portfolio/quality/audits/2026-11-28-coi-expiry-gap-checker.json))
checked each one against the code as it stands.

**5 of 10 were closed.** Both highs were fixed and stay fixed. A renewal that starts the day after
the old policy expires now shows as the one-day lapse it is, under the standard 12:01 a.m. policy
period. Pollution, liquor and garage liability no longer count as general liability. The calendar
escape, the README test command and the as-of date were also fixed. The other five were written
into the README's "Known gaps" and left open. The README said so plainly, so this was an honest
outcome, but the scoreboard had counted them fixed.

**All four bugs that survived the tests in November survived again.** Moving the
umbrella-equals-shortfall boundary, moving the seven-day error boundary, dropping waiver of
subrogation from workers' comp, or letting an umbrella top up employers' liability: the 29 tests
passed every time.

**A new high.** Coverage names were matched by substring, so "comp" matched inside "completed
operations". A row reading "GL incl. products/completed ops" was read as workers' compensation. That
vendor's GL showed as missing, and its workers' comp showed as in force when the list had none.
"Network security liability" was read as general liability.

**Scores before the fix:** correctness 2, completeness 3, verification 2, craft 2, claims 3,
fitness 2, domain 2. It does not meet the bar. Correctness and verification are the scores holding
it back.

## What changed in this PR

- Coverage names now match whole words. Cyber and network lines are left unrecognised rather than
  counted as GL.
- A renewal already on the list clears the lead-time warning. The report shows it as "renewal on
  file" and leaves it off the chase list. A renewal with even a one-day gap still warns.
- The column headings printed on the ACORD 25 (TYPE OF INSURANCE, ADDL INSD, SUBR WVD, POLICY EFF,
  POLICY EXP) are read as written.
- A requirement the page cannot read ("1 million") or a blank lead time now stops the check with a
  message. Before, it became 0 and switched that check off without telling you.
- Eight new tests catch all four earlier surviving bugs and the new boundary (37 tests, all
  passing).

**Still open:** the two employers' liability disease limits on the ACORD 25 (each employee and
policy limit) are not compared. A renewal that clears the lead-time warning is not checked for
limits or endorsements until it is the policy in force.

These scores are from before the fix. A later round re-audits the tool.

For subcontractors who also bill on AIA-style pay applications, the tool links to
[PayApps](https://payapps.marisstella.app/?from=coi-expiry-gap-checker), the hosted pay-app billing
product this repository is building.

*This is a quality audit of free software, not insurance or legal advice. A certificate of insurance
is informational and does not amend a policy. Confirm coverage with the carrier or agent.*

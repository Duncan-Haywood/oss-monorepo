---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): Georgia's contractor copy and the affidavit of payment in full

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#228. Claim:
`claim/payapps/lien-waivers-georgia-part-4` (ROADMAP Next #1). Follows PR 219 (part 3, the
affidavit of nonpayment recorded as filed).

**Why it matters to a sub.** The affidavit of nonpayment's closing paragraph (O.C.G.A.
§ 44-14-366(g)(2)) sends two copies within seven days of filing: one to the owner, and one "TO THE
CONTRACTOR AT THE ADDRESS SHOWN ON THE NOTICE OF COMMENCEMENT" when the filer is "NOT IN PRIVITY
OF CONTRACT WITH THE PROPERTY OWNER AND A NOTICE OF COMMENCEMENT IS FILED". Second-tier subs
usually have no contract with the owner. Part 3 tracked only the owner's copy. Separately, (g)(3)
says that once a sub is paid in full after filing, it swears on request that it was paid, and
recording that affidavit voids the affidavit of nonpayment. Part 3 described this step but did not
track it.

**What landed.**
- A contractor-copy record on a recorded filing. The user first answers "owed" or "not owed",
  because PayApps cannot know about privity or whether a notice of commencement was filed. If the
  copy is owed, the user records the day, method and tracking number. Allowed methods are the
  owner's three plus "another way", because the statute names methods only for the owner's copy.
- A (g)(3) record, accepted only once the payments cover the waiver. The user records the day it
  was signed and the day it was recorded, with book/page. After the signing is recorded, the cash
  report asks for the county recording. After the county recording, the stage is `released` and
  the affidavit is void.
- `gaClockNeedsAction` keeps a filing in the cash report and the weekly email until the owner's
  copy is recorded and the contractor's copy is settled (not owed, or owed and sent).
- Migration 0040 adds seven nullable columns. Clearing the filing clears everything. The history
  shows each step.

**For the next run.**
- Filings recorded before this change, with the owner's copy already sent, now come back into the
  cash report until the user answers the contractor question. This is intended. Answering takes
  one click.
- Georgia part 5 in the ROADMAP: a per-job "notice of commencement filed" field to preselect the
  answer. Weekends and holidays are still not counted.
- Hosted CI on the private repo is still starved. `run_workflow_locally.py --repo-root
  /home/user/private-monorepo payapps-ci` remains the check to use.

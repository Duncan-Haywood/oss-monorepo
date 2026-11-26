---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): Mississippi's statutory lien waivers and affidavit of nonpayment

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#233. Claim:
`claim/payapps/lien-waivers-mississippi` (ROADMAP Next #1).

**Why it matters to a sub.** Ten states print statutory lien waiver forms in
`packages/lien-waivers`. Until this PR Mississippi was the one left "pending": a Mississippi job's
waivers were tracked, but PayApps printed no form. Miss. Code Ann. § 85-7-419 says a waiver "shall
substantially follow" the forms in § 85-7-433. Its notice paragraph says a form without that notice
is "UNENFORCEABLE AND INVALID". Every listed statutory state now prints its own form.

**Where the text came from.** The official Code is published through LexisNexis, and Justia and
FindLaw answer 403 from a cloud session. That was the blocker the ROADMAP recorded. The
Legislature's bill-status site does answer. Both sections were created by SB 2622 (2014), "As Sent
to Governor" (HTML and PDF at `billstatus.ls.state.ms.us/documents/2014/{html,pdf}/SB/2600-2699/SB2622SG.*`),
and the Governor approved it on 11 Apr 2014 (the history XML says so). The HTML and PDF agree word
for word. Because the bill creates the sections new, there are no struck words to untangle, unlike
Georgia's bills. To look for amendments, I fetched the Legislature's "All Measures" XML for every
session from 2015 to 2026 (`billstatus.ls.state.ms.us/<year>/pdf/all_measures/allmsrs.xml`) and
searched the short titles for construction liens and waivers. Each match died in committee. Those
files are a cheap amendment check for any Mississippi statute.

**What landed.**
- Interim waiver (§ 85-7-433(1)) and final waiver ((2)). Each is listed as both kinds, as Georgia's
  are: they waive "upon the receipt of the sum", and § 85-7-419(5)(b) deems the amount paid
  60 days after signing unless an affidavit of nonpayment is filed first.
- Both forms are sworn before a notary. The final form prints its signature and jurat twice, above
  and below the NOTICE, exactly as the bill does. The statute has no line for the claimant's name,
  so a "Claimant" line is added above the signature, as for Georgia.
- Affidavit of nonpayment (§ 85-7-433(3)) as `msAffidavitOfNonpayment()`, plus `msSixtyDays` and
  `msAffidavitCopyDueOn`. Unlike Georgia's affidavit, it has no blank for the unpaid amount, and the
  owner's copy is due in two days, not seven.
- The tests compare each form, and the affidavit, with the statute as a whole. Two edits were tried
  to check this: dropping "OR PREMISES" and dropping the final form's second signature block. Each
  failed the tests.
- The marketing site lists Mississippi among the statutory states. The "tracked until verified"
  bullet is gone, because no listed state is unverified any more.

**For the next run.**
- Mississippi part 2 (ROADMAP Next #1): the app does not yet use the package's 60-day clock or the
  affidavit. Georgia's clock, filing record and cash-report reminders (`ga-waiver-clock.ts`,
  `services/payapps/ga-affidavit.ts`) are the model. Generalising them to "states with a deemed-paid
  clock" is likely cleaner than copying them. Sessions were editing Georgia part 5 at the same time
  as this run, so check for open PRs first.
- § 85-7-425 sends time computation to § 1-3-67, which was not read. The clock counts plain calendar
  days and does not move a deadline off a weekend.
- Hosted CI on the private repo is still starved (jobs fail in 2 s).
  `run_workflow_locally.py --repo-root /home/user/private-monorepo payapps-ci` is the check.

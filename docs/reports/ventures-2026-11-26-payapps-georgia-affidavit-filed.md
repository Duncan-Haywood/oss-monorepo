---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): a Georgia affidavit of nonpayment recorded as filed

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#219 (merged). Claim:
`claim/payapps/lien-waivers-georgia-part-3-affidavit-filed` (ROADMAP Next #1). It follows PR 209
(the forms) and part 2 (the 90-day clock and the printed affidavit).

**Why it matters to a sub.** A Georgia waiver becomes effective 90 days after signing even if the
sub was never paid, unless the sub files an affidavit of nonpayment first (O.C.G.A.
§ 44-14-366(g)(2)). Part 2 warned about the 90 days and printed the affidavit. But PayApps never
learned that the affidavit was filed, so it went on warning. It also never told the sub that the
affidavit's own closing paragraph gives **seven days** to send the owner a copy by registered or
certified mail or statutory overnight delivery.

**What landed.**
- A filing record on each sent Georgia waiver: the day, the county, and the book/page or
  instrument number. A copy record follows it: the day, the method and the tracking number.
- Migration 0038, six nullable `ga_affidavit_*` columns on `lien_waivers`.
- `gaWaiverClocks` now returns a `stage` (`running`, `filed` or `paid-after-filing`) and a `filing`
  object with `copyDueOn`, `copyDaysLeft` and `late`.
- `gaClockNeedsAction` decides what the cash report and the weekly email name. The 90 days get the
  same ±30-day window as before. A filing whose copy is not recorded is always named.
- Once the copy is recorded, the waiver reads as suspended until payment in full ((g)(5)). If the
  money then covers it, the pay app quotes (g)(3): on request, the sub swears in recordable form
  that it was paid in full. That affidavit has no statutory form, so nothing is printed.
- A filing dated after the 90 days ended is still recorded. The text says that the statute asks for
  the filing before the 90 days end, and to ask counsel.

**For the next run.**
- The copy owed to the *contractor* (when the filer has no contract with the owner and a notice of
  commencement was filed) is only described in the text. It is not recorded apart from the owner's
  copy. That, and recording a signed (g)(3) affidavit, is Georgia part 4 in the ROADMAP.
- PR 219's hosted CI got no runner (`ci_starvation.py`: runner_id 0).
  `run_workflow_locally.py --repo-root /home/user/private-monorepo payapps-ci` ran all 9 run steps
  green in about 3 minutes, so use it instead of waiting.
- `drizzle-kit generate --name <slug>` from `apps/payapps` writes a clean migration and snapshot.
  Fetch the private `main` and check the number just before you merge: 0038 was still free here.

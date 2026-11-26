---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): Georgia part 5, the job's notice of commencement

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#231 (merged). Claim:
`claim/payapps/lien-waivers-georgia-part-5-noc-filed` (ROADMAP Next #1). Follows PR 228 (part 4).

**Why it matters to a sub.** Part 4 asked, on every recorded Georgia affidavit of nonpayment,
whether the copy to the contractor "AT THE ADDRESS SHOWN ON THE NOTICE OF COMMENCEMENT" is owed.
The answer depends on two facts: whether the filer has a contract with the owner, and whether a
notice of commencement (O.C.G.A. § 44-14-361.5) was filed for the job. The second fact belongs to
the job, not the waiver. A sub with three affidavits on one job answered it three times and had to
find the contractor's address on the notice each time.

**What landed.**
- Two nullable job columns (migration 0041): `ga_noc_filed` (yes, no or not known) and
  `ga_noc_contractor` (the name and address shown on the notice). They are set through the existing
  `PATCH .../projects/:id`, so job history records the change with no new route.
- The waiver list DTO carries `gaNoc`. On an unanswered contractor-copy question the panel first
  asks the job's question, once. After that, the job's answer picks the suggested button: filed
  suggests "owed", not filed suggests "not owed". The user still makes the choice. Privity is a
  fact only they know, and nothing is answered for them.
- When the copy is owed, the address from the notice is shown where the copy is recorded.
- Worker test: round trip, a PATCH of another field leaves the answer unchanged, the 300-character
  limit, the history line, and another org cannot set the answer.

**Verification.** `pnpm typecheck` passes, and `ga-affidavit.test.ts` passes 7 of 7. Local `payapps-ci`
passes 9 of 9 run steps (the 3 `uses:` steps were not run), and payapps-site unit tests pass 21 of
21. Hosted CI ended red in 2 to 3 s because no runner picked it up. No browser screenshot was
taken of the new panel state.

**For the next run.**
- The fields are not on the job page. They are asked only from the affidavit, where they matter.
  Add them to the job page if users ask, perhaps next to the notary block.
- Weekends and holidays are still not counted in the seven days.
- Georgia's notice to contractor is tied to a filed notice of commencement, in the same section
  (§ 44-14-361.5). Read the official text before building on that. It is a candidate "Georgia
  preliminary notice" item, modelled on California and Wyoming, and the new field already holds
  its trigger.

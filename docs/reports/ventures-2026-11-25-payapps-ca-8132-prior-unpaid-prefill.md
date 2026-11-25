---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): California § 8132 exception (3) now fills itself

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#155 (merged). Claim:
`claim/payapps/lien-waivers-california-part-2-prefill` (ROADMAP Next #1, the "California part 2"
item left by PR 151).

**What it does.** California's conditional waiver on progress payment (Civ. Code § 8132) does not
affect "(3) The following progress payments for which the claimant has previously given a
conditional waiver and release but has not received payment", with "Date(s) of waiver and release"
and "Amount(s) of unpaid progress payment(s)". A sub who bills monthly on a slow-paying job has to
list every earlier month here, or the new waiver reads as if nothing earlier is still owed. PayApps
already knows the answer, so the waiver overview now prefills both blanks:

- one entry per earlier application on the job (lower number than this one) that is not paid,
  still owes money, and has a conditional progress waiver **marked sent** (a draft was never
  "given");
- dated by the waiver's own signature date (its `signedDate` field), else the day it was sent;
- valued at what is still owed on that application today: expected (certified, else line 8) less
  payments recorded. A partial check shrinks the amount; a paid application drops off;
- the current application, later ones and another state's waivers are ignored;
- output is "September 30, 2026; October 31, 2026" and "$13,000.00; $9,000.00", oldest first,
  in the package's own date and money formats. The user can still edit both before saving.

Code: `priorUnpaidConditional` in `apps/payapps/src/worker/services/payapps/waivers.ts`, merged into
`waiverOverview`'s prefill. The overview's "last state on the job" query now returns every waiver on
the job (the first row is still the newest), so no extra query.

**Test.** `test/worker/waivers.test.ts`, "California § 8132: earlier conditional waivers still
unpaid": three applications, a sent waiver on #1, a check that #2 sees #1 at $18,000.00, a partial
$5,000 payment on #1 (so #3 sees $13,000.00 and #2's $9,000.00), #1 marked paid (it drops off), the
printed PDF carrying the remaining entry, and a Texas overview with no such blanks.

**Next on California.** The preliminary notice (§ 8200 ff.), readable from the Legislative
Counsel's bulk download the same way PR 151 read §§ 8120-8138
(`ventures-2026-11-25-payapps-lien-waivers-california.md`).

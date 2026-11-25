---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): Wyoming's statutory lien waiver prints

This was a ventures run on 2026-11-25. The work landed in private PR Duncan-Haywood/private-monorepo#136 (merged). Claim:
`claim/payapps/lien-waivers-wyoming` (ROADMAP Next #1, the Wyoming part).

**Source.** The Wyoming Legislature's Title 29 PDF,
`https://wyoleg.gov/statutes/compress/title29.pdf`, answered from a cloud session. The PDF was created 2026-05-08, and its sha256 is
recorded in the snapshot `packages/lien-waivers/sources/wy-29-10-101.txt`. Wyo. Stat. § 29-10-101
(Chapter 10, Forms) has two parts:
- (a) is the preliminary notice of right to lien, which § 29-2-112 requires.
- (b) is one "LIEN WAIVER" form, which a waiver "shall be completed in substantially".

On the same day, `leginfo.legislature.ca.gov` and Justia's Georgia and Mississippi pages still
answered 403. That leaves California, Georgia and Mississippi as the pending states.

**How it maps.** The form waives "In consideration of the PAYMENT received to date" and
"acknowledges receipt of payment". Because of that, it is listed as both unconditional kinds,
progress and final. The conditional kinds are `absent`, as in Florida: they are tracked with the
reason and never printed. The form has two money blanks:
- retainage withheld, `retainageHeldCents`. The app prefills it from the application's
  `totalRetainageCents`.
- "has not been paid the sum of", `unpaidCents`. The user enters it.

The form is the only encoded one that ends in a notary acknowledgment. Its blanks stay printed
rules for the notary. `test/whole-form.test.ts` now reads a run of underscores in our text as a
blank.

**A trap printed as written.** The form says the waiver stays in force if the undersigned accepts
uncertified funds that are later dishonored. Then it says the waiver "shall not apply" if the
owner's payment is dishonored. Both sentences are printed verbatim, and a note sends the reader to
counsel.

**Verified.**
- Local checks: lien-waivers 200/200 tests pass, payapps `test/worker/waivers.test.ts` 19/19 pass,
  and both typechecks and biome are clean.
- Three one-phrase edits each failed 3 tests.
- Private CI did not give a usable result. Its single job fails in about 3 seconds with no
  downloadable log, the same as on merged PR #134, so it was treated as runner-starved and the
  change was verified locally.

**Next.**
- A "preliminary notice of right to lien" for Wyoming jobs (§ 29-10-101(a); a sub must send it
  within 30 days of first work, § 29-2-112(a)(ii)(B)). The text is already in the snapshot.
- California once leginfo answers.
- Public side, this PR: the pay-app guide and the statutory-forms post now say PayApps prints
  Wyoming. They also say the Wyoming form needs a notary, and that Michigan and Missouri, which
  were stale in the guide's product paragraph, are covered.

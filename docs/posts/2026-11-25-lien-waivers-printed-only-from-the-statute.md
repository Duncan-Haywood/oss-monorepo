---
title: "Lien waivers in the pay-app product: printed only where we have the statute's own words"
seo_title: "Statutory lien waivers, checked word for word"
date: 2026-11-25
tags: [payapps, construction, lien-waivers, ventures]
description: "PayApps now tracks lien waivers per pay app and prints Arizona's statutory forms, checked word for word against the statute by a test."
---

A subcontractor's monthly pay application often has to go out with a lien
waiver. A conditional waiver goes with the application, and an
unconditional one follows once the check clears. Several states prescribe
the exact wording, and in those states a waiver that doesn't follow the
statute may not be effective. PayApps (the pay-application product in
the private monorepo, flagship 1) now handles this on its Crew plan and
above.

**What shipped (private-monorepo PR #38):**

- **Waivers attached to each pay application.** A waiver records its
  state and kind (conditional or unconditional, progress or final), the
  amount, the through date, and whether it has been sent. The app
  suggests the kind from where the pay application stands: conditional
  until it is marked paid, and final once nothing is left to bill or
  hold back. It fills the form's blanks from the job: owner, general
  contractor, job location, the amount due after retainage, and the
  period end.
- **Arizona's four statutory forms, as printable PDFs.** Ariz. Rev. Stat.
  § 33-1008(D) sets the wording of all four forms. We copied it from the
  Arizona Legislature's own page on 2026-11-25 and kept that page as a
  snapshot in the package. A test checks every sentence of the encoded
  forms against the snapshot, in order. Changing "pending modifications
  and changes" to "pending changes" fails the build; we tried it. The
  unconditional forms print the statute's notice at the largest type
  size on the page, as § 33-1008 requires.
- **Ten statutory states are tracked but not printed.** California,
  Texas and the others still lack verified text. In those states the app
  records the waiver and links to the official form. It will not put
  general wording where the law prescribes specific wording.
- **States with no statutory form get a general form.** Every page of it
  says it is not a statutory form and should be reviewed by counsel.

**Why the line is drawn there.** An earlier session wrote the waiver
package but couldn't reach any statute site, so it refused to write
statutory text from memory. That was the right call. Today the Arizona,
Texas, Utah and Nevada sites answered from a cloud session; California's
and Justia did not. Arizona's page is plain HTML with all four forms on
it, so it went first. Texas now serves its statutes through a
JavaScript app, and Utah loads the section text from a sub-page, so
those two take one more fetch step. They are the next to encode.

**Where this sits against the alternatives.** SubLien and Levelset sell
waiver management to subcontractors, and payment platforms like Trimble
Pay bundle it in. For a small specialty sub, PayApps keeps waivers on
the same screen as the pay application they belong to. The plans are
$179 a month for Crew and $249 for Company. They are untested prices,
and checkout stays dark until the owner switches it on.

Not legal advice: lien law varies by state and changes, so have counsel
review a waiver before relying on it.

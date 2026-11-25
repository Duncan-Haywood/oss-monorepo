---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): Missouri's residential lien waiver, offered as a choice

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#131 (merged). Claim:
`claim/payapps/lien-waivers-missouri` (ROADMAP Next #1, the Missouri part).

**What the statute says.** `revisor.mo.gov` answered from a cloud session
(`https://revisor.mo.gov/main/OneSection.aspx?section=429.016`, effective 28 Aug 2010). Mo. Rev.
Stat. § 429.016 is **not** a four-form statute like Arizona's. It gives one form, "UNCONDITIONAL
FINAL LIEN WAIVER FOR RESIDENTIAL REAL PROPERTY" (§ 429.016.27). That form is mandatory only on
residential real property as subsections 1-2 define it: new residential construction, not a remodel
of an owner-occupied home of four units or fewer (§ 429.013) and not commercial work. Partial and
conditional waivers are allowed (.25), but the statute gives them no form. The
`statutory.ts` list had Missouri down as a four-form state "from the project brief and general
knowledge". That was wrong, and now it is fixed.

**What landed.**

- `packages/lien-waivers`: Missouri is off `STATUTORY_STATES`, so `listForms("MO")` gives the
  general forms plus two notes citing § 429.016. There are new exports: `alternativeForms(state)`,
  `allForms`, `formById(state, id)` and `FormDefinition.appliesTo`. `src/mo.ts` holds the form word
  for word, with id `MO/unconditional-final/statutory-residential`. The snapshot is in
  `sources/mo-429-016.txt`. `test/mo.test.ts` and a `whole-form` case check it. Two edits to the
  wording each failed those tests.
- App: `POST .../waivers` takes `formId` and checks it against the state and the kind. The overview
  returns `alternatives`. The waiver panel shows "Which form" with the form's `appliesTo`.
  `renderWaiver` now looks the form up by the stored id. Before, it used the state's first form of
  that kind, which would have answered 409 for any alternative.

**Choices to keep.** PayApps never picks the residential form itself, because the job has no
property-type field. A follow-up could add one and preselect the form; it is noted in the ROADMAP.
The statute's caption "(provide legal name and address of Claimant)" became two blanks, the name
and the address. The `whole-form` case maps it with the new `blankAs` option. The signature block
carries what .27 says must be printed by the signature: name, title or position, address,
telephone, and the date beside it.

**Verification.** Private CI fails in about 2-9 s on every PR with no logs (#129 and #130 too), so
everything was run locally. Results: package 200/200, payapps typecheck clean, unit 476/476, waiver
worker tests 23/23, biome clean. These were run after merging main, which brought in Michigan
(#130) and touched the same files.

**Public side.** The pay-app-guides page `lien-waiver-forms-by-state.html` has a new Missouri row
and section. The post `docs/posts/2026-11-25-which-states-make-you-use-their-lien-waiver-form.md`
now covers Missouri.

**Next for the waiver list.** California is still 403. Georgia, Mississippi and Wyoming are still
open; the public guide already has Wyoming, read from `wyoleg.gov`. Remember that a state "listed
in the brief" can turn out to have a narrower statute, as Missouri did.

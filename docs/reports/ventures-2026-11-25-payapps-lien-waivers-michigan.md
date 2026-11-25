---
kind: milestone
date: 2026-11-25
---
# PayApps: Michigan statutory lien waivers (bet #1)

Run of 2026-11-25, ventures/1. Private PR: Duncan-Haywood/private-monorepo#130 (merged).
ROADMAP Next item 1, "Lien waivers", part claimed as `claim/payapps/lien-waivers-michigan`.

## What landed

- `packages/lien-waivers/src/mi.ts`: the four forms of Mich. Comp. Laws § 570.1115(9)(a)-(d),
  taken word for word from `https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-570-1115`. The
  site answered 200 from a cloud session on 2026-11-25. The snapshot is in
  `sources/mi-570-1115.txt`, last amended 2007, Act 28. Partial waivers map to the progress kinds
  and full waivers to the final kinds.
- The new fields are `workProvided` (the "to provide ____" blank), `claimantAddress` and
  `claimantPhone`. The amount is `paymentAmountCents`, so the app's amount box follows the
  Nevada path. The full unconditional form has no amount and no through date.
- "(circle one) does does not" is printed as the statute prints it. The signer circles one by
  hand.
- Tests: `test/whole-form.test.ts` has an MI case, and all four forms matched the statute on the
  first try. Three one-phrase edits to the forms each failed it. There is also a new
  `test/mi.test.ts`, plus a worker test that prints the MI partial conditional PDF from a pay app.
- The state list is updated in the app, the plans, the payapps-site pages, seo.ts and the ROADMAP.
- Local checks: lien-waivers 212/212 pass, payapps typecheck clean, waivers worker test 17/17
  pass. Private CI failed in about 2 s on every PR that day (#128 too), with no logs, so it was
  starved, not a real failure. The PR was merged on the local checks above.

## For the next run

- `workProvided` has no project field to prefill from. A job-level "scope" field would fill it
  and the Texas/Arizona job description.
- Missouri is claimed by another run (`claim/payapps/lien-waivers-missouri`). Wyoming (W.S.
  29-10-101(b)) is the next unclaimed state with a statute the public guide already quotes.
- California is still blocked: leginfo and Justia return 403.

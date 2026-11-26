---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote (bet #2): e2e suite part 2, and two bugs it found (2026-11-26)

Private-monorepo PR #205, claimed as `claim/jobshop-quote/e2e-suite-part-2` (ROADMAP item 12).
Private CI had no runners (2 s red, `ci_starvation.py` exit 0); `run_workflow_locally.py
--repo-root /home/user/private-monorepo jobshop-quote-ci` ran every step green, e2e 5/5 included.

## What landed
- `test/e2e/04-cad-revision-email.spec.ts`: a STEP plate written with
  `packages/cad-features/test/helpers/step-writer.ts` (imported by relative path; typechecks), the
  measured box and holes under Source, the blank on the quote line, the quote email, a revision and
  its "What changed" card, the PDF-summary toggle, rev 1 superseded.
- `test/e2e/05-team-and-import.spec.ts`: rate-card paste import and re-import; an invited estimator
  in `browser.newContext()`; page and API role limits with a 201 positive control.
- `helpers.ts` `addBasicRateCard(page)`.

## Fixes
- `senderMustBeVerified(env)` in `services/quotes/email.ts`: the offline demo could never email a
  quote (sign-up there skips confirmation). Same rule as `requiresEmailVerification`, kept on for
  `APP_ENV=test` so the existing "Confirm your email" test still bites.
- `importRates` in `services/ratecard/index.ts` wrote and counted "no change" rows as updated.
- `context.ts`: geometry fake only for `APP_ENV=test`; demo and e2e run `CadFeaturesGeometry`.

## Keep
- The "Print Changes from ..." checkbox is controlled by the server's answer: Playwright `check()`
  fails ("did not change its state"); click, then `toBeChecked()`.
- Biome flags `innerText()` in specs; use `textContent() ?? ""`.
- seedRateCard makes one machine, not two.

## Next (item 12, part 3)
A drawing PDF attached (the fake converter decodes bytes as text, so it needs a fixture the server
can read), a DXF flat pattern's cut and bend suggestions, the CSV export.

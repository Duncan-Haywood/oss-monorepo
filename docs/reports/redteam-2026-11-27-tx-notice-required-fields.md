---
kind: note
topics: [redteam]
date: 2026-11-27
---
# Red team 2026-11-27: Texas notices of claim, required blanks and a stale holiday note

Targets: `ventures/payapps/packages/lien-waivers/src/tx-notice.ts`, merged the same day
(bet #1, PR #19750), with `tx-dates.ts` read alongside. A second campaign hit
`ventures/payapps/packages/billing/src/entitlement.ts`.

## Seeded faults

`tx-notice.ts`: 8 mutants, 2 caught, 6 escaped. All six flipped a field's
`required: true` to `false` (date, project, work type, original contractor, contact
person, address). The word-for-word tests compare wording, and wording does not
change when a blank becomes optional. The only test that rendered a notice with fields
missing checked one field, `claimAmount`. Triaged as gaps. Catch rate 0.25, then 1.0
after the guard.

`entitlement.ts`: 8 mutants, all 8 caught.

## Guard left behind (covers the whole class)

`packages/lien-waivers/test/required-fields.test.ts` covers every waiver and notice
form in all 50 states plus DC (211 forms):

- It pins each form's fields, in order, with `?` after an optional one, against
  `test/fixtures/form-fields.json`. A deliberate change regenerates the fixture with
  `UPDATE_FORM_FIELDS=1 node --test test/required-fields.test.ts`, and that fixture's
  diff is what review reads.
- A notice rendered with nothing filled in must name every required field and no
  optional one.
- A waiver validated with nothing filled in must name every required field.

Before this, a required/optional flip on any state's form would have reached main
unnoticed, unless that state's own test happened to check that field.

## Real defect, fixed

Both Texas notices print a "Weekends" note in their disclaimers. It said PayApps
"moves a date past a weekend but not past a holiday, so the date it shows can be a day
early". Part 2 of the Texas work added `txLegalHoliday` (Gov't Code § 662.021) to the
roll, so this note contradicted the dates the app shows. For example, the date for
15 February 2027 (Presidents' Day) now shows as the 16th. The package README said the
same thing. Both are now corrected. A new test in `tx-notice.test.ts` fails on the old
text and checks that `txNextBusinessDay("2027-02-15")` gives the 16th.

## For the next run

The pattern was a change in behaviour (the holiday roll) that left prose elsewhere
describing the old behaviour. Product notes that describe what code does ("PayApps
moves...") are worth grepping for whenever that code changes. `ROADMAP.md`'s part-1
entry still says "not past a legal holiday". It is left as dated history, and the
part-2 entry records the change.

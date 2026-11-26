---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): Massachusetts' partial waiver and subordination of lien

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#199 (merged). Claim:
`claim/payapps/lien-waivers-massachusetts` (ROADMAP Next #1, a part of the lien-waivers item).

**Host.** `malegislature.gov` answered 200 through the cloud proxy (the 2026-11-24 README listed it
as blocked). `law.justia.com` still answers 403. Section pages are plain HTML, and the section text
sits in the `<p>` run after `<h2 id="skipTo">`. Blanks are `<pwrule;N>` pseudo-tags (written as
`____` in the snapshot).

**What the statute says.** c. 254, § 32 voids agreements that bar a notice of contract or lien
enforcement, except (1) waivers by a principal on a lien bond, (2) statements of amounts due or
paid, (3) dissolutions under § 10 and (4) the "Partial Waiver and Subordination of Lien", for
persons who filed or recorded a notice of contract under § 2, "substantially in the following form
with no material deviation". So Massachusetts is handled like Missouri: the general forms with a
§ 32 note in `listForms("MA")`, and the statutory form from `alternativeForms("MA")`. Its id is
`MA/conditional-progress/statutory-partial-subordination`. It is listed as conditional progress
because it waives "upon receipt of" the payment.

**What landed.** `packages/lien-waivers/src/ma.ts` (verbatim body and its own fields, lines 1 to
10 of the pay application), `src/words.ts` (`amountInWords`, a module of its own so the browser
bundle does not pull in every form's text; aliased `@lien-waivers/words` in apps/payapps) and the
snapshot `sources/ma-254-32.txt`. Tests: `test/ma.test.ts`, plus a `whole-form` case. The
whole-form normaliser now drops a space before `)` on both sides, because the statute's `($___)`
read as `( ▢ )`. In the app, `prefillFor` fills lines 1 to 8 from the G702 summary (line 7 is
previous *certificates*, so that line 8 = line 6 - line 7 holds), line 9 from pending change
orders, the number and date, the property and the words. `typeValue` in the waiver panel keeps the
words in step with the figures.

**Checks run.** Package 226/226. payapps unit 538/538, worker 281/281 (one new MA case prints the
PDF), typecheck and build. payapps-site unit 21/21. Private CI was queued (starved runners).

**Next.** Fields on the job for a recorded notice of contract and for county and town, so the form
can be preselected and filled completely. Georgia and Mississippi are still blocked: their codes
are published through LexisNexis, and Justia answers 403.

---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): Georgia's statutory lien waivers, read from the Acts

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#209 (merged). Claim:
`claim/payapps/lien-waivers-georgia` (ROADMAP Next #1, part of the lien-waivers item).

**Hosts.** Georgia's official Code is published only through LexisNexis. `law.justia.com` and
`codes.findlaw.com` answer 403 through the cloud proxy. Two hosts publish the Acts and answer 200:
`gov.georgia.gov` (`/document/<year>-signed-legislation/sb-<n>/download`, the signed bills as PDFs)
and `www.legis.ga.gov` (`/api/legislation/document/20192020/188623` is SB 315). Use these hosts for
any state whose Code sits behind Lexis: read the Act that last rewrote the section. **Mississippi
(§ 85-7-433) is the next candidate**: try `billstatus.ls.state.ms.us` and `legislature.ms.gov`,
which both answered 200 on 2026-11-26.

**Reading a marked-up bill.** An amending bill prints deleted words struck through and new words
underlined. Plain `pdftotext` keeps both ("60 90 DAYS"). The fix was a 40-line pdfplumber script
(pdfplumber installed in a scratch venv, not added to the repo). For each word it finds a
horizontal line or thin rect under the word's horizontal centre. A line at 30-80% of the word's
height is a strike and one below 80% is an underline. It drops struck words and keeps underlined
ones. It works per word, so a token like "(a)(b)" (the old letter struck, the new one underlined)
comes out wrong. The subsection letters were set by hand, and the whole result was read by eye
against the bill. SB 315 rewrote all of § 44-14-366. SB 143 (2021) rewrote (g)(2) and changed one
word in the affidavit ("COPY OF THE LIEN" to "COPY OF THE AFFIDAVIT"). Web searches found no later
amendment.

**Mapping.** Georgia has two forms, interim (d) and final (e). Neither is conditional or
unconditional: each waives "upon the receipt of the sum". Under (g)(2) the waiver becomes
conclusively effective 90 days after signing unless an affidavit of nonpayment is filed before then
(the 2020 Act struck the earlier "claim of lien" alternative and the 60 days). So the interim form
is listed as both progress kinds and the final form as both final kinds, and `GA_NOTES` spells out
the 90 days.

**12-point font.** The statute requires the forms to "be in at least 12 point font". The package now
has `FormDefinition.minFontPt` and `WaiverDocument.minFontPt`, and `waiverPdf` raises both its
body and its largest size to that value. The 7 pt footer band stays outside the form.
`apps/payapps/test/unit/waiver-pdf-font.test.ts` parses the `Tf` operators to check. Any other
state with a whole-form type size can reuse the field.

**Not done (ROADMAP "Georgia part 2"):** the (g)(2) affidavit of nonpayment form (its text is
already in `sources/ga-44-14-366.txt`), and a reminder before the 90 days run out on an unpaid
Georgia waiver. The reminder would be the most useful part: `waiver-followup.ts` already tracks
waivers given and unpaid.

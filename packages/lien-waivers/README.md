# @private-monorepo/lien-waivers

> **This is not legal advice.** This package produces documents. It does not tell anyone
> whether a waiver is right for their situation, and no lawyer has reviewed it. Lien law
> varies by state and changes. Anyone signing or accepting a lien waiver should have it
> reviewed by counsel licensed in the project's state.

A TypeScript library, with no dependencies, for construction lien waivers in four kinds:

| kind                     | meaning                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `conditional-progress`   | releases rights through a date, *only once* the stated payment clears        |
| `unconditional-progress` | releases rights through a date; the claimant says it has already been paid   |
| `conditional-final`      | releases all rights for the job, *only once* the final payment clears        |
| `unconditional-final`    | releases all rights for the job; the claimant says it has been paid in full  |

The pay-app billing app is meant to import it.

## Current status: Arizona, California, Florida, Georgia, Michigan, Mississippi, Nevada, Texas, Utah and Wyoming encoded and verified, Missouri's one residential form and Massachusetts' partial waiver as alternatives; no listed state pending

**2026-11-26: Mississippi encoded from the Act that wrote it.** Miss. Code Ann. §§ 85-7-419 and
85-7-433 were created by SB 2622 (2014 Regular Session), approved by the Governor 11 Apr 2014. The
official Code is published through LexisNexis, and Justia and FindLaw answer 403, but the Legislature's
bill-status site answered 200 for the bill "As Sent to Governor", in HTML and PDF
(`https://billstatus.ls.state.ms.us/documents/2014/html/SB/2600-2699/SB2622SG.htm`); the two agree word
for word. The bill creates both sections new, so there are no struck words to drop. For amendments, the
Legislature's "All Measures" list for each session 2015-2026 was searched by short title: every
construction-lien or waiver bill in them died in committee. `sources/ms-85-7-433.txt` holds § 85-7-419
and § 85-7-433(1)-(3) (header: hashes, method, the search). `src/ms.ts` has the interim and final forms
(each listed as both kinds, as Georgia's: they waive "upon the receipt of the sum", and § 85-7-419(5)(b)
deems the amount paid sixty days after signing unless an affidavit of nonpayment is filed first);
`src/ms-affidavit.ts` has § 85-7-433(3)'s affidavit of nonpayment (`msAffidavitOfNonpayment`) and the
clock (`msSixtyDays`, 60 calendar days, and `msAffidavitCopyDueOn`, two days to send the owner a copy).
Each form is sworn before a notary, and the notary's blanks stay printed rules. The final form prints its
signature and jurat twice, above and below the NOTICE, as the bill does; both are kept. The statute has
no line for the claimant's name, so a "Claimant" line is added above the signature, as for Georgia.
`test/ms.test.ts` and `test/whole-form.test.ts` check the wording (the affidavit as a whole too);
dropping "OR PREMISES" from the interim form or the second signature block from the final form each
failed them. Not done: the time computation of § 85-7-425 (it points to § 1-3-67, not read, so the clock
does not move a weekend or holiday deadline); § 85-7-433(4)'s notice of contest of lien and (5)'s pre-lien
notice (residential).

**2026-11-26: Georgia encoded from the Acts that wrote it.** The official Code of Georgia is published
through LexisNexis, which this environment cannot reach (Justia and FindLaw answer 403). The State itself
publishes the Acts: SB 315 (2020 session, "AS PASSED", signed 5 Aug 2020, in force 1 Jan 2021) rewrote the
whole of O.C.G.A. § 44-14-366, and SB 143 (2021) rewrote its (g)(2), the affidavit of nonpayment
(`https://gov.georgia.gov/document/2020-signed-legislation/sb-315/download` and
`.../2021-signed-legislation/sb-143/download`, both answered 200; the same SB 315 text is on legis.ga.gov).
The bills print deleted words struck through and new words underlined, which plain `pdftotext` runs
together ("60 90 DAYS"); the words were told apart by the PDFs' drawn rules (a rule through the middle of a
word is a strike, one at its baseline an underline), struck words dropped, and each change read by eye
against the bill. The result is `sources/ga-44-14-366.txt` (its header records hashes and method). No later
amendment was found; the official Code itself was not read, and the notes say so.

Georgia's two forms, "upon interim payment" ((d)) and "upon final payment" ((e)), are neither conditional
nor unconditional: each waives "upon the receipt of the sum", and (g)(2) makes it conclusively effective
at the earliest of receipt, a written acknowledgment of payment in full, or 90 days after signing unless
an affidavit of nonpayment is filed first. So `src/ga.ts` lists the interim form as both progress kinds and
the final form as both final kinds, and the notes explain the 90 days. Both forms must "be in at least 12
point font": `FormDefinition.minFontPt` (and `WaiverDocument.minFontPt`) carries that to the printer,
and PayApps' PDF prints every block of a Georgia form at 12 pt. The forms are dated by hand under seal and
have witness and address lines, kept as the statute prints them. `test/ga.test.ts` and
`test/whole-form.test.ts` check the wording.

**2026-11-26: Georgia's affidavit of nonpayment.** `gaAffidavitOfNonpayment()` (`src/ga-affidavit.ts`) is
the (g)(2) form as SB 143 rewrote it, a `NoticeForm` rendered with `renderNotice`, at 12 pt
(`NoticeForm.minFontPt`), with its blanks named as the waivers' are (so a Georgia waiver's values fill
it) plus `waiverDate`, `waiverAmountCents` and `unpaidCents`; `NoticeForm.crossCheck` refuses an unpaid
amount of zero or above the waiver's. The swearing date, seal, witness and notary are left to be done by
hand. `gaNinetyDays(signedOn, today)` counts the 90 calendar days (not moved for weekends or holidays)
and `gaAffidavitCopyDueOn(filedOn)` the 7 days for the owner's copy. It is not a preliminary notice, so
`noticeForms("GA")` stays empty. `test/ga-affidavit.test.ts` checks every sentence against the snapshot.

**2026-11-26: Massachusetts read; it belongs beside Missouri, not on the statutory list.** Mass. Gen. Laws
c. 254, § 32 (General Court, `https://malegislature.gov/Laws/GeneralLaws/PartIII/TitleIV/Chapter254/Section32`,
answered 200 to the cloud proxy; snapshot in `sources/ma-254-32.txt`) makes an agreement "purporting to bar
the filing of a notice of contract or the taking of any steps to enforce a lien" void and unenforceable, with
four exceptions. Exception (4) is a form: the "Partial Waiver and Subordination of Lien", for "persons who
have filed or recorded notices of contract under section two", "substantially in the following form with no
material deviation therefrom". It is a progress waiver given "upon receipt of" a payment, so it is listed as
the conditional progress kind (`src/ma.ts`, id `MA/conditional-progress/statutory-partial-subordination`),
offered by `alternativeForms("MA")` with `appliesTo`; `listForms("MA")` stays the general forms, with a note
naming § 32 and pointing to it. The form heads its text with the pay application's lines 1-10 (original
contract, approved change orders, adjusted contract, completed to date, retainage, total payable, previous
payments, current amount due, pending change orders, disputed claims), so it has its own field list. Lines 2
and 9 are text, not money, because a net of change orders can be deductive. The payment is stated in words
and figures; `amountInWords(cents)` writes the words as cheques do. The statute prints no signature lines (it
ends "Signed under the penalties of perjury this ___ day of ___, ___.", left for the signer to date by
hand), so the signature block adds name, title and the contractor signed for. The statute's sentence after
the form (giving it "shall not affect the lien rights of any other person") is a note. `test/ma.test.ts`
and `test/whole-form.test.ts` check the wording. Not answered here: whether any other waiver is
enforceable on a Massachusetts job (the general forms' note says to ask counsel).

**2026-11-25: California done.** The four forms of Cal. Civ. Code §§ 8132, 8134, 8136 and 8138 are
in `src/ca.ts`. `leginfo.legislature.ca.gov` still answers 403 to the cloud proxy, but the
Legislative Counsel's official bulk download does: `https://downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip`
holds `LAW_SECTION_TBL.dat` (one row per code section, naming its content file) and one
`LAW_SECTION_TBL_<n>.lob` per section in CAML (XML). Reading the zip's central directory and then
only the entries needed, by HTTP range request, costs about 7 MB of the 1.2 GB file. Snapshot in
`sources/ca-8132-8138.txt` (§§ 8120-8138, the whole of Article 3). California's forms are the model
the generic field set was drawn from, so they use the generic keys, plus `priorWaiverDates` and
`priorUnpaidAmounts` (§ 8132's exception (3), optional text) and `disputedClaimsCents` (the final
forms' one exception). Each form leads with its title and then its notice; the unconditional forms'
"Notice to Claimant" must be "in at least as large a type as the largest type otherwise in the
form". `test/ca.test.ts` checks every sentence in order; `test/whole-form.test.ts` the whole form.
The same download should unlock California's other lien forms (preliminary notice, § 8200 ff.).

**2026-11-25: Wyoming's preliminary notice.** `noticeForms("WY")` returns the "NOTICE TO OWNER"
of Wyo. Stat. § 29-10-101(a) (`src/notices.ts`), from the same snapshot; `renderNotice` fills it
and returns the § 29-10-101(b) waiver form blank as its attachment, since the notice says "A form of
lien waiver is attached to this notice". The deadline (§ 29-2-112) is not encoded; the notes quote
the form's own reference to it. `test/notices.test.ts` checks every heading and sentence, and that
nothing of subsection (a) is left out.

**2026-11-25: California's preliminary notice (private works).** `noticeForms("CA")` returns
`CA/preliminary-notice/private-works`. California prescribes the notice's contents, not a whole
form: the Cal. Civ. Code § 8102(a) items "to the extent known", § 8202(a)(1) and (2), and
§ 8202(a)(3)'s "NOTICE TO PROPERTY OWNER" statement "in boldface type" (printed as `notice` blocks,
bold at the page's largest size). Each item's heading is the statute's own phrase for it, and the
statement is word for word, both checked against `sources/ca-8102-8216.txt` (§§ 8102, 8106, 8110,
8116, 8118, 8200, 8202, 8204, 8206, 8216, from the same Legislative Counsel bulk download as the
waivers) by `test/ca-notice.test.ts`, which also fails on a heading cut short at either end. The
title, the citation line and the signature lines are this package's. Items the statute asks for
only "if any" (construction lender, the claimant's demand, § 8202(b)'s unpaid laborers) are left
off when blank (`NoticeForm.omitIfBlank`). The notes quote § 8204(a)'s 20-day rule but compute no
date, name the ways to give notice (§§ 8106, 8110) and the proof of notice declaration (§ 8118,
not printed). Public works (§ 9300 ff.) are not encoded. Other states return no notice.

**2026-11-25: California's preliminary notice, part 2.** `src/ca-proof.ts`: `caNoticeDueOn` (§ 8204(a),
20 calendar days after first furnishing, never moved for a weekend or holiday), `caNoticeCompleteOn`
(§ 8116: on delivery or deposit; five days after mailing for Code Civ. Proc. § 415.20),
`caNoticeTiming` (on time, or the first day of work a late notice covers), and `caProofOfNotice`, the
§ 8118 proof of notice declaration: § 8118(a)'s three items as headings and § 8118(b)'s accompanying
documents word for word, by method. It leaves out the § 2015.5 "under penalty of perjury" sentence,
whose official text is not in the snapshot, and its disclaimer says so. `test/ca-proof.test.ts` checks
the rules and the copied text against `sources/ca-8102-8216.txt`.

**2026-11-25: Wyoming done.** Wyo. Stat. § 29-10-101(b) is in `src/wy.ts`, from the Wyoming
Legislature's published Title 29 (`https://wyoleg.gov/statutes/compress/title29.pdf`, which
answered from a cloud session; snapshot in `sources/wy-29-10-101.txt`). This settles "Wyoming's
section number" below: the waiver form sits in Chapter 10 (Forms), beside the preliminary notice
of right to lien (§ 29-10-101(a), required by § 29-2-112 and not produced here). Wyoming has
**one** form, "LIEN WAIVER", and the form for waiver of a lien "shall be completed in substantially
the following form". It waives "In consideration of the PAYMENT received to date" and
acknowledges receipt, so it is listed as both unconditional kinds (progress and final) and the
conditional kinds are `absent`, as in Florida. It reserves "monies withheld as retainage in the
amount of $___" and states "has not been paid the sum of $___": two money blanks,
`retainageHeldCents` and `unpaidCents` (PayApps prefills the first from the application's total
retainage and leaves the second to the user). It is the only encoded form with a notary
acknowledgment; its blanks stay printed rules for the notarial officer, and
`test/whole-form.test.ts` now reads a printed rule in our text as a blank. The form says both that
the waiver stays in effect if the undersigned accepts uncertified funds that are later dishonored
and that it "shall not apply" if the owner's payment is dishonored; both are printed as given and
a note sends the reader to counsel. Three one-phrase edits ("pursue any and all actions" to
"pursue all actions", "IN WITNESS THEREOF" to "WHEREOF", an added sentence) each failed three tests.
`leginfo.legislature.ca.gov`, Justia (Mississippi, Georgia) still answered 403 the same day.

**2026-11-25: Missouri read, and it is not a statutory-forms state.** Mo. Rev. Stat. § 429.016
(Missouri Revisor of Statutes, `https://revisor.mo.gov/main/OneSection.aspx?section=429.016`,
effective 28 Aug 2010; snapshot in `sources/mo-429-016.txt`) prescribes one form, the
"UNCONDITIONAL FINAL LIEN WAIVER FOR RESIDENTIAL REAL PROPERTY" (§ 429.016.27), and only for
residential real property as subsections 1-2 define it (new residential construction; not repair or
remodeling of an owner-occupied home of four units or fewer, which § 429.013 covers, and not
commercial work). There, an unconditional final waiver "shall only be valid" on that form; partial
and conditional waivers are allowed (§ 429.016.25) with no form. So `listForms("MO")` returns the
general forms with two Missouri notes, and the statutory form comes from `alternativeForms("MO")`
with `appliesTo` saying when to use it (`src/mo.ts`, id `MO/unconditional-final/statutory-residential`).
The caller chooses; `formById(state, id)` finds a chosen form again. The statute's caption
"(provide legal name and address of Claimant)" is two blanks here (name, address), and the
signature block carries what § 429.016.27 says to print by the signature (name, title or position,
address, telephone, date beside it). `test/mo.test.ts` and `test/whole-form.test.ts` check the
wording; two edits ("fully, finally, and" to "fully and"; dropping the "and for any work hereafter
performed ..." clause) each failed them.

**2026-11-25: Michigan done.** The four forms of Mich. Comp. Laws § 570.1115(9)(a)-(d) are in
`src/mi.ts`, from the Michigan Legislature's published text
(`https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-570-1115`, which answered from a cloud
session; last amended 2007, Act 28; snapshot in `sources/mi-570-1115.txt`). Michigan calls them
partial and full waivers: partial is listed as the progress kind and full as the final kind. The
forms are used "in substantially the following format". Their blanks are the other contracting
party, what the contract is to provide, the property description, the amount and the through
date (partial forms), and the claimant's signature, date signed, address and telephone. The
partial forms keep the statute's "(circle one) does does not cover all amounts due" for the
signer to circle by hand: PayApps does not make that statement for them. The full conditional
form says the contract "has been fully paid and satisfied" and then that it "is conditioned on
actual payment of" the amount; § 570.1115(4) makes it effective on that payment. All four pass
`test/whole-form.test.ts` on the first try; three one-phrase edits ("either in writing, by
telephone, or personally" to "either in writing or by telephone", "for contract improvement" to
"for improvement", "construction lien rights" to "lien rights") each failed it.
`leginfo.legislature.ca.gov` and Justia still answered 403 the same day.

**2026-11-25: Florida done.** Fla. Stat. § 713.20(4) and (5) are in `src/fl.ts`, from the
Florida Senate's published 2026 Florida Statutes (`https://www.flsenate.gov/Laws/Statutes/2026/713.20`;
the 2025 edition reads the same, last amended 1999; snapshot in `sources/fl-713-20.txt`).
`www.flsenate.gov` answered from a cloud session; `leginfo.legislature.ca.gov` and Justia still
returned 403 the same day. Florida has **two** forms, a progress and a final "WAIVER AND RELEASE
OF LIEN", neither labelled conditional or unconditional. Each "hereby waives and releases" the
lien "in consideration of" the payment, with no condition in its text, so they are listed as
`unconditional-progress` and `unconditional-final`. § 713.20(7) lets a lienor that signs one in
exchange for a check condition it on payment of the check, but gives no wording for the condition,
so the two conditional kinds are `absent` (refused with `NO_STATUTORY_FORM`, reason in the notes),
the mirror of Utah. Florida prints a caption where a blank goes ("(insert date)"), so the captions
became the field labels and `test/whole-form.test.ts` reads them as blanks (`blanks`). The forms
are optional ("may be in substantially the following form"), but no one may require a different
one (§ 713.20(6)). Three one-phrase edits (e.g. "any retention or labor" to "any retention,
labor", "the following described property" to "the following property") each failed the tests.

**2026-11-25: Texas and Utah done.** Texas's four forms (Tex. Prop. Code § 53.284(b)-(e)) are in
`src/tx.ts`. The statutes site is a JavaScript app with no text in its HTML, but the chapter file
it loads is served at `https://tcss.legis.texas.gov/resources/PR/htm/PR.53.htm` (found in the
app's bundled config; snapshot in `sources/tx-53-284.txt`). The section is unchanged since 2011;
the chapter file carries amendments through 2025. Texas puts its unconditional notice *above*
the title and requires it in bold, at least the largest type and not under 10 point, so the
notice is the first block of those two forms.

Utah (Utah Code § 38-1a-802(4), `src/ut.ts`, snapshot from the section's XML download in
`sources/ut-38-1a-802.txt`) has **two** forms, not four: a conditional progress form and a final
form that carries no conditional label but takes effect only "once" the check is endorsed and
paid, so it is listed as `conditional-final`. Utah has no unconditional form. Those two kinds now
say so: the form has `absent` set to the reason, its notes lead with it, and `render()` refuses
with `NO_STATUTORY_FORM` instead of `STATUTORY_TEXT_NOT_ENCODED`, so "the statute has none" is
never shown as "pending". `test/whole-form.test.ts` covers every encoded form (eighteen with Michigan's four); six
one-phrase edits (three per state, e.g. "except for unpaid retention" shortened to "except
for", "Contractors' Bonds" to "Contractor Bonds") each failed it.

**2026-11-25: Nevada done.** The four forms of Nev. Rev. Stat. § 108.2457(5)(a)-(d) are in
`src/nv.ts` from the Nevada Legislature's published text (snapshot in
`sources/nv-108-2457.txt`). Nevada's blanks differ from Arizona's (Property Name, Property
Location, Undersigned’s Customer, Invoice/Payment Application Number, Payment Amount, and for
final payments Payment Period and Amount of Disputed Claims; no through date), so the forms
declare their own fields. Nevada is stricter than Arizona: a waiver is unenforceable unless it
is "in the following forms", and its two unconditional notices differ (progress: "to the
extent of the Payment Amount or the amount received"; final: "even if you have not been paid").

**Whole-form check.** `test/whole-form.test.ts` rebuilds each encoded form from its blocks and
compares it with the statute's form as a whole (blanks as "▢", captions and drafting notes
dropped). The per-state tests check that each phrase appears in order; this one also fails
when a clause is dropped. Tried on 2026-11-25: deleting Arizona's "Before any recipient of
this document relies on it ..." sentence from the conditional final form passed
`test/az.test.ts` and failed this test; changing "any retention withheld" to "any retention"
in Nevada failed it too.

**2026-11-25: Arizona done.** The four forms of Ariz. Rev. Stat. § 33-1008(D) are encoded in
`src/az.ts` from the Arizona Legislature's published text (snapshot with fetch date in
`sources/az-33-1008.txt`), with the statute's own blanks as fields and the unconditional
notice the statute requires. `test/az.test.ts` checks every sentence against that snapshot,
in order, so a one-word drift fails the build (tried: changing "pending modifications and
changes" fails it). From the same session `statutes.capitol.texas.gov` (now a JavaScript app,
no text in the HTML), `le.utah.gov` (section text loads from a versioned sub-page) and
`www.leg.state.nv.us` answered; `leginfo.legislature.ca.gov` and Justia still returned 403.
Texas and Utah are the next to encode (Nevada landed the same day, above).

Some states prescribe the exact wording of lien waivers by statute. In those states a waiver
that is not in the statutory form may not be effective. As of **2026-11-24** (Arizona since
encoded, above):

- This package **lists** 11 states as statutory-form states: AZ, CA, FL, GA, MI, MO, MS, NV,
  TX, UT, WY. That list comes from the project brief. It has **not** been checked against an
  official source.
- **No statutory form text is encoded.** The network policy of the environment this was
  built in blocked every official statute site we tried (the CA, TX, AZ, UT, NV, FL, MI, MO
  and MA legislature sites, and Justia). We would not reconstruct public-law text from
  memory, so each statutory form carries its citation, marked `verification.status:
  "unverified"`, with `body: null`.
- For those states, `render()` **refuses** with `STATUTORY_TEXT_NOT_ENCODED` and points to
  the official source. It never substitutes the generic form. The app should send the user
  to the official form instead.
- Still open (Massachusetts was settled on 2026-11-26, above): whether
  Missouri's and Florida's forms are mandatory or optional; Wyoming's section number; and how
  Georgia's and Florida's statutory forms map onto the four kinds.

| State | Citation (unverified)                                                    | Official source            |
| ----- | ------------------------------------------------------------------------ | -------------------------- |
| AZ    | Ariz. Rev. Stat. § 33-1008 (**verified 2026-11-25**, encoded)            | azleg.gov                  |
| NV    | Nev. Rev. Stat. § 108.2457 (**verified 2026-11-25**, encoded)            | leg.state.nv.us            |
| CA    | Cal. Civ. Code §§ 8132 (CP), 8134 (UP), 8136 (CF), 8138 (UF)             | leginfo.legislature.ca.gov |
| FL    | Fla. Stat. § 713.20 (**verified 2026-11-25**, encoded)                   | flsenate.gov               |
| GA    | O.C.G.A. § 44-14-366(d), (e) (**verified 2026-11-26** from the Acts, encoded) | gov.georgia.gov (Acts) |
| MI    | Mich. Comp. Laws § 570.1115 (**verified 2026-11-25**, encoded)           | legislature.mi.gov         |
| MO    | Mo. Rev. Stat. § 429.016                                                 | revisor.mo.gov             |
| MS    | Miss. Code Ann. § 85-7-433                                               | —                          |
| TX    | Tex. Prop. Code § 53.284                                                 | statutes.capitol.texas.gov |
| UT    | Utah Code § 38-1a-802                                                    | le.utah.gov                |
| WY    | Wyo. Stat. § 29-10-101(b) (**verified 2026-11-25**, encoded)             | wyoleg.gov                 |

### Hosts needed to finish (blocked on 2026-11-24)

Every state in the table above is **statutory text pending — not yet verified**. Reading
the official text needs network access to these hosts:

- `leginfo.legislature.ca.gov` (California)
- `statutes.capitol.texas.gov` (Texas)
- `www.azleg.gov` (Arizona)
- `le.utah.gov` (Utah)
- `www.leg.state.nv.us` (Nevada)
- `www.leg.state.fl.us` (Florida)
- `www.legislature.mi.gov` (Michigan)
- `revisor.mo.gov` (Missouri)
- `malegislature.gov` (Massachusetts, to decide whether it belongs on the list)
- `law.justia.com` (fallback for Georgia, Mississippi and Wyoming, whose official codes are
  published through LexisNexis; their official publisher's host is still to be confirmed). For
  Mississippi, `billstatus.ls.state.ms.us` (the Legislature's bills, as passed) answered instead.

### Encoding a statutory form (how to finish the job)

1. Read the **current** section on the official site, not a vendor's copy.
2. In `src/statutory.ts`, add the verbatim form to that state's `bodies[kind]` as
   `BlockTemplate[]`. Copy the text exactly, including headings, NOTICE paragraphs and
   capitalization. Use `{{fieldKey}}` placeholders only where the statute has a blank. If the
   statute's blanks differ from `fieldsFor(kind)`, give the form its own field list.
3. Set that citation's `verification` to
   `{ status: "verified", checkedOn: "YYYY-MM-DD", sourceUrl, checkedBy }`.
4. Add a test that renders the form and compares it with the statutory text.
   `test/statutory.test.ts` already fails if a body ships with an unverified citation or with
   a placeholder that has no field.

## Every other state: generic form

`listForms("NY")` (and every state not in the table above) returns four **generic** forms.
Their wording was written for this package and is **not** any state's statutory form. Each
one starts with a NOTICE block saying it is not a statutory form and that local counsel
should review it, and that notice also appears in `document.disclaimers`.

## API

```ts
import { listForms, render, toPlainText } from "@private-monorepo/lien-waivers";

const forms = listForms("ny");             // FormDefinition[] (throws RangeError on unknown state)
const form = forms.find((f) => f.kind === "conditional-progress")!;
form.body === null;                        // true => statutory text not encoded; don't offer it

const r = render(form, {
  claimantName: "Acme Drywall LLC",
  customerName: "Big GC Inc.",
  jobLocation: "123 Main St, Springfield",
  throughDate: "2026-10-31",               // dates: ISO YYYY-MM-DD
  checkMaker: "Big GC Inc.",
  checkAmountCents: 1234567,               // money: integer cents
  checkPayee: "Acme Drywall LLC",
  signerName: "Pat Smith",
  signerTitle: "President",
  signedDate: "2026-11-24",
});
if (!r.ok) r.errors;                       // [{ field, code, message }] — every problem at once
else {
  r.document.blocks;                       // PDF-ready blocks: title | heading | paragraph |
                                           //   notice | field | signature | spacer
  r.document.disclaimers;                  // show these
  toPlainText(r.document);                 // plain-text preview
}
```

- `form.fields` describes each input (`key`, `label`, `type`, `required`, `help`), so a UI
  can build the form from it.
- Validation reports `REQUIRED`, `INVALID_DATE` (including impossible dates such as
  Feb 30), `INVALID_MONEY` (only non-negative integer cents), `INVALID_TEXT` (more than 2000
  characters), and `UNKNOWN_FIELD` (to catch typos).
- A blank optional field renders as a fill-in line (`________________`).
- `hasStatutoryForms(state)` and `STATUTORY_STATES` expose the registry.

## Development

```sh
pnpm --filter @private-monorepo/lien-waivers test       # node --test (Node >= 22.18 strips TS types)
pnpm --filter @private-monorepo/lien-waivers typecheck
```

Tests live in `test/`. They cover each statutory state's four forms (citation present,
honest verification record, a body only with a verified citation, render refusing while
the text is unencoded) and the generic forms (rendering, notices, every validation path).

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `packages/lien-waivers` at commit
`cded6eaf5d8aefcb42e61ed1cad3ec0b81826072` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).

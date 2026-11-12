# E-invoice preflight

**Validate a structured invoice before submission.** After using this, you can
now see which fields, totals, VAT digits, or payment instructions would fail a
local preflight — in the browser or in CI — which used to mean waiting for a
network rejection. Open `index.html` and drop a JSON, UBL, CII, or Factur-X
PDF file, or run the CLI below. The page never uploads the invoice.

**Live tool:** https://marisstella.app/einvoice-preflight/

This free local CLI also checks a small, transparent JSON, UBL XML,
UN/CEFACT CII (XRechnung CII / Factur-X), or Factur-X / ZUGFeRD PDF invoice
for missing fields and arithmetic mistakes, then prints rule IDs and
plain-language fixes. It is aimed at bookkeepers and ERP integrators
searching for an e-invoice preflight check. CII is the XML an ERP actually
emits when it is not UBL; a Factur-X PDF is only the envelope around that XML.
When a PDF unwraps, the result names the standard attachment
(`factur-x.xml`, `zugferd-invoice.xml`, or `xrechnung.xml`) and the syntax
(CII or UBL). Custom attachment names are not echoed. The attachment stream is
found whatever order the generator wrote its dictionary in (`/Filter` or `/Length`
before `/Type`) and with an indirect `/Length 5 0 R`; before 2026-10-22 those
PDFs were refused as having no invoice XML (found by building such files; tested
on hand-made PDFs, not yet on a real Mustang, Ghostscript or Acrobat export).
Opened in poppler (2026-10-30): the shipped example PDFs had an empty page tree
(`pdfinfo`: "Invalid page count 0"), so no viewer could show them. They now carry
one page, and a test (skipped where poppler is absent) repairs the credit note
with defects, checks `pdfinfo` reads one page with no syntax error and that
`pdfdetach` returns exactly the corrected XML. veraPDF and Acrobat are still unrun.

**PDF envelope checks (2026-10-30, `pdf-envelope.mjs`).** A Factur-X PDF now also
gets four checks on the PDF around the XML: PDF-001 (no PDF/A-3 marker in the
XMP; a note, not blocking), PDF-002 (attachment not named factur-x.xml,
zugferd-invoice.xml or xrechnung.xml), PDF-003 (no valid AFRelationship; a note)
and PDF-004 (XMP `fx:ConformanceLevel` names a different profile than the XML's
guideline ID). Tested on hand-built PDFs only (`pdf-envelope.test.mjs`); the
shipped example PDFs have no XMP, so they draw PDF-001. Not run on a real
Mustang, Ghostscript or Acrobat export, and not a PDF/A validator (veraPDF unrun).
The browser page and the Node CLI/server get these; the Python CLI does not yet.

**Two more envelope notes (2026-10-31).** PDF-005 (the embedded file's stream has
no `/Subtype`, the MIME type PDF/A-3 requires, `/text#2Fxml` for XML) and PDF-006
(the document catalog has no `/AF` array; read only when the catalog is in plain
text, so a catalog packed in a compressed object stream draws nothing). Both are
notes. Tested on hand-built PDFs only, same limits as PDF-001..004. The "page
button for PDFs" item was already done: the page runs these on any dropped PDF.

**XRechnung profile (Germany).** Tick "Also apply the German XRechnung rules"
on the page, or call the API with `POST /v1/validate?profile=xrechnung`, to add
nine `XR-001`..`XR-009` rules that mirror the BR-DE business rules a German
public buyer's portal enforces: buyer reference (BT-10), Leitweg-ID check
digits (ISO 7064 MOD 97-10, verified against published samples), payment
instructions, seller contact, seller and buyer city and postcode, invoice type
code, the XRechnung 3.x specification identifier, and a seller tax identifier.
Off by default. JS (page and API) only; the Python CLI does not apply it yet.
It is an offline observation, not the KoSIT validator.

**BG, MT and GB false rejects fixed (2026-11-10).** A differential run over 44,000 random numbers against python-stdnum 2.2 found valid numbers we flagged: BG 10-digit "other" numbers whose weighted sum is a multiple of 11 (check digit 0), MT numbers whose last two digits are 74 minus the sum or 00 (the rule is the eight-digit weighted sum 3,4,6,7,8,9,10,1 mod 37 = 0), GB 12-digit branch traders with branch digits other than 000, and GB numbers from 100 on with remainder 55. All fixed in `vat.mjs` and `vat.py`; BG, MT and GB now agree on every case. Not changed: EL 8-digit numbers (stdnum pads a zero; we still ask for 9 digits) and GB GD/HA government forms (not covered). No authority text read.

**Azerbaijan VOEN check digit (2026-11-09).** An `AZ` number of 10 digits now fails INV-023 unless the ninth digit equals the weighted sum of the first eight (4,1,8,6,2,7,5,3) mod 11 and the tenth is 1 or 2 (a remainder of 10 fits no digit, so such numbers are refused, as python-stdnum does). In `vat.mjs` only (`vat.py` does not cover AZ). Pinned on python-stdnum's three doctest numbers (1401555071 valid, 1401555081 bad digit, 1400057424 bad status); the Ministry of Taxes text is unread, and no real VOEN from an invoice was tried.

**VAT check digits for Bulgarian 10-digit and Czech 10-digit numbers (2026-11-09).** A BG number of 10 digits (a natural person's EGN, a foreigner's number or the "other" form) now fails INV-023 unless one of the three public check-digit rules holds, so about a quarter of wrong last digits still pass; a CZ 10-digit birth number (individuals, born 1954 on) must have a valid month and day and a first nine digits that leave the last digit mod 11. 9-digit CZ numbers carry no check digit and stay shape-only. In `vat.mjs` and `vat.py`; pinned on python-stdnum's published EGN example and a mutation each; no authority text read.

**Czech 8-digit and special 9-digit VAT numbers (2026-11-10).** An 8-digit CZ number starting 9 now fails INV-023, and a 9-digit number starting 6 (individuals without a birth number) has its check digit verified. Differential test on 1,800 random numbers against python-stdnum 2.2: 8-digit and 9-digit identical; 6 of 13 valid 10-digit numbers stdnum accepts are still flagged for months outside 01-12/21-32/51-62/71-82 (deliberate). No Czech authority text read. Pinned in `vat.test.mjs`.

**VAT check digits for CY, MT and XI (2026-11-08).** Cyprus (check letter), Malta (mod 37) and Northern Ireland digit forms (mod 97, as GB) now fail INV-023 on a bad check digit, in `vat.mjs` and `vat.py`. Same sourcing as below: public algorithms from memory, one published example number and a mutation each; no authority text read.

**VAT check digits for 11 more countries (2026-10-30).** EE, HU, SI, SK, HR, LV (companies), LT (9 digits), BG (9 digits), RO, EL and CZ (8 digits) now fail INV-023 on a bad check digit, not only INV-022 on length (`vat.mjs` and `vat.py`). Algorithms from memory of the public descriptions (python-stdnum), each tested on a published example number and a one-digit mutation; no real invoice, no tax-authority text read. Variants not implemented stay length-only.

**Peppol profile.** Tick "Also apply the Peppol BIS Billing 3.0 rules" on the
page, or call `POST /v1/validate?profile=peppol`, to add five `PP-001`..`PP-005`
rules that mirror what a Peppol access point rejects: the business process
(BT-23, R001), the Peppol 3.0 specification identifier (R004), seller and buyer
electronic addresses (R020, R010) and a buyer or order reference (R003). Off by
default, JS only, and an offline observation, not the OpenPeppol Schematron.
The UN/CEFACT CII reader now also captures the party electronic address.

**France profile.** Tick "Also apply the French rules" on the page, or call
`POST /v1/validate?profile=france`, to add eight `FR-001`..`FR-008` rules for
invoices to French buyers under the e-invoicing reform (reception mandatory
from 1 September 2026, issuing phased in after): the seller and buyer SIREN or
SIRET (`legal_id`, scheme 0002) must be present and pass the Luhn check digit
(La Poste's SIREN 356000000 uses its documented digit-sum exception), the
SIREN inside a French VAT number must be the seller's own, and the three
mentions the Code de commerce has always required on a B2B invoice must
appear in the notes or payment terms: late-payment penalty rate (L441-10),
the fixed 40 euro recovery indemnity (D441-5) and the early-payment discount
condition (L441-9). Factur-X subject codes `#PMD#`, `#PMT#` and `#AAB#` are
recognised, as are French and English wording. The UBL and CII readers now
capture the party legal identifier and the invoice and payment-terms notes.
Off by default, JS only, and an offline observation, not a certified
platform's validator or legal advice. Findings never echo the number.

**Poland: KSeF FA(3) (new, 2026-10-24).** An XML file whose root is `Faktura` in the `crd.gov.pl/wzor/` namespace is read by `fa3.mjs` with its own rules `PL-001`..`PL-011`: NIP check digit for seller and buyer (weights 6 5 7 2 3 4 5 6 7, mod 11), tax-rate code list, `P_8B x P_9A = P_11` per line, each `P_13_n` against the lines at that rate, `P_14_n` against net x rate, `P_15` against all totals, duplicate line numbers, and the PLN tax (`P_14_nW`) on foreign-currency invoices. Element names, rate codes and what each total means were read from the published schema (`schemat_FA(3)_v1-0E.xsd`, namespace `http://crd.gov.pl/wzor/2025/06/25/13775/`, taken from the `ksef-client-ts` npm package because crd.gov.pl was unreachable from the build host); `examples/fa3-invoice.xml` validates against it with `xmllint`, and the defect file fails the XSD on its unknown rate code only (the other faults are arithmetic that a schema cannot see). Sums are checked only on `RodzajFaktury` VAT or UPR; advance, settlement and correcting invoices skip them and say so in `skipped`. Not done: the KSeF-side business rules, and any real invoice: no genuine FA(3) file was available, so the rules are measured on one hand-made example and its planted-defect twin (`fa3.test.mjs`, 6 tests). The 1-grosz tolerance is an assumption. **Schema gate (2026-10-25, `PL-012`..`PL-017`).** `build-fa3-schema.mjs` reads `schemat_FA(3)_v1-0E.xsd` and its three base files into `fa3-xsd-data.mjs` (content models with occurrence counts, attributes, and length, pattern, range, digit and code-list facets; it throws on any XSD construct it does not model, and the one union, `TNrREGON`, is read as two patterns). `fa3-xsd.mjs` runs a file against it before the arithmetic rules: `PL-012` an element the schema does not allow there or one too many, `PL-013` elements out of sequence, `PL-014` a required element missing, `PL-015` a value outside its pattern, length, date, digits or code list (every enumeration is enforced here, because v1-0E is the schema in force; the generic PL-015 for a bad tax rate yields to the more specific `PL-004`), `PL-016` a missing or non-fixed attribute (`kodSystemowy="FA (3)"`, `wersjaSchemy="1-0E"`), `PL-017` a cut-off file (the other checks are then skipped and named). Messages never echo the value. **Measured against xmllint on the real XSD** (`eval/fa3-xsd-diff.mjs`; xmllint needs the remote import pointed at the local `bazowe/` copy): from two xmllint-valid seeds (`examples/fa3-invoice.xml`, and `fa3-invoice-rich.xml` with an EU buyer, exemption branch, payment, footer and registers), 3 x 1,620 seeded mutations (an element deleted, duplicated, swapped with its neighbour, an unknown element added, a value emptied, lengthened by 1,100 characters, given a euro sign, made text or negative, or a date cut to year-month): 4,860 of 4,860 verdicts agree with xmllint. **Branch seeds (2026-11-06).** `examples/fa3-correction.xml` (RodzajFaktury KOR: reason, type, two corrected-invoice blocks, one by KSeF number and one outside KSeF, period) and `examples/fa3-settlement.xml` (ROZ: a partial advance, an advance-invoice reference, a `Zalacznik` data block) are made-up, xmllint-valid on the real XSD, and joined the differential: 4 seeds, 6,520 mutations in 10 kinds (652 each) (an element deleted, duplicated, swapped, unknown, emptied, lengthened, euro, text, negative, short date), 6,520 of 6,520 verdicts agree with xmllint. The official CIRF/KSeF client templates (13 distinct files, `eval/ksef-official-templates.mjs`) hold no correction, advance or settlement file, so these seeds are hand-built from the XSD and no real one has been tried. **Transport seed (2026-11-08).** `examples/fa3-transport.xml` (made up, xmllint-valid on the real XSD) adds a `WarunkiTransakcji` block with two `Transport` entries (one by `RodzajTransportu` with carrier, cargo, times and a three-country route, one by the `TransportInny` / `LadunekInny` choice branch). With it as a fifth seed, 6,550 mutations in 10 kinds (655 each, `--per 1300`): 6,550 of 6,550 verdicts agree with xmllint. Limits: the seeds cover the blocks they contain (the transport block is now seeded; other choice branches are mutated only if present); no real KSeF file; the namespace is not checked; KSeF's own business rules beyond the XSD are not modelled.

**Italy: FatturaPA (new).** An XML file whose root is `FatturaElettronica` (FPR12 business, FPA12 public body) is not EN 16931, so it is read by `fatturapa.mjs` with its own rules `IT-001`..`IT-024`: partita IVA (Luhn) and codice fiscale check digits, SdI destination code length, TipoDocumento, RegimeFiscale and Natura codes, 0% lines needing a Natura, line / VAT-summary / document-total arithmetic to the cent, payment IBAN, and, from 2026-10-30, the Agenzia delle Entrate's own schema read into a table (`fatturapa-xsd.mjs`, below). Rule ids are this tool's own, not SdI error codes; the one-cent tolerance and the code lists are assumptions to check against the current Agenzia delle Entrate technical specification (the official site was not reachable when this was written). When a cassa, bollo, withholding, rounding or document discount is present the totals checks are skipped and named in `skipped`, never reported as a pass. **Spec 1.9 codes (2026-10-24).** TD29 (omitted or irregular invoicing report) and RF20 (cross-border VAT franchise) joined the code lists, per the Agenzia delle Entrate's specification 1.9 in force from 1 April 2025 (read from press and software-vendor summaries; the primary site is unreachable from the build host). `IT-023`: a TD29 whose seller's IdPaese is not IT, which SdI rejects (error 00473 as the summaries give it). Tested in `fatturapa.test.mjs`; not yet against a real SdI file. **2026-11-11 (red team).** `IT-024`: lines at an AliquotaIVA and Natura that no DatiRiepilogo covers (the reverse of `IT-015`). Dates are now checked as real calendar days: `Date.parse` had let 2026-02-30 through as 2 March, in `IT-009` and in the schema check `IT-021`. Not checked: the signature, duplicate numbers, SdI acceptance. `examples/fatturapa-invoice.xml` is clean; `examples/fatturapa-invoice-with-defects.xml` is the same invoice with six planted faults that raise nine rules (IT-002, 003, 006, 011, 012, 014, 015, 016, 024), pinned in `fatturapa.test.mjs`. **Schema checks (2026-10-30, `IT-018`..`IT-022`).** `build-fatturapa-schema.mjs` reads the FatturaPA XSD 1.2.1 (from the `@digitalia/fatturapa` npm package; fatturapa.gov.it is unreachable from the build host) into `fatturapa-xsd-data.mjs`: element order, how many times each may occur, and the length, pattern and range facets. The XSD itself is not copied. `fatturapa-xsd.mjs` then raises `IT-018` (out of sequence, for every block, not the hand-written list of eleven), `IT-019` (an element not allowed there, or one too many), `IT-020` (a required element missing, including the Denominazione-or-Nome+Cognome choice), `IT-021` (a value too long, empty, not a number or date, or holding a character outside Basic Latin and Latin-1: a euro sign or a smart quote in a description, which SdI refuses) and `IT-022` (cut-off or mismatched XML). Messages name the element and the reason and never echo the value. Code lists are deliberately not read from 1.2.1, which predates TD16-TD28, RF17-RF19 and the N2.x/N3.x/N6.x codes (our own clean example uses N2.2 and fails the 1.2.1 enumeration); only ten lists that have not grown (`STABLE_ENUMS`: EsigibilitaIVA, CondizioniPagamento, TipoCessionePrestazione and so on) are enforced. A missing child of an element with a schema `default` (Nazione) is accepted, as the schema fills it in. **Measured against xmllint on the real XSD** (`eval/fatturapa-xsd-diff.mjs`): of the 15 corpus files, xmllint accepts 13; the Agenzia's own sample `FPR02` fails it on exactly the order this tool had exempted (ContattiTrasmittente must come before PECDestinatario, so that exemption is gone and the sample now draws `IT-018`), and eigor's `con-ritenuta-acconto-e-cassa-previdenziale.xml` is cut off before its closing tag (now `IT-022`; the old reader passed it). Then 2 x 819 seeded mutations of the 13 valid files (an element deleted, duplicated or swapped with its neighbour, an unknown element added, a value emptied, lengthened by 1,100 characters, or given a euro sign), each judged by xmllint and by this tool: 1,638 of 1,638 verdicts agree. Not done: the namespace and attribute checks, the signature block, the 1.2.2 and later schema changes (anything the Agenzia added to the structure after 1.2.1 would be reported as `IT-019` here, so the message says what the schema allows, not that SdI refuses; the 15 corpus files show no such case), and no real SdI acceptance.

**Official Schematron (optional).** Beside the built-in rules you can
run the CEN EN 16931 validation artefacts (ConnectingEurope/eInvoicing-EN16931,
EUPL-1.2) for UBL and CII invoices, in Saxon-JS, with each BR-xx failure mapped
to a plain-language fix (`schematron-fixes.mjs`). When the invoice's
specification identifier (BT-24) names XRechnung, the KoSIT XRechnung rules
(BR-DE-xx, Apache-2.0, UBL and CII) run too; when it names Peppol BIS Billing 3,
the OpenPEPPOL rules (PEPPOL-EN16931-Rxxx, MPL-2.0, UBL invoices and credit notes, and CII) run. Findings carry
the official rule ID and `source` of `en16931-schematron`, `xrechnung-schematron`
or `peppol-schematron`; the built-in `INV-nnn` rules still run. Neither the engine nor the compiled rules ship in this folder:

```sh
cd ventures/einvoice-preflight
npm i --no-save saxon-js xslt3     # Saxon-JS is Saxonica's, free to use, not MIT
node build-schematron.mjs          # clones the artefacts (needs git, curl, unzip), compiles ./schematron/*.sef.json (~2 min)
node schematron-cli.mjs examples/ubl-invoice-with-defects.xml   # or --json
# API: POST /v1/validate?schematron=1 (report.reports[].schematron is "ok" or "unavailable")
```

Checked on the bundled examples: the clean UBL, CII and Factur-X invoices pass
the base rules, and the defects file raises BR-CO-15, BR-CO-16, BR-CO-17, BR-S-09
and BR-61. The bundled UBL example names XRechnung 3.0 and the XRechnung rules
find what a German public buyer would reject: no seller contact (BR-DE-2) and no
buyer post code (BR-DE-9). The Docker image builds the rules in a first stage and
ships them with Saxon-JS (`?schematron=1`). JSON drafts have no XML to check. On a self-hosted copy the web page has an "Also run the official EN 16931 Schematron" box: it posts the XML to the page's own `/v1/validate?schematron=1` (`official.mjs`) and lists the official findings beside the built-in ones; on a static host with no API it says the check did not run, never a pass.

**In the page, on any static host (shipped).** `plain/` holds the same official rules as plain JSON, compiled from the Schematron source by `node build-plain-rules.mjs` (`plain-compile.mjs`; needs `npm i --no-save slimdom fontoxpath esbuild`), and fontoxpath (MIT, bundled) to run them (`plain-schematron.mjs`, loaded by `official-browser.mjs`). No Saxon, no server, no licence caveat: the web page runs the EN 16931, XRechnung and Peppol rules in your browser and downloads only the sets your file's BT-24 needs (about 0.3 MB for a base-only check). `plain/manifest.json` records the upstream commit of each set. It is checked against the Saxon route: every example in `examples/` and the official eInvoicing-EN16931 examples (40 files) give the same rule at the same location as the compiled SEFs, and 353 of 353 randomly edited copies (deleted elements, changed amounts and codes, blanked values) do too (`plain-schematron.test.mjs` repeats the example comparison when the SEFs are built). Where it differs from XSLT by design, it says so:
- fontoxpath keeps numbers in doubles where the rules assume exact `xs:decimal`; a failed top-level equality is re-asked as "equal within 1e-7", which can only clear a finding (the XRechnung-O example's BR-O-08 is floating-point noise without it), never raise one;
- IBAN mod-97 checks (DE-R-019/020 and XRechnung's `checkIBAN`) cast a 24-digit string to `xs:integer`; they run as a digit-by-digit remainder;
- a rule that cannot be evaluated is returned in `skipped` and named on the page ("N rule(s) ... were NOT checked"), never counted as a pass. None skip on the examples.
Both are `EUPL-1.2` (EN 16931), `Apache-2.0` (XRechnung) and `MPL-2.0` (Peppol) data; the licences and commits are in `plain/manifest.json`.

**No server needed (in-browser).** `node build-schematron.mjs && node build-browser.mjs` writes `./browser/` (Saxon-JS's browser runtime fetched from saxonica.com, the compiled rules, a manifest). Serve it beside `index.html` on any static host and the same box runs the official rules in the visitor's browser (`official-browser.mjs`): the invoice never leaves the page, and the note says so. Checked in headless Chromium on `ubl-invoice-with-defects.xml`: BR-CO-15, BR-61, BR-CO-16, BR-S-09 and the XRechnung BR-DE-2, zero POST requests. The folder is git-ignored and not on the owner's Pages copy on purpose: Saxon-JS's licence does not allow copying it to a site whose main purpose is to serve it to third parties, so each deployer builds their own (`official-browser.test.mjs` runs the real runtime when it exists). The
XRechnung messages are in German, as the KoSIT rules publish them; the `fix` line
is English. `examples/xrechnung-cii-invoice.xml`, `examples/xrechnung-cii-credit-note.xml` (CII credit note, type 381, with its BT-25 invoice reference) and `examples/peppol-credit-note.xml` (Peppol BIS 3 UBL credit note) pass the official rules (the CII ones with one information-level note, BR-DE-TMP-32) and are pinned by tests. `examples/ubl-credit-note-with-defects.xml` is a credit note with six faults (a 380 type code, no buyer reference, a VAT total that disagrees with its subtotal, a German seller without a contact); the official rules report BR-CL-01, BR-CO-14, BR-CO-15, DE-R-015, PEPPOL-EN16931-P0101 and PEPPOL-EN16931-R003, each with a specific English fix, pinned by tests. `examples/xrechnung-cii-credit-note-with-defects.xml` is the clean CII credit note with four faults (no buyer reference, no seller contact, a VAT amount that is not 19% of its basis, a type code outside UNTDID 1001); the official EN 16931 and XRechnung rules report BR-CL-01, BR-CO-14, BR-CO-17, BR-DE-15, BR-DE-17, BR-DE-2, BR-DE-TMP-32 and BR-S-09, each with a specific English fix, pinned by tests. `examples/peppol-nl-credit-note.xml` (a Dutch Peppol credit note, KVK identifiers) passes; `examples/peppol-nl-credit-note-with-defects.xml` drops the invoice reference, the seller's street and the KVK scheme, and the official rules report NL-R-001, NL-R-002 and NL-R-003, each with an English fix (all nine Peppol NL-R rules now have one; pinned by tests). Building it also showed the endpoint check rejected scheme 0106 (the Dutch KVK number, a registered EAS code), a false INV-039 on Dutch KVK endpoints; it is accepted now (JS and Python). The NLCIUS rules themselves now run too (see the next paragraph). Peppol also applies its German `DE-R-nnn` rules to a domestic German invoice (seller contact, buyer post code, payment groups); each has an English fix.

```sh
cd ventures/einvoice-preflight
# Browser: open index.html, or `python3 -m http.server 8765` and visit
# http://127.0.0.1:8765/ — same rule IDs as the CLI. After a check,
# Download remediation CSV is the same one-row-per-rule queue as
# --format remediation-csv. Other CLI formats include VAT/IBAN/BIC/RF
# credit-note document type (INV-032 through INV-034), 0% / exempt
# tax reasons (INV-035 and INV-036), mixed-rate tax breakdown
# (INV-037 and INV-038), buyer/seller electronic addresses
# (INV-039 through INV-041), invoice period start/end
# (INV-042 and INV-043), and payment means vs IBAN
# (INV-044 through INV-046), buyer / purchase-order
# references (INV-047 through INV-049), header
# allowances or charges (INV-050 through INV-052),
# and payment terms days vs due date
# (INV-053 and INV-054).
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-credit-note.json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-mixed-rate.json
PYTHONPATH=src python3 -m einvoice_preflight examples/cii-invoice.xml
PYTHONPATH=src python3 -m einvoice_preflight examples/factur-x-invoice.pdf
# examples/factur-x-credit-note.pdf: a Factur-X (EN 16931) credit note, type 381; its XML passes the official rules. Both readers now take BT-25 (the invoice a CII credit note reverses) from the settlement header; before, every CII or Factur-X credit note drew a false INV-033.
PYTHONPATH=src python3 -m einvoice_preflight examples/ubl-invoice.xml
PYTHONPATH=src python3 -m einvoice_preflight examples/peppol-credit-note.xml
# The one example that is meant to fail: six planted defects, annotated at the
# top of the file and pinned by tests/test_examples.py. Exits 1.
PYTHONPATH=src python3 -m einvoice_preflight examples/ubl-invoice-with-defects.xml
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format sarif > preflight.sarif
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format github
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format markdown > review.md
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format html > review.html
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format csv > triage.csv
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format remediation-csv > remediation.csv
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format junit > preflight.junit.xml
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format summary
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format remediation
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format checklist
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --max-files 500 --max-depth 2 --format json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --max-files 500 --max-bytes 1048576 --format json
cat invoice.json | PYTHONPATH=src python3 -m einvoice_preflight - --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --usage-file ~/.local/state/einvoice-preflight/usage.json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format jsonl
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format json --max-files 500
PYTHONPATH=src python3 -m einvoice_preflight invoice.json --max-bytes 1048576 --format json
PYTHONPATH=src python3 -m einvoice_preflight invoice.xml --format json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format sarif --output preflight.sarif
```

For an installed command, run `python3 -m pip install .` from this directory,
then use `einvoice-preflight invoice.json` from anywhere. The installed command
also supports `einvoice-preflight --version` for CI logs and adapter diagnostics.
The package has a focused GitHub Actions workflow that installs the command,
runs the standard-library test suite, and smoke-tests the installed entry point
whenever this venture changes.
Pass `-`
as the filename to read one JSON, UBL XML, CII XML, or Factur-X PDF invoice from
standard input, which is useful for ERP adapters and CI pipelines. SARIF reports
use `stdin.json` as the artifact name for piped input. Directories are scanned
recursively for `.json`, `.xml`, and `.pdf` files. A Factur-X / ZUGFeRD /
XRechnung PDF is unwrapped to its embedded invoice XML before the same checks
run. Encrypted PDFs and scanned paper PDFs with no attachment are refused.
XML input maps common UBL Invoice, CreditNote, and
DebitNote elements, and CII CrossIndustryInvoice, into the same checks. It is
not a full Peppol or EN 16931 conformance validator. Use
`--max-files N` in CI or ERP jobs to refuse a directory scan when more than `N`
invoice files are present. This bounds accidental scans of a broad working
tree; the command exits `2` without reading any invoice contents.
Use `--max-bytes N` to refuse an individual file or stdin stream larger than
`N` bytes before parsing it. This provides a memory and denial-of-service guard
for CI and ERP jobs; oversized inputs are reported as read errors and exit `2`.
The tool never submits an invoice, chooses a tax rate, contacts a tax
authority, or claims that an invoice is legally valid. It only checks the
document facts represented in the input schema. The user remains responsible
for selecting the correct format, tax treatment, and submission process.

**Saudi Arabia: ZATCA (Fatoora) rules (shipped 2026-10-25).** A UBL file whose `cbc:ProfileID` is `reporting:1.0` (simplified) or `clearance:1.0` (standard) is checked by ZATCA's own published rules *instead of* the EU base (KSA invoices carry no BT-24 profile, so the PINT matcher gained a `profileId` test). Two sets: ZATCA's cut of the EN 16931 UBL rules (105 checks) and the KSA business rules, BR-KSA-* (152 checks, including the VAT-number, CRN, QR, cryptographic-stamp, prepayment and 24-hour reporting rules). The rules ship only as SchXslt-compiled XSLT in the `phive-rules-zatca` artefact on Maven Central (rules version 3.4.6; ZATCA publishes them under LGPL-3.0); `build-zatca-rules.mjs` reads them through a second reader in `plain-from-xslt.mjs`, because SchXslt's shape differs from the one PINT and RO use: one mode for all rules with the pattern named inside, and ZATCA's hand-written `xsl:if`, `xsl:for-each` and `xsl:choose` around each assert. The reader rebuilds each assert as one XPath that is true when the check fails (a for-each becomes `exists((select)[violation])`, a `when`/`otherwise` branch carries the negation of the branches before it) and throws on any construct it does not know. Count check: 152 of the 152 `failed-assert`s in the stylesheet come out (the first pass lost 4 that sat in a template with no `xsl:choose`; the test would not have caught it, the id count against the stylesheet did). fontoxpath has no `fn:format-number`, which ZATCA's VAT-amount rules (BR-CO-17, BR-S-09, BR-KSA-51/79/80) use; `plain-compile.mjs` now rewrites it to a prolog function for the two pictures in use (`0.00`, `#.00`: two decimals, half to even), without which those five rules were skipped, not passed. ZATCA's `error` flag is shown as `fatal`. Verification (`zatca.test.mjs`, 6 tests; made-up invoices `examples/zatca-simplified-invoice.xml` and `-with-defects.xml`): the clean file runs with no skipped rule and raises only BR-KSA-98 (the clock rule: any fixed issue date is more than 24 hours old) and BR-KSA-29; the defect file adds BR-CO-14, BR-CO-15, BR-CO-17, BR-S-09 (VAT 14.00 on 100.00 at 15%), BR-KSA-27 (no QR), BR-KSA-40 (a VAT number that does not start and end in 3) and BR-KSA-F-08 (a CRN that is not 10 digits); an unsigned simplified invoice draws BR-KSA-28, -30 and -60. The suite also pins the reader on a tiny fixture. Not done and not known: no real ZATCA sandbox invoice or Fatoora verdict has been tried (the invoices are ours, written against the rule texts), so false positives on real files are possible. BR-KSA-29 used to fire on every signed invoice, ours included: the rules' svrl namespace list binds `sbc` to CommonSignatureComponents-2 (an upstream typo), while the compiled stylesheet's own `xmlns:sbc` is SignatureBasicComponents-2, the namespace ZATCA's samples use and the one an XSLT engine resolves with. Read against the 3.4.6 jar on 2026-11-05; `plain-from-xslt.mjs` now lets the stylesheet's declaration win, `plain/zatca-ksa-ubl.json` is rebuilt, and BR-KSA-29 fires only on an invoice with no stamp (pinned in `zatca.test.mjs`). Signatures, the QR TLV and the invoice hash chain are not checked beyond their presence; the Saxon route and server API still run the EU base on a KSA file; no CII form exists; credit notes (2026-10-26, `examples/zatca-simplified-credit-note.xml`, 2 tests): ZATCA's rules treat a credit or debit note as an `Invoice` document with type code 381 or 383, not a UBL `CreditNote` root. Ours passes, and without its `BillingReference` and `InstructionNote` it draws BR-KSA-56 and BR-KSA-17. A `CreditNote`-rooted file draws EU-base false positives (BR-22 and others read `InvoicedQuantity` and `/ubl:Invoice/...` paths), so a KSA file should not use that root; no real ZATCA credit note was tried. Debit notes (2026-10-25, `examples/zatca-simplified-debit-note.xml`, type 383, 1 test) behave the same: clean, and BR-KSA-17 and BR-KSA-56 without the reason and reference; also made up, no real one tried; the 2.0.3 and 2.3.8 rule versions in the jar are not run; XRechnung-style English fixes for BR-KSA ids are not written (the messages are ZATCA's own English).

**Netherlands NLCIUS (SI-UBL 2.0), shipped 2026-10-25.** A UBL file whose BT-24 names `urn:fdc:nen.nl:nlcius:v1.0` (or the G-account variant `gaccount:v1.0`) now also gets the Dutch national rules, 39 checks (BR-NL-1 to BR-NL-35 and SI-UBL-2), compiled by `build-nl-rules.mjs` from `si-ubl-2.0.3.13.xslt` in `phive-rules-simplerinvoicing` 4.6.3 on Maven Central (set `EINVOICE_NL_JAR` for a jar on disk, `EINVOICE_NL_RULES` for another rules version). The XSLT bundles the EU base, so the builder keeps only the pattern that holds the national checks and throws if it mixes in base checks. Errors cover the KVK/OIN identifiers, street/city/post code, buyer or order reference, type codes 380/381/384/389 against the Invoice or CreditNote document, a payment means and its code (30, 48, 49, 57, 58, 59); the warnings flag fields NLCIUS says to leave out (tax point date, country subdivision, address line 3, reason codes). The rules only fire for a Dutch seller. A Peppol BIS file does not match; it keeps the Peppol NL-R rules. UBL and, from 2026-10-25, CII (34 checks from `nlcius-cii-1.0.3.13.xslt`, same artefact and builder; the CII twin of the empty-element rule reports as `empty-element-check`); plain route only (browser and Node fallback), no Saxon form. CII verification (`nlcius.test.mjs`, 4 more tests): `examples/nlcius-cii-invoice.xml` (made up) passes with no skipped rule; `examples/nlcius-cii-invoice-with-defects.xml` raises BR-NL-2, BR-NL-3, BR-NL-12 and the warning BR-NL-28-2. A CII file with an empty `ApplicableHeaderTradeDelivery` draws the official empty-element warning, so a clean example carries a delivery date. Verification (`nlcius.test.mjs`, 5 tests): `examples/nlcius-invoice.xml` (made up) passes with no skipped rule; `examples/nlcius-invoice-with-defects.xml` raises BR-NL-2, BR-NL-3, BR-NL-12 and the warning BR-NL-28-2, each with an English fix. The official ids repeat in places (the charge-reason warning BR-NL-34 is reported as `BR-NL-32-n`), kept as published. No real Dutch invoice or Digipoort/Peppol access point verdict has been tried.

**Peppol PINT: Singapore InvoiceNow and Australia/New Zealand (shipped 2026-10-23).** A UBL file whose BT-24 names `...billing:international:sg:3.0`, `...billing:international:aunz:3.0` or the A-NZ self-billing id is checked by that profile's own rules *instead of* the EU base and the Peppol BIS add-on, because PINT uses GST category codes (SR, ZR, NG...) that the EU base rejects (before this, an SG invoice drew a false `PEPPOL-EN16931-R004`/category finding). Singapore runs three sets (the CEN subset with GST amounts, the Peppol subset, the SG GST rules, 931 checks), A-NZ two (958 checks, including the ABN rules AUNZ-R-004 and PEPPOL-COMMON-R050). OpenPeppol publishes these only as Schematron already compiled to XSLT, and GitHub is not reachable from every build host, so `build-pint-rules.mjs` takes the XSLT from the `phive-rules-peppol` artefact on Maven Central (set `EINVOICE_PINT_JAR` to use a jar on disk) and `plain-from-xslt.mjs` reads the generator's fixed XSLT shape back into the same plain JSON (rules, rule order, lets, `xsl:param` roots, XQuery functions). It throws on any template shape it does not know rather than dropping a rule. Fidelity check: the same reader on OpenPeppol's own BIS XSLT yields 55 checks, every id also in the `.sch`-compiled Peppol set, and on the EN 16931 XSLT 979 checks against 982 (the XSLT is a newer release: it adds BR-CO-25, BR-66, BR-67, UBL-CR-631 and drops UBL-SR-53..59). Verification (`pint.test.mjs`, 6 tests, made-up invoices in `examples/pint-sg-invoice.xml`, `pint-sg-invoice-with-defects.xml`, `pint-aunz-invoice.xml`): both clean files pass with no skipped rule; the SG defect file raises BR-109-GST-SG, BR-NG-08/09/12-GST-SG and BR-CO-17-GST-SG; a missing buyer ABN raises AUNZ-R-004 and a wrong check digit PEPPOL-COMMON-R050; ordinary Peppol BIS files still get the EU base. Not done: the Saxon route itself still runs the EU base on a PINT file, but since 2026-11-10 the report (page and server API) sends PINT files to the plain route instead (see "Server API runs PINT and ZATCA rules" below); CII has no PINT form; no real InvoiceNow or Peppol A-NZ invoice or an access point's verdict has been tried, only the rule sets as published (versions: SG 2026.6, A-NZ 1.0.12); the Japan and Malaysia PINT sets are not in that artefact. The same Maven artefacts also hold RO_CIUS (`phive-rules-cius-ro`) and the Dutch NLCIUS XSDs (`phive-rules-energieefactuur`), the open items below, readable with this same tool next.

**Current PINT releases, measured on OpenPeppol's own examples (2026-11-11).** The SG and A-NZ sets above are the older releases, which name the profile BIS-style (`...poacc:billing:international:sg:3.0`). Current PINT files say `urn:peppol:pint:billing-1@sg-1`, `urn:peppol:pint:billing-1@aunz-1` or `urn:peppol:pint:selfbilling-1@aunz-1` with BT-23 `urn:peppol:bis:billing`. Those matched no profile, so a current Singapore or Australian invoice got the EU base: on OpenPeppol's 40 published examples for SG 1.4.1 and A-NZ 1.1.3 (the good-case files phive-rules runs in its own tests, commit 36d1f09), **0 of 40 passed**, with BR-47, BR-48, BR-CO-04 and BR-CO-17 on every A-NZ file and BR-CL-17/18 and UBL-CR-005 on every SG file. `node eval/phive-corpus.mjs <phive-rules checkout>` reruns it (fetch commands in the file; the examples are not copied here). Four changes, each read against the file that tripped it:

| change | why |
|---|---|
| the current rule sets, from `phive-rules-peppol-pint` 4.6.4 on Maven Central (`build-pint-rules.mjs`; PINT-UBL 170 checks plus 92 SG and 74 A-NZ jurisdiction checks, each count equal to the stylesheet's `failed-assert`s), matched on the new ids (`schematron-core.mjs`) | the cause above; the older ids keep the older sets |
| the plain runner's "equal within 1e-7" allowance now also covers an equality inside a top-level `or`/`and` chain (`slackTest`, `plain-schematron.mjs`) | `aligned-ibrp-004` (`not(cbc:BaseAmount) or PriceAmount = BaseAmount - Amount`) fired on 5 NZ files: 69.99 - 10.00 is 59.989999... in doubles. Loosening one disjunct or conjunct can only clear a finding, never raise one; 70.10 - 20.11 still fires (test) |
| line allowances and charges are summed with their sign (`linenet.mjs`, `linenet.py`); on a negative invoice a header percentage may be negative, -100 to 0, still checked against base times percent (`adjustment.mjs`, `adjustment.py`) | the A-NZ negative invoice: line 2 is -4 days x 400 per 2 days, a -200 charge and a -100 allowance = -900.00, which INV-012 read as -800; its header charge is -10% of 1500 = -150.00, which INV-051 rejected as a percentage below 0 |
| under a PINT set the built-in INV-026 (BIC shape), INV-044 (UNCL 4461 code) and INV-035 (exemption reason) step aside, as INV-024 already did (`report.mjs`) | the branch id carries an Australian BSB or a Singapore bank code (28 of 40 files), Singapore adds `Z01` for GIRO and a PayNow code, and ZR/NG/OS lines need no EU exemption reason; PINT's own sets carry those rules |

After: **39 of 40 pass** (A-NZ 24/24, SG 15/16) with no rule skipped. The one left is a real fault in OpenPeppol's example, not ours: SG example 07 (foreign buyer) carries a 2,300.00 SGD transport charge at SR 7% but no SR row in the tax breakdown and GST of 0.00, so 161.00 of GST is missing; INV-018 and INV-038 report it and the official PINT rules do not. Tests: `pint-current.test.mjs` (8; made-up `examples/pint-current-sg-invoice.xml` and `pint-current-aunz-invoice.xml`, the older examples with the new ids) and 2 in `tests/test_adjustment.py`. The same script reads the NLCIUS, CIUS-RO, CIUS-PT and ZATCA folders, but those mix good and deliberately broken files, and SimplerInvoicing's carry placeholder IBANs and VAT numbers (`NL11 BANK 1111111111`) that rightly fail INV-023/INV-025; scoring them needs each module's good-file list from `CTestFiles.java`, which is the next step. Not done: Japan, Malaysia, UAE and Oman PINT (in the same artefact, not loaded); no access point's verdict on any file; examples written by the rule authors are not invoices from a real business.

**The national examples, scored on their good-case lists (2026-11-11).** `node eval/phive-corpus.mjs <phive-rules checkout> --good` now reads each module's `CTestFiles.java` and scores only the files it lists as good cases (commented-out entries and SimplerInvoicing's error list left out); `--builtin` runs the built-in checks alone in a second and `--messages` prints one message per rule. Run on phive-rules commit 36d1f09, the whole preflight as the page runs it (built-in INV checks plus the official sets on the plain route). Files with no blocking finding:

| set | good cases | before | after |
|---|---|---|---|
| PINT A-NZ 1.1.3 | 24 | 24 | 24 |
| PINT SG 1.4.1 | 16 | 15 | 15 |
| ZATCA 3.4.6 | 19 | 8 | 18 |
| NLCIUS SI-UBL 2.0.3.2 | 61 | 0 | 0 (54 once the placeholder VAT and IBAN numbers are set aside) |
| NLCIUS-CII 1.0.3 | 1 | 0 | 0 |
| CIUS-RO 1.0.9 | 10 | 0 | 0 |
| CIUS-PT 2.1.1 | 10 | did not finish | 0 (every file in about 3 s) |

Four faults of ours, found and fixed:

- **CIUS-PT hung on any invoice with an attachment.** AMA's rule DT-CIUS-PT-111.1 is `matches(.,'^(.{1,6826666})$')` on the embedded document. fontoxpath compiles an XSD regex to an automaton and expands a bounded repeat into one state per count, so the run reached 4.4 GB and had not finished after 15 minutes on any of AMA's ten examples. The page runs the same code in the browser, so a Portuguese invoice with a PDF attached would have frozen the tab. `plain-schematron.mjs` now rewrites a whole-string `.{m,n}` test with a bound of 1,000 or more to `string-length` bounds plus "no newline or carriage return", the same test (30 small-bound cases agree with fontoxpath's own regex). It is the only rule of that shape in the shipped sets.
- **Official warnings failed the file.** A finding whose Schematron flag is `warning` (BR-NL-19 to BR-NL-35, UBL-CR-*, PINT and ZATCA warnings) counted as blocking, so SimplerInvoicing's 25 warning examples, all good cases, failed on them. KoSIT, Peppol and phive validators pass a file whose only findings are warnings. Warnings are now listed and labelled but do not fail a file: page, Markdown report, audit pack, JSON `exit_code` and the server API's status.
- **A Romanian buyer that is not VAT registered was read as having a bad VAT number.** CIUS-RO puts such a buyer's fiscal code (CUI, `8609468`) in a `PartyTaxScheme` with an empty `TaxScheme`. The reader took any unlabelled scheme as BT-48, so INV-022 fired on the buyer in 4 of ANAF's 10 examples. EN 16931's BR-CO-9 reads only `TaxScheme/ID` = `VAT`; an unlabelled scheme now counts as a VAT number only when it starts with a two-letter prefix (JS and Python readers both).
- **Five EU-only built-in checks fired on ZATCA files.** A simplified (B2C) invoice names no buyer (INV-006); KSA credit and debit notes are `Invoice` documents with type code 381 or 383 (INV-034); ZATCA's own cut of the EN 16931 rules leaves out BR-33, allowance reason (INV-052) and BR-61, account for a credit transfer (INV-045), checked in `plain/zatca-en16931-ubl.json`; and a prepayment adjustment repeats a rate in the tax breakdown (INV-038, that message only). These are now dropped where a ZATCA set governs, like INV-005/017/018/022 before.

Read and left alone, because they are faults in the examples, not in the checks: SimplerInvoicing's `NL11 BANK 1111111111` IBANs and `NL…B01` VAT numbers fail their checksums (INV-023/025, 57 files); ANAF's seller id `RO1111111111118` has 13 digits where a Romanian VAT number has 2 to 10 (INV-022, all 10); line nets that are not quantity times price, such as 2 × 1273.00 billed as 1273.00 or a returned line with a positive quantity and a negative net (INV-012 on 6 RO files, 3 NL and the CII example; EN 16931 has no rule for this but Peppol's PEPPOL-EN16931-R120 does); and AMA's files are syntax templates with placeholders (`$%()*`, `#ENTITY@ATMPAYMENT#12345#`, type code `NC`), which the EU base rejects as it should. Still open: UBL-SR-53 fires on 4 RO files with an empty `TaxScheme` (an EU-base rule that later EN releases drop, so a rule-version gap); ZATCA's rate-change prepayment example leaves INV-038 "row 2 taxable amount" (a prepayment at the old rate); INV-026 read BT-86 as a BIC, while EN 16931 also allows a national clearing code; closed 2026-11-12, see "BT-86 clearing codes" (the NL examples' placeholder `BA11` is still INV-026, as it should be). Tests: `official-good-cases.test.mjs` (6: the CUI reading, the warning severity, the regex rewrite, a PT invoice with an 8,000-character attachment finishing in under 2 s), 2 more in `report-plain-route.test.mjs`, 3 in `tests/test_ubl_party.py`. The examples are not copied here.

**Romania RO e-Factura national rules, CIUS-RO (shipped 2026-10-24).** A UBL file whose BT-24 names `CIUS-RO` now also gets Romania's 122 national rules (v1.0.9 from `phive-rules-cius-ro` on Maven Central) after the EU base, in the browser and on the Node plain route: date format `YYYY-MM-DD`, an invoice number with a digit, the profile id, RON as the VAT accounting currency, `SECTOR1..6` city and `RO-xx` county codes, address and tax-id presence, two-decimal amounts and the length caps. It is an add-on (`ADDONS["cius-ro"]`), not a replacement like PINT, because the national file only adds to EN 16931. The messages are bilingual in the source (`Romanian #English`); the English half is shown, each rule has an English fix. `build-ro-rules.mjs` rebuilds `plain/cius-ro-ubl.json` (set `EINVOICE_RO_JAR` for a jar on disk). Verification (`cius-ro.test.mjs`, 5 tests; made-up invoices `examples/ro-invoice.xml` and `ro-invoice-with-defects.xml`): the clean RON invoice passes both sets with no skipped rule; the defect file raises BR-RO-001, -010, -030, -110 and -DT001; removing the buyer street raises BR-RO-082. Not done: the Saxon route and server API do not run it (no `.sef.json` built); the bundled `EN16931-CIUS_RO` XSLT (EN rules with RO changes) is not used; no real invoice from a Romanian ERP and no ANAF SPV verdict has been tried, so false positives or gaps against ANAF's live validator are unmeasured.

**Portugal national rules, CIUS-PT (shipped 2026-10-25).** A UBL file whose BT-24 names `CIUS-PT` (`...urn:feap.gov.pt:CIUS-PT:2.1.1`) now also gets the Portuguese profile's checks that the EU base lacks (368 of the 1,154 in AMA's v2.1.1 stylesheet, from `phive-rules-cius-pt` 4.6.3 on Maven Central): VAT identifier and tax scheme for seller and buyer (`BR-CIUS-PT-01..04`), a Deliver to group (`-66`), a credit or debit note's preceding-invoice reference (`-25`, `-65`), "lower rate" `AA` rules, and about 290 field-format rules (`DT-CIUS-PT-*`: VAT rate as `23.00`, quantities with three decimals, a remittance reference framed as `#REFERENCE@ATMPAYMENT#...#`). It is an add-on (`ADDONS["cius-pt"]`), plain route only (no Saxon form). `build-pt-rules.mjs` rebuilds `plain/cius-pt-ubl.json` (set `EINVOICE_PT_JAR` for a jar on disk); to read it, `plain-from-xslt.mjs` now also turns an `xsl:if` around a `successful-report` (a Schematron `<report>`) into an assert. Verification (`cius-pt.test.mjs`, 5 tests; made-up invoice `examples/pt-invoice.xml`, NIFs with valid check digits): it passes the EU base and the PT set with no skipped rule; a bare `23` rate, an unframed payment reference, a removed Deliver to group, a removed seller VAT block and a type-383 note without a reference each raise exactly the expected PT rule. Not done: no real invoice from a Portuguese ERP and no AT/eFatura verdict has been tried, so false positives are unmeasured; the stylesheet's own EU-base copy is dropped, and Portuguese `AA`, `RED`, `INT`, `NOR`, `ISE`, `OUT` and `NA` VAT codes fail the EU base's BR-CL-17/18 (measured 2026-10-25 on `examples/pt-invoice.xml`), although AMA's stylesheet has no BR-CL rule at all and its own DT-CIUS-PT-091/-105/-131 and BR-AA-* rules admit them; the finding now says so (`PT_CODE_NOTE`, 1 test) and is not suppressed, since which validator the receiver runs is unknown; the Portuguese page still says nothing is mandated for B2B.

## Mandate calendar (shipped 2026-11-02)

`node mandate-calendar.mjs` turns the "Key dates" column of the mandates hub
into `mandate-dates.json` and `mandate-calendar.ics` (87 dated milestones
across 48 countries), so a finance team can subscribe in any calendar app and
the feed cannot drift from the table. Only full day-month-year dates become
events; "Sep 2026" or "late 2028" are left out rather than guessed. Brackets
stay whole when a cell is split, and a cell with several dates is split so each
date keeps only its own words. `--check` fails when the files are stale;
`--upcoming [date]` prints what starts next. `mandate-calendar.test.mjs` pins
the parser, the RFC 5545 folding and escaping, and freshness. Not done: the
text is a clause cut from the hub cell, so a few summaries are terse ("Spain:
1 Jul 2027 (others)"); the description carries the status and the country
page link. Use: a lead magnet and a link-worthy asset for the mandate pages;
no accounts, no cost.

**Deadlines page (shipped 2026-11-02).** `node deadlines-page.mjs` writes `e-invoicing-deadlines-2027.html` from `mandate-dates.json`: the 18 full-date milestones in 14 countries between 2 Nov 2026 and 31 Dec 2027, grouped by quarter, each linking its country page, with an ItemList JSON-LD block and the no-warranty footer. A static, link-worthy page for the search "e-invoicing deadlines 2027"; linked from the hub and the sitemap. `deadlines-page.test.mjs` pins freshness against the JSON, date order, links, escaping and the disclaimer. The window start (`FROM`) is fixed in the file so the output is reproducible; move it when refreshing. Not done: months/years without a day (Germany 2027 and 2028) are not listed; they stay in the hub table.

**Countdown on the hub (shipped 2026-11-02).** `mandate-countdown.js` reads `mandate-dates.json` and shows the next 8 milestones with days left on the mandates hub, or the next 12 for one chosen country. Days are whole calendar days in the visitor's browser (DST safe); no tracking, one same-origin fetch, and the table below still holds every date if the script fails. `mandate-countdown.test.mjs` (4 tests) pins the day arithmetic, sorting, filtering and links; opened in headless Chromium: 8 rows, Poland filter gives its dated entry, no console errors. **Size selector (shipped 2026-11-08).** `whichapplies.mjs` writes `which-e-invoice-mandate-applies.html`: country plus one number (France: a size class) gives the start date and days left for Germany (EUR 800,000), Spain (EUR 8 million), the UAE (AED 50 million), Poland (PLN 200 million; the smallest wave is defined by monthly sales and only noted), Oman (OMR 5 million) and France. The cut-offs are the ones on the country pages; `whichapplies.test.mjs` (8 tests) pins the edges, every date against `mandate-dates.json`, freshness and the links; clicked in headless Chromium, no console errors. **Malaysia added 2026-11-09:** five turnover bands from the MyInvois phases table on its country page (above RM100 million 1 Aug 2024, down to up to RM1 million 1 Jul 2026, reported; the page notes sources disagree on that last band), each date checked against that table by `whichapplies.test.mjs` (the hub cell holds only the first date). Not done: other countries with size waves (Saudi waves, Singapore, Ireland), headcount-based rules, and any confirmation from a tax authority.

## Run it as your own API (self-hosted, one click)

The same rules are available as a small HTTP service you run in **your own**
account. Nothing is stored, nothing is forwarded, and the author runs nothing
in between. Use it from an ERP, a webhook or a CI job instead of shelling out
to the CLI.

**Deploy:** fork this repository, then open
`https://render.com/deploy?repo=<your fork URL>`. `render.yaml` builds the
`Dockerfile` here on Render's free plan and generates an `EINVOICE_API_KEY`
for you. Anywhere that runs Docker works too:

```sh
cd ventures/einvoice-preflight
docker build -t einvoice-preflight . && docker run -p 8080:8080 -e EINVOICE_API_KEY=change-me einvoice-preflight
# or, with Node 20+ and no Docker:  EINVOICE_API_KEY=change-me node server.mjs
```

```sh
# one invoice: body is the raw file; Content-Type (or ?name=x.pdf) picks the parser
curl -H "Authorization: Bearer $KEY" -H "Content-Type: application/xml" \
  --data-binary @invoice.xml https://YOUR-HOST/v1/validate
# a batch (base64 for PDFs); also flags duplicate invoice numbers (INV-019)
curl -H "Authorization: Bearer $KEY" -d '{"documents":[{"name":"a.json","content":"{...}"}]}' \
  https://YOUR-HOST/v1/validate/batch
```

The response is the CLI's `--format json` report plus a `disclaimer`. With no
`EINVOICE_API_KEY` the API is open, so set one on anything public.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | listen port |
| `EINVOICE_API_KEY` | none | require `Authorization: Bearer <key>` on `/v1/*` |
| `EINVOICE_MAX_BYTES` | `1048576` | per-invoice size limit |
| `EINVOICE_MAX_BATCH` | `50` | documents per batch |
| `EINVOICE_RATE_LIMIT_PER_MIN` | `120` | per client IP (honours `X-Forwarded-For`) |
| `EINVOICE_CORS_ORIGIN` | none | allow browser calls from this origin |
| `EINVOICE_SERVE_UI` | on | `0` serves the API only |

If this saves you a rejected invoice run, you can chip in at
<https://buymeacoffee.com/duncanhaywood>. Same safety boundary as below:
preflight, not a Peppol/EN 16931 conformance validator, and no warranty.

## Create an e-invoice (new)

The checker's other half. Germany already requires businesses to *receive*
structured e-invoices and makes *sending* mandatory from 2027 (2028 for small
firms); Belgium, Poland and France follow. A PDF no longer counts, and the
usual answer is a paid invoicing subscription. This writes the file instead.

```sh
# Browser: open create.html (or GET /create.html on the server). No upload.
node generate-cli.mjs examples/draft-invoice.json -o RE-2026-001.xml          # XRechnung 3.0 UBL
node generate-cli.mjs examples/draft-invoice.json -f cii -p peppol -o out.xml # CII, Peppol BIS 3.0
curl -H "Authorization: Bearer $KEY" -d '{"draft":{...},"format":"ubl"}' https://YOUR-HOST/v1/generate
```

A *draft* is who, what and how much (`examples/draft-invoice.json`). Line
nets, the per-rate/category VAT breakdown, the totals and the amount due are
computed in integer cents, so they cannot disagree with each other. Standard,
zero, exempt (`E`, e.g. Kleinunternehmer § 19 UStG), reverse-charge (`AE`),
intra-EU (`K`), export (`G`) and out-of-scope (`O`) VAT; invoices and credit
notes; a seller VAT ID or national tax number; prepayments. Profiles:
`xrechnung` (BR-DE contact, buyer reference and payment checks), `peppol`
(BIS 3.0), `en16931`. Missing required data is an *error* and nothing is
written; what only your profile wants (a Leitweg-ID, a seller contact) is a
*warning*. Every file is read back through the same readers and rules as the
checker, and the API returns that result as `preflight`.

Not a certified invoicing system: it does not sign, archive, transmit, look
up a Leitweg-ID or a Peppol participant, or do document-level allowances
(put discounts into the line price). It is a preflight-grade writer, not a
schema/Schematron validator, so run the output through your network's validator
(e.g. the KoSIT validator) before sending.

## Input shape

The supported v0 JSON shape is intentionally small and format-neutral. UBL XML
and UN/CEFACT CII (XRechnung CII / Factur-X XML) both map into this shape.
A Factur-X / ZUGFeRD / XRechnung PDF is unwrapped to that embedded XML first.
UBL input maps common `Invoice`, `CreditNote`, `DebitNote`, line, party, tax, and
monetary-total elements. CII maps `CrossIndustryInvoice` header, parties, lines,
tax, payment, and totals the same way. When an invoice contains multiple UBL `TaxTotal`
elements, their `TaxAmount` values are added to obtain the invoice tax total.
This keeps split tax schemes from being silently ignored; it is still an
arithmetic check, not a tax-law determination:

```json
{
  "invoice_number": "INV-1001",
  "issue_date": "2026-08-24",
  "due_date": "2026-09-23",
  "period": {"start": "2026-07-01", "end": "2026-07-31"},
  "buyer_reference": "COST-441",
  "order_reference": "PO-9001",
  "document_type": "invoice",
  "currency": "EUR",
  "supplier": {"id": "DE123", "name": "Supplier GmbH", "vat_id": "DE136695976", "endpoint": {"scheme": "0088", "id": "1234567890128"}},
  "customer": {"id": "DE456", "name": "Customer GmbH", "endpoint": {"scheme": "EM", "id": "ap@customer.example"}},
  "payment": {"means": "30", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX", "remittance": "RF18539007547034"},
  "adjustments": [{"kind": "allowance", "amount": 20, "base": 200, "percent": 10, "reason": "Early payment discount"}],
  "lines": [{"description": "Consulting", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
  "totals": {"net": 180, "tax": 38, "gross": 218, "prepaid": 38, "due": 180}
}
```

`supplier.vat_id` and `customer.vat_id` are optional. When supplied, they are
checked against published national VAT shapes and checksums (DE, FR, BE, NL,
AT, IT, ES, PL, SE, DK, FI, PT, LU, IE, GB, and length-only checks for other
EU prefixes). A matching complete VAT in `id` is checked the same way. Short
codes such as `DE123` stay internal ERP identifiers and are not treated as
VAT numbers. Failed checksums are `INV-023`; a `vat_id` that is not a known
shape is `INV-022`. Messages never repeat the identifier. This is a typo
catch, not a VIES registration lookup and not a determination that a party
may charge tax. UBL `PartyTaxScheme/CompanyID` maps into `vat_id`.

`supplier.endpoint` and `customer.endpoint` are optional. When supplied they
are `{ "scheme": "<EAS>", "id": "<address>" }`. A missing or unknown Peppol
EAS scheme is `INV-039`. An empty id is `INV-040`. A known scheme that fails
its published shape — GS1 check digit on `0088` (GLN), an email shape on
`EM`, or the digit length for `0007` / `0184` / `0190` / `0192` / `0208` /
`0212` — is `INV-041`. Other known schemes only require a non-empty
identifier. Messages never repeat the address. This is a typo catch, not a
Peppol SMP lookup and not a claim that the party can receive e-invoices.
UBL `Party/EndpointID` maps into `endpoint.id` and `schemeID` maps into
`endpoint.scheme`.

`payment.means` is optional. When supplied it is a UNCL 4461 payment means
code (BT-81) such as `30` (credit transfer), `58` (SEPA credit transfer),
or `10` (cash). An empty code, or one outside the UNCL 4461 list in the CEN
rule BR-CL-16, is `INV-044`. A credit transfer or SEPA transfer without a
complete IBAN is `INV-045` (direct debits name the payer's account, so they do not need one). Cash, cheque, or card together with a complete IBAN is
`INV-046`. Omitted means stay clean even when an IBAN is present.
Messages never repeat the typed code or the account. This is a code-list
and consistency check, not a Peppol profile determination and not a claim
that the buyer can pay that way. UBL `PaymentMeans/PaymentMeansCode` maps
into `payment.means`.

`payment.iban` is optional. When supplied, it is checked against published
IBAN lengths and the ISO 13616 MOD-97 checksum. Failed checksums are
`INV-025`; a value that is not a country-prefixed IBAN (or that uses the
wrong national length) is `INV-024`. Short internal account numbers stay
internal unless they are placed in `payment.iban`. Messages never repeat
the account number. This is a typo catch, not a bank lookup and not a
determination that the account exists or belongs to the named party. UBL
`PaymentMeans/PayeeFinancialAccount/ID` maps into `payment.iban`.

`payment.bic` is optional. EN 16931's BT-86 (payment service provider
identifier) admits a BIC or a national clearing code, so either is accepted:
an 8- or 11-character ISO 9362 identifier (four letters, a two-letter
country, a two-character location, and an optional three-character branch),
a clearing code of 3 to 11 digits (UK sort code, German BLZ, US ABA routing
number, Australian BSB, Italian ABI/CAB and so on), or an Indian IFSC. A
value that is none of these is `INV-026`, and so is a nine-digit number with
a US district prefix whose ABA check digit fails (a **note** when it starts
with 0, since Canada's EFT form and Russia's BIK do too). When both a
complete IBAN and a complete BIC are present, a country mismatch is
`INV-027`; when a clearing code and a complete IBAN are present and the
IBAN's country carries its bank code in a known place (23 countries, from
the SWIFT IBAN registry's bank and branch positions: DE, GB, IE, AT, CH, IT,
FR, ES and others), a code that is not that bank code is also `INV-027`
(see "BT-86 clearing codes" below). Messages never repeat the BIC
or the account number. This is a typo catch, not a SWIFT directory lookup
and not a determination that the institution will accept the payment. UBL
`PayeeFinancialAccount/FinancialInstitutionBranch/ID` (or the nested
`FinancialInstitution/ID`) maps into `payment.bic`.

**BT-86 clearing codes (2026-11-12).** Before this, every non-BIC value in
BT-86 was `INV-026`, so a UK supplier quoting a sort code, a US one quoting a
routing number, or an Australian one quoting a BSB failed the preflight on a
field the standard lets them fill that way (the PINT route already dropped
INV-026 for this reason; EU files had no such escape). Now `classifyProviderId`
in `bic.mjs` (mirrored by `classify_provider_id` in the Python package) reads
the value as a BIC, a clearing code, or neither, and a clearing code is checked
against the IBAN: a German BLZ must be the IBAN's first eight BBAN digits, a
UK sort code its six digits after the bank letters, an Italian ABI or ABI+CAB
the digits after the CIN letter, a Swiss IID the five-digit bank code (written
with or without leading zeros). That catches a typo a BIC check never could:
`37040045` against `DE89 3704 0044 ...` is INV-027. The ABA check (weights 3,
7, 1, sum divisible by 10) is checked on published routing numbers (021000021,
121000358). Not done: no bank directory lookup (a well-formed sort code may
not exist); countries outside the 23 are not compared; the Python package has
no note severity, so the leading-0 routing note is silent there. Tests:
`bic.test.mjs` (4 new), `tests/test_bic.py` (`ClearingCodeTest`, 3), and
`pint-current.test.mjs` now uses a malformed value for its "EU still checks"
case, since a BSB on an EU file is no longer wrong.

`payment.remittance` is the text the buyer should quote on the transfer.
When a complete IBAN is present and remittance is missing, that is
`INV-030`, a **note** (`severity: "note"`): it is listed in every report but does not
fail the file or change the exit code, because the standard does not require it — an unmatched SEPA credit is how paid invoices sit in
unallocated cash. When remittance is supplied, an ISO 11649 RF creditor
reference that fails its MOD-97 check (or that is not RF-shaped after
starting with `RF`) is `INV-031`. Unstructured notes are accepted up to
140 characters. Messages never repeat the reference. This is a matching
and typo catch, not a bank lookup and not a determination that a payment
will be allocated. UBL `PaymentMeans/PaymentID` maps into
`payment.remittance`; `InstructionNote` is used when `PaymentID` is
absent.

`document_type` is optional and defaults to a commercial invoice. Use
`invoice`, `credit_note`, or `debit_note` (UN/CEFACT 1001 codes `380`,
`381`, and `383` are accepted). An unknown type is `INV-032`. A credit
or debit note without `original_invoice` is `INV-033` — networks reject
a reversing document that does not name the invoice it applies to. A
commercial invoice that carries a credit or debit type code, or a
credit that names itself as the original, is `INV-034`. Messages never
repeat the original invoice number. This is a document-shape check, not
a Peppol profile determination. UBL `CreditNote` and `DebitNote` roots
map into `document_type`; `InvoiceTypeCode` / `CreditNoteTypeCode` /
`DebitNoteTypeCode` map into `document_code`;
`BillingReference/InvoiceDocumentReference/ID` maps into
`original_invoice`.

A line with `tax_percent` of `0`, or a UNECE 5305 category of `E`, `AE`,
`K`, `G`, `O`, or `Z`, needs an exemption reason. Put it on the line as
`tax_reason` or `tax_reason_code` (for example `VATEX-EU-IC`), or on the
invoice as `tax_exemption_reason` / `tax_exemption_reason_code`. A missing
reason is `INV-035`. An empty reason field is `INV-036`. Messages never
repeat the reason text. This is a document-shape check — the tool does
not decide whether 0% is legally correct. UBL
`ClassifiedTaxCategory/ID` maps into `tax_category`;
`TaxExemptionReason` and `TaxExemptionReasonCode` map into the line
reason fields. `TaxTotal/TaxSubtotal/TaxCategory` exemption fields map
into the invoice-level reason.

When line items use more than one `tax_percent`, the invoice needs
`tax_breakdown`: one row per rate with `tax_percent`, `taxable` (the net
of those lines), and `tax` (taxable times the rate, rounded to cents).
A mixed-rate invoice without that list is `INV-037`. A present breakdown
that is the wrong shape, repeats a rate, misses a rate the lines use,
or disagrees with the line nets is `INV-038`. A single-rate invoice may
omit the list. This is per-rate arithmetic — the same relationship EN
16931 expresses as `TaxTotal/TaxSubtotal` — not a determination that a
percentage is legally correct. UBL `TaxSubtotal` rows map into
`tax_breakdown` (`TaxableAmount`, `TaxAmount`, `TaxCategory/Percent`,
and optional `TaxCategory/ID` as `tax_category`).

`due_date` is optional. When supplied, it must use `YYYY-MM-DD` and cannot be
earlier than `issue_date`; this is a date-shape and document-consistency check,
not a judgment about payment terms or legal requirements. UBL `DueDate` is
mapped into the same optional field.

`payment.terms_days` is optional. When supplied it is a positive whole number
of days (Net-N). An empty or non-integer value is `INV-053`. When both
`issue_date` and `due_date` are present ISO dates, a due date that is not
issue date plus those days is `INV-054`. Terms without a due date stay
clean — the due date is not required just because terms are named.
Omitted terms stay clean. Messages never repeat party or account data.
The expected due date may appear in the fix. This is arithmetic, not a
Peppol profile determination and not a claim that the buyer must pay by
that date. UBL `PaymentTerms/SettlementPeriod/DurationMeasure` with
`unitCode="DAY"` maps into `payment.terms_days`. CII
`SpecifiedTradePaymentTerms/SpecifiedPeriod/DurationMeasure` with the
same unit maps the same way.

`buyer_reference` and `order_reference` are optional (EN 16931 BT-10 /
BT-13). When supplied they must be non-empty text, not a placeholder such
as `N/A` or `none`, and no longer than 70 characters. An empty or
placeholder buyer reference is `INV-047`. The same defects on the
purchase-order field are `INV-048`. A purchase-order value that repeats
the invoice number is `INV-049`. Omitted references stay clean. Messages
never repeat the typed reference. This is a shape and consistency check,
not a Peppol profile determination and not a claim that the buyer issued
that order. UBL `BuyerReference` maps into `buyer_reference` and
`OrderReference/ID` maps into `order_reference`.

`adjustments` is optional (EN 16931 BT-92 / BT-99). When supplied it is a
list of document-level allowances and charges: `{ "kind": "allowance" |
"charge", "amount": <money>, "base": <money>, "percent": <0-100>,
"reason": "<text>", "reason_code": "<code>" }`. An empty list, a
non-list, a missing kind, or a missing or negative amount is `INV-050`.
When both `percent` and `base` are present, an amount that does not
equal the percentage of the base (rounded to cents) is `INV-051`. A
missing, empty, or placeholder reason (and reason code) is `INV-052`.
Omitted adjustments stay clean. Invoice net then equals line nets minus
allowances plus charges (`INV-014`). Messages never repeat the amount,
percent, or reason. This is arithmetic and shape, not a Peppol profile
determination and not a claim that the discount is commercially
correct. UBL invoice-level `AllowanceCharge` maps into `adjustments`
(`ChargeIndicator`, `Amount`, `BaseAmount`, `MultiplierFactorNumeric`,
`AllowanceChargeReason`, `AllowanceChargeReasonCode`). Line-level
`AllowanceCharge` is ignored.

`period` is optional. When supplied it is `{ "start": "YYYY-MM-DD", "end":
"YYYY-MM-DD" }` — the EN 16931 invoice period (BT-73 / BT-74). A period that
is not an object, that names only one date, or that is not an ISO date is
`INV-042`. An end earlier than the start is `INV-043`. Omitted periods stay
clean. Messages never repeat the dates. This is a date-shape check, not a
Peppol profile determination and not a claim that the dates match the
underlying contract. UBL invoice-level `InvoicePeriod/StartDate` and
`EndDate` map into `period`; line-level `InvoicePeriod` is ignored.

`totals.prepaid` and `totals.due` are optional. When `prepaid` is supplied, it
must be a non-negative amount no greater than `totals.gross` (`INV-028`). When
`due` is supplied, it must equal gross minus prepaid, treating a missing
prepaid as zero (`INV-029`). This is remaining-balance arithmetic — the same
relationship EN 16931 expresses as PrepaidAmount and PayableAmount — not a
determination that a payment was received or that a balance is legally due.
UBL `LegalMonetaryTotal/PrepaidAmount` maps into `totals.prepaid` and
`LegalMonetaryTotal/PayableAmount` maps into `totals.due`.

Amounts use the currency's major unit and are compared to cent precision. Each
line must include a numeric `net` amount matching quantity times unit price. Each
line's tax is calculated from its rounded line net and the supplied
`tax_percent`; the invoice tax total must equal the sum of those per-line
rounded amounts. This reports arithmetic discrepancies only and does not
decide whether a tax percentage is legally correct.
`--format json` is suitable for an ERP adapter. It always returns the same
envelope, whether the input is one file or a directory: `status`,
`files_checked`, `files_failed`, `observations`, per-file `reports`, and
`read_errors`. Each flattened finding in `errors` includes its source `file` as
well as the rule, message, fix, and JSON Pointer, so a batch adapter can route a
finding without joining against `reports`. Each `reports` item also includes an explicit `status` (`pass` or
`fail`) and `observations` count, so adapters can render a batch queue without
inferring state from the errors array. Each finding also includes a `path` JSON Pointer (for example,
`/totals/gross`), so adapters can focus a field-level repair UI without
reimplementing the rules. `--format sarif` emits SARIF
2.1.0 for GitHub code scanning, CI annotations, and
editor integrations. It contains the rule IDs, fixes, JSON Pointer paths, and the local invoice
filename, never invoice fields or line contents. Unreadable files are emitted as `INV-READ`
results so a CI consumer cannot mistake a skipped file for a clean check. Both formats exit `1` when
any check fails and `2` for an unreadable input file. Pass a directory to scan
all `.json` files recursively; batch JSON includes per-file errors and batch
SARIF uses paths relative to the input directory. An empty directory is an
input error and exits `2`. Batch scans also flag a supplier (matched by id, VAT id or
name) who reuses an `invoice_number` as `INV-019`; the number itself is never
emitted. Two different suppliers that both issue `1001` are not flagged.
Credit notes are tied to their originals when both are in the batch (same seller,
reference matched ignoring case): `INV-056` for a currency mismatch, `INV-057` when
the credit notes against one invoice add up to more than its gross total, `INV-058`
when the named invoice in the batch belongs to a different seller. A credit note whose
original is not in the batch is left alone. Tested on hand-written invoices (JS and
Python CLI); not tried on real ERP exports.
JSON output uses the same versioned summary fields for single files and
directories: `schema_version` (currently `1`), `status`, `exit_code`,
`files_checked`, `files_failed`, `observations`, `rules`, `fixes`, and `read_errors`.
`exit_code` mirrors the process result (`0` pass, `1` findings, `2` read/input
errors), so an adapter can handle captured output without reimplementing exit
logic. `fixes` is a sorted, privacy-safe remediation queue with one item per
rule, its occurrence count, check message, and recommended fix. Single-file output also includes `file` and `errors`; directory output
includes the per-file `reports` array. Rule counts let a CI or ERP adapter show
a compact defect summary without parsing human text.
`--format jsonl` emits one compact JSON object per invoice (or read error),
which is suitable for streaming directory results into CI or an ERP adapter
without parsing an aggregate document. Each record has `schema_version`,
`status`, `file`, `observations`, `fixes`, and `errors`; read-error records also
have `error`. `fixes` is the per-invoice remediation queue grouped by rule, with
occurrence counts, the check message, and recommended fix. The line-oriented
mode uses the same privacy boundary and exit codes as JSON.
`--format markdown` produces a reviewable report with filenames, rule IDs,
observations, and fixes for single files and recursive directory scans. Batch
reports also include a finding summary grouped by rule, so repeated defects can
be triaged before reviewing individual invoices. Markdown-sensitive local names
and messages are escaped in the report.
`--format github` emits GitHub Actions `::error` annotations for each finding and
read error, so a CI job can place defects directly in its Checks UI. It uses the
same privacy boundary as SARIF: only the local filename, rule ID, observation,
and fix are emitted, never invoice numbers or line contents. It exits `1` for
findings and `2` for read errors.
`--format csv` produces one spreadsheet row per finding, plus explicit pass and
read-error rows. Its stable columns are `file`, `status`, `rule`, `path`,
`message`, `fix`, and `error`, making it suitable for triage queues without
exposing invoice values or contents.
`--format remediation-csv` produces one spreadsheet row per rule across the
batch, with an occurrence count, check message, and recommended fix. It is
useful when an operator wants a compact queue of repeated fixes rather than
one row per invoice. Read errors are represented as `INV-READ`; invoice
values, numbers, and line contents are never included. The JSON
`--format remediation` queue stays the per-invoice adapter payload.
`--format junit` produces a JUnit XML report for CI dashboards. Each invoice is
one testcase; failed checks are failures and unreadable files are errors. The
report contains only local filenames, rule IDs, JSON Pointer paths, observations,
 and fixes, never invoice values or line contents. Directory scans do not follow
symbolic links; linked JSON files are reported as read errors so a scan stays
bounded to its selected directory.
`--format html` produces a standalone browser report with summary cards, finding
counts, and per-file review sections. It has the same privacy boundary as the
other report formats and can be opened locally without a server.
`--format summary` prints a compact batch result for CI logs, followed by sorted
rule counts when findings exist. It includes counts and rule IDs only, never
invoice values, numbers, or line contents.
`--format remediation` emits a versioned JSON queue grouped by invoice and rule.
Each item includes the local file, rule ID, occurrence count, distinct JSON
Pointer paths, check message, and recommended fix. This is intended for ERP or
ticket adapters that need a repair queue without parsing the full finding
report; it never includes invoice values, numbers, or line contents. Read errors
remain in `read_errors`, and the output uses exit code `2` for those errors.
`--format checklist` emits a plain-text, copyable repair checklist grouped by
local filename and rule. It starts with status and counts, making it useful for
handing a complete batch triage summary to a reviewer without asking them to
parse JSON. It does not modify invoices or decide whether they may be submitted.
Use `--output PATH` with any format to write the report atomically to a local
file instead of stdout. Parent directories are created when needed. A failed
write returns exit code `2` and never replaces an existing report with a partial
file.

`--max-depth N` limits how far a directory scan descends. `1` checks only
files in the scan root; `2` includes one subdirectory. Deeper folders are
not walked, so a nested export dump cannot expand a CI job. The same
positive-integer syntax as `--max-files` applies. Files below the bound are
skipped rather than failing the scan, so a top-level folder next to an
archive still checks.
`--max-files N` accepts a positive integer, including the usual `+N` CLI
notation, and rejects zero, negative, or non-numeric values before any invoice
is read.
`--max-bytes N` uses the same positive-integer syntax and rejects zero,
negative, or non-numeric values before any invoice is read. It refuses an
oversized regular file before reading it and reads stdin only through `N+1`
bytes, returning a structured exit-2 read error when the limit is exceeded.

Machine-readable formats remain valid JSON, JSONL, SARIF, CSV, remediation-csv,
JUnit, Markdown, or HTML when a directory is empty or a `--max-files` limit
refuses the scan.
These input errors are reported in the selected format and the command exits
`2`, so CI and ERP adapters do not need to special-case an unstructured stderr
or stdout message.

## Measured on real FatturaPA samples (2026-10-28)

`node eval/fatturapa-corpus.mjs <ZUGFeRD corpus>/fatturaPA` ran `IT-001`..`IT-018` over 15 files: the Agenzia delle Entrate's six official samples (FPR01-03, FPA01-03) and nine from eigor. Result: `IT-003`/`IT-004` on 8 and 9 files (the samples use the placeholder partita IVA 01234567890, which fails its check digit, so these are right); `IT-017` on 3 (placeholder IBANs); `IT-015` on FPR02 and FPR03 (the first body's lines sum to 25.00 but its summary base is 27.00, a real inconsistency in the sample); and `IT-018` on FPR02, **a false positive of ours**: the official sample puts `PECDestinatario` before `ContattiTrasmittente` in `DatiTrasmissione`, against the order this tool had written from memory. Reading the XSD (2026-10-30) settled it: the schema puts ContattiTrasmittente first, xmllint rejects the sample, and the exemption was removed. The corpus marks all 15 as valid, which only means they pass its own check, not that SdI accepted them. Rules for cassa, bollo and ritenuta files are skipped and named, as before.

## Measured on the official examples (2026-10-24)

The CEN EN 16931 test repository (ConnectingEurope/eInvoicing-EN16931, EUPL, not copied here) ships 41 example invoices in UBL, CII and other syntaxes. They pass the official Schematron, so a built-in rule that fires on one is a false positive of ours or a real inconsistency in the example's data. `node eval/official-examples.mjs <checkout>` runs the built-in rules over them (31 are readable UBL or CII; 9 are EDIFACT or other syntaxes this tool does not read; one file is over the 1 MB limit: it is not FatturaPA but a 3.3 MB UBL invoice with an embedded attachment, `FT G2G_TD01 con Allegato, Bonifico e Split Payment.xml`; `MAX_CHARS=5000000 node eval/official-examples.mjs <checkout>` reads it, and on 2026-10-24 it drew one finding, the non-blocking INV-030 note, no false positive).

Before this run **none** of the 41 passed the built-in rules; 29 of the 31 readable files drew a finding, mostly arithmetic ones. The causes, all fixed in the JS and Python rules:

| Rule | Files before | After | Cause |
|---|---|---|---|
| INV-014, INV-018, INV-038 | 16, 16, 19 | 0, 1, 1 | line allowances/charges ignored; tax summed per line instead of per rate (BR-CO-17); a second `TaxTotal` in the VAT accounting currency (BT-111) added to BT-110; CII net read from `LineTotalAmount` (BT-106) instead of `TaxBasisTotalAmount` (BT-109); CII header allowances not read; breakdown rows keyed by rate only, so S, Z and E at 0% collided; a negative taxable amount rejected |
| INV-009 | 5 | 0 | a negative quantity (a credit line) rejected |
| INV-011, INV-015 | 2, 2 | 0 | category O has no `Percent` and invoices with no VAT carry no tax total |
| INV-012 | 13 | 12 | unit prices rounded to cents before multiplying (0.0088 EUR per kWh read as 0.01); price base quantity (BT-149) ignored. The 12 left are real: the example's stated line net is not quantity times price (for instance quantity 2, price 800, net 800) |
| INV-005 | 6 | 6 | unchanged on purpose: a buyer known by name alone is still flagged, a buyer with a VAT id, legal id or endpoint is not |

What is left on the readable files is mostly the examples' placeholder data (VAT numbers and IBANs that fail their checksums: INV-022/023/024/025), plus INV-012 above, one HUF invoice whose VAT is rounded to whole forints (INV-018/038 use cents; since 2026-10-24 a HUF tax total rounded to the unit is accepted, a unit-rounded total in any other currency is not) and INV-033 on a credit note without BT-25. One file is clean. A line whose stated net disagrees with quantity times price is reported once (INV-012); in a parsed file the totals are then summed from the stated nets, as BR-CO-10 does, so the error is not repeated in every total. Draft JSON still sums quantity times price. Where a line states a price base quantity and its net matches quantity times price without it, the net is accepted (the official CII example 8 does this).

Behaviour changes that tests pin: tax is worked out per rate on the summed taxable amount; header allowances and charges move the taxable amount of their rate (or of the only rate); a UBL or CII buyer may omit BT-46 when another identifier is present; negative quantities are allowed.

## Measured on the XRechnung test suite (2026-10-26)

The KoSIT XRechnung test suite (itplr-kosit/xrechnung-testsuite, Apache-2.0, not copied here) holds 72 valid German documents in UBL and CII (36 cases, each in both syntaxes: 33 standard, 3 extension; `node eval/official-examples.mjs <checkout>/src/test/business-cases`). They pass KoSIT's validator, so a finding is a false positive of ours, placeholder data, or a style note. Before this run 72 of 72 drew a finding. Real false positives found and fixed, in the JS and Python rules:

| Rule | Cause | Files before / after |
|---|---|---|
| INV-044 | the means list held 13 codes; BR-CL-16 allows the whole UNCL 4461 list (here code 68, online payment service) | 2 / 0 |
| INV-045 | direct debits (49, 59) were asked for a payee IBAN; they name the payer's account | 7 / 0 |
| INV-035 | zero-rated category Z was asked for an exemption reason (BR-Z-10: none) | 2 / 0 |
| INV-029 | the payable rounding amount (BT-114) was ignored; a negative amount due (prepayments above the gross, BR-CO-16 has no sign limit) was refused; CII amounts due were never checked | 3 / 1 |
| INV-028 | prepaid above gross, same credit-balance case | 2 / 0 |
| INV-038 | a zero tax-breakdown row (0 taxable, 0 tax) that exists only for a zero-amount header allowance or charge was called a rate no line uses; a non-zero row with no line is still flagged | 6 / 0 |

A negative amount due is accepted only when it equals gross minus prepaid plus rounding; a negative `due` typed with no prepayment is still `INV-029`. Left, not fixed: placeholder VAT ids and IBANs (INV-022/023, 27 and 42 files), the `[BIC]` placeholder (INV-026), 6 files whose line net is not quantity times price (INV-012), 39 files with an IBAN and no remittance reference (INV-030, a style note the standard does not require), and one extension case whose amount due differs from the totals on purpose (INV-029). The same 31 CEN examples also lose 2 INV-035, 2 INV-044 and 1 INV-045.

## Measured on the Peppol BIS 3.0 examples and the ZUGFeRD corpus (2026-10-27)

The OpenPEPPOL `peppol-bis-invoice-3` examples (9 UBL files), the ZUGFeRD community corpus (`ZUGFeRD/corpus`; 51 XRechnung files, 13 ZUGFeRD 2 files) were read, not copied: `node eval/official-examples.mjs <checkout>` (set `PATH_FILTER` to pick a folder). Before: 0 of 9 Peppol files and 2 of 51 XRechnung files were clean. Real false positives fixed in the JS and Python rules (`negative-invoice.test.mjs`, `tests/test_checks.py`):

| Rule | Cause | Fix |
|---|---|---|
| INV-013, 015, 016, 029, 050, 038 | the Peppol "negative invoice" example (type 380, negative net, tax, gross and a negative header charge) was refused: totals and header amounts had to be non-negative | a negative net and gross make a negative invoice; its totals, amount due and header allowances/charges keep their sign and the arithmetic is still checked |
| INV-028 | a negative prepaid amount (KoSIT-valid German insurance invoice, prepaid -220) | accepted when the stated amount due equals gross minus prepaid |
| INV-032 | only 9 UNCL 1001 codes known; 204, 387, 575, 877 and others in valid files | the BR-CL-01 invoice, credit and debit codes added |
| INV-048 | Peppol's `NA` purchase-order id with a `SalesOrderID`, and an empty id with one | the sales order number is the reference |
| INV-045 | an IBAN that is present but malformed (a placeholder) was reported as missing | INV-024 reports it; INV-045 only when none is given |

After: the 9 Peppol examples draw only placeholder-data findings (fake VAT ids, IBANs, GLNs; INV-034 where the example credit note names itself "Snippet1"); XRechnung corpus 8 of 51 clean (INV-032, 048, 028 gone); the rest are placeholders (INV-023 34 files), 7 files whose line net is not quantity times price (true, e.g. 20 x 2.77 stated as 55.46) and style notes. A negative invoice is not valid in every country's rules; this tool only stops calling it arithmetic nonsense.

## Measured on the Ministry's own FA(3) templates (2026-10-27)

`node eval/ksef-official-templates.mjs <clones> <schemy/FA>` reads the FA(3) sample invoices that the Polish Ministry of Finance and CIRF ship in `ksef-client-csharp`, `ksef-client-java` and `ksef-pdf-generator` (MIT; read from a checkout, not copied here), fills their `#placeholders#` (NIP, number, date, internal ids) with valid values, and compares the schema gate with xmllint on the real XSD. **14 distinct files; the verdict agrees with xmllint on all 14; 12 draw no finding at all** (so no false positive from `PL-001`..`PL-011` on files KSeF's own tooling emits, including the attachment, self-invoicing and third-party-subject variants). The other two (`...custom-subject_3` with a `Nazwa` where `IDWew` belongs, `...multiple-Subject3` with `IDWew` before `Nazwa`) are rejected by xmllint too: they are element-order faults in the Ministry's templates, which we report as `PL-013`. Limits: these are templates, not invoices a business issued; the rate and total branches they exercise are the plain-VAT ones, so the correction and advance branches remain unmeasured on real files.

## Measured on the ZUGFeRD corpus PDFs (2026-10-29)

`node eval/facturx-corpus.mjs <ZUGFeRD/corpus checkout>` unwraps every PDF in the corpus with `facturx.mjs` and runs the built-in rules on the embedded XML (the files are read, not copied). Before: of 126 PDFs in the corpus's `correct` folders, **only 40 unwrapped** and 5 were clean. Three faults, all ours:

- The invoice sniff looked at the first 4,096 bytes of the attachment. The official ZUGFeRD samples open with a licence comment of over 5 KB, so the root element was out of range and 59 valid PDFs were refused as "no UBL or CrossIndustryInvoice". Comments are now dropped before sniffing (`facturx.test.mjs`).
- One attachment that would not inflate (a report PDF, a mis-sliced stream) aborted the whole read, 5 files. It is now skipped; the error is raised only when no attachment is usable.
- MINIMUM and BASIC WL carry totals and no lines by design, so INV-007, 014, 018 and 038 fired on all of them. They are skipped when `specification_id` ends in `minimum` or `basicwl` and there are no lines; MINIMUM also has no prepaid field, so INV-029 (amount due vs gross) is skipped there (`negative-invoice.test.mjs`).

After: 104 of 126 unwrap, 18 are clean. The 24 ZUGFeRD 1.0 files and one unstructured PDF remain refused (1.0 uses the older `CrossIndustryDocument`; the message now says so) and one has no attachment. What is left is real or placeholder data: INV-023 (placeholder VAT ids, 72 files), INV-005 (no buyer id, a style note), INV-012 (e.g. 20 x 2.77 stated as 55.46), INV-021 (the BASIC WL sample is dated 2019 with a 2017 due date), INV-024 (11 files, placeholder IBANs). Fixed 2026-10-24: the EXTENDED "Warenrechnung" samples drew INV-014/018/038 because `SpecifiedLogisticsServiceCharge` (3.00 freight at 19%, EXTENDED only) was not read as a header charge; `cii.mjs` now maps it (1 test; both samples now draw only the placeholder-VAT INV-023). The corpus's `fail` folders hold files failing for PDF/A or XSD reasons we do not check, so findings there prove nothing either way.

## Measured on Mustang's test PDFs (2026-10-28)

`node eval/facturx-corpus.mjs <ZUGFeRD/mustangproject checkout>` (read, not copied): 36 PDFs from other generators. One Aspose.Words invoice (2026-03-24) was refused as "compressed in a way this tool cannot read": `/Subtype /application#2Foctet-stream` contains the word `stream`, so the reader began inside the dictionary. Fixed in `facturx.mjs` (keyword must be followed by a line break; test in `facturx.test.mjs`). Unwrapped 18 before, 19 after; the rest hold no invoice XML. Remaining findings on the others are placeholder VAT ids, a bank checksum in a French sample and a missing remittance.

## Privacy and usage

Everything is local. Invoice contents are never uploaded or retained by this
tool, including when read from standard input. Usage counting is opt-in with
`--usage-file` and stores only aggregate event counts, never invoice data,
paths, IPs, or identifiers. It records `invoice_preflight_attempted` once per
command invocation and `invoice_preflight_checked` once per successfully parsed
invoice, so failed input is not silently missing from adoption signals. Usage
recording is best effort and never changes
the validation result if its state file cannot be read or written. Omit the
flag to disable it. There are no accounts, cookies, or analytics vendors.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax or legal advice, and it does not
replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

This is a preflight observation, not a declaration that an invoice is valid or
compliant. Format-specific validators and professional review are still
needed before submission.

## FAQ

### Does this submit invoices?

No. It reads one local JSON file and writes a report to stdout.

### Does it calculate VAT?

No. It checks the arithmetic for the tax percentage supplied in each line; it
does not decide whether that percentage is legally correct.

### Does a 0% line need a reason?

When a line is 0% or uses an exempt / zero-rated category (`E`, `AE`,
`K`, `G`, `O`, `Z`), the preflight expects `tax_reason` or
`tax_reason_code` (or an invoice-level exemption reason). That is the
same shape Peppol and many EN 16931 CIUS reject when the reason is
missing. The tool never chooses the reason and never claims the
exemption is legally valid.

### Does it look up VAT registrations?

No. Optional `vat_id` values (and a complete VAT shape in `id`) are checked
with published checksums only. The tool never calls VIES or any network
service, never stores the identifier, and never claims a party is registered.

### Does it confirm a deposit was paid?

No. Optional `totals.prepaid` and `totals.due` (and UBL PrepaidAmount /
PayableAmount) are checked only as remaining-balance arithmetic against
`totals.gross`. The tool never contacts a payment processor and never claims
a balance is legally due.

### Does it look up bank accounts?

No. Optional `payment.iban` values (and a UBL payee account ID) are checked
with the published IBAN length and MOD-97 checksum only. Optional
`payment.bic` values are checked for ISO 9362 shape and, when both are
complete, for the same country as the IBAN. Optional `payment.remittance`
(and UBL `PaymentID` / `InstructionNote`) is required when a complete
IBAN is present and, when it looks like an RF creditor reference, is
checked with the published ISO 11649 checksum only. The tool never
contacts a bank, never stores the account number, BIC, or remittance,
and never claims funds can be received or allocated there.

`examples/factur-x-credit-note-with-defects.pdf` wraps the defective CII credit note in a Factur-X envelope: the built-in rules report INV-032 (unknown type code) and INV-038 (tax amount), identical to the bare XML (`facturx.test.mjs`); the official-rule findings for the same XML are pinned in `schematron.test.mjs`.

## Repair a JSON invoice's arithmetic

UBL files (Invoice, CreditNote) are repaired too, in place: see "Repair a UBL file" below.

`node repair-cli.mjs invoice.json -o fixed.json` (or `POST /v1/repair`)
recomputes line nets, the net, tax, gross and amount-due totals from the
invoice's own quantities, unit prices, tax percents and header adjustments,
and upper-cases a lower-case currency code. It logs each change (path, old
value, new value, reason), re-runs the checks on the result and lists what is
left. It never chooses a tax rate, date, identifier, bank detail or party:
those findings stay for a person (exit 1 while any remain). If a line's
quantity, price or tax percent is invalid, no totals are touched. Tests in
`repair.test.mjs` and `server.test.mjs`. The web page has a "Repair the arithmetic (JSON, UBL or CII)" button (paste JSON, click, read the change table; clicked through with `eval/browser-repair.mjs`).

## Repair a UBL file

`node repair-cli.mjs invoice.xml -o fixed.xml` (or `POST /v1/repair` with the
XML as the body) edits only the amount elements of a UBL Invoice or
CreditNote and leaves every other byte alone (comments, namespaces, order).
It recomputes each line's net (quantity x price / base quantity), the taxable
amount and VAT of each `TaxSubtotal` (taxable x rate, rounded half up, the
EN 16931 way), the document `TaxAmount`, the line-extension, tax-exclusive,
tax-inclusive and payable totals. It skips, and says so in `skipped`, any
line with its own allowance, charge or sub-line, any document with header
allowances or charges, more than one `TaxTotal`, and any tax group that does
not match the subtotals one to one: it never adds a subtotal or picks a rate
or category. The result is re-parsed and re-checked. On
`examples/ubl-invoice-with-defects.xml` it fixes 3 amounts and clears
INV-017, INV-018, INV-029 and INV-038; INV-021 (due date) and INV-045 (no
IBAN) stay for a person. Tested on the repo's hand-written UBL examples only
(`repair-ubl.test.mjs`, `server.test.mjs`); not tried on a real ERP export.

## Repair a CII file (XRechnung CII, ZUGFeRD, Factur-X XML)

The same command and endpoint take a `CrossIndustryInvoice` file
(`repair-cii.mjs`; the CLI and `POST /v1/repair` pick CII or UBL by content).
**Factur-X PDFs** (CII inside) are repaired too (`repair-facturx.mjs`; CLI
`node repair-cli.mjs in.pdf -o out.pdf`; `POST /v1/repair` with the PDF returns
`pdf_base64`): the embedded XML goes through the CII repair and the PDF is
extended by an incremental update (all original bytes kept, a newer copy of the
attachment appended). The printed pages are not re-rendered, so if they show
wrong amounts, re-issue the PDF from the source system. A PDF 1.5 file whose
newest cross-reference is a stream (most modern generators) gets an appended
uncompressed xref stream (`/W [1 4 2]`, `/Prev` chained) instead of a table
(2026-10-22). Encrypted PDFs, or ones whose xref dictionary cannot be read, come
back with only the corrected XML. Tested on PDFs built by this repo's own writer
(plain and Flate streams, classic table and a hand-built xref-stream file); no
real ERP or Factur-X export tried, so a PDF viewer or veraPDF opening the
result is the open check.
Same contract as UBL: only amounts are edited, in place: each line's
`LineTotalAmount` (quantity x net price / basis quantity), each header
`ApplicableTradeTax` block's `BasisAmount` and `CalculatedAmount`, and the
header monetary summation (line total, tax basis, tax, grand total, amount due
= grand - prepaid + rounding). Skipped, and said so: lines with their own
allowance, charge or sub-line, header allowances or charges, more than one
`TaxTotalAmount`, and tax groups that do not match the header blocks one to
one. On `examples/xrechnung-cii-credit-note-with-defects.xml` it fixes the
wrong VAT amount (150.00 to 190.00) and leaves the type code and missing
fields for a person. Hand-written examples only (`repair-cii.test.mjs`,
`server.test.mjs`), no real ERP or Factur-X export tried. The web page's
repair button takes pasted JSON, UBL or CII (clicked through in headless
Chromium with `eval/browser-repair.mjs`, which pastes the defective CII
credit note).

The web page's repair button also takes one dropped Factur-X PDF (empty paste
box): it lists the changes and offers `<name>-repaired.pdf` to download. The
printed pages are not redrawn. Clicked through in headless Chromium with
`eval/browser-repair.mjs` on a PDF built by this repo.

## Metamorphic fuzz (2026-10-25)

`node eval/metamorphic-fuzz.mjs [N] [seed]` builds seeded random valid JSON
invoices (1 to 5 lines, five tax rates, fractional quantities, per-rate
breakdowns rounded to cents) and perturbs each one in a way with a known
answer. On 3,000 invoices per seed (seeds 7, 99, 12345): 0 valid invoices
flagged, and every one-cent change to a line net, a breakdown tax, the net
total or the gross, a changed quantity, a swapped line rate and a negated
quantity was caught (3,000 of 3,000 each). An empty `tax_breakdown` on a
single-rate invoice is accepted by design (`breakdown.mjs`, INV-037 needs two
or more rates). Synthetic invoices only; it says nothing about real ERP
exports, which stay the open item.
- Austria mandate page, 2026-10-26 (`austria-e-invoice-mandate.html`, 8 tests, hub counts 33 pages): federal-government suppliers must e-invoice (since 1 Jan 2014; EN 16931 since 18 Apr 2020, e-Rechnung.gv.at or Peppol, ebInterface or Peppol BIS 3.0); B2B voluntary with no adopted date, ViDA 1 Jul 2030. Vendor and guide excerpts only (BMF and RIS unread), no penalty stated. The checker does not read ebInterface XML: that is the open gap this page names. To refresh when Austria adopts a B2B date.
- Malta mandate page, 2026-10-26 (`malta-e-invoice-mandate.html`, 8 tests, hub counts 32 pages): no domestic B2B mandate (voluntary), public bodies receive EN 16931 over Peppol BIS 3.0 (Legal Notices 403/404 of 2018), ViDA 1 Jul 2030; Commission sheet and vendor excerpts only (the Commission and vendor hosts were unreachable, MTCA unread), sources disagree on the B2G readiness year (2020 or 2021) and on whether suppliers must send; no penalty stated. To refresh when the MTCA announces B2B dates.
- Finland mandate page, 2026-10-26 (`finland-e-invoice-mandate.html`, 8 tests, hub counts 34 pages; the Austria page is PR 10673's): voluntary for domestic B2B with ViDA 1 Jul 2030 as the first fixed date; Austria federal B2G e-invoicing since 1 Jan 2014 (ebInterface or Peppol BIS 3.0, USP), Finland government over Peppol since 2019/2020 plus a reported buyer right to request a structured invoice (Finvoice 3.0 common). Search excerpts of vendor and advisory pages only; the BMF, Vero and the laws were unreachable and unread, no penalty stated, sources disagree on Austrian regional/local reach and on a 2027 to 2028 Austrian B2B date. To refresh from the primary texts. The checker has no ebInterface or Finvoice reader (open item).
- Luxembourg mandate page, 2026-10-25 (`luxembourg-e-invoice-mandate.html`, 8 tests, hub now counts 31 pages): draft bill approved 17 Jul 2026 (receive 1 Jan 2028, large and medium issue 1 Jul 2028, all 1 Jan 2029, domestic B2B, Peppol, EN 16931); dates from vendor and advisory pages, the bill text unread, no penalty stated. To refresh when the bill is tabled.
- Luxembourg refresh, 2026-10-26 (same page, 1 new test): the bill is tabled as draft law No. 8815, filed 30 Jul 2026; alternative technical solutions to receive reported until 30 Jun 2028 (31 Dec 2028 small businesses); the first issuing phase is two of three thresholds on 2026 figures; Peppol with MyGuichet.lu as fallback sits in a draft Grand-Ducal Regulation. Read from search excerpts of KPMG Luxembourg, Arendt and Deloitte Luxembourg summaries (chd.lu and the firms' sites are unreachable from cloud sessions); the bill text is still unread.
- Luxembourg primary-source read, 2026-11-02 (same page, 1 new test): chd.lu was reachable today, so the French deposit text of draft law No. 8815 and the Bar Association opinion (30 Sep 2026) were read. Confirms the dates and thresholds (7.5m balance sheet, 15m turnover, 50 staff, 2026 figures). New: a usage fee (2/3/4/5 euros per invoice above a regulatory cap, bands of 20/30/50/then rest, ex VAT), same-format corrections, no recipient acceptance, only the e-invoice is the invoice, no penalty provision found (searched 'amende', 'sanction'). Grand-Ducal Regulations (caps, network) still unread.
- UK mandate page, 2026-10-25 (`uk-e-invoice-mandate.html`, 8 tests, hub test now counts 28 pages): VAT invoices B2B and B2G from April 2029 over Peppol, roadmap due with Budget 2026; sources are search excerpts from law-firm, accountancy and vendor pages (gov.uk and HMRC unreachable), so no penalty or phasing is stated. To refresh after Budget 2026.
- Norway mandate page, 2026-10-25 (`norway-e-invoice-mandate.html`, 8 tests, hub counts 30 pages): send duty 1 Jan 2027, receive and digital bookkeeping 1 Jan 2030, EHF / Peppol BIS 3.0; from search excerpts only (Lovdata and skatteetaten.no unread), so no penalty stated and exemptions flagged as reported. No ELMA lookup.
- Lithuania mandate page, 2026-10-25 (`lithuania-e-invoice-mandate.html`, 8 tests, hub test now counts 29 pages): B2G mandatory since 2017 (SABIS from 2024), i.SAF monthly reporting since 2016, no enacted B2B mandate; a 2028 target and the 2030 ViDA date come from secondary sources that disagree, and vmi.lt and e-tar.lt were not read (search excerpts only). To refresh when a B2B law is tabled.
- Built-in checks beside PINT/ZATCA, 2026-11-10 (`report.mjs`, 1 test): clean example files drew INV-024 (Singapore and A-NZ local account numbers) and, for the KSA file, INV-022, INV-005, INV-017 and INV-018 (non-EU tax id, no buyer on a simplified invoice, a second TaxTotal repeating the tax double-counted). When a PINT or ZATCA set governs the file those rules are dropped; other INV-0xx checks still run. Made-up invoices only.
- Server API runs PINT and ZATCA rules, 2026-11-10 (`report.mjs`, `Dockerfile`, `report-plain-route.test.mjs`, 3 tests): `?schematron=1` on `/v1/validate` used only the Saxon route, which runs the EU base, so a Singapore or KSA file got `unavailable` or EU false positives while the browser page already used the plain-JS runner. The report now runs the plain runner first; a file matched to a PINT or ZATCA set takes that set, any other file keeps the Saxon route (the plain runner stands in when the Saxon files are not built). The Docker image now carries `plain/` and slimdom, fontoxpath and their three dependencies (checked by running the runner from a folder holding only those). Not done: no Docker build was run here; the built-in INV-0xx checks still run beside PINT/ZATCA rules (an SG file with a local account number draws INV-024); the Saxon route itself is unchanged. Made-up invoices only.
- Sweden mandate page, 2026-10-26 (`sweden-e-invoice-mandate.html`, 8 tests, hub counts 35 pages): no dated domestic B2B mandate; public-sector suppliers on e-invoices since April 2019 with Peppol BIS 3.0 preferred; EU ViDA 1 Jul 2030. Search excerpts of vendor pages only (Invopop, B2Brouter, Stripe, VATcalc); Skatteverket, DIGG and the law unread, no penalty stated, sources disagree on whether Svefaktura/EDIFACT ended 1 Jul 2025. To refresh from primary texts.
- Albania mandate page, 2026-11-03 (`albania-e-invoice-mandate.html`, 8 tests, hub counts 74 pages): clearance through the DPT under Law 87/2019, B2G 1 Jan 2021, cashless B2B 1 Jul 2021, B2C cash 1 Sep 2021; UBL 2.1 or CII signed with an AKSHI certificate, NIVF/NSLF. Search excerpts of vendor pages only (DPT, the law and the vendor sites unreachable from the build host); sources disagree on retention (5 vs 10 years). No future date, so no calendar entry. Not tested: Albanian schema, signing, clearance.
- Mauritius mandate page, 2026-11-03 (`mauritius-e-invoice-mandate.html`, 8 tests, hub counts 75 pages): MRA invoice registration (EBS to IFP, IRN and QR); MUR 100m from 15 May 2024, widening to MUR 40m from 1 Sep 2026. Search excerpts only (mra.mu and vatupdate unreachable from the build host); sources disagree on the 2025 and 2026 wave dates, and the Finance Act 2026 fine is one aggregator's claim, not stated as fact. Not tested: Mauritian schema, registration.
- Côte d'Ivoire mandate page, 2026-11-03 (`cote-divoire-fne-e-invoice-mandate.html`, 8 tests, hub counts 77 pages): DGI facture normalisée électronique (FNE) under the 2025 tax annex and arrêté 0337/MFB/DGI; press and vendor pages give start dates from 1 Jun 2025 to 1 Jun 2026, DGI controls from 1 Sep 2026 and an API specification deadline of 29 Oct 2026 (aggregator citing a DGI notice), so the page lays out the conflict and states no single date. Search excerpts only (page fetches blocked in the build); DGI, Journal Officiel and portal unread; no penalty amounts found. Not tested: Ivorian format, certification.
- Morocco mandate page, 2026-11-03 (`morocco-e-invoice-mandate.html`, 8 tests, hub counts 76 pages): DGI pre-clearance (Simpl-TVA); vendor guides give 1 Jan and 1 Jul 2026 waves, the newest source read (about 28 Sep 2026) says no decree is published, so the page states no binding date. Search excerpts only; Official Bulletin and DGI unread. Not tested: Moroccan format, clearance.
- New Zealand mandate page, 2026-11-03 (`new-zealand-e-invoice-mandate.html`, 8 tests, hub counts 73 pages): no general B2B mandate; central agencies receive Peppol e-invoices since 2022; large suppliers to government reported required from 1 Jan 2027; PINT A-NZ, MBIE as Peppol authority. Search excerpts of vendor and compliance pages only (MBIE, Inland Revenue and the procurement rules unreachable from the build host); sources disagree on the PINT A-NZ send date, the NZD 33 million line and how firm 2027 is. Calendar, JSON and the 2027 deadlines page regenerated. Not tested: PINT A-NZ rules, NZBN identifiers.
- Turkey mandate page, 2026-10-26 (`turkey-e-invoice-mandate.html`, 8 tests, hub counts 36 pages): e-Fatura at TRY 3 million gross sales (TRY 500,000 in listed sectors, some categories regardless), e-Arşiv for all other invoices since the TRY 3,000 threshold went on 1 Jan 2026; UBL-TR through GİB or a licensed integrator, so the checker has no rules for it and says so. Vendor and advisory excerpts only (communiqués and GİB unread; a 2027 simplified-method date and Communiqué 535 are single-source or unread). Open: UBL-TR rules from GİB's published schematron.
- Switzerland mandate page, 2026-10-26 (`switzerland-e-invoice-mandate.html`, 8 tests, hub counts 38 pages): federal B2G e-invoices for contracts of CHF 5,000 or more since 2016, no private B2B mandate or timeline. Vendor guides only (zoneandco, Comarch, B2Brouter, ecosio, Vertex); they disagree on whether a central EFV platform exists and on the format list, both flagged. EFV and the ordinance unread. No eCH rules in the checker.
- Cyprus mandate page, 2026-10-26 (`cyprus-e-invoice-mandate.html`, 8 tests, hub counts 39 pages): public bodies must receive structured e-invoices (central 18 Apr 2019, sub-central 18 Apr 2020, national law of 26 Jun 2019 under Directive 2014/55/EU); suppliers not required to send; no domestic B2B or B2C mandate found; EU-wide cross-border step 1 Jul 2030 (ViDA). Vendor and advisory guides only (EU Commission summary, ecosio, Sovos, Zenolegal, e-invoice.app); TAD and the gazette unread. No Cypriot rules in the checker.
- Mexico CFDI page and RFC check, 2026-10-27 (`mexico-cfdi-e-invoice-mandate.html`, `mexico.mjs`, 6+8 tests, hub counts 40 pages, widget run in headless Chromium over http): CFDI as stamped XML via a SAT-authorised PAC, 4.0 requiring the customer's RFC, exact name, postal code and tax regime, cancellation by reason code; vendor blogs only (SAT and the Resolución Miscelánea Fiscal unread, sources disagree on the 3.3 to 4.0 dates, no penalty stated). RFC check digit (mod 11, weights 13 to 2, a company's RFC padded with a leading space) reproduces four RFCs I know (SAT970701NN3, GODE561231GR8, CACX7605101P8, XEXX010101000), not read from SAT's specification; generic XAXX010101000 and XEXX010101000 accepted by shape. Measured blind spot: 60 of 385 single-character substitutions in the first 11 characters of a sample RFC leave the digit unchanged (character values run to 37, mod 11), so a pass is not confirmation. Open: CFDI 4.0 XML reader and SAT catalogues from the published Anexo 20 / XSD, a real PAC rejection to compare, Brazil NF-e.
- Colombia and Chile pages with NIT and RUT check digits, 2026-10-27 (`colombia-dian-e-invoice-mandate.html`, `chile-sii-e-invoice-mandate.html`, `colombia.mjs`, `chile.mjs`, 9+5+7 tests, hub counts 43 pages, widgets run in headless Chromium over http). Colombia: UBL 2.1 XML validated by DIAN before delivery, 96-character CUFE, electronic documento soporte for purchases from non-invoicers. Chile: DTE numbered from SII-authorised folios (CAF), 8 calendar days to claim before a received invoice is presumed accepted. Search excerpts of vendor blogs, law-firm notes and SII PDFs only (page fetches were blocked here; DIAN annex, the laws and the CUFE hash unread; sources disagree on CAF validity and on the Chilean mandatory-from date, flagged on the page). Check digits (Colombia: mod 11, weights 3 to 71, remainder 0 or 1 is the digit; Chile: mod 11, weights 2 to 7, 10 is K) reproduce 4 numbers each that I know, including DIAN's 800.197.268-4 and the SII's 60.805.000-0; not read from the specifications. Measured: Chile's digit never misses one wrong digit or a swap (0 of 12,667 swaps); Colombia's misses 3,015 of 162,000 single-digit errors (1.9%) because remainders 1 and 10 both give 1, so only NITs ending in 1 hide them. Open: the DIAN technical annex, the CUFE hash, the SII DTE schema; Peru (SUNAT) and Argentina.
- Japan qualified-invoice page and T-number check, 2026-10-26 (`japan-invoice-system-e-invoice-mandate.html`, `japan.mjs`, 6+8 tests, hub counts 37 pages with Turkey, widget run in headless Chromium): T plus 13 digits; the corporate-number check digit (9 minus the weighted mod-9 sum) reproduces the tax agency's own number 7000012050002 only (one sample, formula from memory of the public rule, not the specification). Mod 9 cannot see a 0/9 swap (8 of 117 single-digit typos on the sample pass); an individual's number is not a corporate number, so a mismatch is worded as maybe-a-typo. Dates (80% to 30 Sep 2026, 50% to 30 Sep 2029) are from search excerpts of vendor pages; the 2026 reform revisions (rates, cap on large purchases from one unregistered seller) are unread and not applied. Open: the agency's specification for the check digit, the registrant web-API lookup, Peppol JP PINT rules.
- Turkey mandate page, 2026-10-26 (`turkey-e-invoice-mandate.html`, 8 tests, hub counts 37 pages with Turkey): e-Fatura at TRY 3 million gross sales (TRY 500,000 in listed sectors, some categories regardless), e-Arşiv for all other invoices since the TRY 3,000 threshold went on 1 Jan 2026; UBL-TR through GİB or a licensed integrator, so the checker has no rules for it and says so. Vendor and advisory excerpts only (communiqués and GİB unread; a 2027 simplified-method date and Communiqué 535 are single-source or unread). Open: UBL-TR rules from GİB's published schematron.
- Brazil NF-e page and CNPJ/CPF check, 2026-10-26 (`brazil-nfe-e-invoice-mandate.html`, `brazil.mjs`, 6+8 tests, hub counts 41 pages, widget run in headless Chromium over http): NF-e as XML authorised by SEFAZ before goods move; alphanumeric CNPJ for new registrations (NT 2025.001, schemas NT 2026.004 v1.01, production reported 1 Jul 2026; IBS/CBS layout NT 2025.002-RTC, production reported 3 Aug 2026). Sources are web-search excerpts only (the notice sites were unreachable through the proxy; Portal da NF-e unread; test-environment dates differ; production go-live not confirmed). Check digit (value = ASCII minus 48, weights 2 to 9 from the right, mod 11) reproduces 11.222.333/0001-81, 00.000.000/0001-91, 12.ABC.345/01DE-35 and CPF 111.444.777-35 as I know them, not read from the Receita Federal specification. Measured: a digit swapped for another digit is never missed (108 and 63 cases), but allowing letters 24 and 27 of 420 single-character substitutions leave both digits unchanged. Open: NF-e 4.00 XSD reader, NFS-e, a real SEFAZ rejection.
- Peru and Argentina pages with RUC and CUIT check digits, 2026-10-27 (`peru-sunat-e-invoice-mandate.html`, `argentina-arca-e-invoice-mandate.html`, `peru.mjs`, `argentina.mjs`, hub counts 45 pages). Peru: CPE through SEE-SOL (free per SUNAT), own system or OSE; factura to a buyer with a RUC. Argentina: CAE from ARCA (ex-AFIP) gives the invoice tax value; public invoice check. Both ID rules use weights 5,4,3,2,7,6,5,4,3,2 mod 11; pinned on SUNAT's RUC and the tax authority's CUIT (plus a second CUIT); 0 of 90 single-digit errors missed on each. Search excerpts only; resolutions unread, dates and exceptions flagged unsettled on the pages.
- Uruguay page with RUT check digit, 2026-10-27 (`uruguay-dgi-e-invoice-mandate.html`, `uruguay.mjs`, 4+8 tests, hub counts 46 pages). CFE in DGI's XML format, reportedly mandatory for all VAT taxpayers (a Dec 2023 KPMG bulletin and 2026 vendor guides, search excerpts; resolutions unread, legal basis cited inconsistently). RUT check digit: weights 4,3,2,9,8,7,6,5,4,3,2 over 11 digits, 11 - mod 11 (11 read as 0, 10 treated as no digit: sources do not say what DGI does). Pinned on ONE RUT (Antel's 21-100342-001-7, from a forum thread and a vendor validator, sum checked by hand); 0 of 99 single-digit errors missed. Open: DGI's specification for the digit and for 10, the CFE XSD.
- Paraguay page with RUC check digit, 2026-10-27 (`paraguay-dnit-e-invoice-mandate.html`, `paraguay.mjs`, 4+8 tests, hub counts 47 pages). SIFEN: electronic documents in DNIT's XML, phased in by group (press: 1 Jun 2026 to 1 Sep 2027 under RG 52; State suppliers from 2 Jan 2026; sources differ on that rule's resolution). Search excerpts only; the proxy blocked every page that could give a confirmed RUC. Check digit: weights 2,3,... from the right of the base, 11 - sum mod 11 (0 when the remainder is 0 or 1), as open-source implementations describe it; pinned on a HAND-COMPUTED 80016875-5, not a registered RUC. 0 of 72 single-digit errors missed on that base. Open: DNIT's own rule and a real RUC; Ecuador next.
- Spain B2B update, 2026-10-27 (`spain-verifactu-e-invoice-mandate.html`, hub row, index line): Order HAC/1028/2026 (BOE 5 Oct 2026, in force 6 Oct): B2B e-invoicing 6 Oct 2027 above 8 million euro turnover, 6 Oct 2028 for the rest; EN 16931 UBL via the public solution; private platforms send a copy. Read from search excerpts of EY, KPMG, Seeburger, Fiscal Solutions, peppol.nu and VATupdate; BOE unread. Verifactu postponement to Oct 2028 is reported by one outlet only, not adopted on the page.
- Ecuador page with RUC and clave de acceso check digits, 2026-10-27 (`ecuador-sri-e-invoice-mandate.html`, `ecuador.mjs`, 8+8 tests, hub counts 48 pages). SRI: electronic receipts as signed XML authorised by the tax authority, each with a 49-digit clave de acceso. Search excerpts of vendor guides and libraries only; the SRI technical sheet and resolutions are unread, so no dates or penalties are stated. RUC: third digit 0-5 modulo 10, 6 modulo 11 (weights 3,2,7,6,5,4,3,2), 9 modulo 11 (4,3,2,7,6,5,4,3,2), province 01-24 or 30; a recalled company RUC (1790010937001) and cédula (1710034065) fit it, unconfirmed with the SRI. Key: modulo 11, weights 2..7 from the right, 11 to 0, 10 to 1; pinned on a hand-built key (sum 490, digit 5), recomputed in Python. Every single-digit substitution in the key changes the digit (0 of 432 missed); the RUC-in-key is also tested. Fixed a stray Paraguay link in the Uruguay hub row. Measured 2026-10-27 (ecuador.test.mjs): in a 13-digit RUC the establishment digits sit outside the check, so 26 of 117 single-digit typos pass for a company (1790016919001) and 35 of 117 for a public body (1760001550001), against 0 of 90 in a 10-digit cédula; only a register lookup catches those.
- Vietnam page with tax code (MST) check digit, 2026-10-28 (`vietnam-e-invoice-mandate.html`, `vietnam.mjs`, 4+8 tests, hub counts 49 pages; the widget ran in headless Chromium over http with no page errors). Decree 123/2020 and Circular 78/2021 (compulsory 1 Jul 2022; coded C and uncoded K invoices) and Decree 70/2025 (from 1 Jun 2025: cash-register invoices for households at VND 1 billion or more), from web-search excerpts of secondary summaries only (the authority's site was unreachable; decree texts unread; no penalty amount found, so none stated). Check digit: weights 31,29,23,19,17,13,7,5,3, 10 - sum mod 11, none when the remainder is 0; reproduces python-stdnum's published example 0100233488 (and rejects its invalid twin 0100233480), not read from the authority's specification; 12-digit citizen IDs are length-only. 0 of 81 single-digit errors missed. Also fixed the hub's Uruguay row, which had gained a stray Paraguay link. Open: the authority's own rule, a registered MST, Vietnam's XML schema.
- Indonesia page with NPWP shape check, 2026-10-30 (`indonesia-coretax-e-invoice-mandate.html`, `indonesia.mjs`, 3+8 tests, hub counts 54 pages, every country page links to it; the full venture suite passes). Faktur pajak issued and approved in Coretax since 1 Jan 2025 (PMK 81/2024); NPWP 16 digits (NIK for citizens, 0 + old 15 digits for entities) from the tax authority's own article, as a search excerpt. pajak.go.id, DDTC and fiscal-requirements.com did not resolve from the cloud runner, so everything is from search excerpts; the PMK text is unread. Sources disagree on the 17-digit serial number, the upload deadline and the large-taxpayer transition; no penalty amount found, none stated. No check digit is claimed (none found), so the widget tests length only. Open: the PMK text, DJP's Coretax XML schema, a real NPWP check rule.

## How often a check digit misses a typo (2026-10-27)

`node eval/id-blindspots.mjs [N] [seed]` takes N seeded random IDs that pass each validator (Mexico RFC, Colombia NIT, Chile RUT, Brazil CNPJ plain and alphanumeric, Peru RUC, Argentina CUIT, Japan T-number), then tries every single-character substitution and every adjacent swap of two different characters. At 2,000 IDs per seed (seeds 7, 99, 12345), share of mistyped IDs that still pass: Chile 0% and Argentina 0% (substitution and swap); Brazil CNPJ 0.03 to 0.04% (swap 0.11 to 0.15%); Peru 1.3 to 1.4% (swap 1.7 to 2.0%); Colombia 1.4 to 1.8% (swap 1.5 to 2.1%); Japan 2.0 to 2.1% (swap 2.0 to 2.2%); Brazil alphanumeric CNPJ 5.9% (swap 5.7 to 6.1%); Mexico RFC 14.5% of substitutions (swaps 0%, the shape check catches them). Mexico's rate is stable across seeds because the name and homoclave letters take values up to 37 under mod 11. Synthetic IDs on rules pinned to a few known numbers, not read from the authorities' specifications; it says nothing about how often real people mistype. Test: `id-blindspots.test.mjs`. A pass is never confirmation that a number is registered.

## India INV-01 payload check (2026-10-30)

`india-inv01.mjs` (`checkInv01`, 4 tests) pre-checks an IRP INV-01 (version 1.1) JSON payload and names the field for each fault: required blocks, GSTIN shape and check character on seller and buyer, six-digit PIN, DD/MM/YYYY date, HSN length, GST slab, IGST versus CGST+SGST from seller state against place of supply, line arithmetic (Qty x UnitPrice, discount, tax, TotItemVal) and the ValDtls totals, with a one-rupee rounding tolerance. Field names, the slab list and the tolerance are from memory of the public schema and secondary guides; the IRP specification and JSON schema were not read, and no real IRP payload or rejection was run. Tests use a made-up consistent invoice. CLI (2026-10-30): `node india-cli.mjs payload.json [--json]` (exit 0 clean, 1 findings, 2 usage; examples `examples/india-inv01.json` and `-with-defects.json`, made up, tested in `india-inv01.test.mjs`). Page card (2026-10-30): the India page has a paste box that runs `checkInv01` in the browser (nothing sent); run in headless Chromium on both examples, clean and defective. Open: a real IRP sandbox payload, export/SEZ and e-way-bill blocks.

**Turkey (2026-10-30).** The Turkey page tests a VKN (10 digits) or TCKN (11 digits) by length and check digits (`turkey.mjs`). Rules are the widely published ones from open-source validators, not GİB's text; a pass is not a registry lookup. Wanted: a real VKN from a GİB-issued e-Fatura to confirm.

## Branded audit pack (built dark, 2026-11-03)

The monetization plan (`portfolio/monetization/models.yaml`) says checking a
document is a commodity (about $4 per 1,000 on API marketplaces, plus free
official validators), so checks are never charged for. What an accountant or
finance team lacks is the dated record of what was checked before sending.
`auditpack.mjs` turns a batch run (`preflightDocuments()` output) into one
printable document on their own letterhead: logo, name, contact, a verdict, a
row per file, findings grouped by rule with the fix, the findings per file,
unreadable files, their notes, and a fixed statement that a PASS is not a
declaration of legal validity. Typed text, file names and findings are
escaped; the logo is accepted only as a raster data: URL; the accent only as
`#rrggbb`.

It sits behind the same licence-key check as the sibling ventures' packs
(`licence.mjs`, `checkout.mjs`). `CHECKOUT_URL` is empty, so the card on
`index.html` stays hidden and nothing can be bought; `python3
portfolio/monetization/golive.py` sets the link once the owner has made the
merchant-of-record product. The validate call is written from memory of the
provider's docs and not run against a live product. Checked 2026-11-03:
`node --test auditpack.test.mjs` (5 tests, including that the committed
`sample-audit-pack.html` equals what `node build-sample-pack.mjs` makes), and
a headless-browser run with a stubbed checkout link and licence answer: card
shown, key accepted, pack opened with the typed title escaped, no console
errors. Marketing page: `audit-pack-for-accountants.html`.

## ISDOC detection (2026-11-03)

`looksLikeIsdoc` (`report.mjs`) matches the `http://isdoc.cz/namespace/2013` namespace; `preflightDocuments` then gives a read error naming the format and the fix instead of "UBL field TaxAmount is missing". `isdoc.test.mjs`, 3 tests, on a made-up stub; `report.test.mjs` and `page.test.mjs` still pass. The namespace string is from memory of the public ISDOC schema, not read here (cz hosts unreachable from the cloud runner). Open: an ISDOC reader and a real file.

**Update 2026-11-03 (later):** `isdoc.mjs` now reads ISDOC best-effort instead of only refusing it: header, parties, lines and totals map into the neutral invoice shape, so the arithmetic, date and VAT-shape checks run; the report's envelope says "best-effort, unverified". Element names are from memory of the public ISDOC 6.x schema, no real ISDOC file or the XSD was read (cz hosts unreachable), no Czech national rules, no payment block. `isdoc.test.mjs` (made-up file, one good and one wrong-total case, a non-ISDOC root falls back to the old message). A full-suite run has one failure that also fails on a clean checkout: "every other country page links to the Hungary page and back". Open: a real ISDOC file to confirm element names and the credit-note/document-type codes.
- Slovenia primary-source read, 2026-11-07 (`slovenia-e-invoice-mandate.html`, test tightened): uradni-list.si answered, so the ZIERDED text in Uradni list RS 85/2025 (item 3032) was read from the gazette PDF. Corrects the page: Article 28(1) applies the law from 1 Jan 2028 but Chapter 4 (e-route providers) from 1 Apr 2027, so the earlier "1 Apr 2027 not supported" note was wrong; Article 26 sets the provider list for 1 Oct 2027; Article 24 fines 1,000 to 3,000 euros (company), 500 to 1,500 (sole trader), 100 to 500 (responsible person), Article 25 consumer-invoice fines 500 to 1,500; no invoice-data reporting duty found. Implementing regulations (due within 12 months) and fu.gov.si pages still unread.
- Estonia primary-source read, 2026-11-07 (`estonia-e-invoice-mandate.html`): riigiteataja.ee is a JavaScript app, so the Accounting Act (Raamatupidamise seadus) was rendered in headless Chromium and read in Estonian. § 7¹ (3): the register is the commercial register (äriregister), not an "e-business register"; (7): a registered recipient may demand an e-invoice from the seller, EN 16931-1 is presumed proper, parties may agree another standard; (8) exceptions (security agencies, state secrets, professional secrecy); no penalty in the section; the 2024 amendment is RT I, 10.10.2024, 1, in force 1 Jul 2025. No 2027 e-invoice date is in the Act (the one 2027 date is large-company reporting), so the page now calls 2027 a policy target. Unread: the 2019 public-sector duty's basis beyond the transitional section, and any bill for a B2B mandate.

- Mexico RFC in the party VAT check, 2026-11-08 (`vat.mjs`, `vat.test.mjs`): an `MX`-prefixed identifier now runs `checkRfc` from `mexico.mjs` (shape, YYMMDD, mod-11 digit; generic XAXX/XEXX accepted), so a mistyped RFC raises INV-023 and a malformed one INV-022. The normaliser keeps `&` and `Ñ` only after an MX prefix. Same limits as the Mexico page: the digit rule is pinned to four RFCs I know, SAT's text unread, and 14.5% of single-character substitutions still pass (eval/id-blindspots.mjs).
- Ukraine EDRPOU check digit, 2026-11-09 (`vat.mjs` `uaEdrpouOk`, 1 test, 5 well-known published EDRPOUs pass and a one-digit change fails): weights 1..7 (7,1..6 for 30000000-60000000) mod 11, a remainder of 10 retries with weights plus 2, a second 10 means 0. Rule from memory of the public algorithm; tax service text unread. Ten-digit RNOKPP (sole traders) is shape-checked only. Open: the RNOKPP check, the ERPN tax-invoice rules.
- Guatemala NIT check character, 2026-11-09 (`vat.mjs` `gtNitOk`, 1 test): a `GT`-prefixed identifier now gets INV-022 for a bad shape and INV-023 for a wrong check character (weights n+1..2 over the base, check = (11 - s mod 11) mod 11, K for 10). Pinned on hand-computed numbers, not registered NITs; rule from open-source validators, SAT text unread (host unreachable). Open: a real NIT, and the FEL document rules.
- Dominican Republic RNC/cedula and Venezuela RIF check digits, 2026-11-09 (`vat.mjs` `doTaxIdOk`, `veRifOk`, 1 test): a `DO` id of 9 digits gets the RNC check (weights 7,9,8,6,5,4,3,2; 22 real RNCs that predate the rule are accepted), 11 digits the cedula Luhn test; a `VE` id (V, E, J, P or G, 8 digits, check digit) gets the SENIAT weights. INV-022 for shape, INV-023 for a wrong check. Checked against python-stdnum 2.2 on 900 seeded numbers (88 valid, all verdicts equal; 120 pinned in the test); rule source only, DGII and SENIAT text unread. Open: a real e-CF with RNC and a real Venezuelan invoice.
- Moldova IDNO check digit, 2026-11-09 (`vat.mjs` `mdIdnoOk`, `vat.test.mjs`): an `MD` id of 13 digits now gets INV-023 when the last digit is not the first twelve weighted 7,3,1 repeating, summed, mod 10; other lengths INV-022. Checked against python-stdnum 2.2 `md.idno` on 500 random numbers (46 valid, all verdicts equal; 3 pinned). Rule source only, State Tax Service text unread. Open: a real IDNO from an e-Factura file.
- Taiwan page MIG timing, 2026-11-10 (`taiwan-gui-e-invoice-mandate.html`): the "sources differ on MIG 4.0" line now says what the Ministry of Finance Turnkey manual v3.9 (Feb 2025) is reported to say: MIG 3.2.1 and 3.1.2 retired, MIG 4.1 fully used from 1 January 2026; MIG 4.0 acceptance after that is not stated. Read from a search summary of the manual, the PDF was not opened (einvoice.nat.gov.tw is not reachable from cloud runs). The Oman page's 1 April / 1 October 2027 dates were re-checked against search summaries of KPMG, Comarch, Sovos and Oman Observer pieces: they agree on the dates, but one says the Gazette text was not on the portal and the Tax Authority FAQ still shows the older four-phase schedule, which the page already says. No rules changed; page tests pass (8).
- Taiwan GUI and Thailand TIN check digits, 2026-11-09 (`vat.mjs` `twGuiOk`, `thTinOk`, 1 test): `TW` (8 digits, weights 1,2,1,2,1,2,4,1, digit sums, multiple of 5, with the seventh-digit-7 allowance) and `TH` (13 digits, weights 13..2, check = (11 - s mod 11) mod 10) party VAT ids now get INV-022 for a bad shape and INV-023 for a wrong check digit. Thai example 0105536112014 and Taiwan 04595257 are the shapes the open-source validators use; the Ministry of Finance and Revenue Department texts were not read. Open: a real GUI and TIN from an issued invoice.
- UAE TRN shape in the party VAT check, 2026-11-09 (`vat.mjs`, `vat.test.mjs`): an `AE`-prefixed identifier must be 15 digits, else INV-022. Shape only: no public check digit is known, so a typo that keeps 15 digits passes. FTA text unread; 1 test on made-up numbers.
- Singapore GST/UEN and Philippines TIN shapes in the party VAT check, 2026-11-09 (`vat.mjs`, `vat.test.mjs`): an `SG` identifier must match a GST number or UEN shape, a `PH` one 9 or 12 digits, else INV-022. Shape only, no check digit; IRAS and BIR text unread; tests on made-up numbers.
- Malaysia LHDN TIN shape in the party VAT check, 2026-11-09 (`vat.mjs`, `vat.test.mjs`): an `MY` identifier must be a known prefix (C, IG, OG, SG, D, F, PT, TA, TC, TN, TR, TP, J, LE, CS) and 8 to 11 digits, else INV-022. Shape only; LHDN text unread; tests on made-up numbers.
- Tax-id shape checks for MA (ICE, 15 digits), AZ (VOEN, 10), UZ (INN, 9), MD (IDNO, 13), GE (9 or 11), AM (8), TZ (9), UG (10), ZM (10) and RW (9), 2026-11-09 (`vat.mjs`, `vat.test.mjs`): a wrong length or a letter is INV-022. Shape only; authority texts unread; tests on made-up numbers.
- Russia INN, Canada BN and Dominican RNC check digits, 2026-11-09 (`vat.mjs` `ruInnOk`, `doRncOk`, Luhn for the BN's first nine digits; `vat.test.mjs`, 1 test): an `RU` id of 10 or 12 digits gets INV-023 when the control digit(s) fail (7707083893 and 500100732259 pass, a last-digit change fails); `CA` accepts nine digits with an optional `RT0001`-style program account and Luhn-checks the nine; `DO` is nine digits, weights 7,9,8,6,5,4,3,2. Rules from memory of the public algorithms; CRA, FNS and DGII texts unread, so only the Russian pair are known real numbers. Open: a real invoice from each country.
- Tunisia MF shape in the party VAT check, 2026-11-09 (`vat.mjs` `tnMfShapeOk`, `vat.test.mjs`): a `TN` identifier must be 7 digits and a control letter (not I, O or U), optionally followed by a VAT code (A, P, B, D, N), a category code (M, P, C, N, E) and a 3-digit branch number that is 000 unless the category is E, else INV-022. Structure from python-stdnum `tn.mf`; the control letter's own rule is not published there, so it is not checked, and the Tunisian tax text is unread. Not tested on a real MF.
- Morocco ICE, Montenegro PIB and North Macedonia EDB check digits, 2026-11-10 (`vat.mjs` `maIceOk`, `mePibOk`, `mkEdbOk`, `vat.test.mjs`): wrong control digit INV-023, wrong shape INV-022. Rules from python-stdnum 2.2; 3,000 random numbers per country agree with it (9,000 verdicts, 597 valid, 0 mismatches), docstring vectors pinned. Authority texts unread. Ukraine's RNOKPP check landed 2026-11-10 too.
- Senegal NINEA, Ghana TIN, El Salvador NIT check digits and Algeria NIF shape, 2026-11-10 (`vat.mjs` `snNineaOk`, `ghTinOk`, `svNitOk`, `vat.test.mjs`): wrong control digit INV-023, wrong shape INV-022 (these countries were unknown before). Rules from python-stdnum 2.2; 21,000 random numbers agree (0 mismatches). Authority texts unread. Full-suite run: one unrelated failure, the Hungary page does not link the Ethiopia page, fails on main too.
- Mozambique NUIT check digit and Costa Rica tax-id shape, 2026-11-10 (`vat.mjs` `mzNuitOk`, `vat.test.mjs`): `MZ` 9 digits with weights 8,9,4,5,6,7,8,9 mod 11 gets INV-023 on a wrong check digit; `CR` 9 to 12 digits, else INV-022 (shape only). Rules from python-stdnum 2.2; 4,000 random NUITs agree (0 mismatches). Authority texts unread.
- Singapore UEN check letters, 2026-11-10 (`vat.mjs` `sgUenOk`, `vat.test.mjs`): the three UEN forms (8 digits + letter, 9 digits + letter, R/S/T + 2 digits + entity type + 4 digits + letter) get INV-023 when the check letter fails; GST numbers starting with M stay shape-only. Rules from python-stdnum `sg.uen`; 3,000 random UENs agree with it (119 valid, 0 mismatches); ACRA's text unread. The old test's made-up `SG200812345K` was not a valid UEN and was replaced with the library's documented examples. Full venture suite: 1,324 pass, 1 fails (Hungary page cross-link test, fails the same on the untouched tree, not looked into).
- Andorra NRT, Guinea NIFp, Liechtenstein PEID and San Marino COE, 2026-11-10 (`vat.mjs` `adNrtShapeOk`, `vat.test.mjs`): Guinea gets INV-023 on a failed Luhn digit; Andorra checks letter, six digits, letter and the published component ranges (control letter unchecked); Liechtenstein and San Marino are shape only; wrong shape INV-022 (these were unknown before). Rules from python-stdnum 2.2; 3,000 random Guinea numbers agree (326 valid, 0 mismatches). Authority texts unread.
- Hungary page cross-link fix, 2026-11-10: the Hungary mandate page now links the Ethiopia page, so the long-reported failing cross-link test passes; full suite 1,326 pass, 0 fail.
- Faroe Islands V-number shape, 2026-11-10 (`vat.mjs`, `vat.test.mjs`): `FO` plus 6 digits, else INV-022. Rule from python-stdnum 2.2 `fo.vn`.
- Half-cent VAT rounding fix and generated-XML fuzz, 2026-11-10 (`eval/generated-xml-fuzz.mjs`, `checks.mjs`, `breakdown.mjs`, `linenet.mjs`, `adjustment.mjs`, 2 tests): `x * 100 + Number.EPSILON` rounded 0.285 (1.50 at 19%) down, so INV-038 and INV-018 rejected correct invoices when a rate group's VAT fell on a half cent (7 of 20,000 single-line amounts per sweep, ~1 in 150 random drafts). Rounding now goes through `toPrecision(12)`. After: 0 findings on 1,500 random generated drafts (3 seeds, UBL and CII), +1.00 on gross and due caught every time. Not fixed: `repair-ubl.mjs`, `fa3.mjs`, `fatturapa.mjs` use plain `Math.round(n * 100)`. Made-up invoices only.

## VAT differential vs python-stdnum (2026-11-10, 2026-11-11)

`python3 eval/vat-differential.py | node eval/vat-differential.mjs` draws random numbers python-stdnum accepts per country and lists those `vat.mjs` flags (false rejects); `eval/vat-differential-reverse.{py,mjs}` does the reverse (numbers `vat.mjs` passes that stdnum rejects). Needs `pip install python-stdnum` (2.2 used); stdnum is an oracle, no authority text was read. 2026-11-11 results: the false-accept direction found letters passing in the digit-only shape-only countries (BG, CZ, EE, EL, HR, HU, LT, LV, MT, RO, SI, SK, XI; e.g. CZA97957793, 8,000 of 19,587 random CZ strings) and a leading 0 in DK and PT numbers; fixed in both ports (Cyprus stays eight digits and a letter). Remaining differences are deliberate or unproven: EE not starting 1 and SK third digit outside 2,3,4,7,8,9 are flagged where stdnum is lenient (stdnum also accepts a Slovak birth number); ES P/Q/R/S/N/W take a letter control (stdnum accepts either); CO needs 8 to 10 digits before the check digit (stdnum takes 7); EL with 8 digits (stdnum pads a zero). **Prefix rules closed (2026-11-10 run, same oracle, no authority text read):** BE 10-digit numbers must start 0 or 1; IT office code (digits 8-10) 001-100, 120, 121, 888 or 999 and a non-zero first seven; RO leading zero rejected; CZ 9-digit birth numbers (before 1954) need a real date and a year no later than 1953; LV natural-person numbers (first digit 0-3) need a real ddmmyy plus century digit and the personal-code check digit, `32...` codes only the check digit (that check digit is unconfirmed even in stdnum). Reverse run, 20,000 per country: BE, CZ, IT, LV, RO now 0 stdnum-invalid numbers pass; forward run still finds no false rejects beyond the deliberate list above. FR letter keys are closed (see below). TR rare cases settled (2026-11-10 run): of 18,973 random 10 or 11 digit strings that stdnum's `tr.vat` (VKN only) rejects, 84 pass here and all 84 are 11 digits satisfying the T.C. Kimlik check (individuals trade under their TCKN, which stdnum's VAT module does not cover); no 10-digit VKN differs either way, 0 false rejects. Deliberate; no GIB text read.

## French TVA letter keys and SIREN Luhn (2026-11-12)

`vat.mjs` `frOk` and the Python port `_fr` now accept the letter-key form of French TVA numbers (alphabet without I and O; digit+letter and letter+digit formulas) and check the SIREN's Luhn digit unless it starts 000 (Monaco). Before, any letter key passed unchecked, 2,379 of 19,980 random FR strings passed where python-stdnum 2.2 rejected. `eval/vat-differential-fr.{py,mjs}`: 39,986 random numbers (5,506 valid per stdnum), 0 false rejects, 0 false accepts (keys starting `FR` are skipped: stdnum strips a leading FR twice). Tests: `vat.test.mjs`, `tests/test_vat.py`; venture suite 1,348 pass. Authority text unread. Note: the half-cent rounding gap listed above for `repair-*`, `fa3`, `fatturapa` was already closed (they use `roundHalfUpToCents`). TR rare cases: deliberate TCKN acceptance, see above.

## IBAN structure and national check digits vs python-stdnum (2026-11-10)

`iban.mjs` only checked length and mod-97. `eval/iban-differential.py 7 300 | node eval/iban-differential.mjs` (python-stdnum 2.2 as oracle, no SWIFT text read) draws IBANs for all 89 registry countries: 27,001 stdnum-valid ones all passed, but **26,399 of 26,399 stdnum-invalid ones with the right length and a correct mod-97 also passed** (letters where digits belong, etc.), and 15 registry countries (BI, DJ, FK, HN, MN, NI, OM, RU, SC, SD, SO, ST, SV, TL, YE) were unknown. Now `BBAN_FORMATS` carries the registry's per-country structure (wrong structure is INV-024), the 15 countries are known, and BE, ES, ME, NO national check digits fail as INV-025. Re-run, seeds 7 and 11, 400 per kind: 0 false rejects, 1 false accept in 70,000 (BE: stdnum also requires the bank code to be in its Belgian bank list, which we do not carry). Tests in `iban.test.mjs`; venture suite 1,349 pass, 0 fail.

## Malawi and Namibia pages (2026-11-10)

`malawi-mra-eis-e-invoice-mandate.html` and `namibia-namra-e-invoice-mandate.html` (2 test files), wired into the hub table (93 rows), index, sitemap, Hungary cross-links and `mandate-dates.json`/`.ics` (regenerated). Written from web-search summaries only (Edicom, Shared Services Link, VATupdate, e-invoice.app, KPMG, Comarch); no MRA, NamRA or Ministry notice read. Malawi's mandatory date is shown as disputed (1 May 2026 vs 1 Feb 2026); Namibia is `Planned, no binding date`. Open: the MRA public notices of 4 Nov 2025 and 30 Jan 2026, and any 2026 MRA notice settling the date. Venture suite: 1,365 pass, 0 fail.

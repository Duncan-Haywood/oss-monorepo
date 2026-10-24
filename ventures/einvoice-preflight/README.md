# E-invoice preflight

**Validate a structured invoice before submission.** After using this, you can
now see which fields, totals, VAT digits, or payment instructions would fail a
local preflight — in the browser or in CI — which used to mean waiting for a
network rejection. Open `index.html` and drop a JSON, UBL, CII, or Factur-X
PDF file, or run the CLI below. The page never uploads the invoice.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/einvoice-preflight/

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

**XRechnung profile (Germany).** Tick "Also apply the German XRechnung rules"
on the page, or call the API with `POST /v1/validate?profile=xrechnung`, to add
nine `XR-001`..`XR-009` rules that mirror the BR-DE business rules a German
public buyer's portal enforces: buyer reference (BT-10), Leitweg-ID check
digits (ISO 7064 MOD 97-10, verified against published samples), payment
instructions, seller contact, seller and buyer city and postcode, invoice type
code, the XRechnung 3.x specification identifier, and a seller tax identifier.
Off by default. JS (page and API) only; the Python CLI does not apply it yet.
It is an offline observation, not the KoSIT validator.

**Peppol profile.** Tick "Also apply the Peppol BIS Billing 3.0 rules" on the
page, or call `POST /v1/validate?profile=peppol`, to add five `PP-001`..`PP-005`
rules that mirror what a Peppol access point rejects: the business process
(BT-23, R001), the Peppol 3.0 specification identifier (R004), seller and buyer
electronic addresses (R020, R010) and a buyer or order reference (R003). Off by
default, JS only, and an offline observation, not the OpenPeppol Schematron.
The UN/CEFACT CII reader now also captures the party electronic address.

**France profile.** Tick "Also apply the French rules" on the page, or call
`POST /v1/validate?profile=france`, to add seven `FR-001`..`FR-007` rules for
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

**Italy: FatturaPA (new).** An XML file whose root is `FatturaElettronica` (FPR12 business, FPA12 public body) is not EN 16931, so it is read by `fatturapa.mjs` with its own rules `IT-001`..`IT-018`: partita IVA (Luhn) and codice fiscale check digits, SdI destination code length, TipoDocumento, RegimeFiscale and Natura codes, 0% lines needing a Natura, line / VAT-summary / document-total arithmetic to the cent, payment IBAN, and element order inside the main blocks (`IT-018`, the sequence SdI's schema demands; written from memory of the XSD, unchecked against the file). Rule ids are this tool's own, not SdI error codes; the one-cent tolerance and the code lists are assumptions to check against the current Agenzia delle Entrate technical specification (the official site was not reachable when this was written). When a cassa, bollo, withholding, rounding or document discount is present the totals checks are skipped and named in `skipped`, never reported as a pass. Not checked: the full XSD, the signature, duplicate numbers, SdI acceptance. `examples/fatturapa-invoice.xml` is clean; `examples/fatturapa-invoice-with-defects.xml` is the same invoice with six planted faults that raise eight rules (IT-002, 003, 006, 011, 012, 014, 015, 016), pinned in `fatturapa.test.mjs`.

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
is English. `examples/xrechnung-cii-invoice.xml`, `examples/xrechnung-cii-credit-note.xml` (CII credit note, type 381, with its BT-25 invoice reference) and `examples/peppol-credit-note.xml` (Peppol BIS 3 UBL credit note) pass the official rules (the CII ones with one information-level note, BR-DE-TMP-32) and are pinned by tests. `examples/ubl-credit-note-with-defects.xml` is a credit note with six faults (a 380 type code, no buyer reference, a VAT total that disagrees with its subtotal, a German seller without a contact); the official rules report BR-CL-01, BR-CO-14, BR-CO-15, DE-R-015, PEPPOL-EN16931-P0101 and PEPPOL-EN16931-R003, each with a specific English fix, pinned by tests. `examples/xrechnung-cii-credit-note-with-defects.xml` is the clean CII credit note with four faults (no buyer reference, no seller contact, a VAT amount that is not 19% of its basis, a type code outside UNTDID 1001); the official EN 16931 and XRechnung rules report BR-CL-01, BR-CO-14, BR-CO-17, BR-DE-15, BR-DE-17, BR-DE-2, BR-DE-TMP-32 and BR-S-09, each with a specific English fix, pinned by tests. `examples/peppol-nl-credit-note.xml` (a Dutch Peppol credit note, KVK identifiers) passes; `examples/peppol-nl-credit-note-with-defects.xml` drops the invoice reference, the seller's street and the KVK scheme, and the official rules report NL-R-001, NL-R-002 and NL-R-003, each with an English fix (all nine Peppol NL-R rules now have one; pinned by tests). Building it also showed the endpoint check rejected scheme 0106 (the Dutch KVK number, a registered EAS code), a false INV-039 on Dutch KVK endpoints; it is accepted now (JS and Python). The NLCIUS rules themselves are still not run: the official source could not be reached from the build environment. Peppol also applies its German `DE-R-nnn` rules to a domestic German invoice (seller contact, buyer post code, payment groups); each has an English fix.

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

**Peppol PINT: Singapore InvoiceNow and Australia/New Zealand (shipped 2026-10-23).** A UBL file whose BT-24 names `...billing:international:sg:3.0`, `...billing:international:aunz:3.0` or the A-NZ self-billing id is checked by that profile's own rules *instead of* the EU base and the Peppol BIS add-on, because PINT uses GST category codes (SR, ZR, NG...) that the EU base rejects (before this, an SG invoice drew a false `PEPPOL-EN16931-R004`/category finding). Singapore runs three sets (the CEN subset with GST amounts, the Peppol subset, the SG GST rules, 931 checks), A-NZ two (958 checks, including the ABN rules AUNZ-R-004 and PEPPOL-COMMON-R050). OpenPeppol publishes these only as Schematron already compiled to XSLT, and GitHub is not reachable from every build host, so `build-pint-rules.mjs` takes the XSLT from the `phive-rules-peppol` artefact on Maven Central (set `EINVOICE_PINT_JAR` to use a jar on disk) and `plain-from-xslt.mjs` reads the generator's fixed XSLT shape back into the same plain JSON (rules, rule order, lets, `xsl:param` roots, XQuery functions). It throws on any template shape it does not know rather than dropping a rule. Fidelity check: the same reader on OpenPeppol's own BIS XSLT yields 55 checks, every id also in the `.sch`-compiled Peppol set, and on the EN 16931 XSLT 979 checks against 982 (the XSLT is a newer release: it adds BR-CO-25, BR-66, BR-67, UBL-CR-631 and drops UBL-SR-53..59). Verification (`pint.test.mjs`, 6 tests, made-up invoices in `examples/pint-sg-invoice.xml`, `pint-sg-invoice-with-defects.xml`, `pint-aunz-invoice.xml`): both clean files pass with no skipped rule; the SG defect file raises BR-109-GST-SG, BR-NG-08/09/12-GST-SG and BR-CO-17-GST-SG; a missing buyer ABN raises AUNZ-R-004 and a wrong check digit PEPPOL-COMMON-R050; ordinary Peppol BIS files still get the EU base. Not done: the Saxon route and the server API still run the EU base on a PINT file (the browser/plain route is the one fixed); CII has no PINT form; no real InvoiceNow or Peppol A-NZ invoice or an access point's verdict has been tried, only the rule sets as published (versions: SG 2026.6, A-NZ 1.0.12); the Japan and Malaysia PINT sets are not in that artefact. The same Maven artefacts also hold RO_CIUS (`phive-rules-cius-ro`) and the Dutch NLCIUS XSDs (`phive-rules-energieefactuur`), the open items below, readable with this same tool next.

**Romania RO e-Factura national rules, CIUS-RO (shipped 2026-10-24).** A UBL file whose BT-24 names `CIUS-RO` now also gets Romania's 122 national rules (v1.0.9 from `phive-rules-cius-ro` on Maven Central) after the EU base, in the browser and on the Node plain route: date format `YYYY-MM-DD`, an invoice number with a digit, the profile id, RON as the VAT accounting currency, `SECTOR1..6` city and `RO-xx` county codes, address and tax-id presence, two-decimal amounts and the length caps. It is an add-on (`ADDONS["cius-ro"]`), not a replacement like PINT, because the national file only adds to EN 16931. The messages are bilingual in the source (`Romanian #English`); the English half is shown, each rule has an English fix. `build-ro-rules.mjs` rebuilds `plain/cius-ro-ubl.json` (set `EINVOICE_RO_JAR` for a jar on disk). Verification (`cius-ro.test.mjs`, 5 tests; made-up invoices `examples/ro-invoice.xml` and `ro-invoice-with-defects.xml`): the clean RON invoice passes both sets with no skipped rule; the defect file raises BR-RO-001, -010, -030, -110 and -DT001; removing the buyer street raises BR-RO-082. Not done: the Saxon route and server API do not run it (no `.sef.json` built); the bundled `EN16931-CIUS_RO` XSLT (EN rules with RO changes) is not used; no real invoice from a Romanian ERP and no ANAF SPV verdict has been tried, so false positives or gaps against ANAF's live validator are unmeasured.

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
or `10` (cash). An empty or undocumented code is `INV-044`. A credit
transfer, SEPA transfer, or direct debit without a complete IBAN is
`INV-045`. Cash, cheque, or card together with a complete IBAN is
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

`payment.bic` is optional. When supplied, it must be an 8- or 11-character
ISO 9362 identifier (four letters, a two-letter country, a two-character
location, and an optional three-character branch). A value that is not
that shape is `INV-026`. When both a complete IBAN and a complete BIC are
present, a country mismatch is `INV-027`. Messages never repeat the BIC
or the account number. This is a typo catch, not a SWIFT directory lookup
and not a determination that the institution will accept the payment. UBL
`PayeeFinancialAccount/FinancialInstitutionBranch/ID` (or the nested
`FinancialInstitution/ID`) maps into `payment.bic`.

`payment.remittance` is the text the buyer should quote on the transfer.
When a complete IBAN is present and remittance is missing, that is
`INV-030` — an unmatched SEPA credit is how paid invoices sit in
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

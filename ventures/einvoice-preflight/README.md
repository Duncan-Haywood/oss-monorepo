# E-invoice preflight

**Catch the defect before the receiver does.** Point this at the UBL or CII
invoice your ERP just produced and it tells you, in plain language, which
numbers contradict each other and what each one should be — before you submit
it and wait a day for a rejection that says `BR-CO-15`.

It runs entirely on your machine. No upload, no account, no API key, no
network call of any kind.

```sh
cd ventures/einvoice-preflight
PYTHONPATH=src python3 -m einvoice_preflight examples/ubl-invoice-with-defects.xml
```

```
Read ubl-invoice-with-defects.xml as UBL 2.1 XML.

Preflight failed: 4 defect(s) that contradict the document itself.
[INV-030 (BT-9)] Payment due date 2026-08-01 is before the issue date 2026-08-24.
    Fix: Correct the due date, or the issue date if that is the one that is wrong.
[INV-020 (BR-CO-15)] Tax-inclusive amount 380.00 does not equal the tax-exclusive amount plus VAT (386.60).
    Fix: Set the tax-inclusive amount to 386.60 or correct the VAT total.
[INV-024 (BR-S-09)] VAT group S at 19% states VAT of 36.10 on a taxable amount of 200.00, but the rate gives 38.00.
    Fix: Set the group's VAT amount to 38.00, or correct its taxable amount or rate.
[INV-023 (BR-S-08)] VAT group S at 19% states a taxable amount of 200.00, but the
    lines and document-level adjustments in that group total 190.00.
    Fix: Set the group's taxable amount to 190.00, or correct the lines assigned to it.

2 warning(s) — legal under EN 16931, but a common reason a submission bounces
at a national or Peppol profile:
[INV-027 (BT-10)] No buyer reference is present.
    Fix: Add the buyer reference (Leitweg-ID for German public bodies). XRechnung
    requires it, and receivers that enforce it reject the invoice outright.
```

## What it reads

Point it at the file itself; the format is detected from the content, not the
extension.

| Input | What produces it |
| --- | --- |
| **UBL 2.1** `Invoice` / `CreditNote` | Peppol BIS Billing 3.0, XRechnung UBL |
| **UN/CEFACT** `CrossIndustryInvoice` | XRechnung CII, the XML inside a Factur-X / ZUGFeRD PDF |
| **Preflight JSON** | this tool's own small shape, for adapters and tests |

Both XML syntaxes express the same EN 16931 semantics under different element
names, so a rule is written once and applies to either. The JSON shape is
documented under [Input shape](#input-shape) below and is still supported.

## What it checks

**Errors** are internal contradictions — the document disagrees with itself, a
receiver's validator will reject it, and no judgement call is involved:

- Line net against quantity × unit price, allowing for a price quoted per base
  quantity (BT-149) and for the line's own discounts and surcharges.
- Line total against the sum of the lines (BR-CO-10).
- Tax-exclusive amount against the line total less allowances plus charges
  (BR-CO-13), and each stated allowance/charge total against its own entries.
- Tax-inclusive amount against tax-exclusive plus VAT (BR-CO-15).
- Amount due against tax-inclusive less prepaid plus rounding (BR-CO-16).
- VAT total against the sum of the breakdown groups (BR-CO-14).
- Each VAT group's taxable amount against the lines and document-level
  adjustments coded to it (BR-S-08), and its VAT against its own rate
  (BR-S-09), with one cent of slack for per-line rounding.
- VAT category codes against their rates — `E`, `Z`, `AE`, `K`, `G` and `O`
  must be zero-rated; `S` must not be.
- Invoice number, ISO issue date, three-letter currency, party names, at least
  one line, and a due date that is not before the issue date.

**Warnings** are legal under EN 16931 but are the most common reason a real
submission bounces at a national or Peppol profile. They are reported and do
not fail the run unless you pass `--strict`:

- No buyer reference (BT-10). XRechnung requires it; receivers that enforce it
  reject rather than query.
- Standard-rate VAT charged with no seller VAT identifier (BT-31).
- An untaxed VAT group with no exemption reason (BT-120/BT-121).
- Credit transfer as the payment means with no account to pay into (BT-84).
- A line with no VAT category code, and a missing party identifier.

These checks that ask "is this present" run only on real e-invoice XML. The
hand-written JSON shape claims no profile, so holding it to XRechnung's
requirements would be reporting a defect against a standard its author never
invoked.

## What it deliberately does not do

This is a preflight observation, not a declaration that an invoice is valid or
compliant — the distinction matters, so it is worth being exact about:

- It **does not submit** anything, contact a tax authority, or touch the
  network. There is no endpoint in the code.
- It **does not choose a tax rate** or decide whether the rate you used is the
  legally correct one. It checks the arithmetic for the rate you supplied.
- It **does not validate against the official schema or Schematron**. A
  document can pass every check here and still be rejected for a rule this
  tool does not implement. Run the format's own validator as well.
- It **does not open anything the invoice points at.** Document type
  declarations are refused outright, so no local file or remote URL named in
  an invoice is ever read.

## Options

```sh
PYTHONPATH=src python3 -m einvoice_preflight INVOICE [--format text|json|sarif] [--strict] [--usage-file PATH]
```

`--format json` emits a machine-readable report for an ERP adapter:

```json
{
  "status": "fail",
  "syntax": "ubl",
  "profile": "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0",
  "counts": {"errors": 4, "warnings": 2},
  "errors": [{"rule": "INV-020", "severity": "error", "reference": "BR-CO-15", "message": "...", "fix": "..."}],
  "warnings": [...]
}
```

`--format sarif` emits SARIF 2.1.0 for GitHub code scanning, CI annotations,
and editor integrations. It includes rule IDs, fixes, and the input filename,
never invoice fields or line contents.

Exit codes are distinct so an adapter can tell them apart: `0` clean, `1`
defects found (or warnings with `--strict`), `2` the file could not be read as
an invoice at all.

For an installed command, run `python3 -m pip install .` from this directory,
then use `python3 -m einvoice_preflight invoice.xml` from anywhere.

## Input shape

The format-neutral JSON shape, useful for adapters and for testing rules
without hand-writing XML:

```json
{
  "invoice_number": "INV-1001",
  "issue_date": "2026-08-24",
  "currency": "EUR",
  "supplier": {"id": "DE123", "name": "Supplier GmbH"},
  "customer": {"id": "DE456", "name": "Customer GmbH"},
  "lines": [{"description": "Consulting", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
  "totals": {"net": 200, "tax": 38, "gross": 238}
}
```

Amounts use the currency's major unit and are compared to cent precision.

## Examples

| File | What it shows |
| --- | --- |
| `examples/ubl-invoice.xml` | Clean UBL: two VAT rates, a document discount coded to one of them, a part payment |
| `examples/cii-invoice.xml` | Clean CII: a reverse-charge supply with an exemption reason |
| `examples/ubl-invoice-with-defects.xml` | Six planted defects, annotated in the file |
| `examples/valid-invoice.json` | The JSON shape |

CI runs the clean examples and asserts the defective one still fails, so the
first command in this README cannot quietly stop working.

## Tests

```sh
PYTHONPATH=src python3 -m unittest discover -s tests
```

Covers syntax detection from content, UBL and CII extraction, credit-note
element names, ISO date normalisation, every arithmetic rule fired by mutating
one field of a known-clean invoice, base-quantity and line-level-discount cases
that must *not* raise a false alarm, severity separation, refusal of document
type declarations and oversized input, exit-code semantics, and the usage
counter.

## Privacy and usage

Everything is local. Invoice contents are never uploaded or retained — there is
no server to upload them to, and no network code in the project.

Usage counting is opt-in with `--usage-file` and stores only aggregate event
counts: how many runs happened, which syntax was read, and whether anything was
caught (`invoice_preflight_checked`, `syntax_ubl`, `syntax_cii`, `syntax_json`,
`defect_found`, `warning_found`, `preflight_clean`). It never records invoice
data, amounts, party names, file names, paths, IPs, or identifiers, and the file
stays on your machine. Omit the flag to disable it entirely. There are no
accounts, cookies, or analytics vendors.

Those counters exist to answer one question — *is this catching real defects
for anyone, and in which format* — because that is what decides whether the
tool is worth continuing to build.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax or legal advice, and it does not
replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

## FAQ

### Does this submit invoices?

No. It reads one local file and writes a report to stdout.

### Does it calculate VAT?

No. It checks the arithmetic for the tax percentage supplied on each line and
in each breakdown group; it does not decide whether that percentage is legally
correct for the supply.

### Can I use it on a Factur-X / ZUGFeRD PDF?

Extract the embedded XML first (it is a PDF attachment, conventionally
`factur-x.xml` or `zugferd-invoice.xml`) and point the tool at that. Reading
the XML out of the PDF container is not implemented yet.

### It passed here but the receiver rejected it. Why?

This checks a defined subset — arithmetic and structure — not the full EN 16931
Schematron, and not the national profile's own rules. Passing here means "the
document does not contradict itself in the ways this tool knows about", which
is a smaller claim than "this will be accepted".

## Cost and support

$0 to run: local Python, standard library only, no dependencies, no inference,
no paid API, no database. Free with the full feature set — there is no paid
tier and no gated check.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
changes nothing about what the tool does.

MIT licensed.

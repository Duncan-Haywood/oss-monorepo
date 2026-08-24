# E-invoice preflight

**Validate a structured invoice before submission.** This free local CLI checks
a small, transparent JSON or UBL XML invoice shape for missing fields and
arithmetic mistakes, then prints rule IDs and plain-language fixes. It is aimed
at bookkeepers and ERP integrators searching for an e-invoice preflight check.

```sh
cd ventures/einvoice-preflight
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format sarif > preflight.sarif
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format github
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format markdown > review.md
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format html > review.html
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format html --output review.html
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format csv > triage.csv
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format junit > preflight.junit.xml
cat invoice.json | PYTHONPATH=src python3 -m einvoice_preflight - --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --usage-file ~/.local/state/einvoice-preflight/usage.json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format json
PYTHONPATH=src python3 -m einvoice_preflight invoice.xml --format json
```

For an installed command, run `python3 -m pip install .` from this directory,
then use `python3 -m einvoice_preflight invoice.json` from anywhere. Pass `-`
as the filename to read one JSON or UBL XML invoice from standard input, which
is useful for ERP adapters and CI pipelines. SARIF reports use `stdin.json` as
the artifact name for piped input. Directories are scanned recursively for both
`.json` and `.xml` files. XML input maps common UBL Invoice elements into the
same checks; it is not a full Peppol or EN 16931 conformance validator.

The tool never submits an invoice, chooses a tax rate, contacts a tax
authority, or claims that an invoice is legally valid. It only checks the
document facts represented in the input schema. The user remains responsible
for selecting the correct format, tax treatment, and submission process.

## Input shape

The supported v0 JSON shape is intentionally small and format-neutral. UBL XML
input maps common `Invoice`, `InvoiceLine`, party, tax, and monetary-total
elements into this shape:

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

Amounts use the currency's major unit and are compared to cent precision. Each
line must include a numeric `net` amount matching quantity times unit price. Each
line's tax is calculated from its rounded line net and the supplied
`tax_percent`; the invoice tax total must equal the sum of those per-line
rounded amounts. This reports arithmetic discrepancies only and does not
decide whether a tax percentage is legally correct.
`--format json` is suitable for an ERP adapter. It always returns the same
envelope, whether the input is one file or a directory: `status`,
`files_checked`, `files_failed`, `observations`, per-file `reports`, and
`read_errors`. Each finding also includes a `path` JSON Pointer (for example,
`/totals/gross`), so adapters can focus a field-level repair UI without
reimplementing the rules. `--format sarif` emits SARIF
2.1.0 for GitHub code scanning, CI annotations, and
editor integrations. It contains the rule IDs, fixes, JSON Pointer paths, and the local invoice
filename, never invoice fields or line contents. Unreadable files are emitted as `INV-READ`
results so a CI consumer cannot mistake a skipped file for a clean check. Both formats exit `1` when
any check fails and `2` for an unreadable input file. Pass a directory to scan
all `.json` files recursively; batch JSON includes per-file errors and batch
SARIF uses paths relative to the input directory. An empty directory is an
input error and exits `2`. Batch scans also flag duplicate `invoice_number`
values as `INV-019`; the number itself is never emitted.
JSON output uses the same summary fields for single files and directories:
`status`, `files_checked`, `files_failed`, `observations`, `rules`, and
`read_errors`. Single-file output also includes `file` and `errors`; directory
output includes the per-file `reports` array. Rule counts let a CI or ERP
adapter show a compact defect summary without parsing human text.
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
`--format junit` produces a JUnit XML report for CI dashboards. Each invoice is
one testcase; failed checks are failures and unreadable files are errors. The
report contains only local filenames, rule IDs, JSON Pointer paths, observations,
 and fixes, never invoice values or line contents. Directory scans do not follow
symbolic links; linked JSON files are reported as read errors so a scan stays
bounded to its selected directory.
`--format html` produces a standalone browser report with summary cards, finding
counts, and per-file review sections. It has the same privacy boundary as the
other report formats and can be opened locally without a server.
Pass `--output report.ext` to write any report format as a UTF-8 artifact. The
file is replaced atomically, so a CI consumer will not observe a half-written
report; without this option, reports continue to print to standard output.

## Privacy and usage

Everything is local. Invoice contents are never uploaded or retained by this
tool, including when read from standard input. Usage counting is opt-in with
`--usage-file` and stores only aggregate event counts, never invoice data,
paths, IPs, or identifiers. Usage recording is best effort and never changes
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

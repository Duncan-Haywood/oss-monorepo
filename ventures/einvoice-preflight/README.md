# E-invoice preflight

**Validate a structured invoice before submission.** This free local CLI checks
a small, transparent JSON invoice shape for missing fields and arithmetic
mistakes, then prints rule IDs and plain-language fixes. It is aimed at
bookkeepers and ERP integrators searching for an e-invoice preflight check.

```sh
cd ventures/einvoice-preflight
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format sarif > preflight.sarif
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format markdown > review.md
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format sarif --output preflight.sarif
cat invoice.json | PYTHONPATH=src python3 -m einvoice_preflight - --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --usage-file ~/.local/state/einvoice-preflight/usage.json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format json
```

For an installed command, run `python3 -m pip install .` from this directory,
then use `python3 -m einvoice_preflight invoice.json` from anywhere. Pass `-`
as the filename to read one JSON invoice from standard input, which is useful
for ERP adapters and CI pipelines. SARIF reports use `stdin.json` as the
artifact name for piped input.

The tool never submits an invoice, chooses a tax rate, contacts a tax
authority, or claims that an invoice is legally valid. It only checks the
document facts represented in the input schema. The user remains responsible
for selecting the correct format, tax treatment, and submission process.

## Input shape

The supported v0 shape is intentionally small and format-neutral:

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
`--format json` is suitable for an ERP adapter. `--format sarif` emits SARIF
2.1.0 for GitHub code scanning, CI annotations, and
editor integrations. It contains the rule IDs, fixes, and the local invoice
filename, never invoice fields or line contents. Both formats exit `1` when
any check fails and `2` for an unreadable input file. Pass a directory to scan
all `.json` files recursively; batch JSON includes per-file errors and batch
SARIF uses paths relative to the input directory. An empty directory is an
input error and exits `2`.
`--format markdown` produces a reviewable report with filenames, rule IDs,
observations, and fixes for single files and recursive directory scans.
Use `--output report.ext` to write the same report to a local artifact while
still printing it to stdout. The output file's format follows `--format` and
its parent directories are created when needed. Exit codes remain `0` for a
clean report, `1` for invoice observations, and `2` for read errors.

## Privacy and usage

Everything is local. Invoice contents are never uploaded or retained by this
tool, including when read from standard input. Usage counting is opt-in with `--usage-file` and stores only aggregate
event counts, never invoice data, paths, IPs, or identifiers. Omit the flag to
disable it. There are no accounts, cookies, or analytics vendors.

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

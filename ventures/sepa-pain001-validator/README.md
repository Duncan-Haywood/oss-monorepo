# SEPA pain.001 Validator

A free browser tool for anyone who sends euro payments or collections to their bank as an
XML file: **paste or drop the SEPA file and see every problem with its line, path, cause and
fix before the bank rejects it, then repair the control totals and disallowed characters.**
The file is read in the browser; nothing is uploaded and no login, bank account or API key
is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sepa-pain001-validator/

After using this, you can now **find the amount that no longer matches CtrlSum, the IBAN
with a bad check digit, the name with an umlaut, the Saturday execution date and the
duplicate EndToEndId, and download a repaired file**, which used to mean a bank's "XML
schema invalid" message, a call, and reading the XML by hand.

## Input

One SEPA XML file: `pain.001.001.03` or `.09` (credit transfer) or `pain.008.001.02` or `.08`
(direct debit), detected from the namespace. UTF-8, with or without a BOM. A file in
Windows-1252 is decoded and reported. **The reference data (IBAN lengths, SEPA countries,
TARGET2 closing days, character set, field limits) is from memory of public sources; no bank
validator or XSD was available when this was built.** IBANs are masked to their first four
and last four characters in the report and the findings CSV.

## Checks

Well-formedness (with line numbers); namespace and version; required elements; NbOfTxs and
CtrlSum against the real amounts, per file and per payment block, summed as exact decimals;
IBAN structure, country length and mod-97; BIC format and the BIC/BICFI split by version;
EUR and amount format (at most 2 decimals, above 0, at most 999999999.99); execution date
in the past, on a weekend or on a TARGET2 closing day, with the next TARGET day; Max35Text,
Max70Text and Max140Text lengths; the SEPA character set with suggested replacements;
duplicate EndToEndId, PmtInfId and MsgId (against a list you supply); ChrgBr SLEV; service
level SEPA; missing debtor and creditor names; direct debit scheme, sequence type, mandate
id, signature date and creditor identifier. A DTD is refused and never expanded.

## Repair

`repair()` recomputes `NbOfTxs` and `CtrlSum` where they already exist and transliterates
disallowed characters in names and reference fields, and lists what changed. It never edits
an IBAN, amount, currency, date or identifier, adds or removes an element, or shortens text;
a control sum is not rebuilt while any amount is unreadable.

## Run

Open `index.html` through any static server. Tests: `node --test`.

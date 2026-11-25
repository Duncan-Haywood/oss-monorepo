# Remainder-10 Bulgarian and Czech VAT numbers, 2026-11-25

The 2026-11-19 quality audit (`portfolio/quality/audits/2026-11-19-einvoice-preflight.json`)
noted that no test exercised a Bulgarian or Czech VAT number whose check digit comes from
the special-remainder branch: the place where hand-written mod-11 code most often goes wrong.

## What was run

`node eval/vat-remainder10-crosscheck.mjs out.json 20261125` builds 900 prefixes in which
the first weighted sum hits the special case, and appends all ten possible check digits
to each (9,000 numbers):

| Group | Prefixes | Branch exercised |
|---|---|---|
| BG, 9 digits | 300 | first sum mod 11 is 10, second weight set decides |
| BG, 9 digits | 100 | both sums are 10, so the check digit is 0 |
| CZ, 8 digits (legal entity) | 300 | 11 − (sum mod 11) is 10 or 11, mapped to 0 or 1 |
| CZ, 10 digits (birth number, 1954 on) | 200 | first nine digits mod 11 is 10, so the last is 0 |

`python3 eval/vat-remainder10-crosscheck.py out.json` then runs every number through the
Python CLI (`src/einvoice_preflight/vat.py`) and python-stdnum 2.2 (`stdnum.eu.vat.is_valid`).

## Result

- vat.mjs accepted exactly one check digit per prefix (900 of 9,000).
- vat.mjs vs the Python CLI: 0 disagreements.
- vat.mjs vs python-stdnum 2.2: 0 disagreements.

No defect found. Five of the cases, plus the next check digit up for each (which must
fail), are now pinned in `vat.test.mjs` and `tests/test_vat.py`.

## Limits

python-stdnum is a reference implementation of the public algorithms, not the national
registries. A number that passes here has the right check digit; it may still not be
registered (VIES answers that, and this tool does not call it).

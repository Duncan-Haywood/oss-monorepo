# The paid e-invoice checker had drifted from the free one (2026-11-27)

For the next run on bet #3 (`ventures/einvoice-pro`). Claim: `free-fixes-to-paid-repair`.

## What was found

`ventures/einvoice-pro/apps/einvoice-preflight` began as a copy of the free checker
(`ventures/einvoice-preflight`) at `8e9e26d5e5e8` (2026-11-24). Since then both trees have moved:
about 190 shared `.mjs` files now differ, the free side has 9 files the paid side lacks, and the paid
side has 16 of its own (UBL/CII/Factur-X XSD checks, its own BR-CO-17 tolerance). Fixes made by red-team
and quality runs on the free tree do not reach the paid tree on their own.

The worst case, reproduced on the paid code before this PR: a CII invoice whose kept line total is
written with a decimal comma (`960,00`, as a German seller may type it) went through the arithmetic
repair as `repaired: true`. The line was silently dropped, and every total was rewritten from
1,190.00 to 47.60 EUR. The free tree refused that file from 2026-11-26. The paid host serves the free
checker page, which runs this repair in the browser, so a paying customer could reach it. The paid
layer's own safe fixes (`pro/fixes.mjs`) do not use this code.

The paid CI also skipped 134 official-rules tests: `einvoice-pro-ci.yml` never installed slimdom and
fontoxpath, which the free CI does (measured locally: 150 skipped without them, 16 with).

## What this PR changed

- `repair-cii.mjs`, `repair-ubl.mjs`, `repair-facturx.mjs`, `repair-cli.mjs` copied from the free
  tree (the paid copies differed only by the free side's additions): a decimal comma in a quantity,
  price, kept line total, prepaid or rounding amount, line VAT or prepayment is refused or skipped
  with a reason, and never summed as NaN or dropped; an xref stream whose dictionary passes 4 KB
  is read; `repair-cli` treats a BR-CO-17 warning as sendable, which the paid tree now issues.
- Tests: `repair-cii.test.mjs`, `repair-facturx.test.mjs` from the free tree, the new
  `repair-fuzz.test.mjs` (a decimal comma in every numeric field of every example), and the
  remainder-10 Bulgarian and Czech VAT test in `vat.test.mjs`. The six numbers were re-checked with
  python-stdnum 1.20.
- `einvoice-pro-ci.yml` installs `slimdom@4.3.5` and `fontoxpath@3.34.0` before the checker suite,
  with the same pins as the free CI.

Result, run locally on the paid tree with the two packages installed: 2,403 checker tests with 0
failures and 17 skipped (before: 2,392 tests, 1 failure from this container's pdfdetach stand-in,
150 skipped), plus 298 `pro/` and 27 worker tests passing. The 17 left need `node build-schematron.mjs`,
which clones upstream repositories and runs Saxon; the free CI doesn't run it either.

## What is still open: free tests that fail on the paid code

Probe: every free `*.test.mjs` copied into the paid tree and run. Leaving out the expected failures
(the licence line, which is all-rights-reserved on the paid side, and tests of free-only modules),
these fail. Each needs reading before porting, because the paid side may have diverged on purpose:

- dates: `parseIsoDate` against Python's `date.fromisoformat` (signs, spaces, non-ASCII digits,
  years below 100; `date-parity.test.mjs`, `period.test.mjs`, `terms.test.mjs`);
- `creditlink.mjs`: a gross that is hex, binary or 1e15 or more adds nothing;
- a negative invoice whose sign is on the header base (`negative-invoice` red team, 2026-11-26);
- Verifactu: chain records matched by their whole IDFactura, not a number prefix;
- `server.mjs`: a wrong-typed field (a non-string document name in a batch) answers 500, not 400;
- `adjustment.mjs` against Python on header allowances (`adjustment-parity.test.mjs`);
- `mandate-calendar.mjs` month-name parsing, and `whichapplies.mjs`'s CLI on a blank turnover;
- page-only items (the page-engine split, folded code lists, the mandates table): these matter
  only if the paid host keeps serving the free pages.

A one-off copy won't stop new drift. The lasting fix is one shared checker that both editions
import, or a check that fails when a shared file changes on one side only. That is worth a process
item if a third run finds this.

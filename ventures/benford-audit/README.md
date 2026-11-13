# Benford Audit

Benford's law says that in many naturally occurring sets of numbers the leading digit is 1 about 30% of the time and 9 under 5% of the time. Auditors and fraud examiners use departures from it to decide which records to pull first: invented figures, amounts held under an approval limit and repeated reimbursements all leave marks in the digits. The tests are standard in licensed audit analytics suites; this is a free, private version that runs on a CSV in the browser or from the command line.

**Live tool:** https://marisstella.app/benford-audit/
**For auditors (who it is for, a worked example, when to use something else):** https://marisstella.app/benford-audit/for-auditors.html

**After using this, you can now** get Nigrini's Benford test suite, a just-under-limit test and a per-vendor ranking on an export you already have, with a list of records to review, in seconds and without a licence, **which used to take** an audit analytics licence or an afternoon of spreadsheet formulas that stop at the first-digit test.

## Use it

Open [`index.html`](index.html), choose a CSV, check the amount and group columns it picked, enter your approval limits, and select **Run the tests**. **Load a worked example** runs everything on a synthetic 2,565-row ledger with three planted problems. Download the flagged records as CSV or print the page as a report.

Command line, same code:

```bash
node cli.mjs ledger.csv --threshold 5000,10000            # text report
node cli.mjs ledger.csv --group employee --json           # everything as JSON
node cli.mjs ledger.csv --flagged flagged.csv             # the drill-down list
```

Options: `--amount COL`, `--group COL` (header name or 0-based index; both are guessed otherwise), `--sign positive|negative|both` (default positive, as Nigrini recommends: test credits separately), `--min 10` (amounts below are dropped from the tests), `--threshold` (comma-separated limits), `--group-min 50`.

## What it computes ([`benford.mjs`](benford.mjs))

| Test | Statistic | Verdict |
|---|---|---|
| First digit, second digit, first two digits | per-digit Z with continuity correction; MAD; chi-square and p | Nigrini (2012) table 7.1 MAD bands: first 0.006/0.012/0.015, second 0.008/0.010/0.012, first two 0.0012/0.0018/0.0022 |
| Last two digits | chi-square against uniform, on cents (or whole-number digits of amounts of 100+) | p-value |
| Summation | share of the total per first-two-digit bin, expected 1/90 | bins at 2x or more listed with their largest amounts |
| Number duplication, round numbers | counts | listed |
| Just under a limit T | amounts in [0.9T, T) vs [T, 1.1T); expected share below under a 1/x density is ln(1/0.9)/(ln(1/0.9)+ln 1.1) = 0.525; exact binomial upper tail | flagged at p < 0.01 with 10+ amounts |
| Per group (vendor, employee, card) | first-digit MAD minus the MAD sampling noise gives at that n (sum of sqrt(2p(1-p)/(pi n)) / 9); chi-square p; Benjamini-Hochberg q across groups | flagged at q < 0.05 |

Applicability notes warn when fewer than 300 (or 1,000) amounts remain, when the middle 98% spans under two orders of magnitude, or when the data is not right-skewed.

Every record caught by at least one test goes on the drill-down list with its reasons, most-caught first.

## Worked example

`example.mjs` builds the example deterministically (seeded PRNG): 2,400 log-uniform amounts from 10 to 100,000 over 40 vendors, plus 60 invoices from one vendor between 4,500 and 4,999, 25 copies of 1,250.00 and 80 hand-invented claims from one employee. Results (pinned in `test/benford.test.mjs`):

- whole-file first digit MAD 0.0031, close conformity; first two digits 0.0019, marginally acceptable;
- just under 5,000: 84 under vs 30 over, 59.9 expected under, p = 2.9e-6, flagged; 10,000 not flagged;
- 1,250.00 is the most repeated amount (25 times);
- of 39 groups with 50+ amounts, exactly the two planted ones have q < 0.05;
- last two digits chi-square 281.7 on 99 df (excess .00 and .25 endings).

## Tests

```bash
node --test test/*.test.mjs page.test.mjs
```

The tests check the expected distributions against Nigrini's published values, chi-square p against table critical values (df 8, 9, 89, 99), the binomial tail and BH q-values on hand-worked cases, MAD band edges, amount parsing across US and European formats, that an exactly-Benford sample conforms and a uniform one does not, that the threshold test flags a planted pile-up and not a smooth sample, and that the worked example finds each planted problem.

## Limits

- A misfit is a reason to look, never a finding. Fixed fees, price lists, caps, recurring bills and narrow ranges fail honestly.
- The per-group test uses the first digit only; groups rarely have the 1,000 amounts the first-two-digits test needs.
- The threshold window is fixed at 10% on each side. A limit-shaver who stays within 1% of the limit is caught; one who spreads over 30% below may not be.
- MAD bands are Nigrini's, set for large samples; below a few hundred amounts read the excess MAD and p-values instead.
- Not implemented yet: the second-order test, the relative size factor test, date-based tests (weekends, period ends) and a mantissa-arc test.

## Opportunity assessment

- **Target user:** internal auditors, fraud examiners, forensic accountants, controllers and bookkeepers reviewing payables, T&E or purchasing-card data; auditing students.
- **Pain:** Benford testing is a standard first screen, but the full suite (beyond the first digit) and the drill-down are inside licensed audit analytics tools; free web calculators stop at a first-digit chart and need the data pasted into someone's server.
- **Alternatives:** IDEA, Diligent (formerly ACL) and Arbutus include Benford functions; spreadsheets with hand-built formulas; free online first-digit calculators.
- **Business model:** free local core. A natural paid layer, later and on the deployer's own keys, is saved engagements and a scheduled check on a connected ledger (QuickBooks, Xero) that alerts when a vendor's digits or a limit window shift. No paid dependency today.
- **Cost:** a static page; $0 per user. No data reaches any server.

## Privacy and usage

Everything runs in your browser; the CSV is never uploaded. The page counts only `audit_run`, `records_flagged`, `example_loaded`, `flagged_exported` and `report_printed`, locally in your own browser, with a checkbox to turn counting off and automatic respect for Do Not Track and Global Privacy Control. No amounts, names or file contents are stored.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, accounting or audit advice, and it does not replace a qualified professional. It does not determine that any record is fraudulent, wrong or improper: it compares the digits of your own data with a statistical expectation, and many honest data sets do not follow that expectation. **You are responsible for reviewing and verifying its output** against source documents before drawing any conclusion about anyone. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing to sponsor does not change the tool.

## Sources

- Mark J. Nigrini, *Benford's Law: Applications for Forensic Accounting, Auditing, and Fraud Detection*, Wiley, 2012 (tests, Z statistic, MAD bands).
- Y. Benjamini and Y. Hochberg, "Controlling the false discovery rate", *JRSS B* 57 (1995) 289-300.
- Sibling: [`duplicate-payment-audit`](../duplicate-payment-audit/README.md) finds the same bill paid twice.

## License

MIT. See [`LICENSE`](LICENSE).

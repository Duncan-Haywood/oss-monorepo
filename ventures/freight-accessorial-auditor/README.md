# Freight Accessorial Invoice Auditor

Small shippers and freight brokers lose margin to detention, liftgate,
residential, lumper, reweigh, and reclass charges that are difficult to verify
line by line. This browser-local auditor turns one invoice line into a potential
variance, evidence checklist, priority, and copyable dispute draft.

**Value:** after using this, you can identify and document an unsupported freight
charge in minutes, which used to require reconstructing a spreadsheet from the
invoice, rate confirmation, BOL, and POD.

## Why this product

Existing freight audit firms and full TMS platforms are valuable for high-volume
shippers but are expensive or overbuilt for a small broker reviewing a few
invoices. The existing portfolio's 3PL Quote Normalizer compares *future provider
quotes*; this product audits *already-billed shipment charges*, so it is a
separate workflow with a separate search intent. Evidence from current freight
audit guidance consistently identifies phantom accessorials, detention time,
reclass/reweigh, duplicates, and fuel/rate mismatches as recoverable leakage.

Future revenue could be a hosted team workspace or optional user-supplied AI key
for extracting invoice lines. The deterministic local workflow is complete
without an API, account, upload, or paid dependency; hosting costs are zero at
launch. AI is intentionally not required because arithmetic and evidence status
should remain inspectable.

## Run it

```sh
python3 -m http.server 8877 --directory ventures/freight-accessorial-auditor
```

Open `http://localhost:8877`. Enter billed and expected amounts, choose the
evidence status, then copy the factual draft. Data and anonymous audit counts
remain in local storage; no invoice content leaves the browser.

## Privacy, usage, and legal limits

The app counts only a local `audit` event after the user enters a billed amount.
It never collects identity, IP address, invoice content, or cross-site IDs, and
there is no analytics vendor. Clear this site's storage to disable/delete it.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, tax, legal, or engineering advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps prepare for. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

The output is an observation and draft, not a determination that a carrier owes
money. Verify the contract, tariff, shipment record, evidence, and dispute
deadline yourself.

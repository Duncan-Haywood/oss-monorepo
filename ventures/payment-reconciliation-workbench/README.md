# Payment Reconciliation Workbench

Payment processor reconciliation for small businesses should not require a $50/month accounting add-on. This free, local-first browser tool matches payout CSV exports from Stripe, Square, PayPal, or similar processors to bank-deposit CSV exports, then produces a review queue for the exceptions.

**After using this, you can now** identify which processor payouts have reached the bank and export the deposits that still need review, **which used to take** manually comparing two spreadsheets.

## Use it

Open [`index.html`](index.html), choose the two CSV files, set a settlement-date tolerance, and select **Run reconciliation**. The tool recognizes common `date`, `payout_date`, `deposit_date`, `net`, and `amount` headers. Matching requires the same amount to the cent and a date within the selected tolerance. It also identifies a payout split across up to eight nearby bank deposits, searching only the first 18 eligible deposits to keep browser work bounded. Download the review CSV when finished.

No account, build step, API key, or paid service is needed. The product does not connect to payment providers and does not move money. It is deliberately a review aid rather than an accounting system.

## Opportunity assessment

- **Target user:** owner-operators processing $5,000-$100,000 monthly across two or three processors, without QuickBooks or Xero.
- **Pain:** weekend hours spent copying processor exports and checking whether deposits arrived, with missed discrepancies delaying cash visibility.
- **Return value:** each new payout batch can be checked in seconds; the exported exception list can become the operator's recurring close checklist.
- **Alternatives:** spreadsheets, Wave/manual bookkeeping, and reconciliation products that require an accounting platform. This wedge starts with files, works offline, and exposes its deterministic rules.
- **Acquisition:** searches such as “Stripe bank deposit reconciliation CSV”, “Square payout reconciliation spreadsheet”, and “reconcile PayPal deposits without QuickBooks”; processor-specific help pages and bookkeeping communities are natural referral surfaces.
- **Future business model:** free local core first; later, an optional hosted tier or bring-your-own API key could add saved rules, processor adapters, and AI explanations without making paid inference a launch dependency.
- **Development and cost:** a static page can ship in a day and costs $0 per user on GitHub Pages. No financial data reaches our server.
- **Automation:** deterministic parsing, matching, export, tests, and static hosting are agent-operable. Provider-specific format fixtures can be added as demand appears.
- **Risks:** CSV formats vary, refunds/chargebacks and fees can make amounts legitimately differ, and dates may be ambiguous. Grouped matching is limited to positive exact-total deposits and is intentionally bounded; the tool labels only exact rule-based observations and tells the user to verify against source statements.
- **Portfolio fit:** new workflow, not a quote calculator, ecommerce profit calculator, or compliance evidence product. It shares the portfolio's local-first and privacy-safe product shape.

## Privacy and usage

Everything runs in your browser. Your CSV files and financial data are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendors. The app counts only `reconciliation_run` and `review_exported` locally, with a visible checkbox to disable counting and automatic respect for Do Not Track / Global Privacy Control. No file contents, identifiers, IP addresses, or user agents are retained.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## License

MIT. See [`LICENSE`](LICENSE).

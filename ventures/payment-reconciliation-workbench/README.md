# Payment Reconciliation Workbench

Payment processor reconciliation for small businesses should not require a $50/month accounting add-on. This free, local-first browser tool matches payout CSV exports from Stripe, Square, PayPal, or similar processors to bank-deposit CSV exports, then produces a review queue for the exceptions.

**After using this, you can now** identify which processor payouts have reached the bank and export the deposits that still need review, **which used to take** manually comparing two spreadsheets.

## Use it

Open [`index.html`](index.html), choose the two CSV files, set a settlement-date tolerance, and select **Run reconciliation**. The tool recognizes common `date`, `payout_date`, `deposit_date`, `net`, and `amount` headers. Matching requires the same amount to the cent and a date within the selected tolerance. It also identifies a payout split across up to eight nearby bank deposits, searching only the first 18 eligible deposits to keep browser work bounded.

Anything that does not match becomes a review row with a **What to check** column. Where an unmatched payout has a nearby deposit that almost agrees, the tool pairs them, states the gap in money and as a percentage, and says whether the shortfall is the size of a card-processor fee (roughly 0.1%–6%) or something to verify against the statement. Each deposit is offered as the explanation for at most one payout, so nothing is double-counted. These pairings are leads, not matches: the amounts genuinely differ, and you decide whether the difference is a fee you accept or a discrepancy you chase. Download the review CSV when finished; it carries the gap and the explanation alongside every row.

The pairing looks a week further than the matching does, so the most ordinary exception of all gets explained: a deposit for exactly the right amount that the bank posted a few days later than your tolerance allows. That row now reads *"same amount, 5 days apart — outside the date tolerance you set"*, which tells you the one thing you need in order to decide whether to widen the tolerance and re-run. Beyond a week past your tolerance the tool stops offering a lead, because at that distance an equal amount is as likely to be a different transaction as a late one.

No account, build step, API key, or paid service is needed. The product does not connect to payment providers and does not move money. It is deliberately a review aid rather than an accounting system. See [this workbench vs. Synder](vs-synder.html) for which job fits a one-off CSV check versus an ongoing, connected sync subscription.

[This workbench vs. Synder](vs-synder.html) explains why a free, no-connection, one-time CSV matcher and a paid, ongoing sync into QuickBooks or Xero answer different questions.

## Opportunity assessment

- **Target user:** owner-operators processing $5,000-$100,000 monthly across two or three processors, without QuickBooks or Xero.
- **Pain:** weekend hours spent copying processor exports and checking whether deposits arrived, with missed discrepancies delaying cash visibility.
- **Return value:** each new payout batch can be checked in seconds; the exported exception list can become the operator's recurring close checklist.
- **Alternatives:** spreadsheets, Wave/manual bookkeeping, and reconciliation products that require an accounting platform. This wedge starts with files, works offline, and exposes its deterministic rules.
- **Acquisition:** searches such as “Stripe bank deposit reconciliation CSV”, “Square payout reconciliation spreadsheet”, and “reconcile PayPal deposits without QuickBooks”; processor-specific help pages and bookkeeping communities are natural referral surfaces.
- **Future business model:** free local core first; later, an optional hosted tier or bring-your-own API key could add saved rules, processor adapters, and AI explanations without making paid inference a launch dependency.
- **Development and cost:** a static page can ship in a day and costs $0 per user on GitHub Pages. No financial data reaches our server.
- **Automation:** deterministic parsing, matching, export, tests, and static hosting are agent-operable. Provider-specific format fixtures can be added as demand appears.
- **Risks:** CSV formats vary, refunds/chargebacks and fees can make amounts legitimately differ, and dates may be ambiguous. The tool labels only exact rule-based observations and tells the user to verify against source statements.
- **Portfolio fit:** new workflow, not a quote calculator, ecommerce profit calculator, or compliance evidence product. It shares the portfolio's local-first and privacy-safe product shape.

## Privacy and usage

Everything runs in your browser. Your CSV files and financial data are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendors. The app counts only `reconciliation_run`, `exceptions_explained`, and `review_exported` locally, with a visible checkbox to disable counting and automatic respect for Do Not Track / Global Privacy Control. `exceptions_explained` is a plain per-run flag recording that at least one exception was paired with a likely cause — it carries no amounts, no counts, and nothing about the files. No file contents, identifiers, IP addresses, or user agents are retained.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing to sponsor does not change the workbench.

## License

MIT. See [`LICENSE`](LICENSE).

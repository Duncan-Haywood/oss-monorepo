# Duplicate Payment Audit

Duplicate-payment recovery-audit firms exist because businesses routinely pay a vendor twice: the same invoice re-entered under a new number, a data-entry typo that slips past a "have we paid this before" check, or the same amount paid twice a few days apart. Those firms typically work large enterprise ledgers on a contingency fee. This free, local-first browser tool runs the same kind of check on a CSV export a small business already has, with nothing to sign up for and nothing uploaded.

**After using this, you can now** get a short, explained list of likely duplicate vendor payments from a CSV export in seconds, **which used to take** manually scanning a spreadsheet for repeated vendor names and amounts, or paying a contingency fee to a recovery-audit firm to find them for you.

## Use it

Open [`index.html`](index.html), choose a payment-ledger CSV, and select **Check for duplicate payments**. The tool recognizes common `vendor`, `amount`, and `date` headers (`payment_date`, `paid_date`, and similar variants also work); an `invoice_number` or similar reference column is optional but sharpens the check.

Three checks run, in order of confidence:

1. **Exact duplicate** (high confidence) — the same vendor and invoice number paid twice for the same amount.
2. **Same invoice, different amount** (medium confidence) — the same vendor and invoice number paid twice at different amounts, which can mean a partial payment or a data-entry error.
3. **Near-duplicate invoice number** (high confidence) — the same vendor and amount, with invoice numbers that are a likely typo of each other (edit distance of 1 or 2).
4. **Same amount, near date** (review) — the same vendor and amount, landing within a configurable window (default 7 days) of each other, with no invoice-number link. This is the pattern most likely to also be a legitimate recurring charge (rent, a subscription, a retainer), and the tool says so on every row this check produces.

Download the review CSV when finished; it carries every flagged pair, its confidence tier, and the plain-English reason.

No account, build step, API key, or paid service is needed. The tool does not contact a vendor, file a dispute, or take any action on your behalf — it produces a list for you to verify.

## Opportunity assessment

- **Target user:** small-business owners, bookkeepers, and part-time controllers who export AP payment history from QuickBooks, Xero, or a spreadsheet and reconcile it without a dedicated AP-automation platform.
- **Pain:** duplicate payments are a well-documented, recurring AP failure mode (see, for instance, vendor-neutral guidance from Ramp, Brex, NetSuite, and Stripe on detecting and preventing them) and a whole recovery-audit industry exists to find them for a contingency fee on enterprise ledgers — a business too small for that engagement has no free equivalent today.
- **Return value:** each check can surface a real overpayment worth recovering, or confirm a clean ledger, in the time it takes to export a CSV.
- **Alternatives:** manual spreadsheet review, an AP-automation platform's built-in duplicate check (paid, and tied to using that platform), or a contingency recovery-audit firm (typically enterprise-only, and takes a cut of what it finds).
- **Acquisition:** search phrases such as "duplicate payment audit," "how to find duplicate invoices in accounts payable," and "duplicate invoice checker" already draw content marketing from Ramp, Brex, NetSuite, Stripe, Klippa, Precoro, Fiscaltec, and Illumis, plus dedicated recovery-audit firms selling this as a paid service — evidence of real, recurring search demand rather than a guess. Bookkeeping and small-business communities (r/Bookkeeping, r/Accounting, r/smallbusiness, r/QuickBooks) discuss AP process questions of this shape regularly.
- **Future business model:** free local core first; a hosted or bring-your-own-key tier could later add saved rules or a direct QuickBooks/Xero export connector without making paid inference a launch dependency.
- **Development and cost:** a static page ships at $0 marginal cost per user on GitHub Pages. No financial data reaches our server.
- **Automation:** deterministic parsing, matching, export, and static hosting are fully agent-operable; no queue, no human step.
- **Risks:** recurring legitimate charges of the same amount (rent, subscriptions, retainers) share the same-amount/near-date pattern with a genuine duplicate; the tool labels that tier "review" rather than "duplicate" and says so explicitly, rather than asserting fraud or wrongdoing. Vendor-name formatting differences (punctuation, suffixes) could under-match; normalization strips punctuation and case but does not merge genuinely different spellings.
- **Portfolio fit:** an evidence/review tool, not a quote or pricing calculator — closest sibling is [`payment-reconciliation-workbench`](../payment-reconciliation-workbench/README.md) (also a private browser CSV matcher for AP-adjacent data), which matches processor payouts to bank deposits rather than checking a vendor ledger for double payments to the same vendor.

## Privacy and usage

Everything runs in your browser. Your CSV and financial data are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendors. The app counts only `audit_run`, `high_confidence_flag`, and `review_exported` locally, with a visible checkbox to disable counting and automatic respect for Do Not Track / Global Privacy Control. No file contents, vendor names, amounts, or dates are ever retained outside your own downloaded CSV.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. It does not determine that any payment was fraudulent, wrongful, or actually duplicated — it flags statistical patterns in your own data for your review, and recurring charges of the same amount will also match some of these patterns. **You are responsible for reviewing and verifying its output** against your vendor statements and accounting records before requesting a refund, credit, or correction from anyone. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing to sponsor does not change the tool.

## License

MIT. See [`LICENSE`](LICENSE).

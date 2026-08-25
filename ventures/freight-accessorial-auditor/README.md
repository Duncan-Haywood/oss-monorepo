# Freight Accessorial Auditor

Small shippers can now audit freight accessorial invoices for duplicate lines, charges above an expected contract amount, and missing accessorial codes. Paste rows, run the deterministic audit, and download a review queue without uploading invoice data. Malformed or negative amounts are flagged instead of being silently treated as zero.

After using this, you can now identify invoice lines worth disputing and hand a dated CSV to your finance team, which used to take a manual spreadsheet review.

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. It works without an account, API key, or paid service. It is distinct from a 3PL quote normalizer: this audits billed invoice lines after service, rather than comparing prospective fulfillment quotes.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. The optional local counter records only feature names (`audit_completed`, `review_exported`) and can be disabled in the page. No invoice content, people, IPs, or identifiers are collected.

## Legal guardrail

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial advice and does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Future business

The free local core stays complete. A later hosted tier could add opt-in carrier contract imports or customer-managed API keys, but no paid integration is required or enabled today. Potential buyers are ecommerce brands and freight teams that can quantify recovered dollars; acquisition can target searches such as “freight accessorial audit” and “duplicate freight invoice charges”.

# Invoice Payment Terms Calculator

Free browser tool for freelancers and small service businesses. Enter an invoice amount, terms, late-rate assumption, and outstanding invoices to get the due date, cash-flow exposure, 30/60/90-day late-fee scenarios, copyable payment-terms wording, whether a **2/10 Net 30 discount still beats waiting**, and whether **factoring still beats waiting** after your carrying cost.

**After using this, you can now** see when the invoice is due, how many operating days several unpaid invoices consume, whether giving 2% to get paid in 10 days still covers the float, and whether a 3% factor fee still beats waiting — which used to mean a spreadsheet that forgot grace days or treated “2/10 Net 30” and “get paid now” as slogans.

Open [`index.html`](index.html) in a browser. The calculation is local and works without an account, network request, or API key.

[Should I offer 2/10 Net 30?](should-i-offer-2-10-net-30.html)
answers the early-pay question on the same $1,200 default. On 24% money,
waiting still leaves $1,176.33 against $1,168.27 after the discount.
They match at about 36.1%. At 50%, the discount flips ahead.

[Should I factor this invoice?](should-i-factor-this-invoice.html)
answers the third-party fee question. On 24% money, waiting still leaves
$1,176.33 against $1,161.24 after a 3% fee and 90% advance. They match
at a 1.74% fee. At 50%, factoring flips ahead.

[Already overdue? Wait, chase, settle, or collections](chasing-a-late-invoice.html)
picks up where the due date runs out. The same invoice, 15 days late, scored
four ways on expected cash after float and the hours a chase costs: a 10%
settlement is worth $861.16, waiting $823.43, chasing it yourself $755.61
(three hours at $85 is $255 spent whether or not they pay), and collections
$355.63. The most useful number is the chase-hours break-even — about **1.8
hours** on these defaults. Odds are the operator's estimate, not a prediction.

It is not a quote-margin tool (that prices the job), not a retainage
schedule (that is construction withhold), and not a Faire payout-speed
page (that is marketplace processing). This page is invoice terms for
service firms.

## Run

```sh
python3 -m http.server 8877 --directory ventures/invoice-payment-terms-calculator
```

Then open `http://localhost:8877`. There is no build step.

## Privacy and usage

Everything runs in your browser. Your amounts, dates, and drafts are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendors. The optional anonymous local counter records only feature names (`calculation`, `terms_copied`, `draft_saved`, `draft_loaded`, `early_pay_compared`, `factor_compared`, `late_invoice_compared`, `late_invoice_draft_saved`, `late_invoice_draft_loaded`) and can be disabled in the footer. Saved drafts stay on this device.

## Safety

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or business advice, and it does not replace a qualified professional. It does not determine whether a late-fee term is permitted or enforceable, and it does not tell you to offer or withhold an early-pay discount or to factor an invoice. **You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

Late-fee results are arithmetic scenarios, not a recommendation or a determination that a fee can be charged.

The overdue comparison is arithmetic on recovery odds you type. It does not tell you to settle, escalate, or walk away, and it does not say what a late fee, a settlement, or a collection agency is permitted to do — those vary by jurisdiction and by the contract you signed.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```

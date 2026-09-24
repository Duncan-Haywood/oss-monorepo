# Patreon Fee Calculator

Patreon creators can use this free browser-local calculator to find real monthly take-home from patron pledges after their platform plan (Standard 10%, or a legacy Lite/Pro/Premium plan at 5/8/12% for pages published on or before August 4, 2025) and payment processing — including the worse micropayment rate that applies to any pledge of $3 or less. **After using this, you can tell what switching plans would actually cost you, instead of assuming every pledge dollar is taxed the same.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why the pledge total is the wrong number to plan from

"$545 in pledges this month" is not what lands in a creator's bank account, and two mechanics are easy to miss:

- **The platform fee depends on which plan the page is on, and that is mostly out of the creator's hands.** Patreon's June 2025 pricing change replaced the old Pro/Premium tiers with one flat Standard plan at 10% for every page created after August 4, 2025. A page published on or before that date keeps its legacy plan instead — Lite (5%), Pro (8%), or Premium (12%) — unless it is unpublished and republished, which forces Standard and cannot be undone from the creator's side. See the plan-comparison table in the calculator.
- **Payment processing gets sharply worse, not just smaller, on a low-dollar pledge.** On top of the platform fee, Patreon charges 2.9% + $0.30 per successful charge for a US card — except for a charge of $3 or less, where processing switches to 5% + $0.10 instead. A $1 tier is not a smaller version of the standard rate; it is a worse rate on a smaller base. See [`why-your-1-dollar-tier-pays-you-less-than-you-think.html`](why-your-1-dollar-tier-pays-you-less-than-you-think.html) for the worked breakdown, including a one-cent cliff at exactly $3 where a higher pledge can net a creator *less*.

This tool deliberately does not model payout timing, currency conversion, refunds, or declined charges — any income outside the three patron tiers (shop sales, for example) is a single figure the creator supplies, never computed here.

## Sources

Fee figures verified via web search, September 2026, cross-checked across Patreon's own June 2025 pricing-change blog post, `patreon.com/pricing` via secondary citation, and independent trade press:

- Legacy plans (pages published on or before August 4, 2025): Lite 5%, Pro 8%, Premium 12% platform fee.
- Standard plan (pages created after August 4, 2025, or a legacy page that is unpublished/republished): flat 10% platform fee.
- Payment processing (all plans): 2.9% + $0.30 per US-card charge.
- Micropayment rate: 5% + $0.10 for any charge at or below $3.
- Currency conversion and payout-timing fees exist and are not modeled here.

**Platforms change fees without notice.** Verify every figure against Patreon's own current pricing page before relying on a result.

## Privacy and usage

Everything runs in your browser. Your patron counts, pledge amounts, plan, and other income figures are never uploaded, and there is no account. We count anonymous local feature events only (`month-priced`, `plan-compared`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No patron counts, pledge amounts, or income figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not [tax / financial] advice, and it does not replace a qualified professional. It is also not a payout tracker, a payout-timing estimator, or a substitute for your own Patreon dashboard and payout statements. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your payout history, confirm a deposit amount, or replace your own accountant. Patreon is a trademark of Patreon, Inc., named here only to describe what this tool calculates — this tool is not affiliated with, endorsed by, or sponsored by Patreon, and its platform fee, processing rate, and micropayment threshold change over time; verify every figure against your own current Patreon dashboard and Patreon's own current pricing page.

MIT licensed. See `LICENSE`.

## Dev

```
node --test
```

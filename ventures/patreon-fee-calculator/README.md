# Patreon Fee Calculator

Patreon creators can use this free browser-local calculator to find real monthly payout from three pledge tiers — after their plan's platform fee (10% Standard, or 5%/8%/12% on a legacy Lite/Pro/Premium page) and per-charge payment processing fees — plus any other income they supply, then check it against a monthly payout goal. **After using this, you can tell whether billing patrons "per creation" instead of monthly is quietly costing you more in fees for the exact same pledge.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/patreon-fee-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why the pledge total is the wrong number to plan from

"$1,850 pledged this month" is not what lands in your bank account, because two fees come out before it reaches you, and one billing choice quietly changes how much of the second fee applies:

- **The platform fee is a flat percentage of pledge revenue**, set by your plan. A page created after August 4, 2025 is on the Standard plan (10%, flat processing rate on every charge). A page from before that keeps its legacy plan: Lite (5%), Pro (8%), or Premium (12%) — and only a legacy plan gets a lower processing rate on a small charge. The fee applies to your whole page, not per patron.
- **Payment processing is charged per charge, not per patron or per month.** A standard charge costs about 2.9% + $0.30, on every plan. A legacy plan additionally charges a "micropayment" rate — about 5% + $0.10 — on any charge under $3; the Standard plan has no such discount, ever.
- **Billing frequency decides how many charges a pledge produces.** Monthly billing charges a patron once a month for the whole pledge. Per-creation billing charges once per post instead — so the same total monthly pledge split across several posts produces several smaller charges, each paying its own fixed processing fee. See [`does-per-creation-billing-cost-more-in-fees.html`](does-per-creation-billing-cost-more-in-fees.html) for the worked comparison: splitting a $5 monthly pledge across 4 posts costs $90 more in fees than billing it monthly on the Standard plan (only $20.50 more on a legacy Pro plan, whose micropayment discount partly offsets it), for identical $500 gross revenue across 100 patrons.

This tool prices recurring Patreon membership pledges only — it deliberately does not estimate merch sales, one-time tips, or income from other platforms, since none of that runs through Patreon's processing. Any such income is a single figure the creator supplies, added after fees.

## Privacy and usage

Everything runs in your browser. Your plan, patron counts, pledges, billing choice, and income figures are never uploaded, and there is no account. We count anonymous local feature events only (`month-priced`, `gap-checked`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No patron counts, pledge amounts, or income figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. It is also not a payout tracker or a substitute for your own Patreon creator dashboard and payout statements. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers and rates you supply. It does not audit your payout history, confirm a deposit amount, or replace your own accountant. Not affiliated with, endorsed by, or sponsored by Patreon. Patreon is a trademark of Patreon, Inc., named here only to describe what this tool calculates — its platform fee percentages and payment processing rates change over time; verify every figure against your own current Patreon creator dashboard.

MIT licensed. See `LICENSE`.

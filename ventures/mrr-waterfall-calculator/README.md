# MRR Waterfall Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mrr-waterfall-calculator/>

The free MRR waterfall calculator answers a concrete question: **of the recurring revenue you started the month with, how much did you actually keep, and how much did upgrades and winbacks add back?** Enter starting MRR and this period's new, expansion, reactivation, contraction, and churned MRR. Get ending MRR, gross revenue retention (capped at 100%, counting only contraction and churn), net revenue retention (uncapped, adding expansion and reactivation back in), and the growth-to-loss quick ratio.

Open `index.html` in a browser. It needs no account, network request, API key, or billing-system connection. The math is a planning and reporting aid, not a forecast: reconcile it against your own billing export before reporting the figures externally.

[This calculator vs. tracking MRR in a spreadsheet](vs-tracking-mrr-in-a-spreadsheet.html) explains what a spreadsheet formula gets right and where it's easy to get gross and net retention backwards by hand.

## Privacy and usage

Everything runs in your browser. Your MRR figures are never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage. It stores no identity, IP address, URL, or revenue figures. Do Not Track and Global Privacy Control disable counting.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Opportunity assessment

SaaS founders without a paid subscription-analytics platform (Baremetrics, ChartMogul, ProfitWell) routinely search for "MRR waterfall calculator", "net revenue retention calculator", or "gross vs net revenue retention" -- terms that come up constantly in indie-SaaS and micro-SaaS communities (r/SaaS, r/microsaas, Indie Hackers) whenever a founder is preparing a board update or an investor update and needs the two numbers to actually be right. The two metrics are genuinely easy to compute incorrectly by hand: a common mistake is letting expansion or new MRR leak into gross revenue retention, which makes real churn invisible. This tool forces the correct definitions by construction rather than by instruction.

It complements rather than duplicates the portfolio's other SaaS-operator tools (`subscription-price-impact`, `saas-seat-true-up`): those model a specific pricing or seat-utilization decision, while this one reconciles a period's actual MRR movements after the fact. A later bring-your-own-key assistant could parse a pasted Stripe or billing-system export into the five movement fields, but the deterministic workflow is complete without AI.

Future revenue could be a hosted multi-period trend view, but launch stays free and client-side. Hosting is static with zero per-user inference or storage cost. Main risk is a user treating the output as a forecast rather than a reconciliation of numbers they already have, or double-counting a customer across categories (e.g. counting a downgrade as both contraction and part of new MRR); the FAQ and field labels address both directly.

Run tests with `node --test`.

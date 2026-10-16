# Subscription Price Impact

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/subscription-price-impact/>

The free SaaS price increase churn calculator answers a concrete question: **how much subscriber churn can a monthly price increase absorb before recurring revenue falls?** Enter subscriber count, current price, proposed price, and fixed monthly costs. Compare 0%, 5%, 10%, 15%, and 20% churn scenarios.

Open `index.html` in a browser. It needs no account, network request, API key, or customer export. The math is a planning aid, not a forecast: validate assumptions against your own retention data and run a controlled test where appropriate.

[How much can I raise my SaaS price?](how-much-can-i-raise-my-saas-price.html) answers the search question directly. [This calculator vs. Baremetrics](vs-baremetrics.html) explains why a free, no-signup what-if calculator and a paid, connected analytics platform answer different questions.

## Privacy and usage

Everything runs in your browser. Your numbers are never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage. It stores no identity, IP address, URL, or pricing inputs. Do Not Track and Global Privacy Control disable counting.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Opportunity assessment

Independent SaaS operators often search for “SaaS price increase calculator” or “how much churn can a price increase absorb.” Existing calculators usually show simple percentage changes, while this tool makes fixed-cost contribution and revenue break-even subscribers visible. It complements, rather than duplicates, the portfolio’s quote, marketplace, trade-bid, and fee calculators. A later bring-your-own-key assistant could explain a user’s own cohort export, but the deterministic workflow is complete without AI.

Future revenue could be a hosted scenario history or team experiment workflow, but launch stays free and client-side. Hosting is static with zero per-user inference or storage cost. Main risks are users treating scenarios as forecasts or using stale internal metrics; the UI explicitly labels results as assumptions and keeps the user responsible for decisions.

Run tests with `node --test calc.test.mjs`.

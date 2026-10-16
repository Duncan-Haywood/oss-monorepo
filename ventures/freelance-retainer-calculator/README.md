# Freelance Retainer Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-retainer-calculator/>

Independent consultants and freelancers can use this free browser calculator to turn a take-home income goal into a sustainable hourly floor and monthly retainer. It accounts for non-billable time, business costs, and a visible scope buffer instead of hiding those assumptions inside a generic rate.

**Value:** After using this, you can send a retainer price with included hours and an out-of-scope rate, compare 10–30 hour packages against the same capacity so you can quote a range, see whether that price still covers your hourly floor at 50%, 75%, 100%, and 125% usage, see whether a client's offered monthly price still clears the floor, see whether the month as a whole still reaches your income goal, see whether unused-hour rollover still covers the floor after a light first month, and see how much cash prepaid / Net 15 / Net 30 / month-end billing forces you to float — which used to take guesswork or a spreadsheet. The proposal summary can be copied or downloaded as a plain-text file for reliable handoff, and **Copy shareable link** puts the same assumptions — including income-goal, offered price, and payment terms — in the URL so a partner or future-you can reopen the exact plan.

## Clearing the floor is not reaching the goal

The hourly floor is your monthly revenue target divided by your billable capacity — the rate that works *if every billable hour sells*. One retainer rarely is the month. On the shipped defaults ($6,000 take-home, $1,800 costs, 160 hours, 65% utilization, a 20-hour block, 15% buffer) the floor is $75/hr and the retainer prices at $1,725, which clears the floor with buffer to spare and is **22% of the $7,800 target**. The other $6,075 rides on 84 hours nobody has bought, at a **96.4% fill rate**.

The income-goal block prices that assumption instead of hiding it. Enter what you already have committed (revenue and hours) and the share of the remaining hours you honestly expect to bill, and it reports the shortfall, the fill rate the goal actually needs, the hours that would close it, and the retainer price that would close it without selling another hour. Above 100% required fill it says so plainly: selling cannot close that gap, only price, capacity, or the goal can.

Those three inputs describe *your* month, not the client's, so they are deliberately kept out of the copyable proposal summary — a test asserts the summary never carries them. They do travel in a shareable plan link, because that link is for you or a partner, not the client. See [`will-this-retainer-hit-my-income-goal.html`](will-this-retainer-hit-my-income-goal.html) for the worked example.

Not modelled: seasonality, collection risk on the other clients' revenue, or hours lost to a client who churns mid-month. The fill rate is a single flat share you supply, not a forecast.

## Run and test

Open `index.html` in a browser. No server, account, API key, or paid dependency is needed. Run `node --test` (or `npm test`) for the pricing-math, share-link, and page tests.

Note for contributors: the pricing suite is `app.test.mjs`. It was called `test_app.mjs` until 2026-08-26, which matches none of Node's default test-file globs — `node --test` skipped all 117 of its assertions and reported green, and the venture had no CI workflow to catch it either. Keep the `*.test.mjs` suffix. Share-link encode/decode lives in `share.test.mjs`.

## Opportunity and differentiation

The target user is a solo freelancer preparing a proposal. Generic hourly-rate calculators often divide desired income by calendar hours, overstating capacity; project calculators do not answer the recurring retainer question. This niche is searchable through "freelance retainer pricing calculator", "should I charge a retainer or hourly", and "freelance hourly rate after expenses". A useful return loop is changing assumptions for each proposal, checking usage scenarios, and copying a scope summary. Future revenue could be a hosted history/export tier or a bring-your-own-key AI scope reviewer, but the free deterministic workflow comes first.

Alternatives include spreadsheets, Bonsai/Harvest calculators, and advice articles. Differentiation is a transparent capacity model, a scope-risk buffer, and a proposal-ready output with no account or data upload. It fits the portfolio's static-page infrastructure but is not a marketplace-fee calculator, trade bid calculator, or evidence checker.

Operating cost is zero at launch: all calculations and anonymous event counts stay in local browser storage. Security risk is limited to local user input and clipboard access initiated by the user. The output is financial planning information, not financial advice; the user remains responsible for taxes, contracts, and pricing decisions.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are no accounts, tracking cookies, or analytics vendors. The product counts only aggregate local `calculate`, `retainer_usage_compared`, `income_coverage_compared`, `income_goal_short`, `unused_hour_rollover_compared`, `payment-terms-float`, `payment_terms_compared`, `scenario_table_viewed`, `apply-scenario`, `copy-summary`, `download-summary`, and `share-link` events, never people, IPs, content, or cross-site identifiers. `income_coverage_compared` fires only when a month-level input is actually edited, so whether anyone engages with the income-goal view is separable from ordinary retainer pricing. A shareable link encodes the planning fields in the URL hash; it is not sent to a server. The checkbox in the footer turns counting off; clearing browser storage removes the local count.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial advice and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## License

MIT. See `LICENSE`.

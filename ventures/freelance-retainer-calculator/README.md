# Freelance Retainer Pricing Calculator

Independent consultants and freelancers can use this free browser calculator to turn a take-home income goal into a sustainable hourly floor and monthly retainer. It accounts for non-billable time, business costs, and a visible scope buffer instead of hiding those assumptions inside a generic rate.

**Value:** After using this, you can send a retainer price with included hours and an out-of-scope rate, see whether that price still covers your hourly floor at 50%, 75%, 100%, and 125% usage, see whether unused-hour rollover still covers the floor after a light first month, and see how much cash prepaid / Net 15 / Net 30 / month-end billing forces you to float — which used to take guesswork or a spreadsheet. The proposal summary can be copied or downloaded as a plain-text file for reliable handoff.

## Run and test

Open `index.html` in a browser. No server, account, API key, or paid dependency is needed. Run `node test_app.mjs` for the pricing-math tests.

## Opportunity and differentiation

The target user is a solo freelancer preparing a proposal. Generic hourly-rate calculators often divide desired income by calendar hours, overstating capacity; project calculators do not answer the recurring retainer question. This niche is searchable through "freelance retainer pricing calculator", "should I charge a retainer or hourly", and "freelance hourly rate after expenses". A useful return loop is changing assumptions for each proposal, checking usage scenarios, and copying a scope summary. Future revenue could be a hosted history/export tier or a bring-your-own-key AI scope reviewer, but the free deterministic workflow comes first.

Alternatives include spreadsheets, Bonsai/Harvest calculators, and advice articles. Differentiation is a transparent capacity model, a scope-risk buffer, and a proposal-ready output with no account or data upload. It fits the portfolio's static-page infrastructure but is not a marketplace-fee calculator, trade bid calculator, or evidence checker.

Operating cost is zero at launch: all calculations and anonymous event counts stay in local browser storage. Security risk is limited to local user input and clipboard access initiated by the user. The output is financial planning information, not financial advice; the user remains responsible for taxes, contracts, and pricing decisions.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are no accounts, tracking cookies, or analytics vendors. The product counts only aggregate local `calculate`, `retainer_usage_compared`, `unused_hour_rollover_compared`, `payment-terms-float`, `payment_terms_compared`, `copy-summary`, and `download-summary` events, never people, IPs, content, or cross-site identifiers. The checkbox in the footer turns counting off; clearing browser storage removes the local count.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial advice and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## License

MIT. See `LICENSE`.

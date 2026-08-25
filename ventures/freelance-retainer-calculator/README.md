# Freelance Retainer Pricing Calculator

Independent consultants and freelancers can use this free browser calculator to turn a take-home income goal into a sustainable hourly floor and monthly retainer. It accounts for non-billable time, business costs, and a visible scope buffer instead of hiding those assumptions inside a generic rate.

**Value:** After using this, you can send a retainer price with included hours and an out-of-scope rate, which used to take guesswork or a spreadsheet. You can also see how the retainer sits in a month that already has other clients, and whether a cheaper offered price still clears your floor. The proposal summary can be copied, downloaded, or restored from a private planning link.

## Run and test

Open `index.html` in a browser. No server, account, API key, or paid dependency is needed. Run `node test_app.mjs` for the pricing-math tests.

## Opportunity and differentiation

The target user is a solo freelancer preparing a proposal. Generic hourly-rate calculators often divide desired income by calendar hours, overstating capacity; project calculators do not answer the recurring retainer question. This niche is searchable through "freelance retainer pricing calculator", "how to price a monthly retainer", and "freelance hourly rate after expenses". A useful return loop is changing assumptions for each proposal and copying a scope summary. Future revenue could be a hosted history/export tier or a bring-your-own-key AI scope reviewer, but the free deterministic workflow comes first.

Alternatives include spreadsheets, Bonsai/Harvest calculators, and advice articles. Differentiation is a transparent capacity model, a scope-risk buffer, and a proposal-ready output with no account or data upload. It fits the portfolio's static-page infrastructure but is not a marketplace-fee calculator, trade bid calculator, or evidence checker.

Operating cost is zero at launch: all calculations and anonymous event counts stay in local browser storage. Security risk is limited to local user input and clipboard access initiated by the user. The output is financial planning information, not financial advice; the user remains responsible for taxes, contracts, and pricing decisions.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are no accounts, tracking cookies, or analytics vendors. The product counts only aggregate local `calculate`, `copy-summary`, `download-summary`, `compare-offer`, and `copy-share-link` events, never people, IPs, content, or cross-site identifiers. The checkbox in the footer turns counting off; clearing browser storage removes the local count. A planning link stores the numbers in the URL hash so you can bookmark or send a scenario without uploading anything.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial advice and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## License

MIT. See `LICENSE`.

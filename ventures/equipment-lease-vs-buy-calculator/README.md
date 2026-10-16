# Equipment Lease vs Buy Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/equipment-lease-vs-buy-calculator/>

**Should your business lease or buy the equipment?** Enter the purchase quote (price, sales tax, down payment, loan APR and term) and the lease quote (monthly payment, term, amount due at signing, buyout). The calculator converts both into an **after-tax present-value cost** over the lease term, names the cheaper path, solves the **interest rate the lease is really charging**, and finds the **break-even resale value** at which the two cost the same. It also re-runs the purchase under five depreciation methods (full expensing, 5- and 7-year MACRS, straight line, none) and shows a resale-value by discount-rate sensitivity grid.

Open `index.html` in a browser. It needs no account, network request or API key. Export the result as CSV, or copy a shareable link (the inputs live in the link itself).

## The model

- Horizon = the lease term. Payments are monthly in arrears; the lease's amount due at signing is paid at month 0 and deducted evenly over the term.
- Buying: down payment at month 0, level-payment loan, loan interest deductible as paid. Price plus sales tax is the depreciable basis; deductions save tax at the end of each ownership year (capped at the horizon). At the horizon the equipment is sold for the resale value, any remaining loan balance is repaid, and the gain over remaining tax basis is taxed at the same rate (recapture as ordinary income).
- Leasing: payments are fully deductible as paid. If a buyout price is entered the equipment is kept, valued at the resale value, and the gain over the buyout price is taxed.
- Costs are discounted at the user's discount rate (what spare cash earns or costs). The cost is linear in the resale value, so the break-even is solved exactly.
- The implied lease rate is the annual rate (nominal, monthly compounding) at which the payments, the signing amount and the end value (resale, or buyout if kept) equal the equipment price.

Not modelled: Section 179 dollar limits and taxable-income caps, business-use percentage, state tax differences, maintenance, insurance, downtime and early-termination fees. Treat the output as a planning aid and check it with your accountant.

## Privacy and usage

Everything runs in your browser. Your numbers are never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage (`comparison_calculated`, `csv_exported`, `share_link_copied`). It stores no identity, IP address, URL, or figures. Do Not Track and Global Privacy Control disable counting. A shared link contains the inputs it was made from.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, tax, legal or accounting advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Development

`calc.mjs` is a pure ES module (also holds CSV and URL-state encoding). Run tests with `node --test`.

# Investor Update Builder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/investor-update-builder/>

Free, browser-only monthly investor update for startup founders. Enter MRR, customers and
cash for a few months; it works out growth, net burn, runway, burn multiple and a
default-alive check, then writes the update email with your highlights, lowlights, asks
and hiring.

- growth month over month and compound over the last three months;
- net burn that excludes money raised, averaged over three months, with the month the cash runs out;
- burn multiple (with the usual amazing / great / good / suspect / bad bands), SaaS quick ratio, MRR churn and net revenue retention from the month's MRR movements, with a check that the movements add up;
- the default-alive test: does revenue overtake flat expenses before cash runs out at the current growth rate, and what monthly growth would it take;
- plain-text and Markdown email, suggested subject line, CSV, and save/load as JSON so next month starts from this month.

Open `index.html` over any static server (it is an ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - metrics, projection and email assembly.
- `usage.mjs` - local-only feature counters with an opt-out.
- `what-is-a-burn-multiple.html` - guide whose worked example the test suite recomputes.

**No warranty.** Free and as-is; arithmetic on the numbers you type and a text template,
not legal, financial or securities advice. Check every figure before sending it.
The property tests run hundreds of random histories and assert runway times burn equals
cash, that being default alive is monotone in growth, and that the required growth rate
lies on the boundary.

**Privacy.** Everything runs in your browser; nothing is uploaded. Anonymous feature
counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

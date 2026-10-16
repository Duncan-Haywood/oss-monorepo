# Kids Birthday Party Package Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/kids-birthday-party-package-profit-calculator/>

Free, browser-only calculator for trampoline parks, bounce gyms, play cafes and family
entertainment centers. Enter the package price, children included, party length, setup and
cleanup, hosts and pay, food and goodie cost per child, card fees, the open-play margin the
party displaces, and your yearly rent, insurance and utilities. It shows **true profit per
party, margin and profit per room hour**, the **lowest package price that earns your target
margin** (and per child), break-even parties a year, and compares two packages side by side.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - party economics, lowest price, break-even, comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-a-kids-birthday-party-package-really-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, insurance
or financial advice. Not affiliated with any venue chain or booking platform. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.

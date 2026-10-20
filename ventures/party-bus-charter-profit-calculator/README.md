# Party Bus Charter Profit Calculator

Free, browser-only calculator for party bus, limo and shuttle charter operators. Enter the
charter price, hours booked and your minimum, deadhead and positioning hours, miles, fuel,
cleaning, the gratuity share you pay the driver, card fees, the vehicle's cost and expected
charters, and your yearly insurance/storage/permit overhead. It shows **true profit per
charter, margin and profit per vehicle hour**, the **lowest quote that earns your target
margin**, how many charters a vehicle needs to **pay for itself**, break-even charters a year,
and compares two charters side by side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/party-bus-charter-profit-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - charter economics, minimum hours, minimum quote, payback, comparison, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-much-does-a-party-bus-charter-really-make.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not tax, legal, insurance
or financial advice. Not affiliated with any vehicle maker or booking platform. **Privacy.**
Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.

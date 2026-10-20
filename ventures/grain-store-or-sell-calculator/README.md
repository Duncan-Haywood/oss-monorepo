# Grain Store or Sell Calculator

Free, browser-only calculator for farmers deciding whether to sell corn, soybeans,
wheat or sorghum at harvest or store it for a later price. It takes out water
shrink, drying, handling shrink, storage, interest on the money not received and
bin loss, shows what each later price nets against selling now, and finds the
**break-even price** for storage to pay.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/grain-store-or-sell-calculator/

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - moisture shrink, costs of waiting, break-even, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `corn-store-or-sell-at-harvest.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not marketing,
financial or tax advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.

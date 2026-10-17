# Ghost kitchen brand picker

After using this, you can now see which virtual brands to keep running out of one delivery-only kitchen when you cannot staff
them all, with every combination checked exactly, which used to mean adding brands until the line jammed or dropping the one
with the lowest sales.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ghost-kitchen-brand-picker/

Free, runs in the browser, nothing is uploaded. Open `index.html`.

- Up to 14 brands, each with weekly orders, order value, food cost %, delivery-app fee %, packaging, prep minutes and its own monthly cost.
- The set of brands that earns the most a month inside your kitchen hours (exact, every set checked).
- Each brand's profit per order, per kitchen hour, and break-even orders a week.
- The exact answer against the usual rules: best profit per kitchen hour, biggest profit, best margin, as listed.
- What 25%, 50% and 100% more kitchen hours would add.
- Whether the answer holds if every brand's orders came in 30% lower or higher.
- CSV download.

```
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax,
accounting, compliance, or financial advice. **You are responsible for reviewing and verifying its output before relying on
it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without
notice. Do not use this as a system of record.

MIT licence. Optional support: https://github.com/sponsors/Duncan-Haywood

# Wedding flower order optimizer

After using this, you can now see the cheapest wholesale order that covers every stem an event needs, with a damage allowance and
the spare stems it leaves, which used to mean rounding each flower up to a whole box by feel and over-ordering to be safe.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/wedding-flower-order-optimizer/

Free, runs in the browser, nothing is uploaded. Open `index.html`.

- Up to 15 flowers, each with stems needed, a bunch (pack A) and an optional bigger box (pack B).
- Every mix of the two packs is tried, so the cheapest exact order is returned.
- Spare stems and their value, and the saving over buying the small pack only.
- Wholesale cost as a share of the client's flower budget.
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

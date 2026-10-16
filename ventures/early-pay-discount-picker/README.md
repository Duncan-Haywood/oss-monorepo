# Early pay discount picker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/early-pay-discount-picker/>

After using this, you can now see which supplier invoices to pay early when several offer 2/10 net 30 style discounts and
there is not enough cash to take them all, with every combination checked exactly, which used to mean paying whoever called
first or ranking by gut feel.

Free, runs in the browser, nothing is uploaded. Open `index.html`.

- Up to 14 invoices, each with an amount, a discount percentage, a last day to take the discount and a due day.
- The set of invoices that nets the most after your cost of cash, within a cash limit (exact, every subset checked).
- Each invoice's annual rate (2/10 net 30 is about 37%).
- The exact answer against the usual rules: highest rate first, biggest discount first, earliest deadline first, as listed.
- What 25%, 50% and 100% more cash would add.
- Whether the answer holds if your cost of cash were half or double what you entered.
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

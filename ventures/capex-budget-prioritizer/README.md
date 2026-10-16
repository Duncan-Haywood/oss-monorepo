# Capex budget prioritizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/capex-budget-prioritizer/>

After using this, you can now see which equipment, vehicle, software or building projects to fund from a limited budget,
with the combination worth the most in net present value checked exactly, which used to take a spreadsheet and a guess at
which projects to leave out.

Free, runs in the browser, nothing is uploaded. Open `index.html`.

- Net present value, internal rate of return and payback for each project.
- The best set that fits the budget, found by checking every combination (up to 12 projects).
- Option groups (at most one of two quotes, buy against lease) and must-do projects.
- The exact answer against the usual shortcuts (shortest payback first, best return per dollar first).
- What the next slice of budget would buy, and whether the answer changes at a discount rate 5 points either side.
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

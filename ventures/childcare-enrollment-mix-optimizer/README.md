# Childcare enrollment mix optimizer

After using this, you can now see how many infants, toddlers, twos, preschoolers and school-age children to enrol to make the
most weekly profit from your floor space, with the staffing staircase and licensing ratios built in, which used to take trial
and error on a spreadsheet and a guess that the highest-tuition room should fill first.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/childcare-enrollment-mix-optimizer/

Free, runs in the browser, nothing is uploaded. Open `index.html`.

- The exact best enrolment across up to 6 age groups, found by dynamic programming over children and floor space.
- Ratio and group-size staircase: where each extra teacher is triggered, what the next child adds or costs, places left before the next hire.
- Comparison with filling the highest-tuition group first and filling by tuition per square foot.
- What the next slice of floor space would earn, and the plan's exposure to a one-child-tighter ratio rule and 10% higher wages.
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

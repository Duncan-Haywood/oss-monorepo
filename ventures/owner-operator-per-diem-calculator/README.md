# owner-operator-per-diem-calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/owner-operator-per-diem-calculator/>

A private, in-browser calculator for self-employed (owner-operator) over-the-road truck drivers.
Enter full days and travel days away from home and the M&IE per diem rate; the page applies the
travel-day percentage and the 80 percent DOT hours-of-service limit, compares the per diem
deduction with actual meal receipts, shows the larger figure, and estimates the self-employment
tax (15.3 percent of 92.35 percent, Social Security wage-base aware) and income tax it saves.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- The default rates ($80 CONUS, $86 OCONUS) and every rule on the page must be verified against
  the current GSA and IRS notices. Not tax advice. Independent of the IRS, GSA and DOT.
- Related: `owner-operator-cpm-calculator`, `ifta-quarterly-fuel-tax-calculator`.

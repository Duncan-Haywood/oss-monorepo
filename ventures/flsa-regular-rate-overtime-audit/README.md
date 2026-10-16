# FLSA Regular-Rate Overtime Audit

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/flsa-regular-rate-overtime-audit/>

Free, browser-only audit of overtime paid on the wrong rate. Paste payroll rows
(name, week, hours, hourly rate, nondiscretionary bonus, shift differential or
commission, excluded pay, overtime premium actually paid). It reports:

- **Regular rate** per employee per workweek: total includable remuneration
  divided by total hours worked (29 CFR 778.109). Excluded pay is left out.
- **Overtime premium owed**: half the regular rate for every hour over 40.
- **Back pay**: owed minus paid. If you leave "paid" blank it assumes the premium
  was paid on the base rate, which is the usual payroll error.
- **Exposure**: the average weekly shortfall projected over the 2-year lookback
  and the 3-year willful lookback, with an optional liquidated-damages multiplier.
- **Export**: CSV and plain text.

Rules (threshold, premium factor, lookbacks, multiplier) are editable.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - payroll parsing, regular rate, premium, roll-ups, exposure, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `flsa-regular-rate-overtime-explained.html` - guide with a worked example the test suite recomputes.

**No warranty.** Free and as-is; not legal advice. The preset summarises public
law, may be wrong or out of date, and ignores state overtime rules, exemptions,
fluctuating-workweek and belo plans, and the inclusion and exclusion of specific
pay types. Verify every figure with an employment attorney or the Department of Labor.

**Privacy.** Everything runs in your browser; names and payroll are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

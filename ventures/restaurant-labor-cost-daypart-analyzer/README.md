# Restaurant Labor Cost Analyzer

A free browser tool for restaurant owners: **drop in your sales-by-hour report and your time-entry
export and see which dayparts and hours run over your labor target.** Both files are read in the
browser; nothing is uploaded and no POS login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/restaurant-labor-cost-daypart-analyzer/

After using this, you can now **see labor % of sales and sales per labor hour by daypart, weekday
and hour, and an estimate of the labor above your target you could trim without dropping under a
minimum crew**, which used to mean lining up two exports in a spreadsheet by hand.

For pricing the menu, see [`menu-engineering-calculator`](../menu-engineering-calculator/) and
[`restaurant-pos-menu-mix-analyzer`](../restaurant-pos-menu-mix-analyzer/).

## Input

- Sales CSV: a date or date-time column, an hour column when the date has no time, and net sales.
  A per-check export works; rows are grouped by hour.
- Time-entry CSV: clock-in and clock-out date-times with a rate or pay column, or a date and hours.
- Assumptions: target labor %, payroll burden % (placeholder), minimum crew, optional default wage,
  business-day start hour, roles to leave out, and dayparts.

**Column names are matched by alias and unverified against real Toast, Square, Clover or 7shifts
exports.** Comma, semicolon and tab files, UTF-16, `$` signs and thousands separators are read.
Dates are month/day/year unless the first number is above 12.

## Model

Each shift's cost (pay, else rate x hours, else the default wage) plus burden is spread over the
clock hours it covers by minutes. Labor % = labor cost / net sales for the slot. Trimmable = per
weekday-and-hour slot above target, the excess dollars capped at the labor above the minimum crew.
Not modelled: overtime premiums beyond the pay column, tips, benefits, salaried labor, prep and side
work, service standards, forecast sales.

## Run

Open `index.html` through any static server. Tests: `node --test`.

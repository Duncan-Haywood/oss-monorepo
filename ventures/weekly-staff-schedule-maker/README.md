# Weekly Staff Schedule Maker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/weekly-staff-schedule-maker/>

Free, browser-only weekly schedule generator for restaurants, cafes, shops,
salons and other small shift teams. List each person (roles, weekly hour limit,
minimum hours, hourly rate, days off) and the shifts to cover; it assigns people
so every rule holds -- role match, days off, one shift a day, weekly hour cap,
minimum rest between shifts (including Sunday night into Monday morning) and a
longest run of working days -- shares hours fairly as a share of each person's own
limit, spreads weekend shifts, explains every shift it cannot cover, estimates
labor cost, and exports CSV, a grid and plain text. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - staff and shift parsers, scarcity-ordered greedy construction, a
  seeded reassign/swap local search with restarts, an independent validator, and
  CSV / text exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-make-a-staff-schedule.html` - step-by-step guide.

**No warranty.** Free and as-is; a planning aid, not legal, employment or payroll
advice. It does not know predictive-scheduling laws, break rules or overtime rules
where you operate. Review every shift before you share a schedule.

**Privacy.** Everything runs in your browser; names, rates and shifts are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

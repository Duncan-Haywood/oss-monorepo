# payroll-hours-csv-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/payroll-hours-csv-check/>

Checks a payroll hours / timesheet CSV in the browser before it is keyed or imported into a payroll
service: 8:30 mixed with 8.5, unit text, Excel date serials, mixed date formats, duplicate person-days,
hours over 24, Start/End arithmetic that disagrees with the hours typed, overnight shifts and unquoted
commas in names, each with its line number, plus a safe-fixes pass that only touches formatting.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Checks the sheet, not any one vendor's importer, and lists what it does not check. Not wage-and-hour
  or payroll advice; it never changes an hour, a date or a break.
- The file never leaves the browser; a test asserts there are no network calls.

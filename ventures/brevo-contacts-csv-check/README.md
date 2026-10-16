# brevo-contacts-csv-check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/brevo-contacts-csv-check/>

Checks a Brevo (formerly Sendinblue) contacts import CSV in the browser before it is imported: emails and
duplicates, rows with neither email nor SMS, SMS numbers with no country code or ruined by Excel,
unquoted commas, mixed date formats and near-miss column names, each with its line number, plus a
safe-fixes pass that only touches formatting.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Brevo's public CSV import help and listed on the page, along with
  what is not checked. Not affiliated with Brevo.
- Permission to market must come from real opt-in. The tool checks formatting and never creates or
  changes consent.
- The file never leaves the browser; a test asserts there are no network calls.

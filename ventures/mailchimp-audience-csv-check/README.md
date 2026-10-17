# mailchimp-audience-csv-check

Checks a Mailchimp audience import CSV in the browser before it is imported: emails and duplicates,
rows with no email, unquoted commas in Tags, birthday format, phone Excel damage, mixed date formats
and near-miss column names, each with its line number, plus a safe-fixes pass that only touches
formatting.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mailchimp-audience-csv-check/

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Mailchimp's public CSV import help and listed on the page, along with
  what is not checked. Not affiliated with Mailchimp.
- Permission to market must come from real opt-in. The tool checks formatting and never creates or
  changes consent.
- The file never leaves the browser; a test asserts there are no network calls.

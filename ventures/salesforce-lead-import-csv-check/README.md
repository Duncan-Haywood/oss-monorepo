# salesforce-lead-import-csv-check

Checks a Salesforce lead import CSV in the browser before the Data Import Wizard or Data Loader
sees it: required LastName and Company, email format and typos, repeated emails, default picklist
values, numeric fields, field lengths, Excel damage to phones and IDs, and mixed date orders, each
with its line number, plus a safe-fixes pass that only touches formatting.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/salesforce-lead-import-csv-check/

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of Salesforce's public import documentation and listed on the page,
  along with what is not checked (the org's own picklists, validation and duplicate rules). Not
  affiliated with Salesforce.
- The file never leaves the browser; a test asserts there are no network calls.

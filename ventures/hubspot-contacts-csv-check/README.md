# hubspot-contacts-csv-check

Checks a HubSpot contacts import CSV in the browser before it is imported: matching (email or
Record ID), email format and typos, repeated emails, phone and ZIP damage from Excel, lifecycle
stage and lead status values, and mixed date orders, each with its line number, plus a safe-fixes
pass that only touches formatting.

- Static ES modules, no build step, no dependencies. Open `index.html` or run `node --test`.
- `calc.mjs` is pure (no DOM, no network); `usage.mjs` keeps opt-out, local-only event counts.
- Rules are read from memory of HubSpot's public import documentation and listed on the page,
  along with what is not checked. Not affiliated with HubSpot.
- The file never leaves the browser; a test asserts there are no network calls.

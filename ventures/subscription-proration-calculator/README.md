# Subscription Proration Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/subscription-proration-calculator/>

Free, private browser tool for SaaS founders and support teams: billing period, amount billed and mid-cycle changes become day-count segments, the credit or charge due, tax, the next renewal, in either "keep the renewal date" or "restart the period" mode, plus a table of the balance for the same change on other dates.

After using this, you can answer "what do I charge or credit for a change on day 17?" in seconds, which used to take a spreadsheet and a rounding argument.

Open `index.html`. Tests: `node --test 'ventures/subscription-proration-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal, tax or financial advice. Check results against your billing provider's preview. See `VENTURE.yaml`.

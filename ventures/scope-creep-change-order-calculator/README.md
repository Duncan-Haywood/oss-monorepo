# Scope Creep Change Order Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/scope-creep-change-order-calculator/>

Price a client's "one more thing" on a fixed-price project. Enter the quoted price and hours plus the
extra requests; get a change order at the rate your quote implies (optionally with a rush premium and a
free allowance), the schedule impact, and what absorbing the work would cost your effective hourly rate.

```
printf 'Add SSO | 6\nDark mode | 4h\nPDF export | 1d\n' | node cli.mjs --price 6000 --hours 60 --premium 15 --client Acme
node cli.mjs --price 6000 --hours 60 --file requests.txt --format csv
node cli.mjs --price 6000 --hours 60 --file requests.txt --max-creep-pct 20   # exit 1 over the cap
```

Browser version: `index.html` (nothing is uploaded). Node 18+, no dependencies, no network.

Arithmetic on your own estimates; not a contract, a quote or legal advice. MIT licence.

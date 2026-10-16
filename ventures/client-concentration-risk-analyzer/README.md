# Client Concentration Risk Analyzer

How much of your revenue depends on one client? Paste an invoice export (client, optional date, amount) and
see every client's share, the top-1/3/5 shares, the Herfindahl index, whether the biggest client's share is
rising, and whether average monthly revenue without them still covers your costs. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/client-concentration-risk-analyzer/

```
node cli.mjs analyze invoices.csv
cat invoices.csv | node cli.mjs analyze -
node cli.mjs analyze invoices.csv --costs 24000 --months 12
node cli.mjs analyze invoices.csv --warn-top1 20 --json --fail-on warn   # cron/CI: exit 1 when a client crosses the line
```

Input: rows of `client,amount` or `client,date,amount` (a header row is read by name, so QuickBooks/Xero
sales-by-customer style exports paste as they are). Names merge case-insensitively; credit notes net out.

## What is arithmetic and what is a rule of thumb

Arithmetic: shares, Herfindahl index (sum of squared shares x 10,000), effective clients (1 / sum of squared
shares), revenue without the top client, the older-half vs newer-half share of the top client.

Rule of thumb: the levels that raise findings (default 25% warn / 40% error for one client, 60% / 80% for the
top three). Lenders, buyers and insurers each use their own; change them with `--warn-top1` etc. Contract
length, churn risk and replaceability are not modelled.

# AWS Bill Change Explainer

A free, offline tool that reads the CSV AWS Cost Explorer lets you download and
answers one question: **why did the bill go up between these two periods?**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/aws-bill-change-explainer/

After using this, you can name the two or three lines that explain a monthly
jump in under a minute, with no signup, no IAM role and no upload, which used
to mean clicking through Cost Explorer filters and comparing charts by eye.

- A **ranked table** of every line (service, account, region or usage type,
  whatever your export is grouped by), biggest move first, with its share of
  the total rise.
- **New and gone** lines called out: a service that did not exist last month,
  or one that stopped.
- **Partial-month normalisation.** Give the number of days in each period and
  the earlier one is scaled to the later one's length, so a half-finished month
  does not read as a drop.
- A **checklist of common causes** for the services that rose (for example NAT
  gateway and EBS under `EC2 - Other`, log ingestion under CloudWatch). It
  carries no prices, so it cannot go stale on a number, and it is a prompt for
  where to look, never a diagnosis.
- **Accounting lines named as such.** Tax, Support, Savings Plans, Reserved
  Instances and credits move because of other lines or a contract; the output
  says so instead of sending you hunting for a service.
- A **cropped-export check**: Cost Explorer prints its own total row, and if
  the rows do not add up to it, a row was filtered and the tool warns.
- A **gate**: `--max-increase-usd` and `--max-increase-pct` make the CLI exit 1
  when the net rise is above a threshold, for a monthly script.

**What it is not:** a billing tool, a FinOps platform, live data, budgets or
anomaly detection. See [the comparison page](vs-cost-explorer.html).

## Use it

In Cost Explorer: group by **Service**, granularity **Monthly**, at least two
months, **Download CSV**. Then either paste it into `index.html`, or:

```
node cli.mjs compare export.csv                          # last two periods
node cli.mjs compare export.csv --before 2026-07-01 --after 2026-08-01
node cli.mjs compare july.csv august.csv                 # one period per file
node cli.mjs compare export.csv --before-days 31 --after-days 12
node cli.mjs compare export.csv --max-increase-pct 15 --max-increase-usd 500
node cli.mjs compare export.csv --json
```

Exit codes: `0` ok, `1` a gate was exceeded, `2` the file or an option could not
be used. Node 18+, no dependencies, no network call.

## Tests

```
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Limits

It ranks and scales the numbers in the file you give it. It cannot see why a
line moved. The cause checklists were written 2026-10-03 from general knowledge
of how AWS bills behave and were not checked against a live account. Not
affiliated with Amazon Web Services. No warranty; not billing, financial or
professional advice. MIT licence.

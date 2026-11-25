# Supabase Bill Estimator

Estimate a monthly Supabase Pro bill from the usage numbers on your dashboard, and
see which changes cut it most, each with a dollar figure — before the invoice.

**Live tool:** https://marisstella.app/supabase-bill-estimator/

```
node cli.mjs template > usage.csv                 # product,usage CSV to fill in
node cli.mjs estimate usage.csv
cat usage.csv | node cli.mjs estimate - --budget 500      # CI gate: exit 1 over budget
node cli.mjs estimate usage.csv --set egress_gb=2000 --json
node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json
```

`usage.csv` is `product,usage` (header optional, `#` comments allowed):
`pro_orgs`, `compute_usd`, `db_disk_gb`, `db_projects`, `egress_gb`,
`cached_egress_gb`, `storage_gb`,
`mau_thousand`, `edge_invocations_million`, `realtime_messages_million`.

Levers ranked by saving: rightsize compute, trim uncached egress, serve
storage from the CDN (moves egress to the cached meter), shrink the database,
clean up storage, cache Edge Functions, batch Realtime, block fake sign-ups,
consolidate organizations.
Each is computed alone under an assumption printed next to it (editable with
`--assume`), so the savings **overlap and are not additive**.

Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## How Supabase meters it (checked 2026-11-16)

Against Supabase's own billing docs (`manage-your-usage/egress`, `disk-size`,
`storage-size` and `cost-control`), whose worked examples are pinned as tests
in `engine.test.mjs`:

- **Quotas are per organization.** Each Pro organization gets its own quotas
  (egress, storage, monthly active users, Edge Function invocations, Realtime
  messages) and its own $10 compute credit, so the allowances scale with
  `pro_orgs`. Merging two orgs gives up one set of quotas, so "consolidate
  organizations" is offered only with two or more orgs and only when it still
  saves money.
- **Disk is per project.** Each project's primary gp3 disk includes 8 GB and is
  billed on provisioned size. `db_projects` sets the count (0 means one per
  org). Disk is entered as the total and checked against the pooled quota, so
  with uneven projects (one at 5 GB, one at 20 GB) the line is a lower bound:
  enter only the projects above 8 GB to make it exact. Supabase's example (8,
  8 and 50 GB) comes out at $65.25 here and $65.24 on its invoice (GB-hour
  rounding).
- **Cached egress is its own meter.** `egress_gb` is uncached egress ($0.09 a
  GB over 250 GB); `cached_egress_gb` is CDN cache hits ($0.03 a GB over its own
  250 GB). The dashboard's Total Egress includes both. The "serve from the
  CDN" lever moves egress to the cached meter rather than deleting it.
- **Spend cap.** On by default for Pro. With it on, overage on disk, both
  egress meters, storage, MAU, Edge Functions and Realtime is not billed (the
  service is restricted instead); compute is never capped. The total prices
  the cap off; the summary and `--json` (`cappedOverage`, `withSpendCap`) give
  the bill with it on.

Not modelled: io2 disks, read replicas, IPv4, PITR, custom domains, Realtime
peak connections, image transformations, log drains, Team and Enterprise
plans. Audit: `portfolio/quality/audits/2026-11-15-supabase-bill-estimator.json`.

## What it is not

Arithmetic on the numbers you give, at approximate public Pro-plan list prices
dated in the source (`PRICES_AS_OF`) and editable with `--prices` (including the
included allowances and the monthly usage credit); check
<https://supabase.com/pricing>. It cannot see your plan, regions, spend
limits, contract or real invoice. Not a bill reader, a guarantee or advice. Not
affiliated with Supabase Inc.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) calculates locally and never uploads anything.

## Licence

FSL-1.1-MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**

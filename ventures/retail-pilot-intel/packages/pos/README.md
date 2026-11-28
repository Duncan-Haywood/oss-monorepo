# @retail-pilot/pos

POS normalization into `SaleEvent`.

```bash
pnpm exec tsx packages/pos/src/cli.ts --sample
```

## Real ingest: generic CSV export

Most POS systems can export a flat, line-item-per-row CSV (one row per SKU
sold, grouped by a receipt/transaction id). `--file` normalizes one of these
into `SaleEvent` JSON files, the same output shape as `--sample`:

```bash
pnpm exec tsx packages/pos/src/cli.ts --file fixtures/sample-export.csv
```

Required columns: `receipt_id, closed_at, sku, quantity, unit_price_cents`.
Optional: `currency` (a three-letter ISO 4217 code, any case; empty means
`EUR`, anything else is rejected), `description`, `payment_method`
(free text, mapped to `cash`/`card`/`mixed`/`other`), `store_id` (defaults to
`$STORE_ID`), `pos_vendor`. Rows missing a required column, with an
unparsable `closed_at`, or a non-integer `quantity`/`unit_price_cents` are
skipped with a warning rather than aborting the whole file — see
`src/importer.ts`.

`closed_at` takes `YYYY-MM-DDTHH:MM[:SS]` (a space also works for the `T`).
With `Z` or `+HH:MM` it is that instant; without one it is the till's
wall-clock time in the store's zone, Europe/Rome unless `--tz <IANA zone>` or
`$STORE_TZ` says otherwise. Other formats (`19/08/2026 10:00`) are rejected
rather than guessed.

This covers a manual/scheduled export (email a CSV, drop it in a watched
folder) as the first real ingest path. A live POS API integration is a
separate, vendor-specific connector to add once a pilot store's actual POS
system is known.

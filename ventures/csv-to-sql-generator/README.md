# CSV to SQL Generator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/csv-to-sql-generator/>

Paste a CSV, get a **CREATE TABLE and batched INSERT statements** for PostgreSQL, MySQL,
SQLite, SQL Server or BigQuery. Column types come from reading every row: integers and
bigints, decimals sized to the longest value, booleans, dates, timestamps and UUIDs are
recognised; ZIP-style codes with leading zeros stay text; ambiguous `03/04/2024` dates are
flagged and follow your choice; empty cells and `NULL` load as NULL. Anything it had to
guess is listed.

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no
network calls. [`how-to-import-a-csv-into-a-database.html`](how-to-import-a-csv-into-a-database.html)
covers INSERT vs `COPY` vs `LOAD DATA` vs `.import` vs `bq load`, and the traps.

After using this, you can turn an export into a loaded table with sensible types, which
used to mean hand-writing CREATE TABLE, escaping quotes and fixing the dates.

## CLI

```
node cli.mjs data.csv                                  # PostgreSQL
node cli.mjs data.csv --dialect mysql --table orders --drop
cat export.csv | node cli.mjs --dialect sqlite | sqlite3 app.db
node cli.mjs data.csv --dialect bigquery --dmy --no-header
```

Options: `--dialect`, `--table`, `--no-header`, `--drop`, `--batch N`, `--delimiter C`,
`--keep-names`, `--float`, `--dmy`, `--01-bool`, `--no-pk`, `--no-transaction`.
Node 18+, no dependencies.

## Limits

Types describe the rows you give it, not rows you have not seen: a VARCHAR sized from a
sample can reject a longer value later (PostgreSQL and SQLite use TEXT for that reason).
The browser page handles up to 200,000 rows; for more, use your database's bulk loader.
Review the script and try it on a copy before running it against a database you care about.
No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

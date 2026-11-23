# Parity run against real PostgreSQL 16

`pg-16.json` is the recorded output of [`run-pg.mjs`](run-pg.mjs) against
PostgreSQL 16.15 (Ubuntu 24.04's `postgresql-16` package), on cases from the
seeded generator [`gen.mjs`](gen.mjs). [`compare.mjs`](compare.mjs) checks the
engine against it, and `../parity.test.mjs` runs that on every test run with
no server needed.

- **Parse:** 600 files of odd but plausible lines (quotes, commas with and
  without blanks, backslash continuations, `include`, `include_if_exists`,
  `include_dir` with a skipped `.bak`, `@file`, bad and shorthand addresses,
  host names, bad masks, every method, valid and invalid options) written to
  the data directory; the `pg_hba_file_rules` view is read back and compared
  row by row: file, line, type, databases, users, address, netmask, method,
  options and error. For a regex PostgreSQL cannot compile only the failure is
  compared, because its regex engine words errors its own way.
- **Match:** 160 files of valid rules, each loaded with `pg_ctl reload`, then
  36 real connections: the Unix socket and TCP from 127.0.0.1 with and without
  TLS, as `alice` (a member of `staff`, with REPLICATION), `bob` and
  `postgres`, to `appdb`, `staff`, `postgres` and as physical replication.
  Every login role has password `pw` stored as SCRAM, so a line using
  `scram-sha-256`, `md5` or `password` authenticates and `log_connections`
  logs the file and line that did; `reject` and "no entry" have distinct
  errors. The container had no IPv6, so `::1` was not connected to.

Server set-up for the recording: `initdb -A trust`, `ssl = on` with a
self-signed certificate, `log_connections = on`,
`listen_addresses = '127.0.0.1'`, roles and databases as above. The runner
reads the view over the socket while the original trust file is still loaded,
and restores it after each match case, so a broken test file never locks it
out. Use a disposable server: it overwrites `pg_hba.conf`.

```
PGDATA=/path/to/data PGSOCK=/socket/dir PGPORT=54329 PGLOG=/path/to/server.log \
  node parity/run-pg.mjs --parse 600 --match 160 > parity/pg-16.json
node parity/compare.mjs
```

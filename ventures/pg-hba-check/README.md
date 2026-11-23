# pg_hba.conf Check

A free tool that reads PostgreSQL's `pg_hba.conf`, and every file its
`include`, `include_dir`, `include_if_exists` and `@file` references pull in,
the way PostgreSQL 16 reads them, and shows what the file really does: the
lines PostgreSQL rejects (one bad line and it refuses the whole file, so a
reload silently keeps the old rules), the rules that can never match because
an earlier line always wins (PostgreSQL uses the *first* matching line, not
the most specific), which line decides a given connection, and the rules that
let people in more easily than they look. Each finding prints `file:line`, the
risk and the fix.

**Live tool:** https://marisstella.app/pg-hba-check/
· **Guide:** [`pg-hba-conf-mistakes-explained.html`](pg-hba-conf-mistakes-explained.html)

**Who it is for:** anyone who runs PostgreSQL themselves (a VPS, a VM, a
container image, an on-premises server) and has edited `pg_hba.conf` to let an
app, a reporting user or a replica in, and teams that keep it in Ansible,
Puppet, Chef, Helm or a Dockerfile and want a check before they ship.

| Type | Severity | What it flags |
| --- | --- | --- |
| `parse-error` | error | a line PostgreSQL 16 rejects, with its own error text; one such line and the whole file is refused |
| `include-missing` | error | an `include`, `include_dir` or `@file` target that is not among the files given |
| `no-entries` | error | a file with no rules, which PostgreSQL refuses |
| `hostssl-without-ssl` | medium | a `hostssl` line when you say the server has `ssl = off`: loaded, but never matches |
| `trust-remote` | high | `trust` from a network range, `all`, `samenet` or a host name |
| `trust-loopback` | medium | `trust` from `127.0.0.0/8`, `::1` or `samehost` |
| `trust-local` | medium | `trust` on the local socket |
| `ident-over-tcp` | high (medium on loopback) | `ident` on a `host*` line |
| `cleartext-password-no-tls` | high | `password`, `ldap`, `pam`, `radius`, `bsd` on a remote line that also accepts non-TLS connections |
| `password-method` | low | `password` where the transport is protected (hostssl, loopback, socket) |
| `md5-method` | low | `md5` |
| `no-tls-required` | medium | remote `host`/`hostnossl`/`hostnogssenc` with `scram-sha-256`, `md5`, `gss` or `sspi` |
| `any-address` | low | `all`, `0.0.0.0/0` or `::/0` with a password method |
| `secret-in-file` | medium | `ldapbindpasswd=` or `radiussecrets=` in the file |
| `unanchored-regex` | medium | a `/regex` database or user without `^` and `$` |
| `shadowed-rule` | low (medium for `reject`) | a rule an earlier rule always beats |
| `quoted-keyword` | low | `"all"`, `"replication"`, `"samehost"` and the other keywords in quotes |
| `ipv4-shorthand` | medium | `010.0.0.1` (octal, 8.0.0.1), `10.1` (10.0.0.1), `0x7f.1` |
| `address-is-hostname` | medium if it looks like an IP, else low | an address that is not numeric, read as a host name (`10.0.0.300`) |
| `host-bits-set` | low | `192.168.10.5/24` |
| `include-dir-file-ignored` | low | a file in an `include_dir` directory that PostgreSQL skips (`.bak`, dotfiles, not `.conf`) |

"Remote" means any address that is not loopback (`127.0.0.0/8`, `::1`) or
`samehost`.

**Which line decides.** Every report ends with the line that decides five
typical connections (the socket as `postgres`, TCP from `127.0.0.1`, TCP from
an outside address with and without TLS, physical replication from outside),
and `--user U --db D --addr IP [--tls] [--replication] [--group G]` asks about
one more. Matching follows `check_hba()`: connection type (`host` takes TLS,
non-TLS and GSS-encrypted connections; `hostssl` only TLS; `hostnossl`
non-TLS and GSS; `hostgssenc` and `hostnogssenc` likewise), address (CIDR,
address plus netmask, `all`, `samehost`, `samenet`, host names), database
(`all` does not match physical replication; `replication` matches only that;
`sameuser`, `samerole`, regexes, names) and user (`all`, `+group`, regexes,
names). Facts the tool cannot see (group membership you did not give, the
server's own addresses for `samehost`/`samenet` from outside, reverse DNS for
host names) leave a line *undecided*: it is named, and matching carries on
past it rather than guessing.

**How it reads the file.** Following PostgreSQL 16's
[`hba.c`](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/libpq/hba.c)
and the [pg_hba.conf chapter of the manual](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html):
a trailing backslash joins the next line (no separator; the line keeps its
first line's number); tokens end at blanks or commas, double quotes protect
blanks, commas and `#`, and `""` inside quotes is a quote; a blank before a
comma ends the field, so `app ,other` is two fields; `@file` (unquoted) splices
in every token of a file; `include`, `include_if_exists` and `include_dir`
lines are replaced by the files they name (relative paths from the including
file's directory; `include_dir` takes names ending in `.conf`, not starting
with a dot, at least six characters, in byte order), at most ten deep. IPv4
addresses are read with `inet_aton` rules, as glibc's numeric `getaddrinfo`
does; anything not numeric becomes a host name; a bare address takes the next
field as its netmask. Methods are checked against a Debian/Ubuntu or PGDG
build (OpenSSL, GSSAPI, LDAP and PAM; no BSD auth or SSPI); `ident` on a local
line becomes `peer`; options are validated per method as `parse_hba_auth_opt()`
does. This is an independent JavaScript implementation, not PostgreSQL code.

**How it was checked against PostgreSQL.** [`parity/`](parity/) holds a
seeded generator, a runner and the recorded output of PostgreSQL 16.15
(Ubuntu 24.04's package). 600 generated files were written to the server's
data directory and the `pg_hba_file_rules` view read back: the engine agrees
on every row (type, databases, users, address, netmask, method, options,
error text; for an invalid regex only the failure, since PostgreSQL's regex
engine words its errors its own way). 160 files of valid rules were then
loaded one at a time and 36 real connections made against each (socket, TCP
with and without TLS; three roles; three databases and physical replication);
for all 5,760 the engine names the line PostgreSQL logged as authenticating
(`log_connections`), or the same refusal (`rejects connection` versus
`no pg_hba.conf entry`). `parity.test.mjs` replays the recording on every
test run, without a server. The container had no IPv6, so IPv6 matching is
covered by unit tests and the parse run, not by real connections.

## Use it

In a browser: open the live tool, paste `pg_hba.conf` (on Debian and Ubuntu
`/etc/postgresql/16/main/pg_hba.conf`; `SHOW hba_file;` prints the path) and
any included files, named by their path relative to it.

CLI (Node 18+, no dependencies, never connects to a server):

```
sudo node check.mjs /etc/postgresql/16/main          # pg_hba.conf and everything it includes
node check.mjs ./pg_hba.conf --ssl off             # the server has ssl = off
node check.mjs ./pg_hba.conf --user app --db appdb --addr 10.0.4.7 --tls
node check.mjs ./pg_hba.conf --local --user postgres
node check.mjs ./pg_hba.conf --format json
node check.mjs ./pg_hba.conf --fail-on-risk        # exit 2 on an error, high or medium finding
```

Tests: `node --test` in this directory (`scan.test.mjs`, `page.test.mjs`,
`parity.test.mjs`, `usage.test.mjs`).

## Limits

A static read of the files given, not a security audit and not a connection
test. It does not see `listen_addresses`, firewalls, role passwords,
superuser flags, `pg_ident.conf` maps or the network. Regexes run on
JavaScript's engine, which agrees with PostgreSQL's for common syntax.
LDAP URLs and RADIUS server names are not resolved. Behaviour is PostgreSQL
16's; 13 to 15 lack `include` directives and regex users, and 17 and 18 add
options this version does not know. A clean result means only that these
patterns were not found.

## Licence

MIT, see [`LICENSE`](LICENSE). The fixture `fixtures/ubuntu-24.04-pg16/pg_hba.conf`
is PostgreSQL's sample file as Ubuntu installs it, under the PostgreSQL
Licence (see [`fixtures/README.md`](fixtures/README.md)). Not affiliated with
the PostgreSQL Global Development Group.

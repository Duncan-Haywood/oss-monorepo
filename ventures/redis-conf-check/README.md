# redis.conf Check

**Live:** https://marisstella.app/redis-conf-check/ · guide:
[redis.conf mistakes explained](https://marisstella.app/redis-conf-check/redis-conf-mistakes-explained.html)

Paste `redis.conf` and the files its `include` lines pull in. The tool reads
them the way Redis 7.0 does and tells you:

- **whether Redis starts**, with Redis's own error, and the real file and
  line (Redis prints "at line 3" without naming the file when the bad line is
  in an include, and for a wildcard include it counts lines across every
  matching file joined together);
- **who gets in without a password**: a client on another machine, on
  127.0.0.1 and on the unix socket, after `bind`, protected mode,
  `requirepass`, `user default` lines and `rename-command`, and whether such a
  client can `CONFIG SET dir`, run `DEBUG` or `MODULE LOAD`;
- **which line set each value** (the last line Redis reads wins, and an
  include counts where its line stands), and every earlier line that has no
  effect because of it;
- the traps: a `#` after a value (not a comment, Redis refuses to start),
  included files without a final newline (Redis glues two lines into one),
  wildcard includes that match nothing, relative include paths (read from the
  working directory, which every `dir` line moves), a `user default` line
  that silently replaces `requirepass`, short or cleartext passwords, a
  plaintext port left open beside TLS, a world-writable socket, every
  interface bound, `rename-command` in place of ACL rules, and `maxmemory 2g`
  meaning 2,000,000,000 bytes.

Each finding has the file, the line, the reason and the fix. Passwords are
masked in every report, so the JSON can go into a CI log.

It is a static read of the files you give it, **not a security audit and not
a connection test**. A clean result is not proof a server is safe: the tool
does not see your firewall, which addresses are public, command-line options,
an ACL file you did not paste, or `CONFIG SET` changes made since start-up.

## Use it

In the browser: open the page, paste the files, click Check. Nothing is
uploaded and the page makes no network calls.

As a CLI (Node 18+, no dependencies; copy `check.mjs`, `scan.mjs` and
`redis70.mjs`):

```sh
sudo node check.mjs /etc/redis/redis.conf          # redis.conf and everything it includes
node check.mjs redis.conf --host-addrs             # check bind against this machine's addresses
node check.mjs redis.conf --cwd /var/lib/redis     # the directory redis-server starts in
node check.mjs redis.conf --get maxmemory          # the value Redis uses and the line that set it
node check.mjs redis.conf --no-defrag              # Debian/Ubuntu packages: no active defrag
node check.mjs redis.conf --format json
node check.mjs redis.conf --fail-on-risk           # exit 2 on an error, high or medium finding
```

`--fail-on-risk` makes it a CI gate for configuration shipped in a container
image or by configuration management.

## How it reads the file

The engine follows Redis 7.0.15's source, which is BSD-3-Clause; no code is
copied, the behaviour is re-implemented:

- **Lines and words** (`src/config.c`, `loadServerConfigFromString`; `src/sds.c`,
  `sdssplitargs`): each line is trimmed; a line starting with `#` is a
  comment; words split on spaces, with double quotes (and `\n`, `\xHH`
  escapes) and single quotes; a closing quote must be followed by a space;
  the directive name is case-insensitive. A standard setting takes exactly
  one value, except the multi-word ones (`save`, `bind`,
  `client-output-buffer-limit`, ...), which also accept all their words in one
  quoted value.
- **Includes** (`loadServerConfig`): a plain path that cannot be opened stops
  Redis; a path with `*`, `?` or `[` is globbed (sorted, hidden files only by
  an explicit dot), the matches are concatenated as one text and read as one
  file, and no match is silently skipped. Paths are relative to the working
  directory at that moment; `dir` changes it as it is read.
- **Values** (`static_configs[]`): the table of all 178 standard settings,
  their aliases, types, bounds and defaults is generated from config.c into
  `redis70.mjs` by `tools/gen-configs.mjs`; numbers parse as `string2ll`,
  memory values as `memtoull` (`k`, `m`, `g` are powers of 1000, `kb`, `mb`,
  `gb` of 1024), percentages, octal for `unixsocketperm`, enums
  case-insensitively, with Redis's error text for each failure. The special
  settings (`save`, `bind`, `dir`, `replicaof`, `client-output-buffer-limit`,
  `notify-keyspace-events`, `oom-score-adj-values`,
  `latency-tracking-info-percentiles`) have their own rules, including `save`
  appending after its first line. `hz` is clamped to 1..500 after each file.
- **`user`, `rename-command`, modules** (`src/acl.c`): `user` rules are
  checked as Redis checks them at load (an unknown command passes there and
  stops Redis at start-up instead), including Redis's habit of naming the
  token two places before the bad one in the error; `rename-command` checks
  the live command table (a command already renamed away cannot be renamed
  again).
- **Start-up** (`src/server.c`): after the file loads, Redis needs a listener
  (`port`, `tls-port` or `unixsocket`), binds each address in turn (a missing
  address stops it unless prefixed with `-`; a missing address family is
  skipped), needs certificates for TLS, a socket path under 108 bytes, no
  `aclfile` beside `user` lines, and a `loadmodule` for every module setting.
- **Who gets in**: the default user starts with `nopass` and `+@all`;
  `requirepass` sets its password; `user default` lines then reset and
  redefine it. Protected mode turns away clients not on 127.0.0.1 or ::1
  while the default user has `nopass`. `DEBUG` and `MODULE LOAD` are gated by
  `enable-debug-command` and `enable-module-command` before ACL permissions;
  `CONFIG SET dir` is refused by `enable-protected-configs` after them.

Command names and ACL categories (for `user` and `rename-command` lines) were
read from a running redis-server 7.0.15 (`COMMAND LIST`, `ACL CAT`).

## Checked against a real Redis

`parity/` generates 800 generated files (seeded, so the same every time:
inline comments, bad quotes, out-of-range and mistyped values, aliases,
wildcard and plain includes with and without final newlines, `dir` before a
relative include, `user` lines valid and not, `rename-command`, `bind`
variants, TLS without certificates, unix sockets, protected mode on and off)
and starts a real redis-server 7.0.15 (Ubuntu 24.04's package) on each. For
every file it records whether Redis started and, if not, its error and line;
for the ones that started, `CONFIG GET *` as an admin user; and what an
unauthenticated client got from another address of the machine, from
127.0.0.1 and over the unix socket (`PING`, then `CONFIG SET dir .`,
`DEBUG SLEEP 0`, `MODULE LOAD` of a missing file).

The recorded run (`parity/redis-7.0.json`): of the 800 files, 273 started,
429 stopped at a config line (33 different messages) and 98 loaded but
exited at start-up (no listener, bind, TLS, ACL, missing include, module
settings). The engine agrees on all 800: the start or the exact message and
line, all 46,930 `CONFIG GET` values read from the 247 started servers an
admin could query (the rest had `CONFIG` renamed away or used an aclfile),
and all 590 client probes (273 from another address, 273 from 127.0.0.1, 44
over the socket), 0 differences.

The first runs found real differences that are now fixed: aliases such as
`slaveof` are reported by `CONFIG GET` too; `tls-cluster yes` needs TLS
certificates even with `tls-port 0`; only MODULE's loading subcommands are
gated, so `MODULE LIST` stays open; `DEBUG` and `MODULE` are gated before ACL
permissions are checked; `bind ""` leaves no listener; an IPv6 address on a
machine without IPv6 is skipped, not fatal; a missing include's error names
the path as written; and Ubuntu's package, linked against the system
jemalloc, refuses `activedefrag yes` (its error asks for a build with the
jemalloc shipped in Redis's source), which is why `--no-defrag` exists. Run it yourself:

```sh
node parity/run-redis.mjs 800 <a non-loopback IP of this machine> > parity/redis-7.0.json
node parity/compare.mjs parity/redis-7.0.json
```

What the parity run does not cover: Redis versions other than 7.0.15,
`loadmodule`, `sentinel`, `cluster-enabled`, `daemonize`, `supervised`,
`logfile`, `aclfile` contents, `proc-title-template` and CPU-list values (the
tool reads them but does not validate them), and `requirepass`-protected
probes (the static password checks are not tested against a server).

## Tests

```sh
node --test scan.test.mjs page.test.mjs usage.test.mjs parity.test.mjs
```

`parity.test.mjs` replays the recorded run through the engine and fails on
any difference; it also checks every recorded case's fingerprint against the
generator as committed. `fixtures/ubuntu-24.04-redis7/redis.conf` is Ubuntu's
stock file, which loads with no findings.

## Privacy and usage

Everything runs in the browser. Two anonymous counters (`check_run`,
`example_loaded`) live in local storage only, honour Do Not Track and Global
Privacy Control, and can be deleted with the page's opt-out button.

## Licence

FSL-1.1-MIT. Built with AI assistance. Not affiliated with Redis Ltd.; Redis is a
trademark of Redis Ltd., used here only to say which software the tool
reads. Redis 7.0's source and example redis.conf, which the behaviour and the
fixture come from, are BSD-3-Clause.

# Parity run against real sshd

The engine (`../scan.mjs`) claims to read `sshd_config` the way OpenSSH
9.6p1 does. This directory checks that claim against the real binary,
Ubuntu 24.04's `openssh-server 1:9.6p1-3ubuntu13.20`, and keeps the result so
CI can replay it with no `sshd` installed.

- [`gen.mjs`](gen.mjs) generates a configuration from a seed: a main
  `/etc/ssh/sshd_config`, up to three drop-ins in `sshd_config.d/` (some not
  ending in `.conf`, one sometimes including `sshd_config.d/sub/*.conf`), the
  four common `Include` forms, `Match` blocks on `User`, `Address`, `Host`,
  `LocalPort`, `LocalAddress` and `Group` with lists, wildcards, negation and
  CIDR networks, `Match all`, `Include` under a `Match`, keyword aliases
  (`ChallengeResponseAuthentication`), random keyword and value case, `=`,
  quotes, trailing comments, time values (`2m30s`), and, in a quarter of the
  cases, lines that stop sshd (misspelt keywords, bad values, extra words,
  global-only keywords inside `Match`, bad `Match` lines). Each case comes
  with three connections (user, host, address, local address, local port).
- [`run-sshd.mjs`](run-sshd.mjs) writes each case to `/etc/ssh`, runs
  `sshd -t`, and for configurations that start runs
  `sshd -T -C user=…,host=…,addr=…,laddr=…,lport=…` for each connection. It
  records 17 settings plus `AllowUsers`/`DenyUsers` in
  [`sshd-9.6p1.json`](sshd-9.6p1.json). **It deletes and rewrites
  `/etc/ssh`: run it only in a throwaway container**, never on a server (it
  refuses if `/etc/ssh` exists and was not made by it).
- [`compare.mjs`](compare.mjs) replays the record through the engine and
  prints every disagreement grouped by kind; `../parity.test.mjs` asserts there
  are none.

## Result (2026-11-20)

Development seeds 1 to 600 were used while fixing the engine; the committed
record is a separate held-out set, seeds 20001 to 22000, generated after the
last fix: 2,000 configurations, 1,414 that start and 586 that do not, 82,598
checks. The fixed engine agrees on all of them. The engine as it was before
this run disagreed 550 times, in 319 of the 2,000 configurations:

| What the engine got wrong | sshd 9.6p1 behaviour |
| --- | --- |
| `Match all` treated as "back to global settings", so a later `PasswordAuthentication yes` was reported as ignored | Lines after `Match all` form a block that applies to every connection and overrides earlier global values for keywords allowed in `Match` (a `Match` block written before it still wins for its connections); global-only keywords there stay first-value-wins |
| `Match` blocks in a file included under a `Match` never applied | They apply to connections the enclosing block selects (`SSHCFG_NEVERMATCH` is set only when that block is inactive) |
| `PermitTunnel NO` accepted | `strcmp`: lowercase only |
| `Port 22 2222`, `PasswordAuthentication no yes` accepted | "keyword X extra arguments at end of line"; checked for every keyword the engine knows (most take one word, `IPQoS` and `RekeyLimit` two, about twenty take the rest of the line) |
| `MaxAuthTries abc`, `0x10`, `-1` accepted | strtonum, decimal, 0 to 2^31-1 (`011` is 11, `+5` is 5) |
| `LoginGraceTime 2x` accepted; `0s` and `00` not seen as unlimited | `convtime()`: `1h30m`, `1M5`, `90S`; `0s` is 0 |
| `Match Address 10.1.2.3/24` accepted | "Invalid Match address argument": an IPv4 network with host bits set or a mask over 32 (`10.0.0.0/0` too); `10.0/8` or `10.0.0.0/8x` fall back to a wildcard and are fine |

The `Match all` and nested-`Include` rows changed what the tool reports about
password and root logins, not just whether sshd starts.

## Not covered

`Match Group` against real membership (the generated users do not exist, so
group blocks never match on either side), `Match Host` with DNS, IPv6
addresses and networks, algorithm lists (`Ciphers` and the rest), and
keywords other than the 19 compared. Other OpenSSH versions: defaults and
keywords change between releases (9.8 split `sshd-session` and added
`PerSourcePenalties`), so a run against another `sshd` needs its own record.

## Reproduce

In a disposable Ubuntu 24.04 container (as root):

```
apt-get update && apt-get download openssh-server openssh-client libwrap0
for d in *.deb; do dpkg -x "$d" x; done
export LD_LIBRARY_PATH=$PWD/x/usr/lib/x86_64-linux-gnu
id sshd || useradd -r -M -d /run/sshd -s /usr/sbin/nologin sshd; mkdir -p /run/sshd
x/usr/bin/ssh-keygen -q -t ed25519 -N '' -f hostkey
SSHD=$PWD/x/usr/sbin/sshd HOSTKEY=$PWD/hostkey node parity/run-sshd.mjs 2000 20001
node parity/compare.mjs
```

The packages are extracted, not installed, so no service starts. A run of
2,000 cases takes about a minute.

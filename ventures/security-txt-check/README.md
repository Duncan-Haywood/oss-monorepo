# security.txt Checker (RFC 9116)

**After using this, you can now tell whether the `security.txt` you published
is still doing anything — which used to take reading RFC 9116 and noticing, by
eye, that a date in the file had quietly passed.**

A free, zero-dependency Node CLI and a browser tool that validate a
`security.txt` against [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html).

- **Browser:**
  <https://duncan-haywood.github.io/monorepo-projects/security-txt-check/> —
  paste the file, get a report. Nothing is uploaded.
- **CLI:** `node check.mjs example.com` — fetches the live file and adds the
  two checks a paste cannot support.

## Why this exists

Most conformance rules are static: fix the file once and it stays fixed.
`Expires` is not. It is a date, so a file that passes every check today fails
on its own — no commit, no deploy, nothing in any log.

And the failure is silent in both directions. RFC 9116 says data in an expired
file **must be considered stale and should not be used**, so a conforming
researcher treats you as publishing no disclosure contact at all. Meanwhile the
server still returns 200, the text still reads correctly to a human, and every
uptime check you own stays green. Somebody holding a real finding falls back to
a support form, a public issue tracker, or nothing — and from your side,
nothing happened, because nothing arrived.

That is the one check here genuinely worth putting on a schedule.

## What it checks

| Check | Severity | Needs the CLI? |
|---|---|---|
| `Expires` is in the past | danger | no |
| `Expires` missing, duplicated, or not an RFC 3339 timestamp | danger | no |
| `Expires` more than a year out, or under 30 days left | notice | no |
| `Contact` missing, or not a URI | danger | no |
| `Contact` over plain `http:` | danger | no |
| Another URI field over plain `http:` | notice | no |
| A PGP key block pasted into the file | danger | no |
| A line that is not `Field: value`, a comment, or blank | danger | no |
| A known field name with the colon missing (`Policy https://…`) | danger | no |
| `Preferred-Languages` repeated, or holding language *names* | danger / notice | no |
| `Acknowledgements` and other silently-ignored field names | notice | no |
| A cleartext-signed file with no `Canonical` | notice | no |
| A `Canonical` that does not name where the file was fetched from | notice | **yes** |
| Served from the site root rather than `/.well-known/security.txt` | notice | **yes** |
| Not served as `text/plain; charset=utf-8` | notice | **yes** |

**Danger** is an RFC 9116 MUST. **Notice** is a SHOULD, a recommendation, or a
typo that costs you the field. Keeping those apart is the point: a checker that
shouts equally about an expired file and a British spelling teaches its user to
ignore it.

## What it does not check

- Whether anyone reads the address you publish, or answers.
- Anything about the site's actual security. This is a file validator, not a
  scan. A perfectly conforming `security.txt` on an unmaintained inbox passes
  every check here.
- Whether a PGP signature verifies. The file's *signature* is not checked — only
  that a signed file also carries the `Canonical` the RFC asks for. Verifying a
  signature needs the key, and fetching a key on your behalf is not something
  this tool should do.

## CLI

```
node check.mjs <domain-or-url> [--json] [--timeout <ms>]
```

Accepts a bare hostname, an origin, or a full URL. Given a host it tries
`/.well-known/security.txt` first and the legacy root copy second, and reports
which one answered. Given an explicit path it checks exactly that.

Exit codes: `0` nothing danger-severity found, `1` a danger finding or no
`security.txt` could be fetched at all, `2` a usage error. The `1` covers both
"we could not find one" and "the one you have is broken" — both are failures,
but the JSON output distinguishes them (`fetchError` vs `report.findings`).

As a monthly CI gate:

```yaml
- run: node check.mjs ${{ vars.PUBLIC_DOMAIN }}
```

## Privacy

The browser page parses what you paste locally and uploads nothing. The CLI
talks only to the host you name — no telemetry, no call home, nothing through
this portfolio. Anonymous local counters (`check_run`, `example_loaded`) live in
your own browser's storage, honour Do Not Track and Global Privacy Control, and
have an opt-out on the page.

This matters more here than on most tools: a list of which companies somebody is
checking is itself sensitive.

## Files

| File | What it is |
|---|---|
| `engine.mjs` | The RFC 9116 parser and rule set. Pure — text in, report out, `now` always an argument. |
| `check.mjs` | The CLI: resolve candidate URLs, fetch, validate, format, exit. |
| `fetch-url.mjs` | HTTP(S) with an explicit timeout, byte cap, and bounded redirects. |
| `usage.mjs` | Local, anonymous, opt-out usage counters. |
| `index.html` | The browser tool. |
| `why-security-txt-expires.html` | Why the RFC made `Expires` mandatory, and the other silent failures. |
| `vs-securitytxt-org-generator.html` | How this differs from securitytxt.org, including where that is the better answer. |

## Tests

```
node --test ventures/security-txt-check/*.test.mjs
```

The HTTP tests run against a throwaway server on loopback, so the suite needs no
outbound network.

MIT licensed. [Sponsorship](https://github.com/sponsors/Duncan-Haywood) is
optional and never changes what the tool does.

**No warranty.** Provided free and as-is, without warranty of any kind. Not
legal or security advice, and not a security assessment. You are responsible for
verifying its output before relying on it.

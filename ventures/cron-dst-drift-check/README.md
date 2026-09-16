# Cron DST Drift Check

A free tool that computes a cron expression's upcoming run times as real
local wall-clock instants in a chosen IANA timezone, and flags any occurrence
that falls in a **spring-forward gap** (the local time never happens) or a
**fall-back overlap** (the local time happens twice). A second, related
check computes how a scheduler that only understands UTC — GitHub Actions'
own `schedule:` cron among them, by its own documentation — drifts against a
target local wall-clock time across the year's daylight-saving segments.

**What it is not:** a general cron expression parser, a claim about what any
specific scheduler does with a skipped or ambiguous occurrence, or advice
about which scheduler to use. It computes the timezone arithmetic that is
true regardless of implementation — does a named local time exist once, not
at all, or twice — and leaves scheduler-specific behavior to that
scheduler's own documentation.

After using this, you can now **catch a schedule that will skip a run,
double-fire, or silently drift an hour before it ships**, instead of finding
out from an incident channel the next time DST changes.

## Why this exists

A cron expression that names a wall-clock time is only unambiguous in a
timezone that never changes its UTC offset. Most timezones people actually
schedule jobs in do change it, twice a year, and nothing about the cron
syntax itself can say so. Two separate failure modes follow, both
long-documented developer pain points: a schedule whose named local time
falls in a DST transition (searchable as "cron job didn't run daylight
saving," recurring on Stack Overflow and r/sysadmin every spring and fall),
and a UTC-only scheduler whose fixed schedule quietly drifts against the
local time someone actually meant — the exact shape of GitHub Actions'
`schedule:` cron, which its own docs say always runs in UTC with no
timezone field.

`cron-dst-drift-check` is a new object for this portfolio's deterministic
checker family to check — a cron schedule against the real IANA DST
calendar — rather than another instance of an existing misconfiguration
check.

## Try it without installing anything

[`index.html`](index.html) computes everything entirely in the browser using
the `Intl` timezone database your browser already ships. Nothing you type is
uploaded.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. No network call, ever — this is pure
`Intl`/`Date` arithmetic.

```sh
node cli.mjs next "30 2 * * *" --tz America/New_York                                  # next 10 runs, from now
node cli.mjs next "30 2 * * *" --tz America/New_York --count 5 --from 2027-03-13T00:00:00Z --json
node cli.mjs drift 09:00 --tz America/New_York                                        # fixed-UTC-cron drift for this year
node cli.mjs drift 09:00 --tz America/New_York --year 2027 --json
```

`next` exits 1 if any computed occurrence falls in a DST gap or overlap.
`drift` exits 1 if the timezone observes DST at all (so a single fixed UTC
cron cannot hold the local time steady year-round). Both work as a one-line
CI gate on a schedule change.

More, including wiring this into CI and this tool's own named limitations:
[the docs page](why-cron-jobs-break-across-dst.html).

## What's checked

| Check | Source |
|---|---|
| Spring-forward skip | A cron occurrence's local wall-clock time does not exist on that calendar date in the chosen timezone |
| Fall-back overlap | A cron occurrence's local wall-clock time occurs twice on that calendar date; both real UTC instants are reported |
| Fixed-UTC-cron drift | A target local time converted to UTC once per DST segment of the year; more than one distinct UTC clock time means a single fixed-UTC schedule cannot hold the local time steady |

Numeric cron fields only in v0 (no `JAN`/`MON` names). Day-of-month and
day-of-week follow the standard cron OR rule when both are restricted,
matching real cron daemon behavior rather than the more commonly assumed AND.

## Disclaimers

This tool reports whether a named local time exists, doesn't exist, or
exists twice, and what UTC time a fixed-UTC schedule needs per DST
segment — nothing more. It does not know what your specific cron daemon,
systemd timer, or hosted scheduler does with a skipped or ambiguous
occurrence; different implementations genuinely disagree. Verify against
your own scheduler's real behavior before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`schedule_checked`,
`drift_checked`, `example_loaded`) in `localStorage` only — never
transmitted, never tied to the cron expression or timezone you typed. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns it off entirely. The CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The engine, CLI, and
browser page are built and tested; no external user contact has happened
yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).

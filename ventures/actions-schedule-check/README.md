# Actions Schedule Cron Check

A free tool that scans GitHub Actions workflow files for `schedule:` cron
entries that will not run when you expect:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/actions-schedule-check/

1. **`cron-invalid`** — not five fields (a six-field "seconds" cron from
   Quartz or Spring is the usual cause) or a number outside its field's range.
2. **`cron-faster-than-5-minutes`** — `* * * * *`, `*/1` to `*/4`, or a range
   stepping under 5. GitHub documents 5 minutes as the shortest interval.
3. **`cron-top-of-hour`** — minute `0`. GitHub documents that scheduled runs
   can be delayed, and may be dropped, under high load, and names the start of
   every hour as a high-load time. An odd minute such as 17 avoids it.

Each finding prints the file, line, what is wrong and the fix.

**What it is not:** a security audit or a prediction of when any run will
start. Cron times are UTC. GitHub's own documentation for the `schedule` event
is the authority on current limits.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste the
contents of one or more files from `.github/workflows/` and get every
finding — nothing is uploaded, and the page makes no network requests. The
explainer is [`github-actions-schedule-cron-delays.html`](github-actions-schedule-cron-delays.html).

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, no network calls. Wire
`--fail-on-risk` into your own CI to block a bad cron before it merges.

## Limits

A line-oriented scan, not a YAML parser: it reads every `cron:` line, quoted
or not, and understands numeric fields only (lists, ranges and steps). Names
such as `MON` and macros such as `@daily` are reported as invalid; check those
by hand. It does not evaluate whether a day-of-month and day-of-week
combination ever occurs.

## Disclaimers

Free, best-effort, no warranty. A clean scan means this one pattern was not
found, nothing more. Verify its output before relying on it. Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never changes
what the tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only —
never transmitted. Do Not Track and Global Privacy Control are honoured, and
a button on the page turns it off. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` and asserts
the browser port produces identical findings on the same fixture.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). First visitor channel:
people searching "github actions schedule delayed" and "github actions cron
not running".

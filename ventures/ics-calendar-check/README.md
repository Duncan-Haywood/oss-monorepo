# Ics Calendar Check

Free browser tool that checks an iCalendar (.ics) file for what makes Google Calendar, Outlook and
Apple Calendar reject or mis-import it: missing UID, DTSTAMP, VERSION and PRODID, events that end
before they start, zero-length all-day events, recurrence rules with COUNT and UNTIL together or a
mismatched UNTIL, out-of-range or misspelled BYDAY/BYMONTHDAY/BYMONTH parts, EXDATE/RDATE of the wrong type, time zones named without a VTIMEZONE, duplicate UIDs, unfolded long lines and LF
line endings, each with its line number. It writes the file back with every provable fix applied and
leaves the rest untouched. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ics-calendar-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/ics-calendar-check/*.test.mjs
```

## Lint calendar files and feeds in CI

`cli.mjs` is the same checker for a terminal or a CI job, with no dependencies
(Node 20 or newer). Local files are read from disk; a URL argument makes one
GET to fetch the feed and nothing else leaves your machine.

```
node cli.mjs check calendar.ics              # exit 1 if there are errors
node cli.mjs check public/ --strict          # every .ics under a folder; warnings fail too
node cli.mjs check https://example.com/events.ics --json
node cli.mjs fix calendar.ics                # writes calendar.fixed.ics (--in-place overwrites)
```

Exit codes: 0 clean, 1 findings at the failing level, 2 usage or read error.
It applies the same provable fixes as the web page and reports the rest.

## Files

- `index.html`: the tool's page.
- `cli.mjs`: the command-line and CI wrapper around `calc.mjs`.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

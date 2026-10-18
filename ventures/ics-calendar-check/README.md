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
node --test ventures/ics-calendar-check/
```

## Files

- `index.html`: the tool's page.
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

# Gbp Bulk Location Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/gbp-bulk-location-check/>

Free browser tool that checks a Google Business Profile bulk-location spreadsheet (CSV or TSV)
before it is uploaded: semicolon or UTF-16 files, missing template columns, duplicate or damaged
store codes, business names over 100 characters, in all capitals or stuffed with keywords, phone
numbers that are not E.164 or plausible for the country, websites that are not https, hours that are
not 24-hour HH:MM, opening dates, ISO country codes, US state abbreviations, postal code shape,
latitude and longitude ranges, Excel damage (ZIPs that lost a leading zero, scientific notation),
duplicate addresses across store codes and label limits, each with its line number, plus a safe-
fixes pass that converts the delimiter and restores a ZIP's zero only when the state confirms it.
The file is read locally and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/gbp-bulk-location-check/
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

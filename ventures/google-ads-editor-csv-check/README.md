# Google Ads Editor Csv Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/google-ads-editor-csv-check/>

Free browser tool that checks a Google Ads Editor import CSV before it is imported: headlines over
30 characters and descriptions over 90, responsive search ads with too few headlines or
descriptions, exclamation marks and duplicate headlines, display paths, keywords with symbols Google
rejects, plus-sign broad match modifier, brackets that conflict with the Criterion Type, duplicate
keywords, Final URLs without https, blank ad groups, unknown Status values and budgets or bids with
currency symbols, each with its line number, plus a safe-fixes pass that converts the delimiter and
cleans spaces, numbers and capitalisation. The file is read locally and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/google-ads-editor-csv-check/
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

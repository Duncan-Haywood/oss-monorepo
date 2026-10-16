# Ebay File Exchange Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ebay-file-exchange-check/>

Free browser tool that checks an eBay File Exchange or bulk listing CSV before it is uploaded:
semicolon or UTF-16 files where comma-separated UTF-8 is expected, titles over 80 characters,
missing or misspelled Action and site header, ItemIDs and SKUs that Excel turned into scientific
notation, UPCs that lost their leading zero and UPC and EAN check digits, bad prices, quantities,
Format and Duration combinations, picture URLs separated by commas or not https, and JavaScript in
descriptions, each with its line number, plus a safe-fixes pass that converts the delimiter and
restores a UPC's zero only when the check digit confirms it. The file is read locally and never
uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/ebay-file-exchange-check/
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

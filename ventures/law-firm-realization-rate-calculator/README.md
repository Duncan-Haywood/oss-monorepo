# Law Firm Realization Rate Calculator

Free browser calculator for law firms and solo lawyers that turns three columns every billing system
already prints (value of time recorded at standard rates, amount billed, amount collected) into
realization, collection rate and yield per timekeeper and for the firm, splits the loss into write-
downs before the invoice and discounts or unpaid balances after it, ranks lawyers by dollars lost
rather than by rate, reports lockup days from WIP and receivables, prices one point of realization
per year, and answers a collections target as hours needed versus yield needed. Figures are used
locally and never uploaded; no client or matter data is an input.

**Live tool:** https://marisstella.app/law-firm-realization-rate-calculator/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/law-firm-realization-rate-calculator/
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous usage counters, kept only in your browser, on unless
  you opt out or send Do Not Track / Global Privacy Control (see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## Known gaps

From the [2026-11-13 quality audit](../../portfolio/quality/audits/2026-11-13-law-firm-realization-rate-calculator.json):

- A timekeeper whose collected amount exceeds billed is refused (`calc.mjs`, row validation). On period reports, where cash received in the period is set against bills issued in it, that is normal when older receivables are paid. It should compute a collection rate over 100% with a warning.
- The "hours exceed available" check is not pinned by a test (a seeded 50% loosening survived).

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

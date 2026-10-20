# Coi Expiry Gap Checker

Free browser tool for general contractors, property managers and anyone who hires subcontractors:
paste a list of vendor insurance policies (one row per policy, as read off the certificates) and set
what your contract requires. It reports who is expired, who expires inside your lead time, whose
limits are under the requirement (optionally letting an in-force umbrella make up the shortfall),
who lacks additional-insured, waiver-of-subrogation or primary-and-non-contributory wording, and
where a renewal left a gap between policies. Downloads a chase list CSV and renewal reminders as an
.ics calendar. The list is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/coi-expiry-gap-checker/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/coi-expiry-gap-checker/
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

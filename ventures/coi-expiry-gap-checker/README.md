# Coi Expiry Gap Checker

Free browser tool for general contractors, property managers and anyone who hires subcontractors:
paste a list of vendor insurance policies (one row per policy, as read off the certificates) and set
what your contract requires. It reports who is expired, who expires inside your lead time, whose
limits are under the requirement (optionally letting an in-force umbrella make up the shortfall),
who lacks additional-insured, waiver-of-subrogation or primary-and-non-contributory wording, and
where a renewal left a gap between policies. Downloads a chase list CSV and renewal reminders as an
.ics calendar. The list is read locally and never uploaded.

**Live tool:** https://marisstella.app/coi-expiry-gap-checker/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
cd ventures/coi-expiry-gap-checker && node --test '*.test.mjs'
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## Known gaps

From the quality audit of 2026-11-12 (`portfolio/quality/audits/2026-11-12-coi-expiry-gap-checker.json`), not yet fixed:

- A renewal certificate already on the list does not clear the lead-time warning on the policy it replaces, so that policy still appears on the chase list.
- Column headings printed on the ACORD 25 form (TYPE OF INSURANCE, POLICY EFF, POLICY EXP, ADDL INSD, SUBR WVD) are not recognised as aliases.
- A requirement the page cannot read (for example "1 million") becomes 0 and turns that limit check off; a blank lead time becomes 0.
- Employers' liability is checked on each accident only; the two disease limits are not.
- Calendar export does not escape semicolons as RFC 5545 requires.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

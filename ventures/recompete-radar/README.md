# Recompete Radar

Which federal contracts in my niche expire next, who holds them, and how locked-up is the market?

A free, private browser tool for small US government contractors. Enter a NAICS code (and optionally a state and set-aside). The page asks the public USAspending.gov API for contract awards, or reads a USAspending CSV you paste, and shows:

- a **recompete calendar**: awards whose current end date falls within your window, with incumbent, awarding office, value, approximate annual value, and the date a follow-on notice is likely (end date minus your lead time);
- **incumbent ranking** with share of dollars and how many of each vendor's awards are expiring;
- **agency spend**, award-size quartiles, and **market concentration** (HHI, read with the 1,000 / 1,800 cut-offs);
- a CSV download of the calendar.

Paid govcon intelligence suites sell this view; the underlying dates are public.

## Run it

Open `index.html` through any static server (modules need http, not `file://`):

    python3 -m http.server -d ventures/recompete-radar 8080

Tests: `node --test 'ventures/recompete-radar/*.test.mjs'`

## Limits you should know

- **The live API call has not been exercised from the build sandbox** (outbound access to api.usaspending.gov was blocked there). The request body follows the documented `spending_by_award` endpoint and is unit-tested for shape; the response handling is tested against synthetic rows in both API-field and download-CSV column naming. If the live call fails, the page says so and the CSV paste path works regardless. First real use should be checked against USAspending's own search.
- Awards are fetched if they had activity in the last 3 years, largest first, up to 500. Contracts with no modification in that time, and small awards past the cap, are missed.
- "Current end date" excludes unexercised option years, so a contract can outlast its date. Agencies may extend, cancel, merge or set aside a requirement. Every row is a lead to verify on SAM.gov.
- The solicitation date is an adjustable assumption, not a published schedule.
- Test fixtures are synthetic. No real contract data is bundled.

## Next steps

Join SAM.gov opportunity notices to calendar rows (needs a free SAM.gov API key supplied by the user), flag small-business set-aside history per office, and add multi-NAICS watchlists saved locally.

Not affiliated with the U.S. government. Not legal or procurement advice. MIT licensed.

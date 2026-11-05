# Permit packet preflight

Live page: https://marisstella.app/permit-packet-preflight/

Direction: construction-permit tooling (`portfolio/opinions/2026-11-03-requests-for-startups.md`, "AI for City Hall").
Built 2026-11-05 as a prototype. Matches a checklist the user pastes against the
file names in their packet (keyword overlap with a few synonyms, threshold 0.4).

**No city's checklist is built in.** City sites did not resolve from the build
session (seattle.gov, 2026-11-05), and a checklist invented here would be fabricated.

Run: `node cli.mjs checklist.txt ./packet-folder` (exit 1 when a required line has no file). Tests: `node --test engine.test.mjs`.

Next, all needing real inputs: a real public checklist for one city with the
source URL and date as a reviewed preset, then a check of real packets that city
bounced; content checks (PDF text) after name matching proves useful; the
free/paid split (branded pre-submittal report) is undecided.

Limits: name matching only; a mislabelled file passes, an oddly named one fails. Not a plan review.

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

Near misses (a file scoring at least half the threshold) are named as "closest file" on a missing line, not counted as found (2026-11-05).

Limits: name matching only; a mislabelled file passes, an oddly named one fails. Not a plan review.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, construction, engineering or professional advice, and it does not replace a qualified professional or your building department. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

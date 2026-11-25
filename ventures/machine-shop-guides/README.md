# Machine shop guides

Free tools and guides for small machine shops that quote parts and work on
defense contracts. The front door to two products in development for the same
shops: an RFQ-to-quote assistant and a CMMC Level 1/2 + ISO 9001 workspace
(`portfolio/monetization/bets.md`, bets #2 and #4).

**Live:** <https://marisstella.app/machine-shop-guides/>

| Page | What it is |
|---|---|
| `cmmc-level-1-self-assessment.html` | The 15 CMMC Level 1 requirements (FAR 52.204-21(b)(1), verbatim, hash-pinned in `l1.test.mjs`), each judged by its NIST SP 800-171A objectives (59 in all, FCI read for CUI, per 32 CFR 170.15(c)(1)) marked met / not met / N/A, with evidence notes; a requirement is met only when all its objectives are, and all 15 must be met (no score, no POA&M, 32 CFR 170.24); a worksheet CSV (one row per objective) with scope, CAGE codes and the next annual date. Logic: `l1-data.mjs`, `l1.mjs`. |
| `sprs-score-calculator.html` | 110 NIST SP 800-171 requirements, met / not met / partial, scored by the DoD Assessment Methodology (110 minus 5/3/1). Partial credit for 3.5.3 and 3.13.11; no score without an SSP (3.12.4); the Conditional check from 32 CFR 170.21 (88 points, only 1-point gaps or 3.13.11 partial, and none of the six requirements (a)(2)(iii) never allows on a POA&M); gaps as a POA&M starter CSV that marks each gap allowed or not. |
| `nist-800-171-ssp-template.html` | System security plan builder: the 3.12.4 contents (boundary, environment, connections, plus purpose, CUI, inventory, data flow, users, contacts, review date) and, for each of the 110 requirements, status (met / not met / partial / N/A), implementation statement, responsible, evidence, provider, and for gaps the planned action and milestone. A review lists what an assessor would send back; the score and the "110 by" date come from the same statuses and milestones. Downloads: SSP as escaped standalone HTML and as Markdown, POA&M CSV, plan file JSON (re-opened through `normaliseSsp`). Can start from the SPRS calculator's saved answers. Draft kept in the browser only when the user ticks it. Logic: `ssp.mjs`. |
| `job-shop-quote-calculator.html` | Material, setup, programming, cycle time, other ops and markup from the user's own rates, recomputed at each quantity break. No built-in rates. |
| `cmmc-level-1-vs-level-2.html` | FCI vs CUI, the clauses to look for, Level 1 and Level 2 requirements, Phase 2 status (checked 24 Nov 2026). |
| `ssp-and-poam.html` | What goes in an SSP and a POA&M, and CMMC POA&M limits. |
| `how-to-price-a-machined-part.html` | The quoting method, from the shop's own records. |

Logic lives in `sprs-data.mjs` (weights), `sprs.mjs` (scoring), `ssp.mjs` (SSP builder) and `quote.mjs`
(quoting); tests: `node --test *.test.mjs`. Every regulatory claim and the date
it was checked: [`SOURCES.md`](SOURCES.md), which also lists what could not be
re-read from the official host in the building session.

## Honesty rules this venture keeps

- Never implies CMMC certification, assessment or DoD endorsement. A score
  here is a self-check.
- No machining cost figure that is not the user's own input.
- Products are "in development — early access", linking to
  <https://marisstella.app/industries/manufacturing/>.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, compliance, financial or
engineering advice, and it does not replace a qualified professional. **You
are responsible for reviewing and verifying its output before relying on
it**, and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your inputs
and run it yourself.

Not affiliated with or endorsed by the Department of Defense (Department of
War), NIST, the Cyber AB or any C3PAO.

## Usage tracking

`usage.mjs`: an anonymous per-browser count of page views, completed SPRS
self-checks, CSV downloads and quotes, kept in `localStorage` only. Do Not
Track and Global Privacy Control turn it off; every page has an opt-out button.
Nothing is transmitted.

FSL-1.1-MIT licensed.

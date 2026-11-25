# Machine shop guides

Free tools and guides for small machine shops that quote parts and work on
defense contracts. The front door to two products in development for the same
shops: an RFQ-to-quote assistant and a CMMC Level 1/2 + ISO 9001 workspace
(`portfolio/monetization/bets.md`, bets #2 and #4).

**Live:** <https://marisstella.app/machine-shop-guides/>

| Page | What it is |
|---|---|
| `cmmc-level-1-self-assessment.html` | The 15 CMMC Level 1 requirements (FAR 52.204-21(b)(1), verbatim, hash-pinned in `l1.test.mjs`), each judged by its NIST SP 800-171A objectives (59 in all, FCI read for CUI, per 32 CFR 170.15(c)(1)) marked met / not met / N/A, with evidence notes; a requirement is met only when all its objectives are, and all 15 must be met (no score, no POA&M, 32 CFR 170.24); a worksheet CSV (one row per objective) with scope, CAGE codes and the next annual date. Logic: `l1-data.mjs`, `l1.mjs`. |
| `cmmc-scoping-worksheet.html` | CMMC scoping worksheet (`scope.mjs`): the shop lists its assets by kind (CAM, DNC, CNC controller, CMM, printer, phone, cloud service, MSP tool...) and answers whether each handles CUI (yes / could but not meant to / cannot), whether it gives a security function, and for services what they hold; the page names the 32 CFR 170.19 table 3 category the answers point to (or Level 1 paragraph (b)), outside services by table 4, what each must have documented and how it is assessed, and what is open (a CRMA needs a written policy, out-of-scope needs a separation line, unanswered counts in scope). 17 verbatim quotes from the eCFR text, hash-pinned in `scope.test.mjs`. Asset inventory CSV (formula cells neutralised), lines for the SSP template's inventory box, plan file JSON. Kept in the browser only when the user ticks it. |
| `sprs-score-calculator.html` | 110 NIST SP 800-171 requirements, met / not met / partial, scored by the DoD Assessment Methodology (110 minus 5/3/1). Partial credit for 3.5.3 and 3.13.11; no score without an SSP (3.12.4); the Conditional check from 32 CFR 170.21 (88 points, only 1-point gaps or 3.13.11 partial, and none of the six requirements (a)(2)(iii) never allows on a POA&M); gaps as a POA&M starter CSV that marks each gap allowed or not. |
| `nist-800-171-ssp-template.html` | System security plan builder: the 3.12.4 contents (boundary, environment, connections, plus purpose, CUI, inventory, data flow, users, contacts, review date) and, for each of the 110 requirements, status (met / not met / partial / N/A), implementation statement, responsible, evidence, provider, and for gaps the planned action and milestone. A review lists what an assessor would send back; the score and the "110 by" date come from the same statuses and milestones. Downloads: SSP as escaped standalone HTML and as Markdown, POA&M CSV, plan file JSON (re-opened through `normaliseSsp`). Can start from the SPRS calculator's saved answers. Draft kept in the browser only when the user ticks it. Logic: `ssp.mjs`. |
| `dfars-7012-incident-reporting.html` | DFARS 252.204-7012 (MAY 2024) incident clock and checklist: 72-hour report deadline from discovery, image hold of at least 90 days from report submission, steps (c) to (m) each citing its paragraph (subcontractor, malware and cloud steps shown only when they apply), applicability from (c)(1), a timeline, record as Markdown or JSON. Three verbatim quotes hash-pinned in `incident.test.mjs`. Nothing stored unless the user ticks it. Logic: `incident.mjs`. |
| `stock-size-from-step-file.html` | Drop a customer's STEP or STL file: bounding box, the smallest round bar along each axis, and stock options (rectangular and round, with the user's allowance per side, facing/cut-off and rounding), weight and material cost from the user's density and price; from an STL, a first cycle time from the shop's own roughing width/depth/feed and finishing stepover/feed (removed volume ÷ removal rate + surface area ÷ finishing rate, plus allowance and load/unload; every face counted as finished, so it errs long; `cycle.mjs`, hand-checked in `cycle.test.mjs`); hands the cost and the cycle time to the quote calculator. STEP is read from its B-rep edges with exact arc extremes (box exact for planes, cylinders and cones, otherwise a flagged upper bound); STL gives volume and chip share. Parts modelled at an angle are boxed square to their own faces. Nothing is uploaded. Logic: `part-geometry.mjs`; checked against OpenCascade on 68 parts (`fixtures/geometry/`, SOURCES.md). |
| `job-shop-quote-calculator.html` | Material, setup, programming, cycle time, other ops and markup from the user's own rates, recomputed at each quantity break; optional setup and cycle-time calibration factors (blank = 1), filled from `?setupFactor=&cycleFactor=` by the quote-vs-actual page. No built-in rates. Once priced, a customer quote section builds what goes to the buyer: price each (rounded up to the cent) and extended price per quantity, part number and revision, material and finish, lead time, validity (with the expiry date), payment and shipping terms, notes and exclusions; never the cost lines. A check lists what a buyer would send back (no revision, no validity, no lead time, a larger lot cheaper in total). Download as standalone HTML (print to PDF) or copy as email text. Shop details are kept only if the user ticks it; customer and part details never. Logic: `quote-doc.mjs`. |
| `rfq-review.html` | RFQ review checklist (`rfq.mjs`): paste an RFQ; part numbers, revisions, quantities and annual usage, material, finish, tolerances (mm converted; tight ones flagged against the shop's own line), dates, 13 FAR/DFARS clauses with their titles copied from GSA's published source (`rfq.test.mjs` pins them), CUI/ITAR/AS9102/certs/NADCAP/DPAS markers, specs named. Each finding shows the text it came from. Questions for the buyer as a copyable email, a review CSV (formula cells neutralised), and the quantities handed to the quote calculator (`?breaks=`). Pasted text is never stored. Pattern matching, not reading: the page says so. |
| `drawing-review.html` | Drawing review (`drawing.mjs`, tested in `drawing.test.mjs` against an invented drawing written as a real PDF by `sample-drawing.mjs`): drop a part drawing PDF and its text layer is read in the browser (`pdf-text.mjs`, `pdf-parser.mjs`, `inflate-browser.mjs`, vendored byte for byte from the PDF ventures; `pdf-parser-sync.test.mjs` keeps the six copies equal). Title block fields from the label's own text, the next piece on its line or the cell under it, each value checked against what that field can look like; the revision table's latest row and a question when it disagrees with the title block; the general tolerance block (places written as .XX, X.XX or 2 PL, angles with minutes, fractions, ISO 2768 class reported but not applied, units, Y14.5 edition); numbered notes with continuation lines, tagged by cost, and skipped numbers; dimension and thread callouts in the views; distribution statements, CUI and export markings. Questions for the buyer as an email, a CSV (formula cells neutralised), and a link that opens the first article checker with the general tolerances in the query and the callouts in the # part. A scan or dimensions drawn as lines are not readable, and the page says so. |
| `first-article-inspection.html` | First article inspection checker (`fai.mjs`, tested in `fai.test.mjs`): paste the characteristic table of an FAI (tab or CSV, header columns mapped by name, several result columns read as several parts). Each requirement is read into limits (bilateral, unequal, limit dimensions, MAX/MIN, Ra, geometric tolerances as 0 to the tolerance with no MMC bonus, basic/reference, threads and notes as attribute checks, bare nominals by the general tolerance for their decimal places); an unreadable requirement is "not read", never passed. Flags out of tolerance, reject with no NCR, blank results, skipped or repeated balloon numbers, fewer results than nX places, pass marks on variable characteristics, readings within a set % of a limit. Form 3 style CSV (formula cells neutralised, negative numbers kept). Pasted text is never stored. |
| `quote-vs-actual.html` | Quoted vs actual hours: paste a job history CSV (quoted and actual setup hours and cycle minutes; machine, quantity and won/lost optional; headers matched loosely, units read from them). Per machine and overall: median actual ÷ quoted, middle half, share of jobs over quote, quantity-weighted hours missed (and dollars at the user's rate), win rate counting quotes that never became jobs, outlier jobs (ratio above 2 or below 0.5), and a factor (the median, offered at 5+ jobs, "rough" under 15) that one link carries into the quote calculator's factor fields. Summary CSV. Logic: `calibrate.mjs`; tests: `calibrate.test.mjs`. |
| `cmmc-level-1-vs-level-2.html` | FCI vs CUI, the clauses to look for, Level 1 and Level 2 requirements, Phase 2 status (checked 24 Nov 2026). |
| `ssp-and-poam.html` | What goes in an SSP and a POA&M, and CMMC POA&M limits. |
| `how-to-price-a-machined-part.html` | The quoting method, from the shop's own records. |

Logic lives in `sprs-data.mjs` (weights), `sprs.mjs` (scoring), `ssp.mjs` (SSP builder), `part-geometry.mjs` (STEP/STL reader and stock sizing), `cycle.mjs` (cycle time from the shop's feeds), `quote.mjs`
(quoting), `quote-doc.mjs` (the customer quote) and `calibrate.mjs` (quote vs actual); tests: `node --test *.test.mjs`. Every regulatory claim and the date
it was checked: [`SOURCES.md`](SOURCES.md), which also lists what could not be
re-read from the official host in the building session.

## Honesty rules this venture keeps

- Never implies CMMC certification, assessment or DoD endorsement. A score
  here is a self-check.
- No machining cost figure that is not the user's own input.
- A customer's model never leaves the browser: the stock-size page reads the file locally and its test forbids network calls.
- A box is never reported smaller than the part: where the reader can only bound a surface, it says the box is an upper bound and by how much.

### Why a shop would use the stock-size page

Today an estimator opens the customer's model in CAD (SolidWorks, Fusion, a free viewer such as eDrawings) and measures it, or an online quoting platform reads it after the file is uploaded to them. This reads it in a browser tab without installing anything or uploading a confidential model, sizes round and rectangular stock with the shop's own allowances, and hands the material cost to the quote. It is the first piece of the RFQ-to-quote product (bet #2).
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

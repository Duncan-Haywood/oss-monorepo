# Foundation prospecting

Most private foundations never post an open RFP. Grant writers **prospect** instead: they find
foundations that give in their state or community and are big enough to matter, research them
(grants lists, trustees, giving guidelines), then build a relationship or send a short **letter of
inquiry (LOI)**. Grant Autopilot automates the first step: it builds a ranked list of
*plausible* funders from public IRS data. A person still does the research and the outreach.

Code: `src/worker/services/prospecting/**`, `src/worker/routes/org/prospects.ts`,
`src/worker/db/schema/prospects.ts`. Tests: `test/worker/prospects.test.ts`,
`src/worker/services/prospecting/scoring.test.ts`.

## The data

Source: the [ProPublica Nonprofit Explorer API v2](https://projects.propublica.org/nonprofits/api)
(free, no key). ProPublica builds it from the IRS Exempt Organizations Business Master File (EO BMF)
and the IRS SOI annual extracts of Form 990 / 990-EZ / 990-PF financial data.

| We use | API field | Meaning |
| --- | --- | --- |
| Search | `search.json?q=&state[id]=&c_code[id]=3&ntee[id]=` | `q` matches organization **name, alternate name and city** only. 25 results per page. |
| Foundation type | `organization.foundation_code` | EO BMF: `04` private non-operating (grantmaker), `02`/`03` private operating, `10`-`24` public charity |
| Latest filing | `filings_with_data[]` (newest `tax_prd`) | `formtype` 0 = 990, 1 = 990-EZ, 2 = 990-PF |
| Total assets | `totassetsend` | End-of-year book value (990-PF Part II line 16 col b) |
| Total giving | `contrpdpbks` (990-PF only) | "Contributions, gifts, grants paid" (990-PF Part I line 25 col a) |
| Older years | `filings_without_data[]` | PDF links only, no extracted numbers |

Amounts arrive in whole dollars; we store integer cents. `funder_profiles` is a global table (public
data, one row per EIN). Each org's list lives in `org_prospects`.

### How a refresh works (`POST /api/orgs/:orgId/prospects/refresh`, editor+, once per hour)

1. **Search params from the profile.** Uses the state, the cities and counties in `serviceAreas`
   (e.g. "Gallup", "McKinley", "Navajo"), `focusAreas` phrases (e.g. `"workforce development"`) and a
   generic `foundation` query, with each search limited to 501(c)(3) in the org's state(s).
2. **Candidates.** Hits that look like grantmakers (name or NTEE `T2x`) are fetched first, up to 25
   detail calls per run. Only private foundations are kept.
3. **Scoring** (`prospecting.score`, structured output). The model gets the org profile and fact base
   (`[fct_…]` ids) plus numbered **funder facts** built from the filing data (`[ff_location]`,
   `[ff_type]`, `[ff_ntee]`, `[ff_filing]`, `[ff_assets]`, `[ff_giving]`). It returns `fitScore`,
   reasons that cite those ids, and an approach: `letter_of_inquiry`, `wait_for_rfp` or `research_first`.
4. **Deterministic post-checks** (`finalizeProspectScore`):
   - Fact ids the model was not given are dropped. A reason left with no valid citation is dropped.
   - Grants paid unknown: score capped at **50** and the approach changed from LOI to
     `research_first`. Zero grants reported: capped at **20**. Private operating foundation: capped
     at **40**, and an LOI becomes `wait_for_rfp`.
5. **Upsert** into `org_prospects` on `(org_id, ein)`. Only score fields are written. The user's
   `status`, `notes` and `nextStepAt` are never overwritten. When the scoring inputs haven't changed
   (same hash of prompt and context), the LLM call is skipped. At most 15 scoring calls run per refresh.

Statuses: `new → researching → contacted → applied`, or `declined` / `not_a_fit`.

## Limitations (tell users; the UI should show these)

- **The data lags 1–2 years.** A 990-PF is filed up to 10½ months after year end, then processed by the
  IRS and ProPublica. "Latest filing" usually means two tax years ago. Assets, giving, trustees and
  interests may have changed.
- **It doesn't show what a foundation funds.** The API has no grantee list and no program areas. The
  NTEE code classifies the foundation itself (usually `T20`/`T22`), not its causes. Mission fit can only
  be judged by reading the grants list (990-PF Part XV, in the PDF) or the foundation's own guidelines.
  The prompt forbids the model from claiming a foundation funds a cause, and every reason must cite
  provided facts.
- **Being on this list is not an invitation to apply.** It means "worth researching".
- **Respect "no unsolicited proposals".** Many foundations tick the 990-PF Part XV box saying they
  "only make contributions to preselected charitable organizations and do not accept unsolicited
  requests for funds", or say so on their website. The API doesn't expose that checkbox, so check the
  PDF before contacting anyone. Where it is ticked, the only appropriate approach is a relationship
  (introductions through board members or peers), never a cold LOI. Mark such foundations
  `not_a_fit` or `researching`, not `contacted`.
- **Search is name/city based.** Foundations with generic names, or based out of state but giving in New
  Mexico, can be missed. Users should add those by hand (planned) or use paid directories (Candid
  Foundation Directory, Instrumentl) for interest-based search.
- Coverage depends on e-filed returns. Some small or paper filers only have PDFs (`giving unknown`, so the
  score is capped).

## Politeness, caching and terms

- Read-only GETs through `ctx.web.fetchJson` (our crawler User-Agent). Calls are spaced at least
  **1 second apart** (per run / isolate).
- Every response is cached in R2 under `catalog/propublica/v2/…` for **30 days**. Refreshes inside
  that window make no network calls. `funder_profiles.raw_r2_key` points to the cached organization
  JSON, and the detail endpoint reads filing history from it without calling the API.
- Using the API means agreeing to ProPublica's
  [Data Terms of Use](https://www.propublica.org/about/propublica-data-terms-of-use): **cite ProPublica**
  wherever the data is shown, **don't republish the raw data in its entirety** or resell it, and note
  that ProPublica doesn't guarantee accuracy. So we show per-funder summaries only (no bulk export of the
  catalog), keep raw JSON as an internal cache, and every detail response (`GET /prospects/:id`)
  carries an `attribution` block: the ProPublica organization page link, the upstream IRS sources from
  the API's `data_source`, the terms URL and a no-warranty notice. The UI must render it.
- Upstream sources: [IRS EO BMF](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf),
  [IRS SOI annual extract of exempt organization financial data](https://www.irs.gov/uac/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data).

## Offline mode

With `FAKE_EXTERNALS=true`, the search uses `sample-foundations.ts`: six **fictional** foundations
("Sample Mesa Family Foundation", EINs `00-0000001`…`00-0000006`, `.example` websites, no
ProPublica link, attribution "Fictional sample data"). Never add real foundations there with
made-up numbers.

## API

- `GET /api/orgs/:orgId/prospects?status=new,researching|all&minFit=&approach=&state=&q=` →
  `{ items: (OrgProspect & { funder: FunderProfile })[], lastRun }`. Items are sorted by fit.
- `POST /api/orgs/:orgId/prospects/refresh` → `202 { queued: true, runId }`. Returns `429` with
  `Retry-After` within an hour of the last request, and `400` if the profile has no state.
- `GET /api/orgs/:orgId/prospects/:id` → prospect + `funder` + `funderFacts` (what the `ff_…`
  citations refer to) + `filings` (up to 12, newest first) + `attribution`.
- `PATCH /api/orgs/:orgId/prospects/:id` `{ status?, notes?, nextStepAt? }` (editor+, audited; the
  audit entry records field names only).

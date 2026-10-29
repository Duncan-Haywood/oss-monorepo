# Raphael's Map (spec drafted as "Covenant Atlas") — Build Specification

> Renamed 2026-10-29 at the owner's request. The text below is the owner's
> specification as supplied; where the build departs from it (static site
> instead of FastAPI + Next.js, and why), see `docs/decisions.md`.

**Status:** Implementation-ready product specification (v1.0)  
**Created:** 2026-10-29  
**Project type:** Local-first, evidence-based geographic research and decision-support application  
**Provisional project name:** Covenant Atlas (rename freely)  
**Default user profile:** Adult U.S.-based Catholic man looking for a mutually compatible, marriage-minded adult woman. The product should eventually support arbitrary user-defined preferences rather than hardcoding one person's worldview.

> **INSTRUCTIONS TO CLAUDE CODE:** Treat this document as the working product requirements document and implementation contract. Build a functioning MVP rather than an architectural mockup. Start with the U.S. county/metro analysis and verified public data. Produce a runnable application, automated tests, clear source metadata, and documentation. Do not ask for basic framework decisions: use the defaults below. Never display made-up results as real statistics. If a survey download is gated, support a documented local-file import and show the missing-data state instead of substituting invented figures.

---

## 1. Mission and primary decision

**Decision the app answers:** *Where and in which accessible communities is a user most likely to meet adult women who voluntarily share his aspirations for a practicing Catholic marriage, a large family, lifelong commitment, and a home-centered family life?*

This is **not** a dating-app scraper, a system for locating specific women, an automated messaging product, or a tool for inferring sensitive attributes about identifiable individuals. It is a **geographic, survey, and community-research tool** using public aggregates and optional information people freely provide about themselves.

There are two complementary workflows:

1. **Market research and geography:** Compare U.S. counties/metros and international countries on population size, Catholic presence, family-role attitudes, fertility intentions, marital structure, opportunities to meet people, and travel feasibility. Be transparent about missing data and uncertainty.
2. **Personal compatibility workflow:** Generate respectful dating-profile language, compatible dating-app settings, and open-ended questions for consensual conversations. Record the user's own preferences; do not score named strangers or secretly profile third parties.

**Critical distinction:** High national birth rates, low crude divorce rates, high Republican vote share, large hunting participation, and a high number of Catholics are *candidate predictors*, not demonstrations that a particular young woman desires a large Catholic family. The app must explicitly test whether proxies predict actual survey attitudes where data support testing.

### Definition of success

The user can open an interactive dashboard, inspect 10–30 U.S. areas with **real** source-backed demographics, compare a shortlist, understand what is directly measured versus proxy-based, add verified public community opportunities, and export a sourcing/research report. He can adjust the age range, geographic radius, importance of factors, and acceptable missing-data coverage. Each displayed statistic links to its underlying source, denominator, date, geography, and caveats.

---

## 2. Target outcomes and preference ontology

Default preferences are configurable, not normative judgments about everyone:

- **Faith:** Practicing Catholic; Mass attendance, Catholic beliefs, sacramental marriage, and religious commitment are more relevant than national Catholic identity alone.
- **Intent:** Wants marriage and a long-term union; thinks marriage should be preserved through ordinary difficulty and unhappiness. Do not conflate these beliefs with expectations to tolerate abuse or serious danger.
- **Children:** Wants children, ideally **4 or more**, with exploratory bands 0 / 1 / 2 / 3 / 4–5 / 6+; distinguish *ideal* from *expected* family size.
- **Motherhood/family organization:** Interested in prioritizing raising children, with a preference for the option of home-based parenting if economically feasible. Distinguish views about homemaking in general from one's own preferences.
- **Tradeoffs:** Would willingly trade luxury, income, or career opportunities for a larger family and a stable home, subject to reasonable financial security.
- **Values:** Fidelity, shared religious practice, commitment, desire to raise children in the faith, mutually respectful expectations for the husband's provision and involvement.
- **Optional exploratory proxies:** Homeschooling participation, family-of-origin intactness, conservative politics/Republican vote share, rural culture, hunting, religious schools, parish/young-adult group activity. These MUST be clearly labeled as unvalidated until tested.
- **Age:** Adult women **20–25** as the default interested age band; adjustable to 18+ only. Do not infer or engage with minors.
- **Relationship status:** Unmarried/single, where survey or population data are available; never substitute all women of that age for unmarried women without labeling the denominator.

### Outcomes vs. proxies (never mix these labels)

**Direct outcomes / attitudes:** ideal children count, preference for homemaking, willingness to sacrifice luxury for family, views on marital permanence, religious service attendance, intention to marry.

**Partial/related measures:** expected future births, current children, relationship status, religious identification, attitudes to divorce generally, support for traditional gender roles, actual cohort fertility.

**Ecological proxies:** total fertility rate, age-specific birth rates, crude divorce rate, Catholic adherents per capita, homeschool rates, county vote share, hunting license rates, share of children in married-couple households.

**Access measures:** adult target-age population, distance, transportation, publicly advertised parish/young-adult events, frequency of real opportunities, user's language and relocation constraints.

A direct measure is always preferred to a proxy when comparable and sufficiently precise.

---

## 3. Scope and prioritized geographies

### MVP — United States

- Compare **counties** using five-year American Community Survey (ACS) estimates and the 2020 U.S. Religion Census; show county and metro summaries separately. Do not treat metros and counties as the same unit.
- Start the demo with **Colorado Front Range** as the default map view: Boulder/Lafayette vicinity, Denver metro, and Fort Collins/Colorado Springs; populate from actual source data, not hand-authored numbers.
- Extend to all U.S. counties once ingestion works.
- Add state-level homeschool indicators and source-backed religion/value indicators where geographic detail genuinely permits.
- Curate a small manual set of **publicly advertised** Catholic young-adult opportunities: parish young-adult ministries, Catholic campus centers/Newman communities, Latin Mass communities, approved diocesan communities and public events. These are venues/organizations, **not lists of private people**.

### Expansion — international

Initial countries to compare: **Poland, Spain, Portugal, Germany, Croatia, Slovakia, Hungary, Philippines, Mexico, Colombia, Peru, Brazil, Argentina, South Korea, Vietnam**, plus United States. Optional next: Italy, Chile, Guatemala, Costa Rica, Austria, Ireland.

- Begin **country-level**, not city-level, comparisons for values surveys, because geographical sample sizes and survey geocodes may not justify city predictions.
- Only show a subnational comparison if the source actually supports it and effective sample sizes are adequate.
- Group by data availability rather than forcing global scores from mismatched survey years.
- Explicitly present travel, language, and actual meeting opportunities separately from statistical attitudes.

---

## 4. Verified source catalog and acquisition strategy

The following are actual sources and public documentation checked for this project. **Data access and permissible redistribution must be verified on acquisition; publicly visible documentation is not automatically permission to republish respondent-level files.** Store citation URLs, license/reuse notes, version, access requirements, ingestion date, and precise universe/wording for every metric.

| Priority | Dataset | What it contributes | Geographic level / caveat | Acquisition |
|---|---|---|---|---|
| P0 | [U.S. Census ACS 2024 5-year API](https://www.census.gov/data/developers/data-sets/acs-5year/2024.html) | Adult women by age, marital status by age, family structure, income/education where relevant | County; sample estimates, margins of error | API key may be required; `.env` configuration |
| P0 | [ACS detailed variable documentation](https://api.census.gov/data/2024/acs/acs5/variables.html) | Verified column IDs and labels | Source of truth for code-to-label mapping | API / variable JSON |
| P0 | [2020 U.S. Religion Census](https://www.usreligioncensus.org/node/1639) | Catholic adherents and congregations by county, state, metro | Adherents of all ages, NOT women 20–25 and NOT Mass attendees; census year 2020 | Download original XLSX/CSV, manual import initially |
| P0 | [ISSP Family and Changing Gender Roles 2022](https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles/2022) | Household roles, homemaking, marriage, children; individual age/sex/religion where available | Country-specific survey; **registration required**, fieldwork years vary. Includes US, Poland, Spain, Germany, Croatia, Slovakia, Philippines | User-supplied licensed survey file; import plus codebook mapping |
| P1 | [ISSP family module across waves](https://www.gesis.org/en/issp/data-and-documentation/family-and-changing-gender-roles) | Historical comparisons / countries absent in 2022, including Portugal, Mexico, Chile, Argentina, South Korea in 2012 | Older survey data NOT current estimates | Optional wave-specific importer |
| P1 | [Joint European Values Study / World Values Survey 2017–2022, v5](https://www.gesis.org/en/european-values-study/data-and-documentation/joint-evs/wvs-2017-2022-dataset) | Religion, family, divorce, gender-role, trust and values variables where documented | 92 countries/regions across 102 surveys; variable availability differs | Source files + harmonization dictionary; free WVS download also described at [WVS](https://www.worldvaluessurvey.org/WVSEVSjoint2017.jsp) |
| P1 | [Latinobarómetro 2024](https://www.latinobarometro.org/latinobarometro-2024) | Religion, gender/family attitudes and related demographic variables subject to questionnaire verification | 18 LAC territories; check precise 2024 questionnaire items | Aggregate CSV/Excel and codebooks available at source |
| P1 | [CDC NSFG 2022–2023](https://www.cdc.gov/nchs/nsfg/nsfg-2022-2023-puf.htm) | U.S. birth intentions, family and marriage history, survey-weighted young-adult analysis | National, complex survey design; restricted variables excluded | Public female CSV/codebooks; honor design weights |
| P1 | [NORC General Social Survey](https://gssdataexplorer.norc.org/gss_data) | U.S. family/gender-role attitudes, trends, religion | National; latest cumulative data to 2024 at time of spec | Download official release/codebook |
| P1 | [UN World Population Prospects 2024](https://population.un.org/wpp/) | Country-level fertility by five-year age band, total fertility | Observed estimates and projections separately; NOT desired children | Official UN files / API, note revision |
| P1 | [Eurostat divorce indicators `demo_ndivind`](https://ec.europa.eu/eurostat/databrowser/view/demo_ndivind/default/table?lang=en) | European crude divorce rates and series | Divorce events per population ≠ lifetime marital dissolution probability | Eurostat API/download |
| P2 | [PRRI American Values Atlas](https://ava.prri.org/religion/) | Adult Catholic affiliation and geography; potential values context | Religion identification vs active practice, varying geographic resolution | Public atlas and published files subject to availability |
| P2 | [Johns Hopkins Homeschool Hub](https://education.jhu.edu/edpolicy/policy-research-initiatives/homeschool-hub/) | Homeschool participation | State coverage and definitions vary; **2025–26 release partial** | State downloadable statistics; record coverage flags |
| P2 | [Pew Research Center downloadable datasets](https://www.pewresearch.org/datasets/) | Marriage, religion, family attitudes as available | Different questions/years; Pew account may be required | Source-specific licensed import |
| P2 | [Demographic and Health Surveys](https://dhsprogram.com/data/) | Ideal number of children and fertility intentions, where country waves exist | Not all countries; survey universe differs | Account/permission and recode specification |

### Source-selection rules

1. **Never seed charts with numbers copied from earlier chats, news snippets, or memory** unless independently reproduced from an official source/microdata file. Previous conversation statistics are candidate leads, not validated dataset inputs.
2. Keep survey **question text, language, answer categories, period, respondent universe, sampling design, and weight name** alongside every indicator.
3. Do not label values from men + women as women-only, all adults as 20–25-year-olds, or expressed values as behavioral outcomes.
4. Do not compare countries as if surveys have identical questionnaires without checking wording, mode, coverage, and time.
5. If data are gated, licensed, missing, or too thin: mark as **Not available** or **Insufficient sample**, not 0%.
6. Do not infer practicing Catholics from nominal Catholics without a validated separate estimate.
7. Don't reuse data from an older source as “2026” just because this is the current year.
8. Include minimum source refresh policy and stale-data badges, especially for active communities/events.

---

## 5. Specific metrics to implement

### 5.1 Demographics (MVP)

- **`women_20_24`** = ACS `B01001_032E + B01001_033E + B01001_034E` (female aged 20, 21, 22–24); source year 2024 ACS 5-year. Confirm labels on ingestion.
- **`women_25_29`** = ACS `B01001_035E`.
- **`women_20_29`** = sum of the above, with ACS margins of error handled appropriately if displayed.
- **`never_married_women_20_24`** / **`never_married_women_25_29`** = ACS **B12002** (Sex by Marital Status by Age), **using source-verified variable identifiers**. Note: B12002 may group ages differently; do not invent an exact 20–25 marital status estimate if it does not support that interval.
- **`catholic_adherents_per_1000`** = county Catholic adherents / matching-year county population × 1,000; different years should be explicitly flagged if denominator differs.
- **`catholic_congregations_per_100k`** = Catholic congregations / county population × 100,000, if denomination mapping is verified.
- **`married_couple_child_share`** = source-based child living-arrangement measure; identify biological/adoptive parent and cohabitation definitions accurately. Later milestone only.
- **`active_public_young_adult_events_per_month`** = count of verified public events observed over a recent window, not a projection of participant numbers.

### 5.2 Survey metrics (next milestone)

Define survey measures with explicit levels of alignment to desired outcome:

- Ideal family size: exact 0, 1, 2, 3, 4+ / not sure.
- Intended or expected births (different measure).
- Homemaking as fulfilling as paid employment (general belief).
- “Man earns / woman cares for home” attitude (role norm, **not necessarily her personal preference**).
- Preference for one's own full-time, part-time, or no paid employment while raising young children (stronger measure if available).
- Views on divorce, marital permanence, children’s well-being and marriage; preserve precise hypothetical circumstances.
- Religious identification and weekly attendance (different measures).
- Homeschooling preference/intention, if actually asked.
- Attitudes to financial tradeoffs, if actually asked; don't fabricate equivalence from generic economic hardship questions.
- Past number of sexual partners may appear in some surveys; **not a geographic ranking criterion in v1**, because of privacy, cohort, reporting differences, and weak cross-country comparability. Only use optional non-identifying population-level aggregates with clear scientific justification.

### 5.3 Geographic access

- User origin, optional radius, local travel radius, and country interest.
- Officially listed Catholic parish communities, young-adult groups, campus ministries and public events. Store public institution URL, location, recent verification date, eligibility (e.g., university affiliated), approximate age scope only when officially published.
- Cost/flight time/driving time: **not** estimated from latitude alone. Use actual travel provider/route source later or leave blank.
- Language feasibility as a user-controlled preference, not a proxy for values.

---

## 6. Analysis design — what counts as defensible evidence

### 6.1 Never multiply incompatible national averages

Do **not** estimate “number of ideal women” by multiplying `women_20_29 × %Catholic(all ages) × %traditional(all ages) × %wants4+(different survey)`. Such traits are correlated, definitions differ, and no joint distribution is observed. This produces misleading pseudo-precision.

Instead ship **two separate scorecards**:

1. **Opportunity / capacity:** transparent, measured or proxy metrics such as the number of women in target age brackets, Catholic presence, accessible community events, and distance.
2. **Values evidence:** directly observed weighted survey shares where available (prefer women, 18–29 or 20–29, unmarried, Catholic, attending weekly). Show effective sample sizes and uncertainty; if sparse, show broader comparison with a conspicuous caveat.

MVP ranking can be a user-weighted **research priority index**, but call it that—not probability a woman will marry the user, not expected wives, and not verified “compatibility.” Use normalized scales, configurable coefficients, and an evidence-completeness report alongside every score.

### 6.2 Survey weighting and subgroup reliability

- Analyze women and men separately; allow population-wide context, but label it.
- Prefer weighted proportions with the survey's recommended design and analysis weights.
- Track nominal `n`, effective sample size `n_eff = (sum(w))² / sum(w²)`, wave, missing data, and confidence interval where feasible.
- If `n_eff < 30`, suppress direct subgroup percentages or show only **Insufficient sample**. At `30 <= n_eff < 100`, flag **Exploratory / high uncertainty**. These are initial product guardrails, not universal statistical laws.
- For stratified/clustered surveys use design-based standard errors and survey methodology if information permits. Otherwise disclose that intervals are approximate; do not represent naive binomial intervals as fully design-correct.
- Handle refusals, “don't know,” and nonresponses explicitly. Show the denominator selection and whether these responses were excluded.
- Compare same wording across locations and avoid mixing 2012, 2022, and 2025 as equivalent contemporary observations.

### 6.3 Testing speculative proxies

Hypotheses, to be **tested** rather than assumed:

- Weekly Mass attendance or practicing Catholic identity is more predictive of desired marriage permanence and larger ideal family size than nominal Catholic affiliation.
- Personal homeschooling preference is associated with interest in raising multiple children / home-centered parenting.
- Conservative/Republican identification correlates with certain role or marriage attitudes in U.S. survey microdata.
- Family-of-origin structure correlates with marital expectations after controlling for other factors.
- Hunting/rural participation correlates with value preferences only after adjustment for religion, age, education, region and urbanicity.

Methods:

- Weighted descriptive cross-tabs by sex, age, marital status, religion/attendance, education, urbanicity, and country (when supported).
- If same microdata contain both predictor and target, run weighted logistic/ordinal models; compare out-of-sample discrimination/calibration to simple baselines. Report uncertainty and sample sizes, not just p-values.
- Prefer validated **individual-level** associations over correlations between county aggregates, and never treat an ecological relationship as an individual's probability.
- If a proxy cannot be tested against an outcome in the same compatible dataset, label **Unvalidated hypothesis** and keep it out of automatic weighting by default.
- Check whether variables are post-outcome (e.g., current having 5 children) before using them as prospective signals for unmarried 20–25-year-olds.
- Protect against multiple-comparisons fishing: separate exploratory findings from preregistered/held-out validation results.

### 6.4 Ranking approach for first release

Define four 0–100 **transparent dimension scores**, based on observed values only:

1. `demographic_capacity` — age-eligible female population; optionally never-married female population with correct denominator and age boundaries.
2. `catholic_ecosystem` — source-backed Catholic adherents and congregation density; clearly proxy/nominal, not attendance or compatibility.
3. `meeting_access` — public young-adult communities/events + verified proximity.
4. `values_evidence` — only if direct, comparable survey data exist at that geography. Otherwise `null`.

Show a side-by-side table and a **user-configurable composite research index** computed ONLY over available dimensions with visible re-normalized weights. Never silently replace missing data with zero. Display number of scored dimensions, coverage, source vintage, and rank sensitivity to changes in weights. Use population size logarithmically or percentile-normalized so a huge metro doesn't automatically win every score; show raw counts prominently so no math hides scale.

Create two default research modes:

- **Find volume:** prioritize reachable age-eligible population and opportunity to meet.
- **Find concentrated values:** prioritize directly measured values alignment where sample size is adequate; otherwise show that sufficient evidence is unavailable.

No “high quality women” or moral worth ratings. The research is about **mutually voluntary preference alignment**.

---

## 7. Product experience and views

### A. Home / executive summary

- “Where could I meet more compatible, marriage-minded Catholic adults?”
- Current state: last data refresh, number of locations with verified data, coverage limitations.
- Default view: Colorado Front Range; quick switch to all U.S. or international.
- Clearly labeled **Top areas for further research** (not “Top potential wives”).

### B. Explore map

- Choropleth for counties, switch metric: women 20–24, women 25–29, never-married women (if available), Catholic adherents, Catholic density, events.
- Click county → snapshot with raw values, percent/denominator, population period, margins of error, and source links.
- No private person markers.

### C. Compare locations

- Select 2–10 counties/metros, show directly comparable metrics in a sortable table and a small multiple chart.
- Include missingness, vintage, and noncomparability warnings.
- Allow copy/export CSV of aggregates with citations.

### D. Survey Explorer

- Filters: country, dataset, survey year, gender, age band, religion, weekly attendance, marital status, family size and family roles—**only when underlying variables exist**.
- Show exact question text, response choices, percentages, n_eff and caveats.
- Compare only equivalent questions or explicitly mark them as non-equivalent.
- Ability to show household-role attitudes alongside different questions about personal career and parenting preferences.

### E. Community opportunities

- Curated publicly advertised parishes, Catholic young-adult events, Newman/campus centers and traditional liturgy communities.
- For each: public website, location, relevant ministry, current verified status, upcoming public activity if verified, and user-added notes.
- A public organization's existence does not prove a sizable eligible dating pool.

### F. Dating profile and conversation toolkit

- Editable **must-have / nice-to-have / discovery-in-conversation** preferences.
- Profile draft generator for user-owned text; examples:
  - “Practicing Catholic, dating for marriage, hoping for a large family, God willing.”
  - “I'd love to provide for a family-centered home and prioritize children over luxury.”
- Dating app settings checklist: adult age band, Catholic affiliation, wants children, looking for marriage/long-term relationship; explicitly note features differ by app and change over time.
- Questions to explore mutually:
  - “If money were no concern, how many children would you ideally want?”
  - “If you had children, what role would you ideally want paid work to play?”
  - “Would you prefer a large family and modest comforts, or a small family and much more luxury?”
  - “What did you learn about marriage from the family you grew up in?”
  - “Do you view marriage as a permanent commitment through difficult periods? What exceptions do you recognize?”
- Offer gentle follow-ups, not an interrogation script. The tool must avoid demanding disclosures or assigning scores to a specific person based on intimate history.

### G. Methodology / source inspector

- Every metric click opens a trace: source -> version -> source file/API -> transform -> denominator -> displayed value.
- Clearly mark **Observed statistic**, **Survey estimate**, **Projection**, **Proxy**, **Unvalidated hypothesis**, and **User-maintained event listing**.
- Data quality notes and download/access restrictions included.

---

## 8. Architecture and engineering defaults

**Use this stack unless a concrete implementation blocker arises:**

- **Monorepo**: `backend/`, `frontend/`, `data/`, `scripts/`, `docs/`, `tests/`.
- **Backend**: Python 3.12, FastAPI, Pydantic v2, `uv` dependency manager.
- **Analytics**: DuckDB, Parquet source/derived layers, pandas or Polars, `statsmodels` / `scipy` for documented estimates and tests. Start with local files; don't introduce PostgreSQL until needed.
- **Frontend**: Next.js App Router, TypeScript, Tailwind CSS, a clean and restrained design system; MapLibre GL or Leaflet using public geographic boundaries; responsive layout.
- **State**: local config file / browser settings for preferences initially; user account/auth not necessary for local MVP.
- **Source fetching**: explicit `ingest` Python commands; bounded caching/retries, environment-based API key, no private credentials in repository.
- **Deployment**: local first. Optional later Docker Compose + cloud deployment; don't let deployment delay an offline-capable MVP.
- **Testing**: pytest for loaders/metrics/models and vitest/Playwright for main UI flows. CI lint/typecheck/test.
- **Licensing**: prefer MIT or Apache-2.0 for *code*, but data redistribution follows each source's license. Do not redistribute gated survey microdata in the repo.

Suggested repository structure:

```text
covenant-atlas/
  CLAUDE.md                 # this specification
  README.md
  .env.example
  Makefile
  backend/
    pyproject.toml
    app/
      main.py
      api/{health,geo,metrics,sources,comparisons,surveys,communities}.py
      models/{geography,source,metric,survey,community}.py
      services/{census,us_religion_census,ranking,surveys}.py
      db.py
    tests/
  frontend/
    package.json
    app/{page.tsx,explore,compare,surveys,communities,methodology}/
    components/
    lib/
    tests/
  data/
    raw/.gitkeep            # ignored: raw survey microdata
    processed/.gitkeep
    fixtures/                # tiny clearly synthetic test fixtures
    cache/.gitkeep
  scripts/
    ingest_acs.py
    ingest_religion_census.py
    check_sources.py
  docs/
    source_registry.yaml
    metric_dictionary.yaml
    methodology.md
    dataset_imports.md
    decisions.md
```

### Primary API contracts

Implement documented Pydantic response models and these endpoints:

- `GET /api/health`
- `GET /api/geographies?level=county&state=08`
- `GET /api/geographies/{geo_id}`
- `GET /api/metrics?geo_ids=...&metric_ids=...`
- `POST /api/compare` (IDs and optional metric selections)
- `POST /api/rank` (candidate geography IDs, weights, missingness policy)
- `GET /api/sources` and `GET /api/sources/{source_id}`
- `GET /api/communities?geo_id=...`
- `GET /api/surveys/questions` and `POST /api/surveys/crosstab` (**do not return fabricated data while no survey is ingested**).

Every metric API response should include:

```json
{
  "geo_id": "US-CO-013",
  "metric_id": "women_20_24",
  "estimate": null,
  "unit": "persons",
  "universe": "Female residents aged 20–24",
  "year_or_period": "2020-2024 ACS 5-year",
  "source_id": "acs5_2024",
  "source_url": "https://www.census.gov/data/developers/data-sets/acs-5year/2024.html",
  "method": "Sum of published ACS age cells",
  "margin_of_error": null,
  "quality_flags": ["not_ingested_yet"]
}
```

This is an **example schema**, not a data record. It must not appear as an actual county value until data are downloaded.

### Minimal storage tables

- `geographies(id, name, kind, parent_id, state_fips, county_fips, iso3, geom_ref)`
- `sources(id, title, provider, landing_url, dataset_version, reference_period, retrieved_at, license, access_notes, citation)`
- `metric_definitions(metric_id, label, universe, unit, definition, source_variable_ids, method, source_id, class)`
- `observations(geo_id, metric_id, estimate, moe, interval_lower, interval_upper, n, n_eff, reference_period, source_id, quality_flags)`
- `survey_question_map(dataset_id, variable, original_text, harmonized_concept, response_map, weight_variable, country, survey_year)`
- `community_venues(id, public_name, geo_id, category, public_url, public_address, verified_at, notes, public_event_frequency)`

Never store names, religious beliefs, political beliefs, sexual histories, or inferred preferences of private people from dating apps. Personal user preferences can remain local and editable.

---

## 9. MVP implementation order — actually build, don't just plan

### Sprint 0 — runnable skeleton

- [ ] Create monorepo, backend and frontend, environment template, lint/type/test scripts, basic UI design.
- [ ] Create `docs/source_registry.yaml` with sources above and explicit access modes.
- [ ] Create `docs/metric_dictionary.yaml` with definitions and correct source-year labels.
- [ ] Implement error/fallback states for absent data. No fabricated production statistics.
- [ ] Provide `make dev`, `make test`, `make ingest-acs`, and `make ingest-religion` working commands (or document equivalent if platform requires separate terminals).

### Sprint 1 — U.S. observed demographic opportunity map (first working vertical slice)

- [ ] Fetch official 2024 ACS 5-year county data via API. Support `CENSUS_API_KEY` in `.env`; if absent and server requires key, print actionable setup instructions. Validate variable codes from the official dictionary.
- [ ] Ingest `B01001` age-by-sex plus `B12002` sex/marital-status-by-age data, exposing only age bins the published tables truly support.
- [ ] Build processed Parquet and DuckDB tables keyed by FIPS, with sources and data-quality checks.
- [ ] Ingest the user's locally downloaded 2020 U.S. Religion Census file with documented column mapping, denomination mapping, and duplicate detection. Do not silently scrape or invent the spreadsheet format; inspect actual file headers before implementing the final parser.
- [ ] Add county choropleth, comparison table, data provenance panels, and evidence/missingness badges.
- [ ] Default the UI to a Colorado Front Range view, with ability to switch states.
- [ ] Demonstrate real results for a minimum of **10 Colorado counties** if the API and Census dataset are accessible. If access is blocked, still ship the running UI, working importer and explicit blocking instructions—not synthetic results disguised as real.

### Sprint 2 — empirical survey explorer

- [ ] Add ISSP 2022 importer, with explicit required original file and codebook instructions; support weighted country-by-sex/age estimates.
- [ ] Create an importer template for joint EVS/WVS; confirm harmonized variables before use.
- [ ] Add survey explorer and source-language question views.
- [ ] Test proxies only for outcomes measured in the *same* survey microdata.
- [ ] Add an international comparison view that handles unavailable countries and differing years correctly.

### Sprint 3 — practical meeting and matching workflow

- [ ] Add a manually curated, public-only community directory, link verification dates, and local event sources.
- [ ] Add user-configurable weighting of **research priorities**, plus rank-sensitivity visualizations.
- [ ] Add profile prompt generator, dating-app filter checklist, conversation-question organizer.
- [ ] Export a standalone report to Markdown and CSV including all sources and caveats.

### Sprint 4 — scientific refinement

- [ ] Build subgroup estimates and appropriately design-aware variance estimates for available survey files.
- [ ] Evaluate candidate proxy variables by incremental predictive value; report confidence intervals and generalization limitations.
- [ ] Introduce model cards and reproducibility notebooks.
- [ ] Consider locality matching at subnational level only after validating that geographically relevant microdata exist.

---

## 10. Tests and acceptance criteria

### Data integrity

1. A county's `women_20_24` is exactly the sum of verified female age-cell estimates; units are people, not percentages.
2. FIPS preserved as strings with leading zeros (e.g. `08`, `013`).
3. Join to the Religion Census requires matching geography, and it rejects duplicate or ambiguous county records.
4. Date mismatches, missing source downloads, missing survey countries, and zero observed events have different states.
5. Survey calculations preserve weighted denominator, unweighted count, n_eff, missing responses, and question wording.
6. Tiny subgroups are suppressed/flagged; unobserved country-attitude cells are `null`, never `0`.
7. Explicit 2024 ACS vs 2020 religion-source vintage is displayed on every composite view.
8. Crude divorce rate is never described as probability that a marriage ends in divorce.
9. A hypothetical profile preference is never mislabeled as a survey-backed prediction.

### Product quality

1. Local user can start frontend/backend from README instructions.
2. County list, map, comparisons, filters and source drill-down are functional, not static mockups.
3. Loading/error/empty states are understandable and preserve current filter selections.
4. No unexplained acronyms in UI; expand on first appearance (American Community Survey, International Social Survey Programme, etc.).
5. Responsive interface works on mobile and desktop.
6. At least 10 backend tests, 5 frontend component tests, and 1 end-to-end happy path for the first vertical slice.
7. No secret keys or restricted survey microdata committed; `.env.example` and `.gitignore` in place.
8. No targeted person scraping, face matching, deanonymization, covert outreach, automated dating-app actions, or storage of intimate individual-level data.
9. Scores have source coverage, assumptions, and a visible explanation of why an area ranks where it does.
10. A CSV/Markdown export retains exact data definitions and citations.

### Analytical interpretation

- All rankings are called exploratory **research priorities**.
- Every chart states **population**, **year**, **source**, **measure**, and important **uncertainty**.
- Never confuse childbearing behavior with intended/ideal family size.
- An all-age Catholic share is never described as the percentage of unmarried Catholic women 20–25.
- One survey's response wording is not collapsed into another without documentation.
- A country's religious culture is not a claim about any individual woman.

---

## 11. First prompt to execute in Claude Code

Paste this in Claude Code from the repository root after copying this document to `CLAUDE.md`:

```text
Read CLAUDE.md in full and execute Sprint 0 + Sprint 1 as a real working implementation.
Use Python 3.12, FastAPI, DuckDB/Parquet, Next.js, TypeScript and Tailwind.
Prioritize the shortest complete vertical slice: official 2024 ACS county data ingestion,
correct age-band metrics, an interactive Colorado county exploration page,
a location-comparison table, and per-metric source/provenance drilldowns.

Do not fabricate statistics, do not prefill national value percentages copied from chat,
and do not pretend un-ingested survey or religion data exists.
Handle Census API key requirements, local U.S. Religion Census import,
and missing-data states gracefully. Include automated tests and a working README.

Run the code and tests, fix failures you can reproduce, and report precisely
what works, what datasets were successfully ingested, and what access is still needed.
Then propose the next smallest Sprint 2 work item without claiming it is already done.
```

---

## 12. Open uncertainties and research backlog

- **No validated joint distribution** currently establishes a location-level prevalence of unmarried practicing Catholic women 20–25 who desire 4+ children, a home-centered vocation, and lifelong marriage. Build honest partial views instead.
- Strongly religious, unmarried young women may be sparse in national surveys; country differences are not necessarily robust for the exact target subgroup.
- Catholic parish membership is not equivalent to weekly Mass attendance; affiliation is usually measured at a different grain from age/sex/marital status.
- U.S. county vote totals or hunting rates may be interesting ecological correlates, but their usefulness for the specific outcome must be tested and can be confounded by rurality, age, education, and region.
- Homeschool participation is often measured among current parents and school-age children. It is not a direct measurement of unmarried women's future homeschooling intentions.
- Low measured divorce may reflect law, low marriage incidence, or unrecorded dissolution; compare properly conditioned measures when possible.
- International comparisons need source translation checks, country-specific survey weighting, and alignment of reference years.
- Meeting someone is reciprocal; no dataset can tell whether a particular person would be interested in the user.
- The final choice about a spouse is interpersonal and spiritual, not reducible to geographic rankings.

## 13. Change control

When implementation realities force changes:

1. Document the change in `docs/decisions.md` with date, rationale, alternatives, and new acceptance criteria.
2. Keep the original outcome/proxy distinction.
3. Prefer a smaller functional and reproducible product over extensive scaffolding.
4. Mark inaccessible sources explicitly; do not backfill with guesses or unverified AI-generated records.
5. Preserve the ability to replace country or preference scope without redesigning the entire system.

**End of specification.**

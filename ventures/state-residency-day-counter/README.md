# State Residency Day Counter

Free, browser-only multi-state day counter for remote workers, snowbirds and
digital nomads. List where you were and when; it totals the days per state,
checks them against the commonly published statutory residency tests (more than
183 days plus a permanent place of abode in New York, New Jersey, Connecticut,
Massachusetts, Pennsylvania, Minnesota, Rhode Island, Virginia, Maryland and Utah (183 days or more), Michigan, Vermont, Iowa and Maine, and the District of Columbia (183 days or more); 183 days or more with no abode needed in Georgia; more than 200 days in
Oregon; more than 270 days in Idaho; the nine-month presumption in California), shows the room left and the
date you would cross a limit, splits remote-work wages by workdays, draws a
year calendar coloured by state, imports stays from a calendar (.ics) export, the Timeline.json your phone exports from Google Maps (coordinates matched to states in the browser), or older Google Takeout history, and exports a day-range CSV. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/state-residency-day-counter/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - tolerant stay parser (ISO, US and month-name dates, state codes
  or names), day-grid analysis with travel-day and overlap handling, gap
  assumption, nights-vs-inclusive counting, crossing-date search, workday wage
  split, Google Timeline import (`timelineToStays`), CSV export, and an independent brute-force recount.
- Day-by-day log: one CSV row per calendar day (state, whether it came from a stay or the home-state assumption, weekday, a blank column for the evidence you keep), the log residency audits ask for (`dailyLog`, `dailyLogCsv`).
- Printable audit packet: one self-contained HTML file (days by state against the test, the date ranges behind each total, notices, the day-by-day log with an evidence column, disclaimer) to print to PDF and keep with receipts (`auditReportHtml`).
- Trip what-if: enter a planned trip and see the days it adds per state, whether it crosses a published limit, and the longest trip from that date that stays inside it (`tripImpact`).
- Remember and save: an opt-in "Remember my entries on this device" box (local storage only) and a save-to-file / load-from-file pair for the form fields, so a year of stays survives between visits (`setupToJson`, `setupFromJson`).
- Gap check: the notices name the date ranges no stay covers (the days the home-state assumption fills, or that count nowhere without one), so a missing trip shows up before an audit finds it (`gaps.ranges`).
- `state-boundaries.mjs` / `build-boundaries.py` - simplified (~200 m) US state outlines from the Census cartographic files, loaded only when a phone Timeline export is imported; `deviceTimelineToStays` resolves each visit's coordinates to a state and counts visits within about 1 km of a state line for the user to check.
- `usage.mjs` - local-only feature counters with an opt-out.
- `183-day-rule-by-state.html` - guide with a worked example that the test
  suite recomputes.
- `snowbird-days-in-new-york.html` - guide for Florida snowbirds with a New
  York home: three invented summers (1 May to 31 October is 184 days), the
  room left in each, figures recomputed by the test suite.
- `maryland-utah-182-day-limit.html` - guide for the two states whose test
  reads "183 days or more", so the safe maximum is 182; figures recomputed by
  the test suite.
- `california-nine-month-residency-presumption.html` - guide on why California
  has a nine-month presumption rather than a 183-day test; figures recomputed by
  the test suite.
- `remote-work-convenience-of-the-employer-rule.html` - guide on the
  employer-state rule, its dollar figures recomputed by the test suite.

## What you use today, and what this does differently

- **A spreadsheet or a calendar tally:** free and private, but the per-state totals, travel-day handling, overlaps and each state's threshold are yours to get right, and nothing tells you the date you would cross a limit.
- **Travel-day and residency trackers** (apps that log location from your phone, and tax-software add-ons): automatic capture, but they usually want an account and your location history on someone else's server. This tool takes your dates typed, pasted, or imported from a calendar or Google Timeline export, and keeps them in your browser.
- **A tax professional:** the only route to a residency determination. This tool does not make one. It gives you counted days, an audit-style daily log and a printable packet to bring to that conversation.
- **What this adds:** days per state against the commonly published tests, room left, the crossing date, a trip what-if, a workday wage split and a daily log with an evidence column, with no signup and no upload.

**No warranty.** Free and as-is; an organising aid, not tax or legal advice. It
does not decide anyone's residency: domicile, ties, what counts as an abode,
part-year rules, reciprocity and local taxes are not modelled, and the state
rules are summaries of commonly published tests that may be out of date. Tested
against hand-computed years and a random recount; unverified against any tax
authority's own determination.

**Privacy.** Everything runs in your browser; your dates are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

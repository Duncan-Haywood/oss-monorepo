# State Residency Day Counter

Free, browser-only multi-state day counter for remote workers, snowbirds and
digital nomads. List where you were and when; it totals the days per state,
checks them against the commonly published statutory residency tests (more than
183 days plus a permanent place of abode in New York, New Jersey, Connecticut,
Massachusetts, Pennsylvania, Minnesota, Rhode Island, Virginia, Maryland (183 days or more) and Maine; more than 200 days in
Oregon; the nine-month presumption in California), shows the room left and the
date you would cross a limit, splits remote-work wages by workdays, draws a
year calendar coloured by state, imports stays from a calendar (.ics) export or Google Timeline (Takeout) history, and exports a day-range CSV. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/state-residency-day-counter/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - tolerant stay parser (ISO, US and month-name dates, state codes
  or names), day-grid analysis with travel-day and overlap handling, gap
  assumption, nights-vs-inclusive counting, crossing-date search, workday wage
  split, Google Timeline import (`timelineToStays`), CSV export, and an independent brute-force recount.
- `usage.mjs` - local-only feature counters with an opt-out.
- `183-day-rule-by-state.html` - guide with a worked example that the test
  suite recomputes.

**No warranty.** Free and as-is; an organising aid, not tax or legal advice. It
does not decide anyone's residency: domicile, ties, what counts as an abode,
part-year rules, reciprocity and local taxes are not modelled, and the state
rules are summaries of commonly published tests that may be out of date. Tested
against hand-computed years and a random recount; unverified against any tax
authority's own determination.

**Privacy.** Everything runs in your browser; your dates are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

# STR Turnover Scheduler

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/str-turnover-scheduler/>

Free, private browser tool for Airbnb / VRBO hosts, co-hosts and small cleaning companies: paste your calendar (iCal) feeds and it builds the cleaning schedule. One job per checkout, assigned to cleaners day by day with travel time, same-day turnover windows checked against the clean time, double bookings across feeds flagged, the smallest crew that clears every deadline, and the margin on each property's cleaning fee. Exports a schedule CSV, a text message per cleaner and a calendar file.

After using this, you know how many cleaners you need next fortnight and which turnovers will go wrong, which used to take an evening with three calendar tabs.

Open `index.html`. Tests: `node --test 'ventures/str-turnover-scheduler/**/*.test.mjs'`.

Not legal, tax or employment advice. See `VENTURE.yaml`.

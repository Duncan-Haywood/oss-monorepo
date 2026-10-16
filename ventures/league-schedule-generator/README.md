# League Schedule Generator

Free, browser-only round-robin schedule maker for rec leagues, youth sports,
pickleball, darts and chess clubs and office leagues. Paste the team names and
pick a start date and weekday; it builds a single or double round robin with real
dates, home and away balanced (the minimum possible breaks), courts and time
slots shared evenly, team blackout dates handled with makeup rounds, skip dates
for holidays, and an optional single-elimination play-off bracket seeded from the
standings you type. Exports a CSV, calendar (.ics) files for the league or one
team, a plain-text version to paste into a group chat, and a share link that carries the whole setup in the URL fragment (never sent to any server) so a co-organiser opens the same league in one click. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - circle-method rounds with byes for odd leagues and home/away built
  in, date planner, seeded simulated-annealing court and time-slot assignment,
  blackout handling, CSV / iCalendar / text exports, standings, play-off bracket,
  rainout rescheduling (cancel a night or one team's match; it moves to the
  earliest later night both teams are free and a court is open, nothing else
  changes), and an independent validator that re-checks a finished schedule.
- Per-team time limits (`Team: 17:00`): a youth team that can only play early is only given those slots, rainout moves respect them, and the validator flags any breach; an unsatisfiable limit is reported, never hidden.
- Standings rank by points, goal difference, goals for; tick head-to-head to split teams level on points by the matches among them first (`standings(..., { headToHead: true })`).
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-make-a-round-robin-schedule.html` - guide with a worked 5-team example
  that the test suite recomputes.

**No warranty.** Free and as-is; an organising aid, not legal or financial
advice. Check every date, court and pairing before you send a schedule to a
league; league rules, venue bookings and tie-breaks are yours to apply. Tested
against hand-computed 4- and 5-team leagues and a seeded random check of every
size from 2 to 24 teams.

**Privacy.** Everything runs in your browser; team names and dates are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

**Returning each season.** The last setup is remembered in this browser's local storage only (Clear forgets it); share-by-link still carries a setup inside the URL.

**League web page.** "Download league web page" writes one self-contained `.html` file (schedule with a pick-your-team filter, standings and play-off bracket when you gave results, dark mode and print styles, no external requests). Upload it to any static host (GitHub Pages, Netlify, a school site) or email it, so parents and players get a link instead of a spreadsheet (`leaguePageHtml` in `calc.mjs`).

**Pool play.** For a tournament, "Build pool play" splits the teams (listed best seed first) into 2 or more pools by snake draft, builds a validated round robin for each pool on your dates, courts, blackouts and time slots, and, when you type results, ranks each pool and seeds the play-off winners first, then runners-up (`splitPools`, `buildPoolPlay`, `poolAdvancers` in `calc.mjs`). Each pool uses its own courts, so pools never compete for a court.

**Play-off race.** With results typed and a play-off size set, the page lists who has clinched a place, who is out, and how many more points clinch it for everyone still alive. With 12 or fewer games left it works through every win/draw/loss outcome (`playoffRace` in `calc.mjs`, cross-checked against brute force in the tests); with more it uses safe bounds that never call a team clinched or out wrongly. Ranked on points only, with ties on points counted against the team, so goal difference can only help a team shown as alive.

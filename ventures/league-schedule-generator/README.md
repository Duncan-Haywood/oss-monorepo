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

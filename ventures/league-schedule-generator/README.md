# League Schedule Generator

Free, browser-only round-robin schedule maker for rec leagues, youth sports,
pickleball, darts and chess clubs and office leagues. Paste the team names and
pick a start date and weekday; it builds a single or double round robin with real
dates, home and away balanced (the minimum possible breaks), courts and time
slots shared evenly, team blackout dates handled with makeup rounds, skip dates
for holidays, and an optional single-elimination play-off bracket seeded from the
standings you type. Exports a CSV, calendar (.ics) files for the league or one
team, a plain-text version to paste into a group chat, and a share link that carries the whole setup in the URL fragment (never sent to any server) so a co-organiser opens the same league in one click. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/league-schedule-generator/

## What you use today, and what this does differently

- **A spreadsheet or a hand-drawn grid:** free, but home/away balance, byes in odd leagues and court sharing are easy to get wrong, and a rainout means redoing the sheet.
- **League-management platforms** (TeamSnap, LeagueApps, SportsEngine and similar): registration, payments, team messaging and score apps, usually on a paid plan and with accounts for every team. This tool only makes and maintains the schedule: no signup, no upload, free.
- **What this adds:** a fair round robin with the fewest possible home/away breaks, real dates with blackouts and holidays, calendar files per team, and rainout moves that change nothing else. If you need registration or payments, use a platform and paste this schedule into it.

## Run your own league page (self-hosted)

The browser tool builds the season; `server.mjs` gets it to your players. You keep the setup and post results in
`/admin?key=...`; your players open **one link** (`/league?t=...`) to see every fixture, the standings and the
play-off bracket, and add their own team's schedule to their calendar (`.ics`). No accounts, no per-team fee, no
third party: zero dependencies, one JSON file on a disk you own.

- **Alternatives today:** TeamSnap, LeagueApps and SportsEngine hold your players' data behind per-team accounts and
  paid plans. This is only the publish-fixtures-and-table loop for one league, MIT-licensed. It has no registration,
  payments, messaging or score-entry by players; use one of them if you need those.
- **Secrets:** `ADMIN_KEY` unlocks `/admin`; `LEAGUE_TOKEN` is the secret in the player link. The server refuses to
  serve without both. Put it behind HTTPS (Fly and Render do); keys are in the URL, so do not share admin links.
- **Run:** `ADMIN_KEY=a LEAGUE_TOKEN=b STATE=./state.json node server.mjs`, or `docker compose up -d`
  (`docker-compose.yml`), Fly (`fly.toml`), or Render (`render.yaml`, deploy from your fork; it generates both
  secrets). Nothing runs on the author's accounts.
- Tests: `node --test server.test.mjs deploy.test.mjs`.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - circle-method rounds with byes for odd leagues and home/away built
  in, date planner, seeded simulated-annealing court and time-slot assignment,
  blackout handling, CSV / iCalendar / text exports, standings, play-off bracket,
  rainout rescheduling (cancel a night or one team's match; it moves to the
  earliest later night both teams are free and a court is open, nothing else
  changes), and an independent validator that re-checks a finished schedule.
- A team drops out mid-season (`Lob Squad` or `2026-11-03 Lob Squad`): its remaining matches are removed, matches already played stay, nothing else moves, and the page lists how many fixtures each opponent loses so the league can decide how earlier results count (`applyWithdrawals`).
- A team joins late (`2026-11-03 Newbies`): list the team with the others; its matches dated before its first night move to the earliest later night when both teams are free and a court and slot are open (respecting blackouts and per-team time and court limits), with a makeup night added if none fits. Nothing else moves, and a match that cannot be placed stays put and is named in the warnings (`applyLateTeams`).
- Named make-up date: end a rainout line with `-> 2026-10-16` (or `→`) to put the match on a day you already agreed, even outside the league weekday; it is refused with the reason if either team is blacked out or already playing, or no court and slot is free (`applyRainouts`).
- Per-team time limits (`Team: 17:00`): a youth team that can only play early is only given those slots, rainout moves respect them, and the validator flags any breach; an unsatisfiable limit is reported, never hidden.
- Per-team court limits (`Team: Field 2`): a team that can only use one pitch (a youth side on the small field) is only given those courts, rainout moves respect them, and the validator flags any breach (`parseCourtLimits`, `courtLimits` in `calc.mjs`).
- Slot fairness: the fairness note names the team with the widest gap between its most and least used time slot and court ("Team 4 has the widest time-slot gap: 5 game(s) at 19:00 against 3 at 18:00"), so an organiser sees who to swap rather than only a spread number (`slotFairness` in `calc.mjs`).
- Points system: type `2-1-0` (hockey, darts) or any win-draw-loss values instead of the default 3-1-0; the table, pool tables and play-off race all use it, a system that rewards losing is refused with the reason, and it rides in the share link (`parsePointSystem` in `calc.mjs`).
- Standings rank by points, goal difference, goals for; tick head-to-head to split teams level on points by the matches among them first (`standings(..., { headToHead: true })`).
- Points deductions and bonuses: in the results box write `Owls -3 pts (late fee)` or `Lynx +1`; the number is added to that team's table points before every tiebreak, and the play-off race uses it too (`parseResults` returns `adjustments`, `standings` and `playoffRace` take them).
- Season cost: type the court hire per hour and the fairness note prices the season (matches x match length x rate) and the even per-team fee, rounded up to the cent so the league never collects less than the bill (`seasonCost` in `calc.mjs`).
- Must-finish date: type the date the season has to end by (end of term, lease) and the fairness note says how many days spare the last game leaves, or how many rounds and matches fall after it (`deadlineCheck` in `calc.mjs`).
- Recent form: the standings table ends with each team's last five results in the order you typed them (`W D L`, oldest first), so a hot or sliding team shows at a glance (`formString` in `calc.mjs`).
- Games left: the standings table ends with each team's unplayed fixtures before the Form column, so an organiser sees who has played more than who (`gamesLeft` in `calc.mjs`).
- Run-in strength: the standings table shows, per team, the average points per game so far of the opponents it still has to play (`Opp. pts/g`), so an organiser sees who has the harder run-in (`scheduleStrength` in `calc.mjs`). A guide, not a forecast.
- Weekly update: "Copy weekly update as text" builds the group-chat post for the week: last round's scores (home first), the table, and the next round's fixtures; a round counts as played once every match in it has a result (`weeklyUpdate` in `calc.mjs`).
- Season highlights: a line under the results grid names the biggest win, the highest-scoring game, the best attack and the best defence (walkovers excluded from the match records) (`seasonRecords` in `calc.mjs`).
- Results grid: under the standings, a team-by-team grid of every score so far (row team's goals first), in table order, so an organiser sees at a glance who has not yet met (`crossTable` in `calc.mjs`).
- Result check: a warning when a pair has more typed results than meetings in the schedule (a duplicated line that would count twice in the table) or a result for a pair that never meets (`resultsCheck` in `calc.mjs`).
- Results to chase: once results are typed, a warning lists matches dated before today that have no result yet (a pair's results are matched to its meetings earliest first), so a missing score is named rather than silently counted as unplayed (`overdueResults` in `calc.mjs`).
- Standings CSV: once results are typed, "Download standings CSV" saves the ranked table (`standingsCsv` in `calc.mjs`).
- Rest report: the fairness note shows the shortest and longest days between each team's games and counts games that follow within a day (`restReport` in `calc.mjs`).
- Home/away runs: the fairness note flags any team stuck with three or more home or away games in a row and names it (`homeAwayReport` in `calc.mjs`).
- Bye report: in an odd league the fairness note names teams that sit out the first or last round, or have byes in two rounds running (the end of one leg and the start of the next in a double round robin) (`byeReport` in `calc.mjs`).
- Rematch spacing: for a double round-robin the fairness note shows the shortest and longest days between a pair's two meetings and names the pairs that replay soonest (`rematchReport` in `calc.mjs`).
- Shared grounds (`Net Ninjas, Dink Dynasty`): teams that share one pitch or court are moved so they are not both at home the same night where that can be avoided. Only venues flip (a double round robin flips both meetings), the validator must still pass, and clashes that cannot be avoided are listed (`parseGrounds`, `groundClashes`, `applyGroundSharing`).
- Print: "Print or save as PDF" prints only the schedule, standings and bracket (a print stylesheet hides the form and buttons), for the clubhouse wall.
- `usage.mjs` - local-only feature counters with an opt-out.
- `round-robin-schedule-by-number-of-teams.html` - rounds, games, byes and home/away breaks for 3 to 16 teams; the test suite recomputes the table from `roundRobin`.
- `tournament-bracket-by-number-of-teams.html` - bracket size, first-round byes, rounds and games for 3 to 32 teams, single and double elimination; the test suite recomputes every row from `playoffBracket` and `doubleEliminationBracket`.
- `round-robin-schedule-template.html` - the full round-by-round fixture list (home first, byes marked) for 4, 5, 6, 7, 8, 9, 10, 11, 12, 14 and 16 teams; the test suite recomputes every row from `roundRobin`.
- `how-to-run-a-swiss-tournament.html` - guide to Swiss pairings with a worked 6-player example that the test suite recomputes from `swissPairings`.
- `how-to-run-an-americano-tournament.html` - guide to Americano rotations with a worked 8-player, 2-court example that the test suite recomputes from `americano`.
- `how-to-run-a-mexicano-tournament.html` - guide to Mexicano draws (1 & 4 against 2 & 3 from the table) with a worked 8-player, 2-court example that the test suite recomputes from `mexicanoNextRound`.
- `how-to-run-a-double-elimination-tournament.html` - guide to winners/losers brackets, byes and the grand final reset with a worked 6-team example that the test suite recomputes from `doubleEliminationBracket`.
- `how-to-run-a-single-elimination-bracket.html` - guide to seeding, byes and game counts with a worked 6-team example that the test suite recomputes from `playoffBracket`.
- `how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html` - guide to byes with 5, 7 or 9 teams and a worked 5-team example that the test suite recomputes from `roundRobin`.
- `how-to-schedule-a-league-with-limited-courts-and-time-slots.html` - guide to courts and time slots (slots per round, fair early and late slots) with a worked 6-team, 2-court example that the test suite recomputes from `buildSchedule`.
- `how-to-break-ties-in-league-standings.html` - guide to head-to-head versus goal difference with a worked 4-team example that the test suite recomputes from `standings`.
- `how-to-reschedule-a-rained-out-league-game.html` - guide to moving a rainout to the earliest night both teams are free, with a worked 4-team example that the test suite recomputes from `applyRainouts`.
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

**Pool play.** For a tournament, "Build pool play" splits the teams (listed best seed first) into 2 or more pools by snake draft, builds a validated round robin for each pool on your dates, courts, blackouts and time slots, and, when you type results, ranks each pool and seeds the play-off winners first, then runners-up (`splitPools`, `buildPoolPlay`, `poolAdvancers` in `calc.mjs`). Each pool uses its own courts, so pools never compete for a court. Lines in the shared-grounds box double as clubs: teams on one line are kept in different pools where possible by swapping teams within the same snake row, so pool sizes and the seed spread are unchanged (`splitPools(teams, k, clubs)`, `clubPairsInPools`).

**Play-off chance.** Next to the race table, a Chance column estimates each live team's odds of a top-N finish by playing the remaining fixtures out 4,000 times: strength is each team's smoothed result share so far, win chances come from the log5 rule, the draw rate is the league's own, ties at the cut are a coin flip, and it is seeded so the same table gives the same figures. The page shows 100% and 0% for teams the race table calls clinched or out, and holds live teams to 1-99%. An estimate, not a forecast of skill (`playoffOdds` in `calc.mjs`; tests check a finished table, that chances add up to the number of spots, and agreement with the race table).

**Play-off race.** With results typed and a play-off size set, the page lists who has clinched a place, who is out, and how many more points clinch it for everyone still alive. With 12 or fewer games left it works through every win/draw/loss outcome (`playoffRace` in `calc.mjs`, cross-checked against brute force in the tests); with more it uses safe bounds that never call a team clinched or out wrongly. Ranked on points only, with ties on points counted against the team, so goal difference can only help a team shown as alive.

**Swiss system.** Standings rank by score, then Buchholz, then Sonneborn-Berger (`sonnebornBerger` in `swissStandings`). For chess clubs, darts, board games and esports, "Pair next round" takes the players (best seed first) and the finished games (`Ana 1 - 0 Ben`, equal numbers are a draw, `Cy bye`) and pairs the next round Dutch style: same-score players meet top half against bottom half, nobody meets twice, the bye goes to the lowest-ranked player without one, and colours alternate. The table ranks by score then Buchholz, and the page suggests ceil(log2 n) rounds (`swissPairings`, `swissStandings`, `validateSwiss` in `calc.mjs`; checked for no rematches and one bye each from 4 to 16 players). Not FIDE-certified pairing: it does not implement every FIDE floater or colour rule, so use an arbiter-approved program for rated events.

**Referees and officials.** List your referees, umpires or scorekeepers (one per line, with an optional team in brackets, weekdays and `max N`) and every match gets one, shared out evenly. An official never works a match involving their own team, is never on two matches at the same time, keeps to their weekdays and cap, and any match nobody can take is listed with the reason. The CSV, text and league web page gain an Official column (`parseOfficials`, `assignOfficials`, `validateOfficials` in `calc.mjs`). "Download a message per official" writes one ready-to-paste note for each official with only their own matches, date, time, court and teams (`officialMessages`).

**Double-elimination play-offs.** Tick "Double elimination" next to the play-off size (three or more teams) and the bracket becomes winners and losers brackets, a grand final, and a reset game that is played only if the losers-bracket team wins the grand final. A team is out after two losses; byes in an uneven field are carried through the losers bracket so no match is left without an opponent. Tests play every field from 3 to 17 teams, including random results, and check one champion, every other team out on exactly two losses, and 2k-2 games (one more with a reset) (`doubleEliminationBracket` in `calc.mjs`).

**Americano (rotating partners).** For social padel, pickleball, badminton and tennis nights, "Build rotation" takes the players, the number of courts and rounds, and re-pairs everyone each round so people partner and oppose as many different players as possible. Sit-outs and games are shared within one of even, repeat partnerships are minimised by a seeded search and counted, and a validator re-checks the plan (`americano`, `validateAmericano`, `americanoStats`, `americanoText` in `calc.mjs`; tested for every size from 4 to 24 players). Not an official rating system: it does not score or rank the night.

**Mexicano (draw from the table).** For padel and pickleball nights where each round is drawn from the standings, "Draw next round" takes the players, the courts and every finished game (`Ana & Ben 21-17 Cy & Dee`), credits each player with their side's points, and pairs the leaders together: 1 & 4 against 2 & 3 in each group of four, or a split that avoids repeating a partner. The player who has played most sits out, and round one with no scores is a seeded random draw (`parseMexicanoScores`, `mexicanoStandings`, `mexicanoNextRound`, `mexicanoText` in `calc.mjs`; tested for 4 to 20 players on 1 to 3 courts, with games staying within one of even). A format helper, not a rating system.

**Forfeits.** In the results box, `Hawks w/o Owls` (or `wo`, `walkover`) awards Hawks the win at 3-0, counted in the table, goal difference, head-to-head and the play-off race like a played game. Leagues score forfeits differently, so apply your own rule by typing the score you want instead (`parseResults` in `calc.mjs`, `walkover` option).

**A message per team.** "Download a message per team" writes one ready-to-paste note for each team ("Hi Hawks, your fixtures: ...") with only that team's dates, venues, opponents and byes, so a coordinator can message each team instead of forwarding the whole league (`teamMessages` in `calc.mjs`).

**Third-place match.** Tick "Third-place match" next to the play-off size (single elimination, four or more teams) and the losing semi-finalists play `3P` on the final's day (`playoffBracket(seeds, { thirdPlace: true })`). The share link now also carries the double-elimination and third-place ticks; the double-elimination tick was being dropped on open.

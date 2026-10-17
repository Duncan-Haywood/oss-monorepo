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

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - circle-method rounds with byes for odd leagues and home/away built
  in, date planner, seeded simulated-annealing court and time-slot assignment,
  blackout handling, CSV / iCalendar / text exports, standings, play-off bracket,
  rainout rescheduling (cancel a night or one team's match; it moves to the
  earliest later night both teams are free and a court is open, nothing else
  changes), and an independent validator that re-checks a finished schedule.
- A team drops out mid-season (`Lob Squad` or `2026-11-03 Lob Squad`): its remaining matches are removed, matches already played stay, nothing else moves, and the page lists how many fixtures each opponent loses so the league can decide how earlier results count (`applyWithdrawals`).
- Per-team time limits (`Team: 17:00`): a youth team that can only play early is only given those slots, rainout moves respect them, and the validator flags any breach; an unsatisfiable limit is reported, never hidden.
- Standings rank by points, goal difference, goals for; tick head-to-head to split teams level on points by the matches among them first (`standings(..., { headToHead: true })`).
- Standings CSV: once results are typed, "Download standings CSV" saves the ranked table (`standingsCsv` in `calc.mjs`).
- Rest report: the fairness note shows the shortest and longest days between each team's games and counts games that follow within a day (`restReport` in `calc.mjs`).
- Rematch spacing: for a double round-robin the fairness note shows the shortest and longest days between a pair's two meetings and names the pairs that replay soonest (`rematchReport` in `calc.mjs`).
- Shared grounds (`Net Ninjas, Dink Dynasty`): teams that share one pitch or court are moved so they are not both at home the same night where that can be avoided. Only venues flip (a double round robin flips both meetings), the validator must still pass, and clashes that cannot be avoided are listed (`parseGrounds`, `groundClashes`, `applyGroundSharing`).
- `usage.mjs` - local-only feature counters with an opt-out.
- `round-robin-schedule-by-number-of-teams.html` - rounds, games, byes and home/away breaks for 3 to 16 teams; the test suite recomputes the table from `roundRobin`.
- `round-robin-schedule-template.html` - the full round-by-round fixture list (home first, byes marked) for 4, 5, 6, 7, 8, 9, 10, 11, 12, 14 and 16 teams; the test suite recomputes every row from `roundRobin`.
- `how-to-run-a-swiss-tournament.html` - guide to Swiss pairings with a worked 6-player example that the test suite recomputes from `swissPairings`.
- `how-to-run-an-americano-tournament.html` - guide to Americano rotations with a worked 8-player, 2-court example that the test suite recomputes from `americano`.
- `how-to-run-a-mexicano-tournament.html` - guide to Mexicano draws (1 & 4 against 2 & 3 from the table) with a worked 8-player, 2-court example that the test suite recomputes from `mexicanoNextRound`.
- `how-to-run-a-double-elimination-tournament.html` - guide to winners/losers brackets, byes and the grand final reset with a worked 6-team example that the test suite recomputes from `doubleEliminationBracket`.
- `how-to-run-a-single-elimination-bracket.html` - guide to seeding, byes and game counts with a worked 6-team example that the test suite recomputes from `playoffBracket`.
- `how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html` - guide to byes with 5, 7 or 9 teams and a worked 5-team example that the test suite recomputes from `roundRobin`.
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

**Play-off race.** With results typed and a play-off size set, the page lists who has clinched a place, who is out, and how many more points clinch it for everyone still alive. With 12 or fewer games left it works through every win/draw/loss outcome (`playoffRace` in `calc.mjs`, cross-checked against brute force in the tests); with more it uses safe bounds that never call a team clinched or out wrongly. Ranked on points only, with ties on points counted against the team, so goal difference can only help a team shown as alive.

**Swiss system.** For chess clubs, darts, board games and esports, "Pair next round" takes the players (best seed first) and the finished games (`Ana 1 - 0 Ben`, equal numbers are a draw, `Cy bye`) and pairs the next round Dutch style: same-score players meet top half against bottom half, nobody meets twice, the bye goes to the lowest-ranked player without one, and colours alternate. The table ranks by score then Buchholz, and the page suggests ceil(log2 n) rounds (`swissPairings`, `swissStandings`, `validateSwiss` in `calc.mjs`; checked for no rematches and one bye each from 4 to 16 players). Not FIDE-certified pairing: it does not implement every FIDE floater or colour rule, so use an arbiter-approved program for rated events.

**Referees and officials.** List your referees, umpires or scorekeepers (one per line, with an optional team in brackets, weekdays and `max N`) and every match gets one, shared out evenly. An official never works a match involving their own team, is never on two matches at the same time, keeps to their weekdays and cap, and any match nobody can take is listed with the reason. The CSV, text and league web page gain an Official column (`parseOfficials`, `assignOfficials`, `validateOfficials` in `calc.mjs`).

**Double-elimination play-offs.** Tick "Double elimination" next to the play-off size (three or more teams) and the bracket becomes winners and losers brackets, a grand final, and a reset game that is played only if the losers-bracket team wins the grand final. A team is out after two losses; byes in an uneven field are carried through the losers bracket so no match is left without an opponent. Tests play every field from 3 to 17 teams, including random results, and check one champion, every other team out on exactly two losses, and 2k-2 games (one more with a reset) (`doubleEliminationBracket` in `calc.mjs`).

**Americano (rotating partners).** For social padel, pickleball, badminton and tennis nights, "Build rotation" takes the players, the number of courts and rounds, and re-pairs everyone each round so people partner and oppose as many different players as possible. Sit-outs and games are shared within one of even, repeat partnerships are minimised by a seeded search and counted, and a validator re-checks the plan (`americano`, `validateAmericano`, `americanoStats`, `americanoText` in `calc.mjs`; tested for every size from 4 to 24 players). Not an official rating system: it does not score or rank the night.

**Mexicano (draw from the table).** For padel and pickleball nights where each round is drawn from the standings, "Draw next round" takes the players, the courts and every finished game (`Ana & Ben 21-17 Cy & Dee`), credits each player with their side's points, and pairs the leaders together: 1 & 4 against 2 & 3 in each group of four, or a split that avoids repeating a partner. The player who has played most sits out, and round one with no scores is a seeded random draw (`parseMexicanoScores`, `mexicanoStandings`, `mexicanoNextRound`, `mexicanoText` in `calc.mjs`; tested for 4 to 20 players on 1 to 3 courts, with games staying within one of even). A format helper, not a rating system.

**Forfeits.** In the results box, `Hawks w/o Owls` (or `wo`, `walkover`) awards Hawks the win at 3-0, counted in the table, goal difference, head-to-head and the play-off race like a played game. Leagues score forfeits differently, so apply your own rule by typing the score you want instead (`parseResults` in `calc.mjs`, `walkover` option).

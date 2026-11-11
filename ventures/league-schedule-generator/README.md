# League Schedule Generator

Free, browser-only round-robin schedule maker for rec leagues, youth sports,
pickleball, darts and chess clubs and office leagues. Paste the team names and
pick a start date and weekday; it builds a single or double round robin with real
dates, home and away balanced (the minimum possible breaks), courts and time
slots shared evenly, team blackout dates handled with makeup rounds, skip dates
for holidays, and an optional single-elimination play-off bracket seeded from the
standings you type. Also runs a challenge ladder (paste "Cy beat Ana" results; it moves players up, shows who may challenge whom and flags challenges beyond your reach limit). Exports a CSV, calendar (.ics) files for the league or one
team, a plain-text version to paste into a group chat, and a share link that carries the whole setup in the URL fragment (never sent to any server) so a co-organiser opens the same league in one click. Nothing is uploaded.

**Live tool:** https://marisstella.app/league-schedule-generator/

## What you use today, and what this does differently

- **A spreadsheet or a hand-drawn grid:** free, but home/away balance, byes in odd leagues and court sharing are easy to get wrong, and a rainout means redoing the sheet.
- **League-management platforms** (TeamSnap, LeagueApps, SportsEngine and similar): registration, payments, team messaging and score apps, usually on a paid plan and with accounts for every team. This tool only makes and maintains the schedule: no signup, no upload, free.
- **What this adds:** a fair round robin with the fewest possible home/away breaks, real dates with blackouts and holidays, calendar files per team, and rainout moves that change nothing else. If you need registration or payments, use a platform and paste this schedule into it.
- **Next season in one click:** "Start next season from this league" keeps the teams (minus withdrawals, plus late entrants), courts, times and weekdays, clears the old dates and results, and sets the start to the next chosen weekday eight weeks after the last match, so a returning organiser does not retype anything.

## Run your own league page (self-hosted)

The browser tool builds the season; `server.mjs` gets it to your players. You keep the setup and post results in
`/admin?key=...`; your players open **one link** (`/league?t=...`) to see every fixture, the standings and the
play-off bracket, and add their own team's schedule to their calendar (`.ics`). No accounts, no per-team fee, no
third party: zero dependencies, one JSON file on a disk you own.

- **Alternatives today:** TeamSnap, LeagueApps and SportsEngine hold your players' data behind per-team accounts and
  paid plans. This is only the publish-fixtures-and-table loop for one league, MIT-licensed. It has no registration,
  payments or messaging; use one of them if you need those.
- **Secrets:** `ADMIN_KEY` unlocks `/admin`; `LEAGUE_TOKEN` is the secret in the player link. The server refuses to
  serve without both. Put it behind HTTPS (Fly and Render do); keys are in the URL, so do not share admin links. Ten wrong links from one address lock it out for 15 minutes (HTTP 429); behind a proxy the last `X-Forwarded-For` hop is used.
- **Run:** `ADMIN_KEY=a LEAGUE_TOKEN=b STATE=./state.json node server.mjs`, or `docker compose up -d`
  (`docker-compose.yml`), Fly (`fly.toml`), or Render (`render.yaml`, deploy from your fork; it generates both
  secrets). Nothing runs on the author's accounts.
- **Score reports:** the player page has a "Report a score" form. A report only waits in `/admin` ("Scores waiting for you"); **Approve** appends it to Results as `Hawks 3 - 2 Owls`, **Decline** drops it, and the table never changes until you approve. At most 100 wait at once.
- Tests: `node --test server.test.mjs deploy.test.mjs`.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - circle-method rounds with byes for odd leagues and home/away built
  in, date planner, seeded simulated-annealing court and time-slot assignment,
  blackout handling, CSV / iCalendar / text exports, standings, play-off bracket,
  rainout rescheduling (cancel a night or one team's match; it moves to the
  earliest later night both teams are free and a court is open, nothing else
  changes), and an independent validator that re-checks a finished schedule.
- Rainout change notices: after a rainout move, "Download rainout change notices" writes one post for the league chat listing every moved match (old date, new date, time, court) and one short note per affected team with only its own changes (`changeNotices` in `calc.mjs`).
- A team drops out mid-season (`Lob Squad` or `2026-11-03 Lob Squad`): its remaining matches are removed, matches already played stay, nothing else moves, and the page lists how many fixtures each opponent loses so the league can decide how earlier results count (`applyWithdrawals`).
- A team joins late (`2026-11-03 Newbies`): list the team with the others; its matches dated before its first night move to the earliest later night when both teams are free and a court and slot are open (respecting blackouts and per-team time and court limits), with a makeup night added if none fits. Nothing else moves, and a match that cannot be placed stays put and is named in the warnings (`applyLateTeams`).
- Fixed-date matches (`Hawks v Owls -> 2026-11-03`): pin a derby, a cup rematch or a venue booking to a day you choose, earlier or later than where it fell; the pair's earliest unpinned meeting moves there under the same checks as a named rainout date, refusals say why, and write a pair twice to fix both legs of a double round robin (`applyPinnedMatches` in `calc.mjs`). The lines ride in the share link.
- Named make-up date: end a rainout line with `-> 2026-10-16` (or `→`) to put the match on a day you already agreed, even outside the league weekday; it is refused with the reason if either team is blacked out or already playing, or no court and slot is free (`applyRainouts`).
- Dates (2026-11-05): `YYYY-MM-DD`, `M/D/YYYY`, `25/12/2026` (day first only when the first number is over 12; `5/6/2026` stays month first), `25.12.2026`, `25 Dec 2026` and `Dec 25, 2026` are read (`parseDate`; unit-tested).
- Shorter season (`Rounds to play`): a 12-team league that only has time for 8 games a team plays the first 8 rounds of the circle method, so every team meets 8 different opponents, home and away stay within one game of even (two in a double round robin), the page says not every pair meets, and the validator checks it (`spec.rounds` in `buildSchedule`; the test suite validates every length for 3 to 14 teams). Standings then compare teams that did not play identical opponents; the points table is the organiser's call.
- Per-team time limits (`Team: 17:00`): a youth team that can only play early is only given those slots, rainout moves respect them, and the validator flags any breach; an unsatisfiable limit is reported, never hidden.
- Per-team court limits (`Team: Field 2`): a team that can only use one pitch (a youth side on the small field) is only given those courts, rainout moves respect them, and the validator flags any breach (`parseCourtLimits`, `courtLimits` in `calc.mjs`).
- Fill partial nights (`splitRounds`, the "Fill every slot" box on `multi-division-league-schedule.html`, `"split": "1"` in a CLI spec): when a division's round does not fit the court slots left tonight, part of it is played now and the rest comes first on that division's next night, so each team still plays once a night and rounds stay in order (rounds read "Round 3 (part 1)"). Measured on the example league with 3 courts x 2 times: 17 nights -> 13 and slot use 72% -> 94%, same 0 link clashes, `validateDivisions` clean; a round larger than all the slots, refused before, now spreads over nights. Tests in `divisions.test.mjs`.
- Home/away breaks after rainouts (`applyDivisionRainouts(schedule, text, { balance: true })`, API only; stats now report `homeAwayBreaks`, two home or two away matches in a row per team). A rained-out match placed on the earliest free night leaves its team out of order, so breaks rise: on the example league (3 courts, 8 seeds, every fourth night rained out) 176 -> 395. Weighing the first six fitting nights and taking the one with fewest breaks gives 347 (-12%) but moves matches 5.5 days later on average (16.6 against 11.1) and ends the season about 5 days later, so it is off by default. With `splitRounds` it changed nothing (339 both ways: split nights are full, so there is no choice of night). Flipping home/away of a moved match is in (`{ flip: true }`, API only; after all the moves it swaps a moved match when that lowers the total breaks and both teams stay within one home game of even; single round robins only). It moves no match to another night, so it costs no delay: on 7 seeds of the example league 345 -> 333 breaks (-3.5%, 6 swaps in 154 moves). It helps little because almost every team already sits at +1 or -1 home games, so a swap needs a partner on the opposite side; doing it match by match while placing made the total worse (382 against 347), so it runs as a final pass that can only lower it. Combined with `balance` it added nothing (the balanced placement had already taken the swappable gains). Swapping pairs of moved matches in one division together (so a team two games off even is offset by a partner) was tried and dropped: on 40 seeds the single flips give 1996 -> 1934 breaks (-3.1%, 31 swaps) and adding the pair pass gave exactly the same 1934, because after single flips the remaining breaks sit on teams already at +1 or -1 where no offsetting pair exists. Moving a make-up to another night is in too (`{ relocate: true }`, off by default; four checkboxes under the rainouts box on `multi-division-league-schedule.html` for balance, flip, relocate and swapNights since 2026-10-23, riding in the share link, and the same keys in the CLI's spec JSON via `rainoutOptions`): after the moves it tries each make-up on every earlier night already on the calendar (both teams free, an open court, no new linked-team clash; never a date you fixed with `->`) and keeps a move only if total breaks fall, so it adds no delay. Measured on 7 seeds of the example league: on its own it moved nothing (345 -> 345), because the default already takes the earliest night with room; combined with `balance` (which places make-ups later) it moved 2 of 126 matches and took 300 -> 296 breaks (-1.3%) with the season ending the same day. A small gain, kept because it is free of delay. Test in `divisions.test.mjs`. Trading two make-ups' nights is in too (`{ swapNights: true }`, API only, off by default): two moved matches swap nights and slots when each team is free on the other's night, neither lands before its own rainout and no linked team clashes, kept only when total breaks fall. Measured on the same 7 seeds: with `balance` 300 -> 280 breaks (-6.7%, 18 matches moved; relocate alone gave 296, and both together 280, so it takes over relocate's gain), season end unchanged; without `balance` 345 -> 334 (-3.2%). It beats single relocation because a make-up that cannot move alone (no free court) can trade with one that can. Test in `divisions.test.mjs`. `node eval/browser-click.mjs` (Playwright and Chromium; skips if absent) loads the example on the page, adds rainouts, ticks each of the four boxes and builds, then opens the share link in a fresh page: 28 checks pass (2026-10-23), including that every tick survives the link and both pages show the same schedule. It checks that the boxes work end to end, not how many breaks they remove (the numbers above).
- Multi-division share link: on `multi-division-league-schedule.html`, "Copy share link" puts the whole form (divisions, courts, times, dates, closures, travel, links, rainouts, seed) in the URL fragment (`#d=...`, never sent to a server); opening it rebuilds the same schedule (73 matches-rows for the example, checked in headless Chromium; `encodeDivisionFields` / `decodeDivisionFields` in `divisions.mjs`, round-trip test in `divisions.test.mjs`).
- Court closures (`Field 2: 2026-11-03, 2026-11-10 to 2026-11-17`): a court or field that is booked by someone else or closed on a date is never given a match that night. If too few courts are open, the overflow matches move to makeup rounds; a night with every court closed is left unused and named. Rainouts and late-team makeups skip closed courts, the validator flags any match on one, and the dates ride in the share link (`parseCourtClosures`, `courtClosedOn`, `courtClosures` in `calc.mjs`).
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
- Rest gaps (multi-division, 2026-11-03): `restGaps` in `divisions.mjs` counts games on consecutive days per team and the shortest and longest gap in days; the schedule text ends with a "Rest:" line. Unit-tested on a hand-made schedule and the made-up example league only; no real league checked.
- Season highlights: a line under the results grid names the biggest win, the highest-scoring game, the best attack and the best defence (walkovers excluded from the match records) (`seasonRecords` in `calc.mjs`).
- Results grid: under the standings, a team-by-team grid of every score so far (row team's goals first), in table order, so an organiser sees at a glance who has not yet met (`crossTable` in `calc.mjs`).
- Result check: a warning when a pair has more typed results than meetings in the schedule (a duplicated line that would count twice in the table) or a result for a pair that never meets (`resultsCheck` in `calc.mjs`).
- Results to chase: once results are typed, a warning lists matches dated before today that have no result yet (a pair's results are matched to its meetings earliest first), so a missing score is named rather than silently counted as unplayed (`overdueResults` in `calc.mjs`).
- Calendar CSV: "Download Google Calendar / Outlook CSV" writes the columns those calendars import (Subject, Start Date, Start Time, End Date, End Time, All Day Event, Description, Location, Private; MM/DD/YYYY, 12-hour times, an overnight end rolls to the next date), for a calendar or a phone that will not take .ics (`scheduleCalendarCsv` in `calc.mjs`; layout from the calendars' documented import format, not tried against a live account).
- Season grid: "Download season grid CSV" writes one row per team and one column per date, each cell `v Opponent` (home), `@ Opponent` (away) or `BYE`, so a coach or the clubhouse wall sees a whole season on one sheet (`seasonGrid`, `seasonGridCsv` in `calc.mjs`).
- Multi-division season grid (2026-10-30): "Download season grid CSV" on the multi-division page and `node divisions.mjs spec.json --grid` write one row per team (division first) and one column per playing night, each cell `v Opponent 18:00 Court` (home) or `@ Opponent ...` (away), blank on nights off, so a club sees every division on one sheet (`divisionsSeasonGrid`, `divisionsSeasonGridCsv` in `divisions.mjs`; one test on the example league: each match appears once per side). Tested by that test and a CLI run; the page button is not clicked in a browser.
- Team unavailable dates, multi-division (2026-10-30): a new page box (and `"blackouts"` in the CLI spec, also in share links) takes `U10/Hawks: 2026-11-05, 2026-12-22 to 2026-12-30`, one team per line. Every match that lands on such a night moves to the earliest later night both teams are free and a court is open, through the rainout mover, which now never places any moved match on an unavailable date (`parseDivisionBlackouts`, `applyDivisionBlackouts` in `divisions.mjs`). Tested on the example league (no match left on a blackout, count unchanged, schedule validates, bad lines named) and clicked in Chromium (`eval/browser-click.mjs`). A team blocked on every night the mover can look at (120 play nights ahead) is refused and reported, the match stays where it was, no match is lost and the schedule validates (tested 2026-11-04, `divisions.test.mjs`); the single-division page already had blackouts.
- Facility booking button, clicked in Chromium (2026-11-04): `eval/browser-click.mjs` now clicks "Download facility booking request (text)" on the multi-division page and checks the file name, its header line and that it lists venues (27 lines on the example league), 2 more checks, all pass.
- Standings CSV: once results are typed, "Download standings CSV" saves the ranked table (`standingsCsv` in `calc.mjs`).
- Rest report: the fairness note shows the shortest and longest days between each team's games and counts games that follow within a day (`restReport` in `calc.mjs`).
- Home/away runs: the fairness note flags any team stuck with three or more home or away games in a row and names it (`homeAwayReport` in `calc.mjs`).
- Bye report: in an odd league the fairness note names teams that sit out the first or last round, or have byes in two rounds running (the end of one leg and the start of the next in a double round robin) (`byeReport` in `calc.mjs`).
- Rematch spacing: for a double round-robin the fairness note shows the shortest and longest days between a pair's two meetings and names the pairs that replay soonest (`rematchReport` in `calc.mjs`).
- Shared grounds (`Net Ninjas, Dink Dynasty`): teams that share one pitch or court are moved so they are not both at home the same night where that can be avoided. Only venues flip (a double round robin flips both meetings), the validator must still pass, and clashes that cannot be avoided are listed (`parseGrounds`, `groundClashes`, `applyGroundSharing`).
- One-day tournament: "Build timetable" turns the team list into a clock-timed round robin for a single day (courts, first start, game length, changeover, optional double). Each round finishes before the next starts, so no team plays twice at once, and the slot count matches the "how long does a round robin take" table (`oneDayTimetable`, `oneDayText` in `calc.mjs`; tests check every pair meets once for 3 to 16 teams on 1 to 4 courts).
- Shared coach or players (`Hawks U12, Hawks U14`): teams that cannot be in two places are moved to different time slots on the same night where two or more time slots exist. Only the time changes, on the same court, and a move is kept only if the validator still passes, so dates, opponents, venues and team time limits are untouched; clashes that cannot be avoided (one time slot, more linked teams than slots) are named. Two linked teams who play each other are not a clash (`linkedClashes`, `separateLinkedTeams` in `calc.mjs`).
- One-day rest (`Minimum rest between a team's games`): ask for 1 to 6 time slots of rest and the one-day timetable stops round order, fills each slot with teams that have sat out long enough, and leaves a slot empty as a break when nobody has; the page reports the shortest rest achieved (`minRest`, `restSlots` in `oneDayTimetable`; tests check every pair meets once and the rest is met for 6 to 16 teams).
- Print: "Print or save as PDF" prints only the schedule, standings and bracket (a print stylesheet hides the form and buttons), for the clubhouse wall.
- `usage.mjs` - local-only feature counters with an opt-out.
- `round-robin-schedule-by-number-of-teams.html` - rounds, games, byes and home/away breaks for 3 to 16 teams; the test suite recomputes the table from `roundRobin`.
- `tournament-bracket-by-number-of-teams.html` - bracket size, first-round byes, rounds and games for 3 to 32 teams, single and double elimination; the test suite recomputes every row from `playoffBracket` and `doubleEliminationBracket`.
- `round-robin-schedule-template.html` - the full round-by-round fixture list (home first, byes marked) for 4, 5, 6, 7, 8, 9, 10, 11, 12, 14 and 16 teams; the test suite recomputes every row from `roundRobin`.
- `how-to-run-a-swiss-tournament.html` - guide to Swiss pairings with a worked 6-player example that the test suite recomputes from `swissPairings`.
- `how-to-run-an-americano-tournament.html` - guide to Americano rotations with a worked 8-player, 2-court example that the test suite recomputes from `americano`.
- `how-to-run-a-mexicano-tournament.html` - guide to Mexicano draws (1 & 4 against 2 & 3 from the table) with a worked 8-player, 2-court example that the test suite recomputes from `mexicanoNextRound`.
- `rec-basketball-league-schedule.html` - guide to a 10-team, 2-court, 3-tip-off-time Wednesday league with a worked table that the test suite recomputes from `buildSchedule`.
- `volleyball-league-schedule.html` - guide to a 6-team, 2-gym Thursday league where Gym 2 is closed two nights, with a worked table (overflow games moved to makeup nights) that the test suite recomputes from `buildSchedule`.
- `cornhole-league-schedule.html` - guide to an 8-team, 2-lane, 2-start-time Wednesday league with a skipped holiday week; the table is recomputed by the test suite from `buildSchedule()`.
- `darts-league-schedule.html` - guide to a 6-pub, home-and-away double round robin over 10 Thursdays (5 home, 5 away each), table recomputed by the test suite.
- `chess-club-round-robin-schedule.html` - guide to a 7-player club round robin on 3 boards with one bye each, table recomputed by the test suite.
- `how-to-run-a-double-elimination-tournament.html` - guide to winners/losers brackets, byes and the grand final reset with a worked 6-team example that the test suite recomputes from `doubleEliminationBracket`.
- `how-to-run-a-single-elimination-bracket.html` - guide to seeding, byes and game counts with a worked 6-team example that the test suite recomputes from `playoffBracket`.
- `how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html` - guide to byes with 5, 7 or 9 teams and a worked 5-team example that the test suite recomputes from `roundRobin`.
- `how-to-balance-home-and-away-games-in-a-round-robin.html` - guide to home/away breaks, the n − 2 minimum for an even league and why a mirrored double round robin has 3 × (n − 2), with a worked 6-team example that the test suite recomputes from `roundRobin` and `countBreaks`.
- `how-to-schedule-a-league-with-limited-courts-and-time-slots.html` - guide to courts and time slots (slots per round, fair early and late slots) with a worked 6-team, 2-court example that the test suite recomputes from `buildSchedule`.
- `how-to-make-a-fantasy-football-schedule.html` - guide to a 12-team, 14-week fantasy season (a full round robin plus repeat weeks, via double round robin with Rounds to play 14); the test suite rebuilds the example from `buildSchedule`.
- `how-to-break-ties-in-league-standings.html` - guide to head-to-head versus goal difference with a worked 4-team example that the test suite recomputes from `standings`.
- `how-to-reschedule-a-rained-out-league-game.html` - guide to moving a rainout to the earliest night both teams are free, with a worked 4-team example that the test suite recomputes from `applyRainouts`.
- `how-long-does-a-round-robin-tournament-take.html` - match slots a one-day round robin needs for 4 to 16 teams on 1 to 4 courts, turned into hours; the test suite recomputes every cell from `roundRobin`.
- `adult-softball-league-schedule.html` - guide to a 6-team, 2-diamond adult softball season with a blackout night and its makeup game; the test suite recomputes the table from `buildSchedule`.
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

**Score sheets.** "Download printable score sheets" writes one self-contained `.html` file with a page per round: every match with time, court, blank score boxes, a forfeit tick, the official and a signature and notes line, so the person at the table writes results down and the organiser types them in later as `Hawks 3 - 2 Owls` (`scoreSheetsHtml` in `calc.mjs`).

**Random-league check (2026-10-27).** `node eval/fuzz-build.mjs [count] [seed]` feeds random leagues (2 to 20 teams, single or double, 1 to 3 time slots, random weekdays, skip dates, team blackouts, court closures, team time and court limits) through `readSpec`, `buildSchedule` and `validateSchedule`. Seeds 1, 2, 3 and 7: 3,200 leagues built, 0 rejected, 0 invalid. No fault found; this pins behaviour (`fuzz-build.test.mjs`, 150 leagues). It covers the main builder only; the editing passes are the next paragraph.

**Export check (2026-10-29).** `node eval/fuzz-exports.mjs [count] [seed]` runs random leagues through `scheduleIcs` (the whole league and each team) and checks RFC 5545 structure: CRLF endings, no line over 75 octets, balanced VEVENTs, unique UIDs, DTSTAMP, DTSTART and SUMMARY present, DTEND after DTSTART; it also checks that the schedule CSV has one row per match plus one per bye and the season grid one row per team. Seeds 3, 8 and 21: 600 leagues, 0 faults. No fault found; this pins behaviour (`fuzz-build.test.mjs`, 60 leagues).

**Validator mutation check (2026-10-29).** `node eval/mutate-validator.mjs [count] [seed]` takes valid random leagues and seeds one fault at a time into the finished schedule (a dropped or duplicated match, a swapped venue, a team playing twice in a round, a match against itself, a team index out of range, a double-booked court and time, an unknown court or time, a wrong weekday, two rounds on one date, rounds out of order, an undated round, a blackout, skip date or court closure landing on a played date, one team made home in every game), then asks `validateSchedule` whether it notices. Seeds 3 to 5, 200 to 300 leagues each: about 15,000 mutants, 0 missed. Some single-swap venue flips in a single round robin are accepted on purpose (one swap stays inside the +-1 home/away tolerance, so the mutant is equivalent, 22 to 32 per run) and are counted apart. Pinned by `fuzz-build.test.mjs` (60 leagues).

**Multi-division validator mutation check (2026-10-30).** `node eval/mutate-divisions.mjs [count] [seed]` does the same for `validateDivisions`: nine seeded faults (a double-booked court and time, an unknown court, a team playing twice in a night, a night listed twice, a dropped or duplicated match, rounds out of order, one team made home in every game, a closed court used) on random 1 to 3 division leagues. Seeds 3, 4, 5 and 7, 200 to 300 leagues each: 7,876 mutants, 0 missed. No fault found; this pins behaviour (`fuzz-build.test.mjs`, 60 leagues). Not seeded: a wrong venue or travel figure, a broken link between divisions (only the conflict-count recount covers links).

**Editing-pass check (2026-10-27).** `node eval/fuzz-passes.mjs [count] [seed]` builds random leagues, then applies random rainouts (whole nights, one team, some with a named make-up date), late teams and officials, and re-checks: `validateSchedule` clean, no match lost or invented, every vanished placement a reported move, a late team never before its first night, `validateOfficials` clean, every match assigned or listed as unfilled. Seeds 5 to 8, 400 leagues each: 1,600 leagues, about 4,000 rainout lines, 3,000 late-team lines, 0 invalid after one fix. Fault found: a named make-up date on a skip date (`2026-10-31 -> `) was honoured by `applyRainouts` but `validateSchedule` called the result invalid (seeds 5 on 300 leagues: 5 failures); the named date is an explicit override like the weekday one, so the validator now exempts chosen-day rounds from the skip-date check (test in `calc.test.mjs`). Pinned by `fuzz-build.test.mjs` (120 leagues). Not covered: divisions, ground sharing, linked teams, withdrawals.

**Multi-division report and edit check (2026-11-05).** `node eval/fuzz-division-reports.mjs [count] [seed]` covers the multi-division functions the other scripts skip: `applyDivisionBlackouts`, `applyDivisionWithdrawals`, `divisionsIcs`, `divisionsDeadline`, `divisionsBookings`, `divisionsFacilityCost`, `divisionsPlayoffs` and `divisionsScoreSheetsHtml`. Checks: blackout moves lose no match and leave `validateDivisions` clean; a withdrawal's reported removals equal the matches that vanished; the calendar has one VEVENT per match, unique UIDs, CRLF endings and no line over 75 octets; the deadline's late-match count and `fits` equal a recount; bookings add up to every match; the cost total equals the venue costs plus extras and the per-team fees add back to it under both splits; nothing throws. Seeds 3 to 7 (60 to 150 forms each): about 470 leagues, about 3,800 blackout moves, 0 faults, no fault found; this pins behaviour (`fuzz-build.test.mjs`, 40 forms). Synthetic leagues only.

**Fixed-date pin check (2026-10-30).** `node eval/fuzz-pinned.mjs [count] [seed]` builds random leagues, then pins 1 to 4 random pairs to a chosen night (half onto an existing league night, half onto any date from 3 days before the season to 7 after) through `applyPinnedMatches`, and checks: `validateSchedule` clean, no match lost or invented, every reported pin sits on its date at its reported court and time, and a refused line leaves the rounds unchanged. Seeds 5 to 8, 300 leagues each: 1,200 leagues, about 3,000 pin lines (935 pinned, 1,917 refused with a reason), 0 faults. No fault found; this pins behaviour (`fuzz-build.test.mjs`, 60 leagues). Synthetic leagues only.\n\n**Division check (2026-10-27).** `node eval/fuzz-divisions.mjs [count] [seed]` builds random multi-division leagues (1 to 4 divisions of 2 to 9 teams, some double, 1 to 5 courts at 1 to 3 venues, 1 to 3 time slots, random weekdays and a skip date, 0 to 3 link groups, venue fairness and split rounds on or off) through `readDivisionsSpec`, `buildDivisions` and `validateDivisions`, then applies 1 to 3 random rainout lines with random make-up options (`balance`, `flip`, `relocate`, `swapNights`) and re-validates. Seeds 1 to 8, 150 forms each: 996 leagues built (about 46,000 matches; 204 forms rejected for too few court slots, the builder's own message), about 2,000 rainout lines, 0 invalid, 0 thrown. No fault found; pinned by `fuzz-build.test.mjs` (60 forms). Still not covered here: `suggestFairnessWeight`.

**Withdrawal, ground, link, travel and carry-over check (2026-10-27).** `node eval/fuzz-more.mjs [count] [seed]` builds random single-division leagues and applies 1 to 2 withdrawals (some from a date), 1 to 2 shared-ground groups (`applyGroundSharing`) and 1 to 2 linked-team groups (`separateLinkedTeams`), re-checking: `validateSchedule` clean, the removed-match count equals what each withdrawal reports, a withdrawn team never plays on or after its date, ground sharing changes only home/away (same pairs, same dates, courts and times) and never adds clashes, linking never adds clashes or changes pairs. It then builds random 1 to 3 division leagues at 2 to 3 venues with a random travel table and a random `fairnessWeight`, runs three seasons carrying `carryVenueHistory`, and checks `validateDivisions`, that each team's carried venue counts equal the matches it has played in all seasons so far, and that travel minutes and venue imbalance are finite and non-negative. Seeds 1 to 6, 150 leagues each (plus seed 9 on 60): about 900 single-division leagues (1,650 withdrawals, 15,000 matches removed, 1,200 ground groups, 1,200 link groups) and 750 multi-division leagues over 2,250 seasons; 0 invalid, 0 thrown, no fault found. Pinned by `fuzz-build.test.mjs` (25 leagues). Synthetic leagues only; a real league's travel times are still the open item.

**Officials against moved matches (2026-11-02).** `node eval/fuzz-officials-moves.mjs [count] [seed]` builds random 1 to 3 division leagues, assigns officials, then runs a rainout night. Officials assigned before the move go stale: 66 of 150 leagues (581 moves, seed 5) end with an official on two matches at one time. In the order the page and CLI use (move first, assign after) 0 of 150 are invalid. So officials must be assigned after any rainout or unavailable-date move, never before; a caller using the library directly must do the same. Synthetic leagues only.

**Fairness-weight search check (2026-10-27).** `node eval/fuzz-weight.mjs [count] [seed]` runs `suggestFairnessWeight` (2 seeds, 3 seasons, the whole 8-weight grid) on random 1 to 2 division leagues of 3 to 6 teams at 2 to 3 venues, 60% with a travel table. Checks: no throw, the pick is on the grid, every row finite and non-negative, a non-zero pick within the 5% travel slack unless `overSlack` is set, an `overSlack` pick at most half of weight 0's imbalance, `extraTravel` equal to the picked row, and the same answer twice. Seed 5, 60 leagues (about 2 min): 51 searched, 9 rejected (too few court slots), picks of weight 0 in 1, a fair weight in 46, an over-slack fallback in 4; 0 invalid, no fault found. Synthetic leagues only.

**Play-off race check (2026-10-28).** `node eval/fuzz-race.mjs [count] [seed]` builds random part-played leagues (3 to 7 teams, single or double, 0 to 8 fixtures left, 3-1-0 or 2-1-0 points, 0 to 1 point adjustment, 1 to n spots) and checks `playoffRace` against an independent brute force over every outcome (best and worst rank, status), that the safe-bounds route (`exactLimit` below zero) never calls a team clinched or eliminated that the exact route does not, that `magic` is only set for alive teams and within the points left, that `playoffOdds` gives clinched teams 1, eliminated teams 0, sums to the number of spots and repeats under one seed, and that `standings` ranks 1..n in points order with points matching a recount. Seeds 1 to 3, 300 leagues each: 900 leagues, about 4,400 team rows (1,450 clinched, 690 eliminated, 2,290 alive), 0 invalid, no fault found. Pinned by `fuzz-build.test.mjs` (80 leagues). Not covered: head-to-head and goal-difference tie-breaks inside the race (it counts a points tie against the team by design), and real league tables.

**Standings check (2026-11-02).** `node eval/fuzz-standings.mjs [count] [seed]` builds random results (2 to 8 teams, 0 to 30 games, 3-1-0 or 2-1-0, 0 or 1 point adjustment) and checks `standings`, with and without `headToHead`, against an independent recount: won+drawn+lost = played, goals for = goals against, points = scoring + adjustment, ranks 1..n over a permutation of the teams, sorted by points, the same table when the results are typed in another order, no move when every team gets the same extra adjustment, and head to head never changing the points sequence. Seeds 1 and 2, 3,000 leagues each (about 59% with a points tie): 0 failures, no fault found. Recursive head-to-head landed 2026-11-02 (below). Not covered: a real league's table.

**Race against real tie-breaks (2026-11-02).** The fuzz in `eval/fuzz-race.mjs` now plays 25 random score lines into each league's remaining fixtures and ranks the final table with `standings`, with and without recursive head-to-head. Every team's real rank must sit inside the race's `[bestRank, worstRank]`, a "clinched" team must finish in a place and an "eliminated" one must not. Seeds 1 to 3, 300 leagues each: 45,000 final tables, 0 failures, so the by-design points-tie-counts-against-you rule holds under goal difference and head-to-head. Made-up results only.

**Recursive head-to-head (2026-11-02).** With `headToHead`, a subset still level after the first mini-table is split again by the matches among only those teams (the UEFA and FIFA method), before overall goal difference. Found by comparing the old one-pass table with the new one over 200,000 random 6-team leagues: 321 ranked differently; the smallest is pinned in `calc.test.mjs`. `eval/fuzz-standings.mjs` (1,000 leagues, seed 1) still 0 failures. Made-up results only.

**Tie-break flag in the play-off race (2026-10-30).** `playoffRace` rows carry `clinchedUnlessTied`: an alive team that is in a place in every outcome except those where it finishes level on points at the cut, so only goal difference or head to head can cost it. `raceText` says so. Checked against a brute force over every outcome on 120 random part-played leagues (3 to 6 teams, up to 7 fixtures left) in `calc.test.mjs`; 295 tests in the venture pass. Still not modelled: the tie-break itself.

**Pool play.** For a tournament, "Build pool play" splits the teams (listed best seed first) into 2 or more pools by snake draft, builds a validated round robin for each pool on your dates, courts, blackouts and time slots, and, when you type results, ranks each pool and seeds the play-off winners first, then runners-up (`splitPools`, `buildPoolPlay`, `poolAdvancers` in `calc.mjs`). Each pool uses its own courts, so pools never compete for a court. Lines in the shared-grounds box double as clubs: teams on one line are kept in different pools where possible by swapping teams within the same snake row, so pool sizes and the seed spread are unchanged (`splitPools(teams, k, clubs)`, `clubPairsInPools`).

**Play-off chance.** Next to the race table, a Chance column estimates each live team's odds of a top-N finish by playing the remaining fixtures out 4,000 times: strength is each team's smoothed result share so far, win chances come from the log5 rule, the draw rate is the league's own, ties at the cut are a coin flip, and it is seeded so the same table gives the same figures. The page shows 100% and 0% for teams the race table calls clinched or out, and holds live teams to 1-99%. An estimate, not a forecast of skill (`playoffOdds` in `calc.mjs`; tests check a finished table, that chances add up to the number of spots, and agreement with the race table).

**Play-off race.** With results typed and a play-off size set, the page lists who has clinched a place, who is out, and how many more points clinch it for everyone still alive. With 12 or fewer games left it works through every win/draw/loss outcome (`playoffRace` in `calc.mjs`, cross-checked against brute force in the tests); with more it uses safe bounds that never call a team clinched or out wrongly. Ranked on points only, with ties on points counted against the team, so goal difference can only help a team shown as alive.

**Swiss system.** Standings rank by score, then Buchholz, then Sonneborn-Berger (`sonnebornBerger` in `swissStandings`). For chess clubs, darts, board games and esports, "Pair next round" takes the players (best seed first) and the finished games (`Ana 1 - 0 Ben`, equal numbers are a draw, `Cy bye`) and pairs the next round Dutch style: same-score players meet top half against bottom half, nobody meets twice, the bye goes to the lowest-ranked player without one, and colours alternate. The table ranks by score then Buchholz, and a line `Dee out` withdraws a player (their games stay in the table, they are not paired again and the bye is re-chosen among those left), the page suggests ceil(log2 n) rounds (`swissPairings`, `swissStandings`, `validateSwiss` in `calc.mjs`; checked for no rematches and one bye each from 4 to 16 players). Not FIDE-certified pairing: it does not implement every FIDE floater or colour rule, so use an arbiter-approved program for rated events.

**Calendar for multi-division leagues (2026-10-29).** `multi-division-league-schedule.html` gains "Download calendar (.ics)", and `divisionsIcs(schedule, { division, team, stamp, minutes })` in `divisions.mjs` writes one event per match for the whole league, one division or one team (summary, court and venue, division and round, official if assigned; floating local times, 60-minute games unless `minutes` is set). Test: every match appears once, per-division and per-team counts match, UIDs are unique, no line is over 75 bytes, and a 90-minute game ends where it should (`divisions.test.mjs`).

**Score sheets for multi-division leagues (2026-10-30).** `multi-division-league-schedule.html` gains "Download printable score sheets": `divisionsScoreSheetsHtml(schedule)` writes one self-contained `.html` with a page per playing night, matches grouped by venue and ordered by time and court, each with division and round, blank score boxes, a forfeit tick and an Official column when officials are assigned. Test: one page per night, one forfeit box per match, names and title escaped, no script (`divisions.test.mjs`). Printed layout not checked on paper.

**Calendar reminders (2026-10-30).** `scheduleIcs(schedule, team, stamp, official, alarmMinutes)` and `divisionsIcs(schedule, { alarmMinutes })` add a display reminder (`VALARM`, `TRIGGER:-PT<n>M`) that many minutes before each timed match; all-day matches get none, and a value outside 1 to 10080 minutes is ignored. The self-host server takes `/league/ics?t=..&team=N&alarm=60`. Tested for on, off, bad values and all-day (`calc.test.mjs`, `divisions.test.mjs`, `server.test.mjs`); how a given phone calendar shows the alarm is not tried on a live account.

**Referees and officials.** List your referees, umpires or scorekeepers (one per line, with an optional team in brackets, weekdays and `max N`) and every match gets one, shared out evenly. An official never works a match involving their own team, is never on two matches at the same time, keeps to their weekdays and cap, and any match nobody can take is listed with the reason. The CSV, text and league web page gain an Official column (`parseOfficials`, `assignOfficials`, `validateOfficials` in `calc.mjs`). "Download a message per official" writes one ready-to-paste note for each official with only their own matches, date, time, court and teams (`officialMessages`). "Download calendar (.ics), selected official" gives each official a calendar file with only their own matches (`scheduleIcs(schedule, null, stamp, official)`).

**Double-elimination play-offs.** Tick "Double elimination" next to the play-off size (three or more teams) and the bracket becomes winners and losers brackets, a grand final, and a reset game that is played only if the losers-bracket team wins the grand final. A team is out after two losses; byes in an uneven field are carried through the losers bracket so no match is left without an opponent. Tests play every field from 3 to 17 teams, including random results, and check one champion, every other team out on exactly two losses, and 2k-2 games (one more with a reset) (`doubleEliminationBracket` in `calc.mjs`).

**Americano (rotating partners).** For social padel, pickleball, badminton and tennis nights, "Build rotation" takes the players, the number of courts and rounds, and re-pairs everyone each round so people partner and oppose as many different players as possible. Sit-outs and games are shared within one of even, repeat partnerships are minimised by a seeded search and counted, and a validator re-checks the plan (`americano`, `validateAmericano`, `americanoStats`, `americanoText` in `calc.mjs`; tested for every size from 4 to 24 players). Not an official rating system: it does not score or rank the night.

**Mexicano (draw from the table).** For padel and pickleball nights where each round is drawn from the standings, "Draw next round" takes the players, the courts and every finished game (`Ana & Ben 21-17 Cy & Dee`), credits each player with their side's points, and pairs the leaders together: 1 & 4 against 2 & 3 in each group of four, or a split that avoids repeating a partner. The player who has played most sits out, and round one with no scores is a seeded random draw (`parseMexicanoScores`, `mexicanoStandings`, `mexicanoNextRound`, `mexicanoText` in `calc.mjs`; tested for 4 to 20 players on 1 to 3 courts, with games staying within one of even). A format helper, not a rating system.

**Forfeits.** In the results box, `Hawks w/o Owls` (or `wo`, `walkover`) awards Hawks the win at 3-0, counted in the table, goal difference, head-to-head and the play-off race like a played game. Leagues score forfeits differently, so apply your own rule by typing the score you want instead (`parseResults` in `calc.mjs`, `walkover` option).

**A message per team.** "Download a message per team" writes one ready-to-paste note for each team ("Hi Hawks, your fixtures: ...") with only that team's dates, venues, opponents and byes, so a coordinator can message each team instead of forwarding the whole league (`teamMessages` in `calc.mjs`).

**Third-place match.** Tick "Third-place match" next to the play-off size (single elimination, four or more teams) and the losing semi-finalists play `3P` on the final's day (`playoffBracket(seeds, { thirdPlace: true })`). The share link now also carries the double-elimination and third-place ticks; the double-elimination tick was being dropped on open.

## Even carry-over (2026-11-11)

Who you play right after whom. Team B *carries over* team A to team C when B plays A and then C in
its next game; if A is the strongest side, C keeps meeting opponents just out of a hard game.
Russell's carry-over value (1980) sums the squares of those counts: lower is fairer. The circle
method this tool has always used is close to the worst case (8 teams: 148, with five of one team's
seven opponents arriving straight from the same side; the least possible is 48).

- `carryover.mjs`: `carryOver(schedule)` and `carryOverFromOpponents(opponents, { cyclic })` give the
  matrix, value, worst count, repeated pairs and the floor any schedule with that many games could
  reach. `lowCarryOverRounds(n, { seed, effort, breakWeight })` searches for a low-carry-over round
  robin by seeded annealing from the circle method over round swaps, partial team swaps (needed: the
  circle method is a perfect 1-factorization when n - 1 is prime, so partial round swaps alone
  cannot leave it) and partial round swaps; `breakWeight` adds a second pass that trades carry-over
  for fewer home/away breaks. Home/away is then set by a greedy "phase" pass plus annealing with
  restarts, which finds the minimum n - 2 breaks on the circle timetable for 6 to 20 teams (tested).
- The page: tick "Spread who you meet next" (share link keeps it; `readSpec({ carryOver: true })`,
  `buildSchedule` uses `breakWeight: 10` and mirrors for a double round robin). Every schedule's
  report now shows its carry-over value, floor and worst count, and suggests the option when one
  pair repeats three times or more. About 1.4 s for 12 teams in Chromium; validator passes.
- Checked: hand-worked 4-team matrix; all 720 ordered 1-factorizations of 6 teams enumerated
  (least value 60 cyclic / 42 not, which the search reaches); 8 teams reaches Russell's bound 56
  (cyclic) and 48 (not); validity, seeding and at least half the circle value for 7 to 20 teams.
- Real fixture lists (`eval/carryover-real.mjs`, output in `eval/carryover-real.txt`; data
  `eval/data/openfootball-fixtures.json`, 20 top-flight seasons 2021-22 to 2024-25 from
  openfootball, CC0). Mirrored double round robin, ordered by matchday:

  | Schedule | Teams | Carry-over | Breaks |
  |---|---|---|---|
  | Bundesliga (4 seasons) | 18 | 3,474 to 4,342 | 48 |
  | Ligue 1 2023-24, 2024-25 | 18 | 1,840, 1,948 | 74, 96 |
  | circle method | 18 | 14,610 | 48 |
  | this tool, breakWeight 10 | 18 | 1,926 | 74 |
  | this tool, carry-over only | 18 | 1,730 | 104 |
  | EPL, La Liga, Serie A, Ligue 1 (14 seasons) | 20 | 2,278 to 2,564 | 70 to 146 |
  | circle method | 20 | 21,044 | 54 |
  | this tool, breakWeight 10 | 20 | 2,136 | 114 |
  | this tool, carry-over only | 20 | 1,884 | 134 |

  The professional schedules already avoid the circle pattern; the tool lands among them on both
  counts, without their derby, policing and broadcast constraints. Not yet: a real rec league's
  strength data (does carry-over move results at that level?), and the
  search's gap to the floor (12 teams: 156 non-cyclic against a floor of 120; whether that is the
  optimum is unknown).

## A double round robin searched as a whole (2026-11-11)

Mirroring the first half of a home-and-away season repeats every carry-over step, so every count
doubles. `lowCarryOverDoubleRounds(n, { seed, effort, breakWeight })` in `carryover.mjs` searches the
second half as a round robin of its own, and `buildSchedule` uses it whenever "Spread who you meet
next" and a double round robin are both ticked.

- Leg one is the single search's result (rounds and home/away). Leg two starts as leg one played
  backwards with leg one's last round moved to the end: backwards turns every step i -> j into
  j -> i, so counts spread instead of doubling, and each team's home/away pattern is leg one's
  reversed and flipped. With `breakWeight` only leg two moves and its venues follow from leg one,
  so the breaks in the cost are exact; with 0 both legs move on carry-over alone.
- Kept: each pair meets once per leg (phased, as the date placement plays leg by leg), the return
  game at the other ground (every team n - 1 home, n - 1 away), no team meets the same side twice
  running across the halfway point and no team sits out twice running (penalty 1000 each, 0 in
  every test). `assignVenuesDouble` then improves home/away with one choice per pair.
- `carryOverFromOpponents` now counts the diagonal in its floor only when a schedule has a
  back-to-back repeat (`repeats`): a double round robin can, a single one cannot. None of the 20
  real seasons does, so their floors are unchanged.
- Measured (`eval/carryover-real.txt`, last columns, seed 1):

  | Teams | Mirrored, w=10 | Whole season, w=10 | Whole season, carry-over only | Floor |
  |---|---|---|---|---|
  | 18 | 1,926 / 74 breaks | 1,498 / 88 | 1,334 / 142 | 1,170 |
  | 20 | 2,136 / 114 | 1,678 / 124 | 1,596 / 184 | 1,460 |

  The 20-team result is below all 14 professional 20-team seasons (2,278 to 2,564) and inside
  their break range (70 to 146); the 18-team one is below the Bundesliga (3,474+) and Ligue 1
  (1,840, 1,948), with more breaks than the Bundesliga's minimum 48. 8 teams, carry-over only,
  reaches the 200 floor (test). About 2 to 2.5 s for 18 to 20 teams in Node.
- Open: breaks still rise 10 to 19% over mirroring; a search that moves leg one too under exact
  breaks, or a break-minimal leg-two order (the "French" and "English" schemes) as extra starts.
- Measured later the same day (`eval/double-frontier.mjs`, output `eval/double-frontier.txt`;
  break weights 10, 20, 40 and 80 at seeds 1 to 3, each run set against the professional seasons
  of its size):
  - **The seed matters more than the weight.** At 20 teams and w=10, seeds 1 to 3 give 1,678 / 124,
    1,820 / 112 and 1,784 / 108. Raising the weight does not reliably cut breaks: w=80 gives 116,
    108 and 88. The break side of the search is noisy, so one run is a sample, not the curve.
  - **18 teams, w=20 to 80 is a better default than 10.** Every one of those nine runs has 68 to 84
    breaks at 1,574 to 1,634, and six of them dominate both Ligue 1 18-team seasons (1,840 / 74
    and 1,948 / 96: fewer or equal breaks *and* lower carry-over). At w=10 the breaks are 84 to 88.
  - **20 teams:** the runs dominate 2 to 5 of the 14 professional seasons each (always EPL 2021-22,
    2023-24 and 2024-25; sometimes Serie A 2024-25 and La Liga 2023-24). None gets under 88 breaks.
  - **Moving leg one too adds almost nothing** (tried on a scratch copy, not landed: after the leg-two
    pass, one or two more passes over both legs under the exact break cost with re-chosen hosts):
    18 teams 1,498 / 88 went to 1,494 / 86 and then 1,492 / 84, 12 and 20 teams did not change,
    and it cost 1 to 2 s more. Next is best-of-k (seeds or weights, kept by carry-over plus weight
    times breaks), which the spread above says is worth more. It would cost k times the time, so
    it needs the Web Worker first (2.3 s on the main thread for 20 teams in Chromium today).

## Best of four searches, off the page thread (2026-11-11)

One carry-over search is a sample, not the curve (the seed spread above). `bestCarryOverRounds(n,
{ double, seed, tries, weights, pick, effort })` in `carryover.mjs` runs `tries` searches, each with
its own seed and a break weight cycling 10, 20, 40, 80, and keeps the one with the least carry-over
+ `pick` x breaks. Try 0 is exactly today's single search, so it never does worse on that score.
It also returns every try and the frontier (tries no other beats on both counts).

- **Page.** Ticking "Spread who you meet next" now runs four searches in a Web Worker
  (`carryover-worker.mjs`, with a main-thread fallback), shows "search i of 4 done" as each ends, and
  caches the result by teams, double, seed and trade, so a rebuild with the same settings is instant.
  A new choice says what to keep: a balance (`pick` 10, the default), the most even carry-over (0)
  or the fewest back-to-back home or away games (40); it is in share links (`carryOverPick`). The
  read-out lists all four tries as carry-over/breaks. Clicked in Chromium: 20-team double round robin
  in 11.9 s with the worst wait for a frame 17 ms (one search blocked the page for about 2.3 s before);
  8 teams in about 5 s.
- **CLI and tests.** `buildSchedule` takes `carryOverTries` (runs it in place) or `carryOverPlan`
  (rounds the worker found; ignored if its team count or double flag differ) and puts a summary in
  `schedule.carryOverSearch`. `best-of-k.test.mjs` (10 tests).
- **Measured** (`node eval/best-of-k.mjs`, output `eval/best-of-k.txt`; seeds 1 to 3, pick 10, each
  run set against the professional seasons of its size):

  | Teams | Setting | Carry-over | Breaks | Seasons dominated | Time (Node) |
  |---|---|---|---|---|---|
  | 18 | 1 search (before) | 1,522 | 86.7 | 1.0 of 6 | 2.1 s |
  | 18 | 4 x effort 0.25 (same work) | 1,528 | 84.7 | 1.0 | 3.3 s |
  | 18 | 4 x effort 1 (the page) | 1,573 | 73.3 | 1.7 | 9.1 s |
  | 18 | 8 x effort 0.5 | 1,562 | 73.3 | 1.7 | 9.5 s |
  | 20 | 1 search (before) | 1,761 | 114.7 | 3.0 of 14 | 2.7 s |
  | 20 | 4 x effort 0.25 | 1,757 | 121.3 | 1.7 | 4.3 s |
  | 20 | 4 x effort 1 | 1,761 | 114.7 | 3.0 | 11.6 s |
  | 20 | 8 x effort 0.5 | 1,784 | 114.0 | 2.7 | 15.1 s |

  Read plainly: **short searches do not substitute for one long one** (4 x 0.25 is no better at 18
  teams and worse at 20), so the page spends four times the work, which the worker makes affordable.
  At 18 teams that buys 13 fewer breaks (-15%) for 3% more carry-over. **At 20 teams and pick 10 it
  buys nothing:** try 0 wins every time, because the other weights trade 260 to 460 carry-over for
  14 to 20 breaks, which pick 10 prices as a loss.
- **The trade is the useful part at 20 teams** (`node eval/best-of-k.mjs --picks`, output
  `eval/best-of-k-picks.txt`; same four searches re-ranked): "fewest back-to-back" keeps 104 breaks
  on seeds 1 and 2 (against 124 and 112) at 1,940 and 2,028 carry-over, still below every one of the
  14 professional 20-team seasons' 2,278, and dominates 4 of them instead of 2 or 3. At 18 teams
  "balanced" and "fewest" agree on two seeds of three (70 to 72 breaks); "most even" is the old
  single search. Search figures, three seeds, made-up team names; no organiser has used it yet.
- Open: the frontier is thin (four points). Superseded the same day by eight tries on a worker
  pool (next section).

## Eight searches on a pool of workers (2026-11-11)

The four tries above ran one after another in one worker. They do not depend on each other, so the
page now runs **eight** on a pool of Web Workers, one per core (`navigator.hardwareConcurrency`, at
most eight).

- **Code** (`carryover.mjs`). `carryOverTry(n, i, { double, seed })` runs try i alone (its seed and
  break weight are the ones `bestCarryOverRounds` gives it); `splitCarryOverTries(k, workers)` deals
  the try numbers round robin (8 tries on 3 threads: 0,3,6 / 1,4,7 / 2,5); `combineCarryOverTries(results,
  pick)` sorts by try number, refuses a missing one and keeps the lowest score with ties to the lower
  number, exactly as the serial loop. `bestCarryOverRounds` is now that loop over `carryOverTry`.
  `carryover-worker.mjs` takes `{ n, double, seed, indices }` and posts each whole try back; the old
  whole-search message still works for cached pages.
- **Same season on any device.** The number of tries is fixed at eight, not taken from the core
  count, so a share link builds the same fixtures on a one-core phone and an eight-core laptop; the
  cores only change the wait. Tested (`best-of-k.test.mjs`): pools of 1, 3 and 8 workers reporting in
  reverse order return the serial result for single and double seasons at picks 0, 10 and 40, and a
  JSON round trip (the worker message) changes nothing.
- **Measured** (`node eval/best-of-k.mjs`, `eval/best-of-k.txt`, new row "8 x effort 1"; seeds 1 to
  3, pick 10; one thread):

  | Teams | Tries | Carry-over | Breaks | Score | Seasons dominated | One-thread time |
  |---|---|---|---|---|---|---|
  | 18 | 4 | 1,573 | 73.3 | 2,307 | 1.7 of 6 | 9.1 s |
  | 18 | 8 | 1,560 | 68.7 | 2,247 | 1.7 | 16.8 s |
  | 20 | 4 | 1,761 | 114.7 | 2,907 | 3.0 of 14 | 10.9 s |
  | 20 | 8 | 1,720 | 116.0 | 2,880 | 3.0 | 25.2 s |

  Eight tries lower the score at both sizes. At 18 teams both carry-over and breaks fall; at 20
  teams one seed of three changes (1,820/112 to 1,698/116), the other two keep try 0. Modest, and on
  one core it doubles the wait; on four cores each thread runs two tries.
- **In Chromium** (`node eval/browser-carryover-pool.mjs`, a four-core container, 20-team double
  round robin, the page told it has 1, 2, 4 and 8 cores; `eval/browser-carryover-pool.txt`): eight
  tries in 20.2 s on one thread, 10.0 s on two, 6.1 s on four (8 cores: 6.3 s, the container has four),
  against 11.9 s for the old four tries on one thread; worst wait for a frame 17 ms at every size; the
  same kept season (1,678/124 on seed 1) at every core count. Machines with fewer than two cores wait
  longer than before (20 s, not 12) for the extra four tries.

## Carry-over under a cap on breaks (2026-11-11)

Every search above prices a break and trades it for carry-over, and none got a 20-team season under
88 breaks. The reason is leg one: at 20 teams the single search's leg has 46 to 52 breaks against a
minimum of 18 (18 teams: 28 to 34 against 16), so the season can not get far below twice that. The
weights never reach the low-break end of the trade, where the Bundesliga sits (48 breaks, 3,474 to
4,342 carry-over).

- **Code** (`carryover.mjs`). `lowCarryOverCappedRounds(n, { seed, maxBreaks })` starts from the
  circle method with its minimum-break home/away (n - 2 for an even league) and anneals carry-over
  alone, refusing any move that takes the season over `maxBreaks` or a team's home and away games
  more than one apart. Each timetable move either keeps every team's ground in each round (only
  allowed if every match still has one team at home) or carries each match's ground with it (the
  pattern changes, so breaks and balance are rechecked), and a fourth move flips one match.
  `lowCarryOverDoubleRounds(n, { maxBreaks, legBreaks })` runs it for leg one and then moves leg two
  on carry-over alone under the season cap. Leg two starts from whichever of three orders is best
  inside the cap: leg one backwards (what the weighted search uses; nearly every team breaks at the
  halfway point and where leg one's last round rejoins, about 2n more), the mirror (fewest breaks,
  every carry-over count doubled) or the mirror with its first and last rounds swapped.
- **Page and CLI.** "Spread who you meet next" now runs ten tries: the eight weighted ones,
  unchanged, plus two capped ones (`cappedTryBreaks`: 3(n - 2) and 3(n - 2) + 12 over a
  home-and-away season, n - 2 and n + 2 a leg). A fourth choice, "the fewest back-to-back home or
  away games possible, then the most even carry-over" (`fewest`, pick 1000, in share links), keeps
  the capped minimum. The old "fewest" choice is now labelled "fewer" (same value, same links).
  Odd leagues: until 2026-11-11 later their two extra tries were weighted ones at 160 and 320; now
  they run the capped search too (next section). `buildSchedule` takes
  `carryOverCapped` beside `carryOverTries`. Tests: `capped-breaks.test.mjs` (9; the odd-league one
  rewritten 2026-11-11 later).
- **Measured** (`node eval/capped-breaks.mjs`, `eval/capped-breaks.txt`; seeds 1 to 3, recounted from
  the rounds):

  | Teams | Season cap | Carry-over | Breaks | Real seasons dominated |
  |---|---|---|---|---|
  | 18 | 48 (the minimum) | 2,154 to 2,674 | 48 | all 4 Bundesliga (3,474 to 4,342 at 48) |
  | 18 | 60 | 1,696 to 1,858 | 60 | 1 or 2 Ligue 1 (1,840 / 74, 1,948 / 96) |
  | 18 | 72 | 1,564 to 1,704 | 72 | both Ligue 1 |
  | 20 | 54 (the minimum) | 4,734 to 5,080 | 54 | none (circle method 21,044 at 54; none of the 14 has under 70) |
  | 20 | 90 | 2,870 to 3,180 | 82 to 88 | none |

  Read plainly: **at 18 teams the Bundesliga's minimum-break fixture list could have had 38 to 50%
  less carry-over at the same 48 breaks**, and the capped curve fills the gap between the minimum and
  the weighted tries. **At 20 teams the capped search is weak**: leg one stays near 1,100 to 1,400
  carry-over at 18 to 22 breaks, against about 500 for the unconstrained search, so above about 60
  breaks the weighted tries are better. A "squeeze" from the weighted result down to a cap was tried
  on a scratch copy and not landed: it never left the starting timetable (every move that cut breaks
  cost more carry-over than the price of a break).
- **What the page keeps** (same file, second table): the two capped tries change the "balanced" and
  "most even" picks in none of six runs and "fewer" in one (18 teams, seed 2: 1,550 / 72 to 1,786 /
  60). "Fewest" keeps the capped minimum every time: 18 teams 2,330 / 2,596 / 2,502 at 48 breaks
  (all four Bundesliga seasons dominated; the eight weighted tries' fewest was 58 to 72 breaks), 20
  teams 4,552 to 5,968 at 54 (weighted fewest 82 to 86). Ten tries take 16 to 17 s on one thread at
  18 teams and 23 s at 20 (eight took 16.8 and 25.2 s on the earlier, less loaded run); a 12-team
  season in Chromium ran all ten with no page errors and the same kept season on 1 and 4 cores.
- Open: a 20-team leg one at low breaks (a start other than the circle method, or a search over
  home/away patterns first), and odd leagues under a cap (done for odd
  leagues: next section).

## Odd leagues: zero-break home/away, and capped tries (2026-11-11, later)

An odd league gives every team one bye a leg, and a bye ends a run of home or away games, so an odd
round robin can have **no breaks at all**: the circle method with the right home/away does. The venue
search (`assignVenues`, which sets home/away on every carry-over timetable) never found it: it flipped
one match at a time from a greedy start, and left 3 breaks at 7 teams, 46 at 19 and 54 at 21. With a
start that far off, the capped search began an odd league at dozens of breaks and could not move,
which is why odd leagues' capped tries were weighted stand-ins.

- **Colouring start** (`carryover.mjs`, `byeStretches`, `colourStart`). Split each team's games at its
  bye into stretches; make one node per stretch and one edge per match. A two-colouring of that graph
  is a home/away with no breaks (a stretch of colour c is at home in round r when c XOR r is odd, so
  it alternates, and every match has one team of each colour). Breadth-first search finds it when it
  exists; on the circle method it does at every odd size tested (5 to 21), and it is balanced (each
  team (n - 1)/2 home games). Where the graph has an odd cycle, the clashing matches take a seeded coin.
- **Run moves.** Beside single-match flips, the annealing now flips a whole alternating stretch of
  one team (or the part before or after a round), which moves a team's phase in one step instead of
  through a wall of temporary breaks, and it keeps the best home/away it saw rather than where it
  ended. Restarts alternate the greedy start and the colouring start (odd leagues), and the result is
  never worse than the old search on the same seed (it runs as a fallback when the new one has any
  breaks; tested).
- **Measured** (`node eval/odd-capped.mjs`, `eval/odd-capped.txt`, first table; breaks + 50 per game of
  imbalance on fixed timetables, seed 1, old -> new):

  | Teams | Circle method | Low carry-over timetable | Same, break weight 10 |
  |---|---|---|---|
  | 7 | 3 -> 0 | 7 -> 4 | 2 -> 2 |
  | 11 | 10 -> 0 | 24 -> 16 | 17 -> 17 |
  | 15 | 19 -> 0 | 49 -> 43 | 49 -> 46 |
  | 19 | 46 -> 0 | 85 -> 84 | 81 -> 81 |
  | 21 | 54 -> 0 | 109 -> 109 | 107 -> 96 |
  | 18, 20 (even) | 16, 18 (the minimum, unchanged) | 46 -> 44, 62 -> 58 | 32 -> 30, 52 -> 48 |

  Every carry-over schedule on the page goes through this pass, so even leagues gain 2 to 4 breaks on
  some timetables too. The page's plain (circle-method) schedules never used it and are unchanged.
  Rerun on the real-fixture comparison (`eval/carryover-real.txt`, seed 1; the tables in the two
  sections above keep the figures measured then): 18 teams mirrored 1,926 / 74 -> 1,926 / 70 breaks,
  whole season 1,498 / 88 -> 1,486 / 84, carry-over only 104 -> 98 breaks a season; 20 teams mirrored
  2,136 / 114 -> 2,136 / 108, carry-over only 134 -> 126, and whole season 1,678 / 124 -> 1,750 / 118
  (leg two is searched against leg one's home/away, so a different leg one moves its carry-over too;
  still below all 14 professional 20-team seasons' 2,278). The carry-over guide page quotes the new
  figures (its test reads them from the code).
- **Capped tries for odd leagues.** `cappedTryBreaks` now gives an odd league a base of n - 3 breaks a
  leg (at 0 the capped search can not leave the circle method's high carry-over), and `carryOverTry`
  runs the capped search for odd leagues. At small sizes a heavy break weight sometimes lands on
  fewer breaks still (9 teams: 2 or 3 against 5 or 6), so an odd league's capped try also runs the old
  stand-in (160, then 320) and keeps whichever has fewer breaks, then less carry-over.
- **Measured, one leg** (same file, second table, seeds 1 to 3, carry-over/breaks):

  | Teams | Old stand-ins (160 and 320) | Capped, n - 3 | Capped, n + 1 |
  |---|---|---|---|
  | 9 | 93/2, 93/3, 105/11 | 115/6, 81/6, 81/5 | 75/9, 77/10, 79/10 |
  | 11 | 175 to 193 / 16 to 21 | 229 to 297 / 8 | 183 to 193 / 12 |
  | 15 | 307 to 315 / 35 to 40 | 303, 625, 319 / 12 | 289 to 309 / 16 |
  | 19 | 701 to 1,365 / 63 to 73 | 1,355 to 1,537 / 16 | 1,147 to 1,205 / 20 |
  | 21 | 659 to 703 / 86 to 103 | 763 to 835 / 18 | 703 to 743 / 22 |

  Read plainly: at 15 teams the capped tries match the old carry-over at a third of the breaks; at 21
  teams they cost 5 to 15% more carry-over for a fifth of the breaks; at 19 teams (twenty with the bye,
  the size where even leagues are weak too) they reach 16 to 20 breaks, which nothing reached before,
  at about 1.6 times the carry-over. The weighted tries still cover the low carry-over end, so the
  page's "balanced" and "most even" choices are as before and "fewer"/"fewest" now have a low-break
  try to keep.
- **Measured, home-and-away season** (same file, third table; caps 3(n - 3) and 3(n + 1)):

  | Teams | Old stand-ins (160 and 320) | Capped, 3(n - 3) | Capped, 3(n + 1) |
  |---|---|---|---|
  | 9 | 343 to 395 / 10 to 20 | 289 to 325 / 17 to 18 | 279 to 281 / 27 to 29 |
  | 11 | 537 to 679 / 39 to 46 | 713 to 1,117 / 23 to 24 | 525 to 543 / 35 to 36 |
  | 15 | 1,077 to 1,153 / 55 to 72 | 1,147, 1,951, 1,155 / 36 | 983 to 1,027 / 47 to 48 |
  | 19 | 2,213 to 3,957 / 137 to 157 | 4,355 to 4,769 / 47 to 49 | 3,779 to 4,187 / 60 |
  | 21 | 2,147 to 2,299 / 147 to 170 | 2,675 to 2,997 / 54 | 2,541 to 2,659 / 66 |

  At 11 and 15 teams the second capped try beats both stand-ins on both counts on most seeds
  (3 of 6 each, last column of the file); at 19 and 21 teams the capped tries cut a season's breaks
  by two thirds (150 or so to 47 to 66) for 20 to 90% more carry-over, a point on the trade the page
  had no try near before. At 9 teams the stand-in still wins on breaks for two seeds of three
  (10 against 18) and is what the try keeps (sixth column).
- **Tried, not landed: the 20-team leg one with the pattern fixed first.** Fix the minimum-break
  home/away pattern (18 breaks), then anneal the timetable freely with a rising penalty per match
  whose two teams the pattern puts at the same ground (plus moves that trade two teams' whole
  patterns, or two rounds with their pattern columns). Seeds 1 to 3 settled at 1,420, 1,408 and
  1,408 against the capped search's 1,424, 1,414 and 1,408 at the same 18 breaks: two different
  searches agree, which suggests 1,400 or so is close to what the minimum-break pattern allows, not a
  search failure. With a looser cap (22 to 30) and a move that shifts one team's ground between two
  rounds it was no better than the capped search (858 to 1,174 against 874 to 1,298) and often never
  got back to a feasible timetable. A simple relaxation (each carry-over step only needs its two
  opponents at the other ground) gives no bound above the generic floor (360), so the question stays
  open; a tighter bound would need the per-team order of opponents.

## Perfect carry-over at 4, 8, 16 and 32 teams: the field start (2026-11-11, later)

Every search above starts from the circle method and anneals. At 16 teams it stopped at 316 against a
floor of 224, at 32 teams at 1,538 against 960. Those sizes have an exact answer: when the league
(a bye team included) has a power-of-two size N, Russell (1980) showed a round robin exists with every
carry-over count 0 or 1.

- **Construction** (`carryover.mjs`, `fieldOpp`, `fieldGenerators`, `fieldApplies`). Label the teams with
  the elements of the finite field GF(N) (bit strings; addition is XOR) and let team x meet x + g^r in
  round r, where g generates the field's multiplicative group. Each round is a perfect matching (x + g^r
  + g^r = x), each pair {x, y} meets in the one round with g^r = x + y, and team t's two consecutive
  opponents differ by g^r (1 + g), which fixes r; so every ordered pair is one team's carry-over step
  exactly once. Removing one team as the bye keeps every count at 0 or 1 too (7, 15, 31 teams).
  Reduction polynomials for N = 4 to 128 are built in.
- **Which one.** Every generator and starting round gives the same, least carry-over; they differ in
  breaks. `lowCarryOverRounds` tries them all (16 teams: 8 generators x 15 starts) and keeps the one the
  greedy venue pass gives the fewest breaks, then `assignVenues` sets home/away. Because the
  carry-over pass already sits at the floor it stops at once. With a break weight the second pass still
  runs, but the result is now scored exactly against the untraded field timetable and the better one
  kept: the greedy stand-in had traded 16 teams' 224 / 24 breaks for 256 / 24.
- **A mirrored field leg is already perfect.** Mirroring a leg normally doubles every count, but the
  field leg's counts are all 1 over the n(n - 2) non-cyclic steps, and the halfway step (last opponent
  of leg one, then first of leg two) is exactly each team's missing cyclic step: every cell becomes 2
  except n that stay 1, which is
  the floor (16 teams: 912). So at power-of-two sizes the whole-season search can only match the mirror
  on carry-over; `carryover.test.mjs` asks for "strictly below mirrored" only when the mirror is above
  the floor.
- `field: false` restores the old circle start (for comparisons). Other sizes are unchanged.
- **Measured** (`node eval/field-start.mjs`, `eval/field-start.txt`; seed 1, effort 1; carry-over / breaks):

  | Teams | Season | Setting | Circle start | Field start | Floor |
  |---|---|---|---|---|---|
  | 15 | single | carry-over only | 259 / 43 | 195 / 41 | 195 |
  | 15 | single | break weight 10 | 323 / 46 | 195 / 41 | 195 |
  | 15 | home and away | carry-over only | 895 / 141 | 843 / 99 | 795 |
  | 15 | home and away | break weight 10 | 977 / 74 | 945 / 67 | 795 |
  | 16 | single | carry-over only | 316 / 32 | 224 / 24 | 224 |
  | 16 | single | break weight 10 | 350 / 22 | 224 / 24 | 224 |
  | 16 | home and away | carry-over only | 1,048 / 110 | 912 / 64 | 912 |
  | 16 | home and away | break weight 10 | 1,166 / 64 | 912 / 64 | 912 |
  | 31 | single | carry-over only | 1,459 / 232 | 899 / 245 | 899 |
  | 31 | home and away | break weight 10 | 4,823 / 475 | 4,321 / 443 | 3,627 |
  | 32 | single | carry-over only | 1,538 / 140 | 960 / 106 | 960 |

  Read plainly: at 16 teams the single round robin and the whole home-and-away season now reach the
  least carry-over there is (the season with 64 breaks, the same as the old weighted search's
  64 at 1,166), and at 15, 16 and 32 teams breaks fall too. At 8 teams the search already reached the
  floor; the season with a break weight goes 224 / 20 to 216 / 16. At 7 teams nothing changes except 2
  more breaks on the carry-over-only season (147 / 20 to 147 / 22). At 31 teams the carry-over-only
  single leg has 13 more breaks (232 to 245) for 38% less carry-over. Full table in the file.
- **What the page keeps** (16-team home-and-away season, the page's 8 weighted + 2 capped tries, seed
  1, "balanced"; scratch run, one thread, 19.5 s): 996 carry-over / 48 breaks, against 1,220 / 54 before.
  The tries' frontier went from 1,166/64, 1,220/54, 1,656/42 to 912/64, 976/52, 996/48, 1,656/42:
  every old point but the capped minimum is beaten on both counts.
- Tests: `field.test.mjs` (every generator and three starts at 4 to 32 teams are valid round robins
  with every count 0 or 1, cyclic and not, with and without a bye; the search reaches the floor at 15,
  16, 31 and 32; the break-weighted result never scores worse than the field timetable; the 16-team
  season reaches 912). The carry-over guide quotes the 16-team figures (its test reads them from code).
- Open: other sizes have no such construction in this code. Known constructions exist for some other
  sizes in the literature (not read here); 12 teams (156 against 120) and 20 teams remain search-only.

## Starter timetables for 6 to 40 teams, and 20 teams at the floor (2026-11-11)

The field start covers only power-of-two sizes. Most other even sizes (a bye team included) now get a
second start, a **starter** timetable, and the search keeps whichever start does better.

- **Construction** (`carryover.mjs`, `starterOpp`, `STARTERS`, `starterApplies`). Number the teams
  0 .. p - 1 with p = N - 1 (odd) plus a fixed team p. A starter pairs up 1 .. p - 1 so that the
  differences +-(y - x) of the pairs cover every nonzero residue mod p once. In round r, with
  s = step x (r + start) mod p, each pair {x, y} plays as {x + s, y + s} and s plays team p. Each pair
  meets once (the round whose shift carries the starter pair with that difference onto it), so every
  starter gives a valid round robin; `starterOpp` refuses a non-starter or a step sharing a factor
  with p. The circle method is the starter {i, -i} (tested), and one of the worst for carry-over.
- **The table** (`eval/starter-search.mjs`, `eval/starter-search.txt`): a seeded random sample of
  starters (backtracking with shuffled partners), every step coprime to p and every start, 20 s per
  size, scored on non-cyclic carry-over with all N teams ("even") and with team p as the bye ("odd").
  Built in for N = 6, 10, 12, 14, 18, 20, 22, 24, 26, 28, 30, 34, 36, 38, 40. At run time
  `bestStarterOpp` tries every start and keeps the least carry-over, then the fewest greedy breaks.
- **20 teams, and 19, reach the floor.** The sampled 20-team starter (step 9) has every carry-over count
  0 or 1, cyclic too (380 = 20 x 19, Russell's bound): non-cyclic 360 with all 20 playing, 323 with a
  bye. The search from the circle method had stopped at 448 and 381. I have not checked this against
  published constructions; the tests check the counts directly.
- **Both starts run, the better kept** (`start: "starter" | "circle"` on the result). Annealed, the
  starter start loses to the circle start at 11, 13 and 30 teams, so `lowCarryOverRounds` and
  `lowCarryOverDoubleRounds` run the full search from both and keep the lower score
  (carry-over + breakWeight x breaks; ties keep the circle start). So no size scores worse than
  before, and a search at these sizes takes about twice as long (20-team season, weight 10: 2.7 s to
  4.5 s in Node; 6-team searches are unchanged in result).
- **The plain mirror is now a candidate for the whole season.** When leg one has every count 0 or 1
  (field sizes, 20 teams), mirroring it is already at the season floor, and the second-leg search
  could only add breaks: 20 teams, weight 10, gave 1,478 / 122 against the mirror's 1,460 / 116.
  `lowCarryOverDoubleRounds` (not the capped one) now also scores the mirror and keeps it when it is
  strictly better (`mirrored: true`). That gives 16 teams 912 / 56 (was 912 / 64) too.
- **Measured** (`node eval/field-start.mjs <sizes>`, `eval/starter-start.txt`; seed 1, effort 1;
  carry-over / breaks, before -> now):

  | Teams | Single, carry-over only | Single, weight 10 | Season, carry-over only | Season, weight 10 | Floors |
  |---|---|---|---|---|---|
  | 10 | 98/12 -> 94/14 | same | 358/38 -> 330/38 (floor) | same | 80, 330 |
  | 12 | 156/18 -> 152/18 | 182/16 -> 152/18 | same | 640/42 -> 598/46 | 120, 492 |
  | 14 | 216/26 -> 212/32 | 260/22 -> 252/18 | 746/86 -> 732/84 | 862/56 -> 854/52 | 168, 686 |
  | 18 | 412/44 -> 318/52 | 458/30 -> 456/30 | 1,334/142 -> 1,214/148 | 1,486/84 -> 1,556/76 | 288, 1,170 |
  | 19 | 381/84 -> 323/75 (floor) | 449/81 -> 323/75 | 1,389/231 -> 1,311/159 (floor) | 1,597/172 -> 1,525/119 | 323, 1,311 |
  | 20 | 448/58 -> 360/52 (floor) | 510/48 -> 360/52 | 1,596/182 -> 1,460/126 (floor) | 1,750/118 -> 1,460/116 | 360, 1,460 |
  | 22 | 654/66 -> 516/68 | 714/58 -> 516/68 | 2,086/218 -> 1,862/154 | 2,370/146 -> 1,920/150 | 440, 1,782 |
  | 24 | 796/78 -> 654/76 | 878/74 -> 654/76 | 2,538/270 -> 2,482/248 | 2,774/180 -> 2,488/172 | 528, 2,136 |
  | 26 | 954/98 -> 762/98 | 1,072/84 -> 762/98 | 3,040/322 -> 2,780/310 | 3,312/196 -> 3,098/208 | 624, 2,522 |

  11, 13 and 30 teams keep the circle start's carry-over-only results; with a break weight they still
  move (30 teams: 1,154/122 -> 1,110/126, season 4,076/278 -> 3,726/278). Full table in the file,
  odd sizes included.
- **Real fixtures** (`eval/carryover-real.mjs`, the guide's table): 20 teams, the tool's season is now
  1,460 / 116 (was 1,750 / 118), the least a 20-team home-and-away season can have, against 2,278 to
  2,564 for the 14 professional 20-team seasons; 18 teams 1,556 / 76 (was 1,486 / 84: lower score at
  weight 10, 2,316 against 2,326, but more carry-over).
- Tests: `starter.test.mjs` (every built-in starter at three starts is a round robin; circle method =
  starter {i, -i}; bad starters and steps refused; 20 and 19 teams at the floor; never worse than the
  circle start alone at 11, 12, 13, 18 and 22 teams, both weights, and on 12- and 20-team seasons);
  `carryover.test.mjs` reads the guide's new figures from the code.
- Open: the sample was thin past 30 teams; replaced from 22 teams up by the two climbs below.
  12 teams is still 152 against 120.

## Climbed starters: 22 teams at the floor, 24 to 40 teams 4 to 13% lower (2026-11-11, later)

The starter table above came from random sampling, which past 22 teams saw only a few hundred
starters per size. `eval/starter-anneal.mjs` climbs instead, and the table in `carryover.mjs`
(`STARTERS`) now holds its results wherever they are lower.

- **Two reductions.** The step is a relabelling: starter S with step k is, round for round, the
  timetable of starter k^-1 S with step 1 with every team t renamed k^-1 t, so the climb runs at step
  1 only (new entries have step 1). And the cyclic carry-over matrix does not depend on the start; a
  start only picks which round-to-round transition the season drops, so each starter is scored once
  and every start is an O(N) correction.
- **The move.** Remove 3 to 10 random pairs and re-pair the freed residues with the freed differences
  by randomised backtracking (a large-neighbourhood move that keeps it a starter), accepted by
  simulated annealing on the least non-cyclic carry-over over every start. Single climbs stall fast
  (most moves are big steps up), so it restarts every second from a fresh random starter, the first
  two from the table's entries, and keeps the best. 60 s per size and parity, one process per core.
- **Measured** (`eval/starter-anneal.txt`; non-cyclic carry-over at the best start, old table ->
  climbed, floor):

  | Teams | All N play | Floor | With a bye (N - 1 teams) | Floor |
  |---|---|---|---|---|
  | 22 | 516 -> **440** (every count 0 or 1) | 440 | 475 -> **399** (every count 0 or 1) | 399 |
  | 24 | 654 -> 612 | 528 | 609 -> 565 | 483 |
  | 26 | 762 -> 716 | 624 | 757 -> 667 | 575 |
  | 28 | 878 -> 828 | 728 | 875 -> 823 | 675 |
  | 30 | 1,110 -> 1,002 | 840 | 1,053 -> 943 | 783 |
  | 34 | 1,460 -> 1,274 | 1,088 | 1,455 -> 1,271 | 1,023 |
  | 36 | 1,620 -> 1,488 | 1,224 | 1,551 -> 1,483 | 1,155 |
  | 38 | 1,928 -> 1,718 | 1,368 | 1,855 -> 1,645 | 1,295 |
  | 40 | 2,112 -> 1,890 | 1,520 | 2,035 -> 1,885 | 1,443 |

  10 to 20 teams did not move in 60 s each (sampling had already seen tens of thousands of starters
  there; 20 was already at the floor). 12 teams stays 156 against 120, so the starter family itself
  may not reach lower there.
- **22 teams, and 21, now reach the floor**, cyclic too (462 = 22 x 21, Russell's bound), joining 4, 8,
  16, 20 and 32. As with 20 I have not compared this with published constructions; the test checks
  the counts directly (`starter.test.mjs`).
- The annealing search in `lowCarryOverRounds` runs from this start (and the circle start, keeping the
  better), so the gains carry into what the page builds. **Through the search** (`node
  eval/field-start.mjs 21 22 23 24 26 30`, seed 1, effort 1, `eval/starter-anneal-search.txt`;
  carry-over / breaks, sampled starter -> climbed starter):

  | Teams | Single, carry-over only | Season, carry-over only | Season, weight 10 |
  |---|---|---|---|
  | 22 | 516/68 -> 440/66 (floor) | 1,862/154 -> 1,782/148 (floor) | 1,920/150 -> 1,782/144 (floor) |
  | 24 | 654/76 -> 612/84 | 2,482/248 -> 2,312/194 | 2,488/172 -> 2,488/178 |
  | 26 | 762/98 -> 716/102 | 2,780/310 -> 2,618/230 | 3,098/208 -> 2,618/230 |
  | 30 | 1,042/132 (circle) -> 1,002/140 | 3,684/424, unchanged (circle) | 3,726/278 -> 3,838/300 |

  With carry-over only, every size moved down or held. With a break weight, two got worse: 24-team
  season +6 breaks at the same carry-over, and 30 teams (single 1,110/126 -> 1,154/122, score 2,370 to
  2,374; season score 6,506 -> 6,838). The climbed starters were chosen on carry-over alone, and
  `bestStarterOpp` picks the start by carry-over first, so a lower-carry-over start can leave the
  break pass a worse pattern. Open: pick the start (or keep a second starter) by carry-over + weight x
  breaks when a weight is set.
- Open: 24 to 40 teams are still 16 to 28% above the floor; longer runs keep finding small gains, so the
  table is a measurement of 60 s, not a limit. The previous section's 10,000-sample scratch run
  reported 24 teams 570, below the climb's 612 with all 24 playing (570 is close to the climb's 565
  with a bye, so it may have been that entry; that run was not kept), so at 24 the climb may not yet
  beat long sampling. A faster exact score (O(p) per starter from the
  difference counts) would let the climb try far more moves.

## An O(p) starter score, and climbed starters at 24 to 40 teams (2026-11-11, latest)

The climb above scores every move with the full carry-over count. `eval/starter-climb.mjs` (written
in parallel, PR #14821) scores a starter in one pass over p numbers instead, so a 40 s run makes 2 to
10 million moves past 22 teams. Its entries replace the annealed ones wherever they are lower.

- **The count collapses to one sequence.** At step 1 (any step is a relabelling, as above), with
  f(u) the partner of u and f(0) the fixed team, team t meets r + f(t - r) in round r, so over a
  cyclic timetable the count between two ordinary teams depends only on their difference d:
  D(d) = #{u not 0, 1 : f(u - 1) + 1 - f(u) = d (mod p)} + [d = 1] (the fixed team; with it as the
  bye, that term is the jump over the bye round, [f(-1) + 2 - f(1) = d]). The cyclic carry-over is
  p x sum D(d)^2 + 2p (all N play) or p x sum D(d)^2 (bye), and the floor is D(d) = 1 for every d.
  The script checks it against `carryOverFromOpponents` on every result; `starter.test.mjs` checks it
  on every built-in starter at its stored step.
- **Search.** Random starters, then moves that free 2 to 5 pairs and try every re-pairing of their
  residues that uses each freed difference once (backtracking, up to 2,000), keeping the best when
  no worse; restart after 400 + 40p moves without a gain. Up to 40 of the best cyclic candidates are
  then scored exactly, non-cyclic, at every start. 40 s per size and parity (`eval/starter-climb.txt`).
- **Against the annealed table** (non-cyclic carry-over at the best start; `starter.test.mjs` pins
  the kept values):

  | Teams | 24 | 26 (bye) | 30 | 29 (bye) | 34 (bye) | 36 | 35 (bye) | 38 | 37 (bye) | 40 | 39 (bye) |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | Annealed | 612 | 667 | 1,002 | 943 | 1,271 | 1,488 | 1,483 | 1,718 | 1,645 | 1,890 | 1,885 |
  | Climbed (kept) | **570** | **665** | **948** | **891** | **1,269** | **1,422** | **1,419** | **1,648** | **1,575** | **1,816** | **1,813** |
  | Floor | 528 | 575 | 840 | 783 | 1,023 | 1,224 | 1,155 | 1,368 | 1,295 | 1,520 | 1,443 |

  The other entries tie (22 and 21 at the floor in both; 23, 26, 27, 28, 34 with all playing), and the
  annealed entry is kept there. Below 22, 40 s and millions of moves left 6, 10, 12, 14 and 18 teams
  where sampling had them.
- **Through the search** (`node eval/field-start.mjs 21 22 23 24 25 26 28 30`, seed 1, effort 1,
  `eval/starter-climb-start.txt`; carry-over / breaks, annealed table -> merged table):

  | Teams | Single, carry-over only | Single, weight 10 | Season, carry-over only | Season, weight 10 |
  |---|---|---|---|---|
  | 24 | 612/84 -> 570/66 | 612/84 -> 570/66 | 2,312/194 -> 2,222/218 | 2,488/178 -> 2,224/154 |
  | 30 | 1,002/140 -> 948/136 | 1,154/122 (circle) -> 948/136 | 3,684/424 (circle) -> 3,614/288 | 3,838/300 -> 3,624/288 |

  21, 22, 23 and 26 are unchanged. This also clears both break-weight regressions noted above: the
  24-team season at weight 10 scores 3,764 (was 4,268 annealed, 4,208 sampled), and 30 teams 2,308 single
  (was 2,374) and 6,504 season (was 6,838 annealed, 6,506 sampled). 25 and 28 teams, first measured
  here: 665/164 and 828/114 single; seasons 2,631/351 and 3,146/270.
- Open: 24 to 40 teams are still 8 to 21% above the floor. At 24 the best cyclic sum D^2 found is 24
  against 22; whether a 24-team starter can reach the floor is not known to me.

## Several divisions on shared courts (`divisions.mjs`)

A club with U10, U12 and adult divisions has one set of courts, not one per division. `divisions.mjs`
solves them together: each division keeps its own circle-method round robin (home/away balance, byes,
optional `(double)`), and one pass decides which divisions play on which night (divisions with the most
rounds left go first, so they finish together) and which match gets which court and time.

- **What it minimises.** Teams that share a coach or players (`U10/Hawks, U12/Hawks`) are kept out of the same time slot on a night
  (and off consecutive slots at different venues); each team plays at the venue it used last time where it can
  (`Court 1 @ Park` puts a court at a venue). Court closures and skip dates are respected. A clash that cannot be avoided is
  listed under `conflicts`, never hidden.
- **Run it.** `node divisions.mjs example-divisions.json` prints the nights; add `--csv` for the sheet. `example-divisions.json`
  holds the form fields (divisions, courts, times, weekdays, skip dates, closures, links).
- **Checked.** `validateDivisions` re-checks every pair meets once (twice for a double), home/away stays balanced, no court is
  booked twice, no closed court is used and the conflict list matches a recount. `node --test divisions.test.mjs` (19 tests).
- **Measured.** On the example (three divisions of 6, 8 and 6 teams, four courts at two venues, two time slots, three links),
  summed over 8 seeds, the optimiser makes 322 venue changes against 432 for the naive order (-25%). Both give 0 linked clashes here,
  so the example does not show the clash handling beating the naive order; the one-slot test shows an unavoidable clash being listed.
- **Page.** `multi-division-league-schedule.html` runs it in the browser (divisions, courts at venues, times, skip dates, closures, links; CSV, plain-text and print exports; the same disclaimer and local-only usage counts as the main page), linked from `index.html` and the sitemap.
- **Travel from coordinates (2026-11-04).** No travel table? Give each venue a line `Park @ 40.7128, -74.0060` in the travel box (multi-division page or spec) and `parseTravel` estimates every pair that has coordinates on both sides: great-circle km x 1.3 at 40 km/h, rounded up, at least 3 min (`estimateDriveMinutes`). A time typed for a pair always wins; `estimated` lists what was filled in. An estimate for pricing venue changes, not directions; checked by hand arithmetic only (0.1 degree of latitude = 22 min), never against a real league's drive times.
- **Travel table checks (2026-10-30).** `readDivisionsSpec` also returns `warnings` (CLI prints them as `Warning:`): a venue pair missing from the table (it is priced as the longest time given) and a direct time longer than going via a third venue (usually a typo). Hand arithmetic tests only (`divisions.test.mjs`); shown on the multi-division page as a "Travel table" note.
- **Standings across divisions (2026-11-02).** `divisionsStandings(schedule, text, {points, headToHead})` reads results one per line with the division first (`U10: Hawks 3 - 2 Owls`, `U10: Hawks w/o Owls`, `U10: Hawks -3 pts`) and ranks each division with the single-league table. A result between teams that never meet, or a pair reported more often than scheduled, comes back under `errors`, not dropped. Page and CLI landed 2026-11-02 (below).
- **Standings on the page and CLI (2026-11-02).** `multi-division-league-schedule.html` gains a "Standings from results" box under the schedule (results one per line with the division first, points as win-draw-loss, an optional head-to-head tie-break, a table per division, rejected lines listed under "Not counted", and a CSV with a Division column). `node divisions.mjs spec.json --results results.txt` prints the tables (add `--csv`; `points` and `headToHead` come from the spec). `divisionsStandingsText` and `divisionsStandingsCsv` are in `divisions.mjs`. Checked by `divisions.test.mjs` and `page.test.mjs` (109 pass) and clicked in Chromium (`eval/browser-click.mjs`: unknown-team result named, table shown, CSV downloaded). Made-up results only; results are not in share links.
- **Why this team is above that one (2026-11-02).** `tieBreakNotes(rows)` in `calc.mjs` names, for every adjacent pair level on points, the first tie-break that split them (head to head when on, then goal difference, then goals for) and flags pairs level on everything as unresolved (play-off or draw needed). `divisionsStandingsText` (the CLI `--results` output) prints these notes under each table. Checked by `tiebreak.test.mjs` (4 tests) and the existing calc and divisions suites (240 pass). Made-up results only; the multi-division page shows them under its standings, and the single-league page does since 2026-11-04 (a source test, not clicked in a browser).
- **Travel times.** A `travel` field (`Park - School: 25`, minutes, either direction) prices each venue change by its time
  instead of counting it as one; a pair not listed counts as the longest one given. The optimiser then avoids the long hops first,
  and `stats.travelMinutes` (and the text read-out) report the total. On three venues (Park-School 10, Park-Lake 60, School-Lake 55)
  summed over 8 seeds: 14,840 minutes in the naive order, 11,335 when scheduled with every change costing the same, 10,230 with
  the table (-10% against flat); the search runs 10x more moves when a table is given, which is what made that gain appear
  (`divisions.test.mjs`). With five venues on a line (neighbours 5 min, the ends 80) and two divisions of six, 8 seeds: 3,200 minutes flat against 1,280 with the table (-60%). No table means the schedule is unchanged.
- **Rainouts across divisions** (`applyDivisionRainouts`; a `rainouts` field in the spec JSON, or the page's step 4). One line per rainout:
  `2026-10-13` cancels the whole night, `2026-10-13 U10` one division, `2026-10-13 U10/Hawks, U12/Owls` those teams' matches, and
  `-> 2026-12-01` at the end names the make-up night. Each cancelled match goes to the earliest later play night where both teams
  are free and a court is open (skip dates and court closures respected), taking a slot where no linked team plays at the same
  time when one exists; nothing else moves, a refusal says why and leaves the match where it was, and the result is re-validated.
  Tested on the example league for a team, a division, a night, a named date and bad lines (`divisions.test.mjs`).
- **Venue fairness across seasons.** `venueFairness: true` (form field `venueFairness`) also weighs how often each team has played at each venue,
  so the team that had the far venue all autumn gets the near one next time. `node divisions.mjs spec.json --history` prints each team's
  matches per venue; paste that JSON into next season's `venueHistory` field and the new season starts from it (`carryVenueHistory`,
  `venueImbalance`; stats gain `venueImbalance`, the mean gap between a team's most- and least-played venue). Measured on the example
  league over 3 seasons, 8 seeds, cumulative imbalance: 5.83 matches with it off, 3.11 with fairness inside each season only, 1.29 with
  history carried (`divisions.test.mjs`). On `multi-division-league-schedule.html` it is a checkbox plus a box for last season's counts; the report prints next season's history to paste back, and share links carry both. The cost is travel: 1,028 venue changes against 1,218 and 1,212 over the same runs. Off by default, and
  the schedule is byte-identical to before when it is off. The weight is `fairnessWeight` (form field and a box on the page; default 3 against 5 per venue change). Same 3-season, 8-seed run: weight 0 imbalance 5.83 / 1,028 venue changes (= off), 0.5 → 2.42 / 978, 1 → 1.92 / 998, 1.5 → 1.73 / 1,020, 2 → 1.63 / 1,098, 3 → 1.29 / 1,212, 5 → 1.16 / 1,406, 10 → 1.10 / 1,532, 30 → 1.55 / 1,558. So up to about 1.5 fairness costs no extra travel; past 10 it stops helping (`divisions.test.mjs`).
  **Choosing the weight from your own travel** (`suggestFairnessWeight`; `node divisions.mjs spec.json --suggest-weight`): it builds 3 seasons on 4 seeds at weights 0 to 10 for *your* courts and travel table, and keeps the largest weight whose travel stays within 5% of fairness off. Measured on the example league (two venues): 1.5, +4% venue changes. On a three-venue league with Park-School 10 min, Park-Lake 60, School-Lake 55, no weight fits the 5%: every weight costs 14-68% more minutes on the road, and the suggestion falls back to the smallest weight that halves the imbalance (0.5: imbalance 11.7 -> 5.9, +23% minutes) and says it is over the slack. So the "free up to 1.5" rule above is a two-venue result. On the page as "Suggest a weight for my league" (2026-10-24, runs in a worker, example league: weight 2, +5% minutes of travel; `eval/browser-click.mjs` clicks it). Simulated leagues only, no real league's travel tested.
- **Not done yet.** Rounds are placed whole, so a night with 1 spare slot stays partly empty.

**Officials on shared courts (2026-10-29).** The multi-division builder now assigns a referee, umpire or scorekeeper to every match, as the single-league page does: `"officials"` in a CLI spec (`node divisions.mjs spec.json`), one per line as `Name (Hawks): Tue, Thu max 6`. A team in brackets is matched by name in every division that has it. Hard rules: the weekday, never a match of their own team, one match per time slot of a night (across divisions), the cap; least-loaded first. Matches nobody can take are printed with the reason, and the CSV and text read-out gain an Official column (`parseDivisionOfficials`, `assignDivisionOfficials`, `validateDivisionOfficials` in `divisions.mjs`; two tests in `divisions.test.mjs` on the example league). The page has the box too (section 4 of the multi-division page, 2026-10-29): unfilled matches and the check result are listed, an Official column appears in the table, and the CSV carries it; the box rides in share links. Tested by wiring and a share round-trip, not by clicking it in a browser.

**Messages for multi-division leagues (2026-10-29).** `multi-division-league-schedule.html` gains "Download a message per team (.txt)" and, when officials are listed, "Download a message per official (.txt)", as the single-league page has. `divisionsTeamMessages(schedule)` writes one note per team (division, date, time, court, venue, home or away opponent; teams sharing a name in two divisions get one each) and `divisionsOfficialMessages(schedule)` one per official (`divisions.mjs`). Test: every match appears once per side (2 x matches in all), each note has one line per fixture, official notes sum to the assigned total. Wiring tested, not clicked in a browser.

**Reminder box on the multi-division page (2026-11-01).** `multi-division-league-schedule.html` gains a "Reminder before each game (minutes)" box next to the calendar button; a value from 1 to 10080 adds a display alarm to every timed event through the existing `divisionsIcs(..., { alarmMinutes })`, blank adds none. Checked by `page.test.mjs` (the id and the wiring) and the 105 existing page and division tests; not clicked in a browser, and how a phone calendar shows the alarm is untried.

## Branded season print pack (2026-11-02, dark until a checkout link is set)

`printpack.mjs` builds one printable page set on the organiser's letterhead: a
cover (league, season, logo, contact), the full schedule, one page per team
(home/away, byes marked) and an optional rules page. It reuses the licence-key
check from `ventures/wall-framing-takeoff` (`licence.mjs`; the provider's
validate call is from memory of its docs and unrun). The card in `index.html`
shows only when `CHECKOUT_URL` in `checkout.mjs` is a plain https link, which
is empty today, so nothing is for sale. The schedule, CSV, calendar, web page
and score sheets stay free. The key is an honest-buyer convenience, not copy
protection; the code is MIT. Checked: `node --test printpack.test.mjs`
(5 cases: a page per team with each game once and the bye, escaping of every
typed field, SVG and non-hex colour refused, the card dark, the key check never
throwing offline); whole suite 312 passing. Not checked: a real checkout, or
the pack in a browser print dialog.
- **Cross-division play-off seeding (2026-11-02).** Under the standings box on `multi-division-league-schedule.html`, "Seed a play-off from these standings" takes the top N teams of every division plus optional wildcards (best of the rest) and prints the seeds and a single-elimination bracket. Seeds go by finishing place first (all winners, then all runners-up), then points per game, goal difference, goals for, name, so divisions with different games played compare fairly. CLI: `node divisions.mjs spec.json --results results.txt --playoffs 2 [--wildcards 1]`. `divisionsPlayoffs` in `divisions.mjs`; checked by `divisions.test.mjs` (62 tests), `page.test.mjs` (48) and clicked in Chromium (`eval/browser-click.mjs`). Made-up results only. Round-one clashes of one division are fixed by `separate` (2026-11-06, below).

**Tie-break notes on the multi-division page (2026-11-02).** `divisionsTieBreakNotes` (divisions.mjs) feeds the "why teams are ranked where they are" list under each division's table after "Show standings". Unit-tested in divisions.test.mjs; clicked in Chromium by `eval/browser-click.mjs` (made-up results only).

- **Weekly update from the CLI (2026-11-03).** `node divisions.mjs spec.json --results results.txt --weekly` prints the per-division group-chat update (last round's scores, top of the table, next round) that the page button already made. Checked by one divisions.test.mjs CLI test on the made-up example league (67 tests pass). Real league results not yet tried.
- **Strength of the remaining schedule (2026-11-03).** `divisionsRemaining(schedule, resultsText)` in `divisions.mjs` lists, per division, each team's games left and the average points per game of the opponents still to face (opponents with no games count as the division average), hardest run-in first. CLI: `node divisions.mjs spec.json --results results.txt --remaining`. Informational, not a prediction. One `divisions.test.mjs` test on the made-up example league (70 tests pass) and a CLI run; no page button yet; made-up results only. The multi-division page got a "Download strength of remaining schedule" button on 2026-11-04 (browser-clicked in eval/browser-click.mjs, 25-line file from the made-up example league).
- **Missing-scores chase list for multi-division leagues (2026-11-03).** `divisionsOverdue(schedule, resultsText, today)` in `divisions.mjs` lists every game dated before today with no typed result, per division and in date order (a pair's typed results are matched to its meetings earliest first, as the single-league `overdueResults` does; rejected lines are ignored, `divisionsStandings` already reports them). CLI: `node divisions.mjs spec.json --results results.txt --overdue [YYYY-MM-DD]`; page: "Download missing-scores list (text)". Checked by one `divisions.test.mjs` test on the made-up example league (68 tests pass), `page.test.mjs` (48 pass) and a CLI run. Not clicked in Chromium; made-up results only.
- **Team withdrawals for multi-division leagues (2026-11-04).** `applyDivisionWithdrawals(schedule, text)` in `divisions.mjs` removes a team's remaining matches, one line per team: `U10/Hawks` (all remaining) or `2026-11-03 U10/Hawks` (on or after that night). Played matches stay, nothing else moves, a team of the same name in another division is untouched, and each notice names the opponents left with fewer games so the league can decide how earlier results count. `validateDivisions` accepts a withdrawn team's missing pairs (never more meetings than expected) and skips the home/away balance check for a division with a withdrawal. CLI: a `withdrawals` field in the spec JSON prints notices to stderr. Two `divisions.test.mjs` tests on the made-up example league (`divisions.test.mjs` + `page.test.mjs`: 127 pass); not on the page yet, made-up leagues only.
- **Set scoring for volleyball (2026-11-03).** `standings(teams, results, { setScoring: true })` reads each score as sets won and awards points the FIVB way: a win by two or more sets earns the full win value (3) and the loser 0; a one-set win (3-2) earns 2 and the loser 1. Default scoring is unchanged. Checked by one calc.test.mjs test on made-up results (175 tests pass). A "Volleyball set scoring" checkbox on the single-league page (2026-11-04) passes it to the standings table and the download; checked by a page.test.mjs wiring test and, since 2026-11-04, clicked in Chromium (`node eval/browser-click-single.mjs`: three made-up teams, 3-2 and 3-0 results; unticked Aces 6, Blockers 0; ticked Aces 5, Blockers 1; unticking restores 6). Not checked against a real league's table.

## Clinch watch (multi-division, 2026-11-03)

`node divisions.mjs league.json --results results.txt --clinch 2` (and a button on the multi-division page) lists,
per division, who has clinched a top-N place and who is mathematically out, from the typed results and the games
still to play. Points only, ties counted against the team tested, so "clinched" and "out" are never wrong; unit-tested
(`divisions.test.mjs`) on the made-up example league only. Wanted: a real league's results to check it against.

**Same loader on the one-division page (2026-11-04).** `blackoutsFromCsv(csv, teams)` in `calc.mjs` (the page's file picker under the blackout box) reads the same kind of export for a single league; `csvRows` now lives in `calc.mjs` and `divisions.mjs` re-exports it. Unit-tested on made-up forms only.

**Coach sign-up form to blackouts (2026-11-04).** Leagues collect "dates we cannot play" with a Google Form or a spreadsheet, then retype them. `blackoutsFromCsv(csv, divisions)` in `divisions.mjs` reads that export (quoted cells, a BOM, commas or newlines between dates, ranges, "none"), finds the Team, optional Division and date columns by header, merges a team's repeat answers and returns the blackout-box text plus errors for any row naming no known team (never guessed) or a team name in two divisions with no Division column. The multi-division page has a file picker under the box (read in the browser, nothing uploaded); CLI: `node divisions.mjs spec.json --blackouts-csv form.csv`. Tested (`divisions.test.mjs`, 3 new tests, 80 total) and the picker was clicked in Chromium; made-up forms only, not tried on a real league's export.

**Rainout change notices for multi-division leagues (2026-11-04).** The single-league page already wrote a league post and a note per affected team after a rainout; the multi-division page did not. `divisionsChangeNotices(moves)` in `divisions.mjs` takes the moves from `applyDivisionRainouts` / `applyDivisionBlackouts` and returns `{ group, divisions, teams }`: one league-chat post grouped by division, one post per division, and one short note per affected team with only its own changes. A team name used in two divisions gets a note for each, labelled with the division. The page shows "Download rainout change notices (text)" whenever something moved; CLI: `node divisions.mjs spec.json --notices`. Tested on the example league (`divisions.test.mjs`, 72 pass) and browser-clicked (`eval/browser-click.mjs`); made-up league only, not tried with a real league's rainouts.

**Season cost and fee per team (2026-11-04).** `divisionsFacilityCost(schedule, rates, { minutes, extra, split })` in `divisions.mjs` prices the booking request: court-hours booked (each night's courts used times its first-start to last-end span; untimed nights use `minutes` per game) times the rate typed per venue (`Riverside Park: $45/court-hour`), plus any fixed `extra` (insurance, trophies), split over every team or, with `split: "games"`, by each division's share of games. A venue with no rate is named and left out of the total, never guessed. It is arithmetic on the organiser's own rates. Tested against a hand-counted two-venue season (5 and 3 court-hours, 200 + 60 = 260, 43.33 a team) in `divisions.test.mjs`; **no real league's invoice to compare with**. Page and CLI added 2026-11-04: rates box, other-costs box and a by-games tick on `multi-division-league-schedule.html` ("Download season cost and fee per team", browser-clicked in `eval/browser-click.mjs` with blank rates, so the no-rate path), and `node divisions.mjs spec.json --cost rates.txt [--extra N] [--split games]` (exit 2 if a venue has no rate; `divisions.test.mjs`, 138 pass with `page.test.mjs`).

**Facility booking request (2026-11-04).** `divisionsBookings(schedule, { minutes: 60 })` in `divisions.mjs` turns a multi-division schedule into one request per venue: each night the venue is needed, which courts, and the earliest start to the latest finish (games assumed `minutes` long). Organisers send it to a park or school to reserve the whole season at once. CLI: `node divisions.mjs spec.json --bookings`. Tested on the example league (`divisions.test.mjs`, 74 pass: every game counted once, spans, CLI); page button "Download facility booking request" added the same day on the multi-division page (game length field, default 60; source-asserted in `page.test.mjs`); the 60-minute game length is a default, not read from a real facility's booking rules.

- **Booking-request fuzz check (2026-11-04).** `node eval/fuzz-bookings.mjs [count] [seed]` builds random multi-division leagues and checks `divisionsBookings` against the schedule: every game counted once, no venue-night listed twice, booked courts equal the courts used, and each span runs from the earliest start to the latest start plus the game length (30 to 120 minutes). Seeds 1, 2, 3 and 7, 400 each: 1,370 leagues built (the rest refused for too few court slots), 6,000 to 6,500 venue-nights per seed, 0 faults. Made-up leagues only; no fault found, this pins behaviour.

**Season deadline check (2026-11-04).** `divisionsDeadline(schedule, deadline)` in `divisions.mjs` answers "does every division finish before the end of term or the venue lease?": per division the last game date, days spare or late, and the matches dated after the deadline. CLI: `node divisions.mjs spec.json --deadline 2026-12-15` prints the read-out and exits 0 if the season fits, 2 if not (so a script or cron job can gate on it), 1 on a bad date. Tested in `divisions.test.mjs` (82 pass: spare and late cases against a count of matches after the date, empty and invalid input, CLI exit codes). API and CLI only; no page control yet, and the example league is made up.

### Results typed the way people type them (2026-11-04)

`parseResults` in `calc.mjs` now also reads `Hawks 3 v 2 Owls`, `Hawks 3 Owls 2`, `Hawks vs Owls 3-2`, `Hawks beat Owls 3-2`, `Owls lost to Hawks 2-3`, a true minus sign for the dash, a trailing full stop, a bracketed note (`(OT)`), and several results on one line separated by `;`. `Hawks 5-0 Owls (forfeit)` is a walkover that keeps the typed score. Unknown names, self-matches and garbage are still reported with the line number. Before, all of these gave "write it like ..." or a wrong-team error. Test: `result-spellings.test.mjs` (6 tests, made-up teams); the calc, divisions, page, server and fuzz suites still pass (327). Not checked against a real organiser's pasted results.

- **Repeat-forfeit warning (2026-11-05).** `forfeitReport(teams, results, { limit })` in `calc.mjs` counts each team's walkover losses; the single-division page adds a warning naming teams with two or more. Checked by one `calc.test.mjs` test (229 calc and page tests pass); made-up results only, and the limit of two is a default, not any league's rule.
- **Repeat-forfeit warning in the multi-division weekly update (2026-11-05).** `divisionsWeeklyUpdate` now ends a division's block with a warning naming teams with two or more walkover losses (`forfeitReport`, as the single-division page does). One `divisions.test.mjs` test (88 pass); made-up results only, the limit of two is a default, not any league's rule.

- **Same-division teams apart in round one (2026-11-06).** `divisionsPlayoffs(result, { separate: true })`, CLI `--playoffs 2 --separate`, swaps the lower seed of any first-round pair from one division with the closest-seeded team in another pair, when neither pair then clashes, and prints a line per swap. Seed numbers stay with their bracket slot. A field one division dominates is left as seeded. Checked on 2,000 random made-up fields (2 to 6 divisions, top 1 to 3 each): same-division first-round games 601 -> 0, 423 fields fixed, all teams kept (`divisions.test.mjs`, 90 tests). Made-up standings only; no page checkbox yet.

**Team duties: snack stand, scoreboard, field set-up (2026-11-07).** `"duties"` in a CLI spec (`node divisions.mjs spec.json --duties [--csv]`), one per line as `Snack stand: 2` (teams per playing night, 1 to 10). Each night's slots go to teams that play that night, one duty per team per night, fewest duties so far first, then fewest of that duty, then longest since the last one. Slots with no free team are listed, not invented. `parseDivisionDuties`, `assignDivisionDuties`, `validateDivisionDuties` (independent re-check) in `divisions.mjs`; one test on the example league (every slot accounted for, spread of totals at most 2, deterministic, formula cells defused). Library and CLI only: not on the page yet, and no real league's duty rota was compared. Next: the page box and a per-team duty list in the print pack.

**Duty rota on the multi-division page (2026-11-10).** The snack stand / scoreboard / field set-up rota (CLI `--duties`, 2026-11-07) now has a box and a "Download team duty rota (text)" button on `multi-division-league-schedule.html`. It runs `assignDivisionDuties` and refuses to download if `validateDivisionDuties` finds a fault; bad lines are reported, not guessed. Checked: `page.test.mjs` (53 pass, one new source assertion), `divisions.test.mjs` (92 pass) and a Chromium click in `eval/browser-click.mjs` (download has the duties, 46 lines on the example league). Made-up league only; no real league's rota compared. Next: a per-team duty list in the print pack.

**Team sheets with duties, to print (2026-11-10, later).** `divisionsTeamSheetsHtml(schedule, { title, contact, duties })` in `divisions.mjs` writes one printable page per team: its fixtures in date order (date, time, court, venue, home or away, opponent, official when assigned) with a "Your duty" column filled on the nights `assignDivisionDuties` gave it one, a games-and-duties count, the organiser's contact line, and a final duty-rota page night by night with unfilled slots marked "no team free, find a volunteer". A team with two games in a night carries its duty on the first row only. Teams that share a name in two divisions get a sheet each. Page: "Download team sheets to print" on `multi-division-league-schedule.html`, with a title and contact box; duties are optional (no duty column or rota page without them) and the download is refused when `validateDivisionDuties` finds a fault. CLI: `node divisions.mjs spec.json --team-sheets > sheets.html` (spec fields `duties`, `title`, `contact`). This is the multi-division counterpart of the single-league print pack and, unlike that one, free and unbranded (no logo or accent). Checked: `divisions.test.mjs` (93 pass; new test: every match on both teams' sheets, duty cells equal the rota rows and sit on the team's own night, rota page, unfilled marked, title and hostile team names escaped), `page.test.mjs` (54 pass), and the Chromium click in `eval/browser-click.mjs` (downloads `team-sheets.html` with the duty column and rota on the example league). Made-up league only; not printed on paper, no real league's rota compared.

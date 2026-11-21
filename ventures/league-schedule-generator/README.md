# League Schedule Generator

Free, browser-only round-robin schedule maker for rec leagues, youth sports,
pickleball, darts and chess clubs and office leagues. Paste the team names and
pick a start date and weekday; it builds a single or double round robin with real
dates, home and away balanced (the minimum possible breaks for a single round robin,
n−2; the mirrored double has 3(n−2)), courts and time
slots shared evenly, team blackout dates handled with makeup rounds, skip dates
for holidays, and an optional single-elimination play-off bracket seeded from the
standings you type. Also runs a challenge ladder (paste "Cy beat Ana" results; it moves players up, shows who may challenge whom and flags challenges beyond your reach limit). Exports a CSV, calendar (.ics) files for the league or one
team, a plain-text version to paste into a group chat, and a share link that carries the whole setup in the URL fragment (never sent to any server) so a co-organiser opens the same league in one click. Nothing is uploaded.

**Live tool:** https://marisstella.app/league-schedule-generator/

## What you use today, and what this does differently

- **A spreadsheet or a hand-drawn grid:** free, but home/away balance, byes in odd leagues and court sharing are easy to get wrong, and a rainout means redoing the sheet.
- **Tournament platforms** (paid scheduling and registration for weekend events): this page lays out pools, brackets and fields for a weekend with no signup (`weekend-tournament-schedule.html`, below).
- **League-management platforms** (TeamSnap, LeagueApps, SportsEngine and similar): registration, payments, team messaging and score apps, usually on a paid plan and with accounts for every team. This tool only makes and maintains the schedule: no signup, no upload, free.
- **What this adds:** a fair round robin with the fewest possible home/away breaks for a single round robin (a mirrored double has 3(n−2)), real dates with blackouts and holidays, calendar files per team, and rainout moves that change nothing else. The self-hosted league page (below) adds team sign-ups with a team cap, a waitlist and a fee paid on the organiser's own payment link; player waivers are signed on the same page (below); for card processing inside the sign-up, use a platform and paste this schedule into it.
- **Next season in one click:** "Start next season from this league" keeps the teams (minus withdrawals, plus late entrants), courts, times and weekdays, clears the old dates and results, and sets the start to the next chosen weekday eight weeks after the last match, so a returning organiser does not retype anything.

## Practice slots on shared fields (2026-11-21, newest)

`practice-schedule.html`, `practice.mjs` (search in `practice-worker.mjs`), guide
`how-to-make-a-practice-schedule-for-shared-fields.html`. Youth soccer, baseball, flag football and rec
basketball leagues hand every team one or two weekly practice slots on a few fields split into halves or
quarters. Until now the generator scheduled games only; the practice grid was left to a spreadsheet.

- **Why someone would use it:** the alternatives are a hand-made spreadsheet (first-come teams take the
  good slots, coach clashes and over-full fields slip through) or the field-allocation modules in paid
  league platforms (LeagueApps, SportsEngine, Demosphere and similar, with accounts and a per-season
  fee). This takes plain lines, needs no account, keeps every hard rule, shares the misses fairly, says
  when the grid is proved best, and gives each team a weekly calendar.
- **Input:** field lines `name | days | hours | units at once` (a field in quarters is 4); team lines with
  any of `coach Lee`, `2 units`, `2 a week`, `not Fri`, `games Sat`, `prefer Tue Thu`, `prefer 5-7pm`,
  `by 7pm`, `after 5:30pm`. Pipes, tabs (a spreadsheet paste) or commas; mistakes named by line.
- **Hard rules:** units per practice-length block, one practice a team a day, no-days and game days,
  earliest start and latest finish, and a coach's teams never at overlapping times (back to back is fine).
- **Fairness:** a practice off a preferred day misses 2, outside preferred times 2, two practices on
  consecutive days 1. The search minimises the sum of each team's misses squared (two teams missing once
  beats one team missing twice), with an unplaced practice costing more than every miss together.
- **Proof on the page:** each team's best week with the fields to itself (every subset of its days,
  `soloBest`) is a lower bound; when every team meets it the page says "proved". Unplaced practices come
  with a reason: no window takes its units, none fits its days and hours, too few allowed days, or full
  slots and who holds them.
- **Search:** greedy start (most constrained teams first), then annealing with relocations and eviction
  chains (evict holders of a block until it fits, rehouse each, depth up to 2), four reheats from the best,
  three seeded restarts up to 80 practices. Same lists, same grid; "Try another timetable" changes the seed.
- **Outputs:** grid by day and field with units used, each team's week and misses, text for the group
  chat, CSV (formula-looking names defused), weekly repeating `.ics` per team or for all with skipped dates
  as EXDATEs, a share link carrying the lists (rebuilt the same on the other device), print.

- **Every other week (2026-11-21):** `every other week` (or `alternate weeks`, `biweekly`, `fortnightly`)
  on a team line lets it take its slot on A weeks or B weeks, so two such teams share one slot by turns;
  `A weeks` / `B weeks` fixes which. Capacity holds in each week on its own (a weekly team uses both), a
  team keeps all its practices in one set of weeks (a whole-team flip move switches it), and a coach's
  A-week and B-week teams may share a time. Grid cells show each week's use, text and CSV carry the
  weeks, and its calendar repeats every two weeks (`INTERVAL=2`) with the first practice week an A week.
  Checked against the extended CP-SAT model (`eval/practice-exact.txt`, "Every other week"): 83 of 84
  proved optima matched on 100 leagues where a third of teams alternate; the one miss is a gap of 5 that
  three of eight seeds find.

Checked: `eval/practice-exact.txt`: against CP-SAT on 100 random leagues (60 at 75-105% of field capacity,
40 at 40-70%), the search equals all 95 proved optima and beats CP-SAT's 20 s answer on one unproved case;
median 0.5 s, max 1.9 s on the tight set. The first version matched 25 of 35; multi-holder eviction and
restarts closed the gap. `practice.test.mjs` (20 tests, five for alternating weeks: parsing, every hard rule rechecked from scratch on
25 random leagues, capacity mixes, coach clashes, the squared-miss trade, back-to-back days, the solo bound,
outputs and calendar dates, the guide's grid recomputed from the module). Clicked through in Chromium at 390
and 1200 px (example, reshuffle, calendar download, share link, reload; no console errors, no sideways
scroll). Invented teams only; no league has run a season's practices on it yet, which is the next
information.

## Cards and suspensions served against the fixture list (2026-11-21)

The self-hosted league page (`server.mjs`) keeps a **cards log** and works out who is suspended for which game
(`discipline.mjs`). The organiser types one line per event under **Cards, suspensions and scorers** in `/admin`:

```
2026-10-14 Hawks: Ana Lopez yellow
2026-10-14 Owls: Ben Ruiz second yellow
2026-10-21 Owls: Cara Diaz red 3        (a red with the ban your panel set; plain "red" takes the default)
2026-10-28 Wrens: Dan Ito ban 2         (a ban with no card)
2026-10-21 Owls: Cara Diaz goal 2       (the scorers table)
```

- **Rules are settings:** a ban after every N yellows (default 5; 0 turns accumulation off), its length (default 1),
  escalating bans if ticked (5 yellows 1 game, 10 yellows 2, 15 yellows 3, as many county associations run it), the
  straight-red ban (default 1) and the two-yellow sending-off ban (default 1). A second yellow is a sending off and
  is not added to the running yellow total.
- **Serving:** each player's bans queue in card order and are served in their own team's fixtures strictly after
  the card's game day (after rainouts, withdrawals and late teams are applied). Only games before today count as
  served, so a rained-out game serves nothing until it is played on its new date, and the game on today's date is
  still to miss. A ban longer than the fixtures left says how many games carry past the season (the league decides
  what happens to them). A card dated on a day the team had no game is warned about and served from its next game.
- **Who sees what:** `/admin` lists live bans with the games still to miss (date and opponent), players one yellow
  from a ban, parse warnings, and **Download every ban (CSV)** (`/admin/discipline.csv`, formula cells guarded).
  Each captain's page shows only their own team's suspensions and near-ban players, always. Tick **Show suspensions
  and top scorers** and the league page lists suspensions and the ten top scorers for everyone.
- **Alternatives:** a spreadsheet kept by hand, the discipline modules of association systems (e.g. FA Full-Time in
  England) that only cover affiliated leagues, or paid league platforms. This one is free, needs no affiliation,
  and ties the ban to the league's real, rainout-adjusted fixture list.
- **Limits:** it counts; it is not a disciplinary process (no hearings, appeals or fines). Players are matched by
  the name typed on the team, case-blind; two spellings are two players. Not yet used by a real league.
- **Checked:** `discipline.test.mjs` (11 tests: settings, parsing and errors, serving only played games, a
  rained-out game moved later, accumulation and escalation, queued bans, the second-yellow rule, carry-over,
  off-day warnings, same name on two teams, escaping and the CSV guard, the whole server flow from the admin form to
  captain, league page and CSV, and the guide's worked table recomputed). Guide:
  `how-to-track-yellow-card-suspensions-in-a-rec-league.html`.

## Weekend tournaments: referee crews for every game (2026-11-20)

The weekend scheduler placed every game on a field; the referee assignor still worked out who
officiates which game by hand. `tournament-referees.mjs` and the "Referees" box on
`weekend-tournament-schedule.html` now give every game its crew.

- **What you type.** One official per line, everything after the name optional:
  `Ava Chen (Riverside Rapids): Sat, Sun 08:00-12:00; U10 Girls, U12 Boys assistant; max 4 a day;
  max 2 in a row; plays U14 Boys/Summit Strikers`. The club in brackets is a team name and covers
  that name in every division. "U12 Boys assistant" allows the assistant's place only in that
  division; "assistant only" everywhere. A second box sets the crew size per division (`U14 Boys: 3`,
  `all: 2`); the rest get one referee. Each faulty line is refused with the reason.
- **Hard rules** (`validateReferees` re-checks them from the output alone): inside their hours and
  divisions; the referee's place only where allowed; never their own club's pool game; never during
  a game of the team they play for, with the turnover either side; one game at a time, with the
  turnover kept for a walk to another field; daily and weekend caps; at most N games in a row (a gap
  under the break, 30 min by default, keeps a run going; N is 3 unless set per person).
- **The search.** Kick-off order, referee places before assistants; each place goes to the
  eligible official with the fewest minutes so far, staying on the same field where possible. An
  empty place then gets a depth-3 ejection chain: A takes it by handing one game to B, who may hand
  one to C, up to three hand-overs, kept only if the whole chain fits. 80 shuffled passes, keeping
  the fewest empty places, then the fewest risky knockout places, then the most even minutes, then
  the fewest field changes. The sample takes about 0.3 s.
- **Knockout games before the teams are known.** An official whose club has a team in the division
  is kept off its knockout games where anyone else is free; when nobody is, the place is counted and
  named. `refereesAfterResults` reads the results box once the bracket fills, lists every knockout
  place where an official's own club now plays, and gives a fix that it re-checks against every
  rule: a free official, or a swap with an official on a game at the same time.
- **Exports.** Each official's sheet (`refereesText`), a load table (games, referee and assistant
  counts, per day, hours, field changes, first and last), the schedule CSV with a column per crew
  place and one official's CSV (`refereesCsv`), and for every empty place the count of officials
  ruled out by each rule.
- **Measured against an exact optimum** (`eval/referee-exact.mjs`, `eval/referee-exact.py`, CP-SAT;
  `eval/referee-exact.txt`): on 60 random well-staffed weekends, the 36 where every place can be
  filled were all filled, and the least number of empty places was matched in 57 of 59 proved cases
  (2 extra empty places in 2,727). On 60 short-handed weekends: 51 of 58 (8 extra in 2,664); the
  one-hand-over repair it replaced matched 47 (13 extra), a single pass 34. 0 rule breaks in any
  output. The sample's one empty place (U14 assistant, Saturday 11:10) is proved unavoidable.
- **Checked:** `tournament-referees.test.mjs` (7 tests): parsing and every error; the sample
  assignment clean, deterministic, sheets and CSV in agreement; the validator catching each rule
  broken by hand; caps a day, in all and in a row; an empty list; and 20 weekends played to the
  champion where every flagged knockout clash got a fix that passes the validator. In Chromium: the
  sample assigns on load, no console errors, no sideways scroll at 390 px.
- **Not done:** made-up weekends and officials only, no real tournament yet; officials choosing
  their own games on the league page; grades (a minimum referee level per division) and pay totals.

## Weekend tournaments: results on the day fill the pools and the bracket (2026-11-20)

The weekend scheduler below stopped at placeholders: every knockout game read "1st Pool A v 2nd
Pool B" or "Winner SF1" until the director redrew the bracket by hand, usually on a whiteboard by
the score table. Now `tournament-results.mjs` and the "Results on the day" box on
`weekend-tournament-schedule.html` take the scores as they come in and play the weekend forward.

- **What you type.** One game per line, any order, in the league formats (`Hawks 2 - 1 Owls`, `Owls
  lost to Hawks 1-2`, `Hawks w/o Owls`); a level knockout score names its winner (`Hawks 1 - 1 Owls
  (Hawks on penalties)`). A club often enters the same name in two age groups (the sample has North
  Hills Hawks in U10 and U12), so a line whose two teams are both in more than one division is refused
  with the fix: start it with the division (`U12 Boys: ...`) or put the division's name on a line
  above a block of its results.
- **Pool tables.** `standings` from `calc.mjs` per pool: points (3-1-0 or any win-draw-loss), then
  head to head among teams level on points (or straight to goal difference), then goal difference,
  then goals for. An optional **goal-difference cap** (the usual youth rule, often 3 to 5) counts a
  9-0 as 4-0 for goal difference and goals for; the table still shows the real score in the grid.
- **Knockout places.** A pool's places fill only when every game in it has a result, so a bracket
  never shows a team that could still drop out. "Best 2nd-placed" places (when the number going
  through is not a multiple of the pools) fill once every pool is done, compared **per game** (points,
  then goal difference, then goals for per game played), so a runner-up from a pool of three is not
  ranked below one from a pool of four for playing one game fewer. Teams level on everything are
  listed in pool order with a note to settle it by the tournament's own rule.
- **Bracket.** The division's bracket (the same crossover seeds and labels the schedule was built
  with) gets the real names in its seed slots, then `playBracket` carries winners into "Winner SF1"
  slots and losers into the third-place game. The grid shows names, scores and the winner in bold;
  times and fields never move, so the results survive "Try another order".
- **Wrong lines are named.** Each refused line gives its line number and the reason: a name not in
  the division, two teams from different pools while the pools are unfinished ("this would be a
  knockout game, but Valley United is not in the knockouts yet: Pool A still has games to play"), a
  second line for a pool pair when neither went through, a level knockout score with no winner.
- **A fix in the league table on the way.** `tieBreakNotes` said two teams were separated "on head to
  head" whenever the head-to-head option was on, even when they were level on every tie-break, so the
  "Still level: decide it by a play-off or a draw" note never showed on head-to-head tables. It now
  says so only when the deeper head-to-head levels really differ (league page included).
- **Exports.** `tournamentResultsText` (every pool table, the knockout places, each knockout game
  with its result, the champion, runner-up and third, and the next twelve games) and
  `tournamentResultsCsv` (the schedule with the teams filled in and a Result column; one team's games
  with `team`).
- **Checked:** `tournament-results.test.mjs` (7 tests): the sample weekend played to the end on 30
  random score sets (every game has a result; every seed is the team at that place of its pool's final
  table; every knockout slot holds a real team; times and fields unchanged; each final's teams are its
  semifinal winners; champion, runner-up and third distinct); pool lines shuffled ten ways give the
  same tables and seeds; division headings and prefixes; each error; the cap moving a tie; a 10-team
  division in pools of 4, 3 and 3 whose best runner-up is the 4-pool's on points per game, played to
  a champion; both exports. In Chromium at 390 px: 35 of the sample's 36 games typed in, champions
  shown for U10 and U14, the U12 final waiting with its two semifinal winners named, no console
  errors, no sideways scroll, and the results still there after a reload. Made-up weekends only; no
  real tournament has used it yet.
- **Not done:** a pair that meets in its pool and again in the knockouts takes its first line as the
  pool game (so type pool results before that knockout result); a public
  read-only results page for parents (the league's `/league` page does this for a season).

## Weekend tournaments: every division on shared fields, pools then brackets (2026-11-20)

A club tournament puts several age groups on a few fields over a weekend. Until now the generator
made league seasons and one-pool days; a director with U10s on 7v7 pitches, U12s on 9v9 and U14s on
full-size fields still built the weekend grid by hand. `tournament.mjs` and
`weekend-tournament-schedule.html` do it.

- **Input:** days with hours; fields with the sizes they take and closures ("Field 4: 7v7; closed Sun
  12:00-15:00"); divisions as blocks ("U12 Boys: 60 min, 9v9, pools of 3, top 4, 3rd place, rest 60,
  max 3 a day, knockouts Sun", then the teams best first); team arrival and departure limits
  ("not before Sat 11:00", "not Sun"); teams that share a coach.
- **Pools and seeds:** snake-drafted pools (`splitPools`), a round robin in each, then a knockout of
  the top N seeded by `poolPlayoffSeeds` so poolmates meet late (with two pools: 1st A v 2nd B); when N
  is not a multiple of the pools, the last places go to the best runners-up. `playoffBracket` makes
  the rounds, byes and the third-place game.
- **Placement:** randomized list scheduling. Games go in pool-round order, each at the earliest start
  on any eligible field where the field has its turnover free on both sides, both teams have had their
  rest and are under the day's cap, no arrival limit or closure is hit, and no coach-mate is playing.
  Knockout games wait for every pool game of their division plus rest, and for their feeders; a
  finalist's knockout rounds count toward the cap. About 120 orders are tried (rounds shuffled with a
  jitter; on some tries the last day's pool games are held back to leave room for knockouts, the
  divisions with the tightest game budget go first, and a division that had games left out moves up
  the order on later tries) and the best kept: most placed, earliest finish, shortest longest wait,
  least total waiting. `validateTournament` re-checks every rule from the output alone.
- **Before the search:** a field-hours check per group of divisions sharing fields, and `capFits`, a
  necessary condition on the daily cap: for every spread of the knockout rounds over the days, a pool
  of n gets b_d = cap - rounds_d places per team on day d, and its n(n-1)/2 games fit only if they do
  not exceed the sum of floor(n b_d / 2). It catches the parity case: five teams, top 4, 3 a day over
  two days looks like 6 games in 6 places, but day 1 would need all five teams on three pool games (15
  places, odd).
- **Measured** (`node eval/tournament-search.mjs 200 1` and `200 2`, `eval/tournament-search.txt`):
  400 random weekends (2 to 4 divisions of 4 to 12 teams, 4 to 8 fields of mixed sizes, one or two
  days, shared coaches). 46 were refused by the parser (top N of N in one pool, no field of a size),
  194 were warned up front, and no search placed every game in any of those. On the 160 with no
  warning: every game placed in 83.3% / 88.2% (seeds 1 / 2) by one greedy pass, 92.9% / 96.1% at 120
  tries (the page), 94.0% / 96.1% at 600; the longest wait between a team's games fell from about 320
  to 250 minutes on average. 0 results broke a rule. Random weekends, not real tournaments.
- **Checked:** `tournament.test.mjs` (sample weekend placed in full and clean; parsers; crossover and
  best-runner-up seeds; a one-a-day cap spreading a pool; short field time; the validator catching a
  moved game; exports; 40 random weekends clean; `capFits` cases) and `page.test.mjs` (page wiring).
  The page was loaded in Chromium at phone width: 36 games, no errors, no sideways scroll.
- **Not done:** (results typed into the bracket: above, 2026-11-20) referees for a tournament, a real tournament's
  fields and divisions, an exact model for the 4 to 7% of warned-free weekends the search leaves
  short (some may be infeasible: the checks are necessary, not sufficient).

## The league on the club's own website: a read-only embed (2026-11-20)

Clubs want the schedule on their own site, where new players and parents look. Until now an organiser could
download a static `league-page.html`, which goes stale at the first rainout. The self-hosted server now serves
`/embed?k=...` (`embed.mjs`): a small read-only page made for an `<iframe>` on Wix, Squarespace, WordPress, Google
Sites or a hand-made site, rebuilt from the same state as `/league`, so a posted result or a moved game shows on
the club page within a minute (it is cached 60 s).

- **Its own key.** The player link (`LEAGUE_TOKEN`) can send scores, availability, sub offers and waiver
  signatures, and a website's source is public. The embed key is `HMAC(ADMIN_KEY, "embed\nread-only")`, 22
  characters: nothing new to configure, it opens `/embed` and nothing else, and changing `ADMIN_KEY` retires
  every pasted copy. A wrong key counts against the same per-address limit as a wrong player link.
- **What it shows:** next games (the next 3 match days by default, counting doubleheader rounds on one date as one
  day), the latest 5 results (newest first, winners in bold, forfeits marked) and the table; optionally the whole
  season. Options in the address: `show=next,results,table,season`, `team=N` or `team=Name` (that team's games,
  results and byes, its row highlighted), `nights=1..20`, `results=0..20`, `theme=light|dark|auto`, `accent=hex`,
  `title=`. Unknown values fall back to defaults, so a hand-edited snippet still shows something.
- **The snippet** (organiser page, "On your club's website", one for the league and one per team) is the iframe
  plus four lines of script: the embed posts its height to the parent and the script grows the iframe to fit, so
  there is no scroll box inside the page on a phone. A builder that strips scripts shows it 600 px tall, scrolling.
- **Headers:** `frame-ancestors *` (any site may frame it), `default-src 'none'`, `form-action 'none'`, inline
  style and one inline script only; it loads nothing from elsewhere and has no forms.
- **Alternatives today:** TeamSnap, LeagueApps and SportsEngine offer website schedule widgets as part of paid
  plans; LeagueLineup and similar free hosts put the schedule on their site, with their ads, not yours. A pasted
  table or PDF is free but goes stale. This one is free, ad-free, on the club's own page, and current.
- **Checked:** `embed.test.mjs` (9 tests: key stability and exact check, option parsing and clamps, match days
  not rounds, newest-first results (it caught `results=0` showing every result, since `slice(-0)` is the whole
  list), escaping, the server route: 401 for the player token, the admin key and no key; 405 for POST; no form or
  player token in the page; the embed key refused at `/league` and `/admin`; follows a posted result and the
  server clock; the guide's FAQ and options). `eval/embed-browser.mjs` in real Chromium on a 390 px phone: a club
  page on another origin pastes the snippet; the frame loads with no console or CSP errors, grows to fit with 0 px
  left to scroll inside, no sideways scroll, and the dark theme applies (`eval/embed-browser.txt`; it caught the
  first height being 4 px short, because `documentElement.scrollHeight` includes the frame's own height, fixed by
  measuring the body). Not yet pasted into a real Wix or Squarespace site.
- **Guide:** `how-to-put-a-league-schedule-on-your-website.html` (linked from the main page and the sitemap).

## The player page on a phone's home screen, readable with no signal (2026-11-20)

Players look up their next game at the field, where the signal is often one bar or none. The self-hosted league page
(`/league?t=...`, and a captain's `&c=...` link) is now an installable web app that opens from the last copy the phone
saved (`pwa.mjs`):

- **Install:** the page links a web app manifest for that exact link (`/league/manifest.webmanifest?t=...`), so the
  home-screen icon opens the player's or the captain's own page, standalone, named after the captain's team. Icons
  (192 and 512 px, maskable) are PNGs drawn in `pwa.mjs` with `node:zlib`: still zero dependencies.
- **No signal:** a service worker (`/sw.js`, no secret in it) touches only GET page loads of `/league`. It asks the
  network first and saves each good answer per link (at most 6 links per phone); if the network fails, or takes more
  than 4 s, it shows the saved copy with a yellow note: "No signal: this is the copy this phone saved 20/11/2026,
  18:05. Scores and moves since then are not shown." A slow answer that arrives later still refreshes the copy for
  next time. A refused link (401) never replaces a good copy. Admin pages, forms and calendar feeds are never cached.
- **My team first:** the "Show only" team is remembered on the phone, and a captain's page starts on the captain's team.
- **Alternatives today:** TeamSnap, LeagueApps and SportsEngine ship native apps with offline schedules, behind accounts
  and per-team plans. This gives a self-hosted league the same "open it at the field" behaviour with no app store,
  no account and no install beyond "Add to Home Screen".
- **Checked:** `pwa.test.mjs` (icons decoded and CRC-checked, nothing outside the maskable circle but the background;
  manifests for player and captain links; the worker run against stand-in caches: network first, offline copy marked,
  never-opened link gets the "not saved yet" page, a 401 keeps the good copy, 6-link cap, a 4.8 s network answered from
  the copy in under 4.5 s and saved afterwards; the server routes). `eval/offline-browser.mjs` in real Chromium:
  worker controls the page, Chromium reads the manifest with no errors and reports no installability errors, offline
  reload shows the saved fixtures with the note and the remembered team (`eval/offline-browser.txt`; it caught the
  remembered team being restored before the filter existed, fixed). Not yet tried on a real phone at a real field.
- **Limits:** a phone shows only what it saved the last time it had signal; a page opened for the first time offline
  shows "not saved yet". iOS keeps a home-screen web app's saved data, but Safari may clear a site's storage after
  weeks unused in the browser tab.

## Golf leagues on two courses, or a 27-hole course's three nines (2026-11-20)

`golf.mjs` (`parseRotation`, `parseCourses`, `playingHandicap`, `ratedDiff`), `golf-playoffs.mjs`,
`golf-league-schedule.html`; tested in `golf-courses.test.mjs` (8 tests, every number worked by hand in its comments).

**Who it is for.** Leagues that do not play one 18-hole course front/back: two clubs that take turns
hosting, a home course and a sister course, or a 27-hole facility whose Red, White and Blue nines rotate.
Until now the page assumed one card, so such a league had to score each course's nights by hand.

- **Schedule.** An optional rotation, repeating over the season: "Oak front, Pine front, Oak back, Pine
  back", or "Red, White, Blue" (a name alone is a 9-hole course). The whole league plays the same course a
  night, as a course books a league; the CSV gains a Course column, the text and table name the course,
  and the counts table shows each team's nights at each course. Play-off nights carry on the rotation.
- **Cards.** One card per course under a "Course: Oak" line. A 9-hole card takes 9 pars and 9 index
  numbers (odd or even ones, as 27-hole cards print them). Each night is scored on its own course's card,
  tees included; a player's tees missing from a course they play, a rotation course with no card, an 18-hole
  course with no nine named, or several cards for a one-course schedule are each named, not guessed.
- **Rating and slope (optional, all courses or none).** Over par, a nine at a hard course counts like one
  at an easy course, so a league that moves between them drifts. With "Rating:" and "Slope:" (per nine, or
  the 18-hole numbers, halved for rating) the handicaps follow the World Handicap System's arithmetic: each
  round's differential is (adjusted gross - rating) x 113 / slope; the league index is the average of the
  rounds counted (one decimal, capped); tonight's strokes are handicap% x (index x slope / 113 + rating -
  par), rounded, 0 to the cap. Entering handicaps are read as an index. Worked: index 10 at 90% is 8 strokes
  on a par-36 nine rated 35.0/113 and 12 on one rated 37.5/135. Match play across tees keeps the par
  adjustment above (it compares gross strokes, so it is still needed with rating - par in the handicap).

**Limits.** One course a night (a league split over two courses on the same night is not modelled);
a rated league index is still a league handicap, not a Handicap Index; the 18-hole rating halved per nine
is an approximation when a card gives no 9-hole ratings. Not yet used by a real league.

## Golf leagues: tee times rotated evenly, match play scored with handicaps (2026-11-20)

`golf-league-schedule.html`, `golf.mjs`, `golf-tee-table.mjs`; tested in `golf.test.mjs`.

**Who it is for.** Twilight nine-hole leagues of two-person teams at public and club courses. Today the
league secretary keeps a spreadsheet, or pays for golf league software whose two core jobs are the weekly
tee sheet and the match play points with handicap strokes (prices not checked here). This page does both, free, in the browser.

**Schedule.** The round robin repeats over the season; the nine alternates front/back (front first or back
first) or stays fixed; every group gets a tee time (first tee and minutes between groups) or a shotgun
starting hole (1-9 or 10-18, then 1B, 2B...). An odd league's bye team keeps a tee time and plays the course.
Tee times are dealt so each team has each slot as evenly as its weeks allow (floor/ceil of weeks over
slots): a Hungarian assignment per week priced on the counts so far and on last week's slot, swept to a
fixed point, random re-deals kept only when better, then a tabu search over in-week swaps aimed at the
teams still off their share. For 6 seasons the search missed, a SAT solver's deal is stored and re-checked
in the browser before use (`golf-tee-table.mjs`).

**Measured** (`node eval/golf-tee-grid.mjs`, `eval/golf-tee-grid.txt`): 77 seasons, 4-20 teams by 10-22
weeks. Every team at its share in 71 (849 of 868 teams); a hand rotation (each group one slot later each
week) in 4 (90 of 868). The other 6 a SAT solver proved out of reach for this round robin
(`eval/golf-tee-sat.py`, `eval/golf-tee-sat.txt`): 4 teams over 10, 14, 16, 20 and 22 weeks, 20 teams over
10; the page says so (`boundProvedOutOfReach`). Worst build 1.1 s in Node. Repeats (same slot two weeks
running) are counted and shown but come second to the share: 841 over the 77 seasons.

**Weekly scoring** (`golfRecap`). Course card (par and stroke index, 18 holes), rosters, optional entering
handicaps and hole-by-hole cards ("Ana: 5 4 6 3 5 4 5 6 4", "Ben absent"). Low v low handicap pairings;
the higher handicap gets the difference in strokes on the nine's hardest holes (ranked by stroke index
within the nine), a second round past 9. Points per hole (split on a half), per pairing low net, team low
net (defaults 1, 1, 2: 22 a match). League handicap: handicap % of the average of the best N of the last M
rounds' adjusted score over par, net double bogey cap per hole, rounded, capped (defaults 90%, 5 of 5,
18); entering handicap, else the first card sets it that night. Absent: the opponent takes the pairing's
holes and net point; the absentee counts par + 3 in the team net. Bye: each player against net par with
their full handicap. A night worked by hand is in the tests (Hawks 12.5, Owls 9.5) and on the page.

**Limits.** A league handicap only, not a Handicap Index under the World Handicap System; no score
posting; subs play under the rostered name. Flighted play-offs and two-course leagues have landed since
(sections below). Not yet used by a real league.

**Tee rows and skins (2026-11-20, later).** The course card takes more sets of tees ("Par (forward):",
"Index (forward):"; a tee giving one row keeps the main tees' other) and a roster marks a player's tees
("Ben (forward)"). Handicaps are worked over the player's own par and net double bogey on their own holes.
Across tees, the player whose tees have the higher par for the nine gets the difference as extra strokes
(the World Handicap System's mixed-tee adjustment, applied here to a league handicap), on the receiver's own
stroke index; team net is each net over own par, put on the main par. Skins (`skinsGame`): gross, net (a
share of the handicap) or both; one low score on a hole wins it, a tie wins nothing or carries over; players
on different tees compared against their own par; an optional entry makes a pot shared by the skins won, and
a night with none won returns the entries. Worked by hand in `golf.test.mjs`: a forward-tee 5 against a 2
(6 v 2 after the par step, 4 strokes on holes 1, 2, 4, 6; 5.5 - 4.5), the Hawks/Owls night's gross skins
(Cy 5, Ana 3, hole 4 tied) and net skins (only hole 8 not tied, Dee), and carry-over (4 and 5 skins share a
pot of 15 as 6.67 and 8.33).

## Americano and Mexicano scorer (2026-11-19, `americano-night.html`, `night.mjs`)

The Americano card on the main page builds a rotation sheet; it stopped there, so an organiser at the courts
still kept score on paper or in a separate app. `americano-night.html` is the night itself, on one phone:

- **Set up:** players, courts, rounds (empty = the full rotation for Americano, or keep drawing for Mexicano),
  points per game (16, 21, 24 or 32 to a total, or any score) and the sit-out rule.
- **Americano** deals every round at the start with `americano()` from `calc.mjs`, so the stored whist designs
  apply (every size 4k or 4k+1 up to 64 on a court per four: everyone partners everyone once). **Mexicano** draws
  round one at random and each later round from the table with `mexicanoNextRound()`; the draw button stays off
  until the last round is fully scored.
- **Scores court by court:** with a points total, typing one side fills the other; a pair that does not add up
  (a game stopped by the clock) is kept and flagged. Both partners get their side's points; the table ranks by
  total, then points difference, then wins, and ties share a rank.
- **Sit-out credit:** `none`, `average` (the player's own points per game so far; the default) or `half` (half
  the target), added only once that round is fully scored and shown separately. Measured on simulated nights
  (`eval/sit-out-credit.mjs`, `.txt`: 2,000 nights per size 5-15, not multiples of four, 6 rounds to 24, hidden
  skills, points drawn from a logistic model): with no credit the most skilled player wins 54.2% of nights, with
  the average credit 62.5%; the credit changes the winner in 26.7% of nights, and in 72.8% the no-credit winner
  had sat out fewer rounds than someone else. 6 players on 1 court is the control: everyone sits out equally and
  no rule changes anything (0.0%). These are a model's numbers, not a real club's.
- **Kept on the device:** the night is saved in `localStorage` after every score (a refresh or closed tab loses
  nothing; storage blocked = the night lives in the tab). **Share** puts a read-only copy inside the link
  (`#night=`, base64url JSON, checked by `checkNight` before it is shown); nothing goes to a server. Copy
  standings as text, CSV (formula-guarded) or print.
- **Checked:** `night.test.mjs` (10 tests: scores, sit-out rules, Mexicano draw from the table, exports, link
  round trip and damaged links, every size 4-64 valid) and a Playwright pass at iPhone 13 width (example night,
  auto-fill, resume after reload, read-only link, Mexicano draw; no console errors, no horizontal scroll).

## Return leg in reverse order: a third fewer back-to-back home or away games (2026-11-20)

A double round robin used to play its return leg as a straight mirror: round 1 again with venues swapped, then round 2, and so on. Across the halfway line that gives most teams a second home or away game in a row. A new option, "Play the return leg in reverse order" (page checkbox under Double round robin; `reverseLeg: true` in `readSpec`/`buildSchedule`/`roundRobin`; the self-hosted admin has the same box; it travels in share links), plays leg one's rounds backwards with venues swapped, so every team flips home/away at the halfway line.

Measured over 4 to 20 teams (`node eval/reverse-leg.mjs`, `eval/reverse-leg.txt`):

| | mirrored | reversed |
|---|---|---|
| breaks, even n | 3(n-2): 12 at 6 teams, 30 at 12, 54 at 20 | 2(n-2): 8, 20, 36 |
| breaks, odd n | n-2: 3 at 5 teams, 17 at 19 | 0 |
| worst team | 3 | 2 (even), 0 (odd) |
| shortest rematch, weekly league | (n-1) weeks or more | 1 week |

The cost is the last column: the pairs that close leg one open leg two, so they meet on consecutive weeks (the rematch report under the schedule shows it). That is why it is an option and not the default (quality audit round 87 named both sides). Each pair still plays once at each ground, and `validateSchedule` passes every size tested. With carry-over spreading on, the search picks its own second leg, so the option is not applied and a notice says so; with several games a night the reversed leg is kept (`reverse-leg.test.mjs`).

## Run your own league page (self-hosted)

The browser tool builds the season; `server.mjs` gets it to your players. You keep the setup and post results in
`/admin?key=...`; your players open **one link** (`/league?t=...`) to see every fixture, the standings and the
play-off bracket, and add their own team's schedule to their calendar (`.ics`). No accounts, no per-team fee, no
third party: zero dependencies, one JSON file on a disk you own.

- **Alternatives today:** TeamSnap, LeagueApps and SportsEngine hold your players' data behind per-team accounts and
  paid plans. This is the sign-up, publish-fixtures-and-table loop for one league, MIT-licensed. Team sign-ups take
  the fee on the organiser's own payment link (it never handles a card); waivers, notices, availability and
  sportsmanship ratings are below. It has no in-app chat or card processing; use one of them if you need those.
- **Secrets:** `ADMIN_KEY` unlocks `/admin`; `LEAGUE_TOKEN` is the secret in the player link. The server refuses to
  serve without both. Put it behind HTTPS (Fly and Render do); keys are in the URL, so do not share admin links. Ten wrong links from one address lock it out for 15 minutes (HTTP 429); behind a proxy the last `X-Forwarded-For` hop is used.
- **Run:** `ADMIN_KEY=a LEAGUE_TOKEN=b STATE=./state.json node server.mjs`, or `docker compose up -d`
  (`docker-compose.yml`), Fly (`fly.toml`), or Render (`render.yaml`, deploy from your fork; it generates both
  secrets). Nothing runs on the author's accounts.
- **On a phone, with no signal (2026-11-20):** the player and captain pages install to the home screen and open from the last saved copy when the field has no signal (`pwa.mjs`; section "The player page on a phone's home screen" above).
- **Calendar feeds:** the player page links a subscribe-able feed for the whole league and each team (`webcal://`, Google Calendar, or the plain address). Optional `PUBLIC_URL=https://league.example.org` fixes the address in those links; without it the request's host is used (README "Calendar files that follow a rainout").
- **Score reports:** the player page has a "Report a score" form. A report only waits in `/admin` ("Scores waiting for you"); **Approve** appends it to Results as `Hawks 3 - 2 Owls`, **Decline** drops it, and the table never changes until you approve. At most 100 wait at once.
- **Captain links and confirmed scores (2026-11-18, `confirm.mjs`):** `/admin` lists one captain link per team (`/league?t=LEAGUE_TOKEN&c=KEY`; the key is an HMAC of the team name under `ADMIN_KEY`, 22 characters, nothing stored), and with SMTP on, **Email each team its captain link** sends each team's link to its contacts only. A captain's page shows their team's games from the last 21 days, each with its state and a score form. When the other captain sends the same score, the line (`Hawks 3 - 1 Owls`, home first) goes into Results straight away and the game is closed, so it cannot be added twice (reports are keyed by fixture id, which follows a rained-out game). Different scores, and games only one captain has reported, wait in `/admin` under **Captain reports** with both scores side by side and **Use Hawks's** / **Use Owls's** / **Clear reports** buttons; a captain can resend to fix a typo until the game is closed. A wrong captain key counts as a wrong link for the lockout. What this replaces: the organiser typing or approving every score, which is the chore score-confirmation in paid league apps exists to remove. Limits: anyone holding a team's captain link can report for that team (the same trust as the league link), a score the organiser typed by hand is not matched to a fixture, so do not also approve that game from captain reports, and nothing here is a dispute process: the organiser's choice is final. Tested in `confirm.test.mjs` (keys, confirm and dispute, the 21-day window, the full server flow and the emails); not yet used by a real league.
- **Player waivers (2026-11-18, latest, `waivers.mjs`):** under **Waiver** in `/admin` the organiser pastes their own
  release or code-of-conduct text. Each distinct text is a version (the first 16 hex characters of its SHA-256), kept
  with the date it was first set, so every signature points at the exact words agreed to; `/admin/waiver.txt?v=ID`
  returns any version as signed. Players sign at `/league/waiver?t=LEAGUE_TOKEN` (linked from the league page): team,
  full name, optional email, a tick, and the full name typed again as the signature; for a minor the parent or guardian
  signs with their own name. With a waiver set, the captain signs on the `/register` form too. `/admin` matches
  signatures to each roster (a first-name roster entry matches only when one signer on that team has that first name,
  never a guess between two) and lists per team who signed, who signed an earlier version and who has not; a captain's
  page shows the same for their team. **Download every signature (CSV)** has time, team, name, guardian, email,
  version, whether it is current and where it was signed; a mistaken signature can be removed. Signing again replaces
  that person's row for the same version. No IP addresses are kept.
  What it replaces: a paper sheet at week one, a form tool matched to rosters by hand, or a waiver app on a monthly plan.
  What it does not do: draft legal text, check identity, take a drawn signature or judge enforceability (that and the
  age at which a player signs for themselves depend on where you play: ask a lawyer or your league's insurer). Tested in
  `waivers.test.mjs` (versions, signatures, roster matching, the version cap and the full server flow); not yet used
  by a real league. Guide: `how-to-collect-player-waivers-for-a-rec-league.html`.
- **Sportsmanship ratings (2026-11-18, latest, `spirit.mjs`):** off until the organiser picks a scale under
  **Sportsmanship ratings** in `/admin`: five categories scored 0 to 4 (rules knowledge and use, fouls and body
  contact, fair-mindedness, positive attitude and self-control, communication; the shape of the spirit sheet ultimate
  leagues use, 2 each and 10 in all for a normal game) or one score from 1 to 5. Each captain's page then lists their
  games from the last 21 days with a rating form for the other team, starting at a normal game, with an optional
  comment for the organiser only (300 characters); a captain can change their rating while the game is in the window.
  `/admin` shows the table (games rated, average, per-category averages, low ratings, ratings given and the average
  each team gives, so a hard marker shows), the low ratings (a 0 anywhere or 6 or less in total; 2 or less on the 1-5
  scale) with their comments, and per team the games it has not rated; **Download every rating (CSV)**
  (`/admin/spirit.csv`) has one row per rating, formula cells guarded. Tick **Show the sportsmanship table** and the
  league page gets each team's games rated and average, never comments. Ratings are keyed by fixture id and side, so
  they follow a rained-out game; a withdrawn team's games are pruned; switching the scale starts the averages again
  (old ratings stay in the state file).
  - Alternatives: a paper or Google Form spirit sheet typed into a spreadsheet each week; the spirit-score features in
    paid league platforms. This collects them from the captain link teams already use for scores, and points out the
    hard marker as well as the low score.
  - Checked: `spirit.test.mjs` (6 tests: settings, form checks, the table with categories, given averages and a changed
    rating, scales kept apart, pruning, the unrated list and its window, escaping, the CSV and its formula guard, and
    through the HTTP server: off by default, turned on from the admin form, two captains rating, a change, a third team
    and the plain link refused, the admin table and CSV, the public table only when ticked and with no comments, and a
    scale switch). The guide's worked table is recomputed in `page.test.mjs`. No real league has used it yet.
- **Notices from the organiser (2026-11-18, `announcements.mjs`):** `/admin` has a **Notices** form: up to
  1,000 characters, **Who sees it** (everyone, on the league page under "From the organiser", or one team, on that
  team's captain page only), **Show until** (a date; blank means two weeks), and **Also email it to the team
  contacts** (needs SMTP). Each notice is listed in `/admin` with who it was for, when it ends and how many teams were
  emailed, with a **Remove** button. Text is escaped; plain `https://` links become clickable, nothing else. Emails go
  one per team to that team's Contacts, carry the plain league link (never a captain key) and name the teams with no
  address so the organiser tells them by hand. At most 30 notices are kept.
  - Alternatives: the organiser's group chat or a mass email, which players lose and late joiners never see; TeamSnap,
    LeagueApps and SportsEngine messaging, on paid plans with an account per player. This puts the notice where
    players already look for the schedule, with an end date so old news drops off by itself.
  - Checked: `announcements.test.mjs` (6 tests: input checks, the cap, audience and end-date filtering, escaping and
    link rules, per-team emails, and through the HTTP server: post, see it on the league page, a one-team notice only
    on that captain's page, emails to the teams with contacts, removal, and SMTP off). Not yet used by a real league.
- **Move requests (2026-11-18, `reschedule.mjs`):** a captain's page lists their team's next 12 games, each
  with **Ask to move this game**: pick a later date (up to 180 days on) and an optional note. The date is checked
  against the live season before the request is stored: the season is rebuilt with the Rainouts line the organiser
  would type (`2026-10-20 Hawks, Owls -> 2026-10-22`), and the request is refused with the reason unless the game
  lands on that date (both teams free, not blacked out, a court and slot open, the team limits kept) and no other game
  moves. The other captain sees the request on their own captain link, with the note, and clicks **Agree** or
  **Decline**; with SMTP on, their team's contacts get one email with their captain link. An agreed move shows in
  `/admin` under **Move requests** with **Approve the move** and **Refuse**. Approve re-checks the date against the
  season as it is now, appends the line to Rainouts (so it stays visible and editable), and, with SMTP on, sends both
  teams the usual change email; a date that no longer fits closes the request with the reason. Only later dates
  (the rainout mover's rule); a night when either team plays twice is refused, since a rainout line names teams, not one
  game. Requests are keyed by fixture id and dropped when the game passes or another edit moves it. Captains can
  withdraw their own; one open request per game; 200 at most in the state file.
  - Alternatives: LeagueApps and TeamSnap handle reschedules as messages between coaches and an admin who edits the
    game by hand; a group chat does the same with no check that the new date is free. This checks the date first, gets
    both captains' agreement in the open, and turns the organiser's part into one click.
  - Checked: `reschedule.test.mjs` (9 tests: a free day lands with no other fixture moved and the schedule valid; a
    night either team plays, an earlier date, a blacked-out team and a doubleheader night are refused; the request
    state machine (only the other captain answers, only the asker withdraws, one open request a game, re-asking after a
    decline); pruning; escaping of the note; and through the HTTP server: ask, agree, approve with the line written,
    the game on its new date and three emails sent; a misfit date refused at once; another team's captain and the plain
    link refused; approval before agreement refused; refuse shown to captains; a blackout added after agreement making
    approval fail). No real league has used it yet.
- **Who's playing (2026-11-18):** the player page lists the games on the next two match days with a count per team (`5 in of 7, 1 maybe, 2 out`, then the names), and one form: pick the game and team, type a first name, choose In, Maybe or Out. The same name (any case) answering again changes its answer; answers are keyed by the fixture id, so they follow a rained-out game to its new date; answers for games no longer coming up are pruned on every write, and a team takes at most 60 names a game, so the state file stays small. In `/admin`, set **Players a team needs on the night**: the admin page then lists every team below it for those games (`Owls: 3 in, short 4; 2 maybe, 1 out`) with a message to paste into that team's chat, so a forfeit is seen days ahead, not at the court. Anyone with the player link can answer for any name, the same trust as the link itself; there are no accounts. `availability.mjs`, tests in `availability.test.mjs`.
- **Subs (2026-11-18):** the player page has a **Subs** section: anyone free on one of the next match nights types a first name and clicks **I can sub** (or **Take me off**). In `/admin`, every team short of players shows the subs free that night, each with a **Place** button; placing one writes an In answer for that team's game marked `(sub)`, so the team stops showing as short, the counts on the league page include them, and the CSV says `in (sub)`. A sub already In for their own team that night, or already placed, is not offered again. The copy-ready nudge and the reminder email list the free subs too (`Subs free that night: Dee, Eli.`). A placed sub who takes themselves off also comes off that team, so the team shows short again. The pool keeps only the coming nights and at most 40 names a night. `subs.mjs`, tests in `subs.test.mjs`.
- **Alternatives for subs:** a spreadsheet or group chat of "sub list" names, matched by hand to whoever is short; team apps track RSVPs per team, not a pool across the league. This matches the pool to the short teams by night.
- **Alternatives for availability:** TeamSnap, SportsEngine and Spond track RSVPs per player account (TeamSnap's free tier caps it; paid plans per team); a group-chat poll has no minimum and no per-game view across the league. This is the per-game count and the short-team list, with nothing but a name.
- **Rosters, answers CSV and reminders (2026-11-18):** three follow-ups to availability, all in `/admin`.
  - **Rosters** (optional): `Hawks: Ana, Ben, Cara`, one team per line. On the player page the name box then suggests the picked team's names (a `<datalist>` per team, switched by a few lines of script; with no script, or for a sub, any name is still taken), and each team's line ends with *No answer yet: Cara*. The organiser's paste-ready message names them too (`Not heard from: Cara.`). Unknown teams and bad names are listed on the admin page, not guessed; 40 names a team at most.
  - **Answers CSV**: *Download everyone's answers* (`/admin/availability.csv?key=...`, add `&nights=N` for more match days) gives one row per player per game (date, time, court, team, opponent, player, answer, answered_at in UTC) plus a `no answer` row for each roster name not heard from. Names that a spreadsheet would run as a formula (`=`, `+`, `-`, `@`) are prefixed with an apostrophe.
  - **Reminder emails** on the deployer's own mail account, off unless `SMTP_HOST` is set (`SMTP_PORT`, default 587; `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; `REMINDER_TO` is the organiser's address, copied on every reminder; `PUBLIC_URL` puts the league link in the email). At start and every hour the server sends one email per team per game to any team still short of the minimum two days out or less, to that team's contacts (*Team contacts for reminder emails*: `Hawks: captain@example.org`) and the organiser, naming the count, the maybes and the roster players not heard from. A sent reminder is remembered in the state file, so a team gets one per game; a failed send is retried next hour. The client (`mailer.mjs`, no dependencies) uses TLS on 465 or STARTTLS when offered, and never sends a password over an unencrypted connection except to localhost. Contacts accept plain addresses only, and the subject and headers are stripped of line breaks, so nothing typed can add a mail header. Contacts stay in the state file and never reach the player page.
  - Checked: `availability-roster.test.mjs` (parsing, the no-answer lists, the CSV, which reminders are due and to whom, once-only sending, a fake SMTP server for AUTH PLAIN, a refused recipient and a refused login, the server's CSV route) and a Chromium run of the player page (the name box follows the picked team's roster; a team with no roster takes free text; the answer saves). Not checked: STARTTLS and TLS against a real provider (the tests' fake server is plain text), and real inbox delivery. On Fly with `min_machines_running = 0` the hourly check only runs while the machine is awake.
  - Alternatives: TeamSnap and Spond send RSVP reminders to every player account (TeamSnap's free tier limits it); this sends one email only when a team is short, from the league's own mail account, with no player accounts.
- **Schedule-change emails (2026-11-18, latest):** when you save a published league, the server compares the season
  before and after the save fixture by fixture (each match keeps its id through rainouts, withdrawals, late teams and
  any other edit) and lists the upcoming games that moved, were cancelled or were added (`5 upcoming games changed for
  6 teams (Hawks, Owls, ...)`). Tick *Email teams whose upcoming games this save moves* and each affected team gets
  **one** email, to its contacts with the organiser copied, listing only its own games from its side (`- vs Owls
  (home): was Tue 13 Oct 2026 18:00, Court 1, now Tue 27 Oct 2026 19:00, Court 2`; `- at Kites (away): Tue 3 Nov 2026 is cancelled`),
  with the league link. Past games are never reported; a team with no contact address is named in the admin note so
  you can tell it yourself; past 40 changes the email lists the first 40 and points to the page. Unticked, or with
  SMTP off, the note still shows the summary and nothing is sent. `changes.mjs`, tests in `changes.test.mjs` (moved,
  cancelled and added fixtures, past games ignored, one email per team with only its games, the box unticked, SMTP
  off, a second save with no change sending nothing).
  - Alternatives: TeamSnap, LeagueApps and SportsEngine notify every player account of a schedule change on their
    paid plans; a spreadsheet league re-sends the whole sheet and leaves each team to spot its own moved game. This
    sends each team its own changed games only, from the league's own mail account, with no accounts.
- **Team sign-ups (2026-11-18):** tick *Open sign-ups* in `/admin` and share `/register` (a public page, no secret in
  the link) in the club newsletter or group chat. A captain types the team name, their name, email, optional phone,
  the players and a note. Each sign-up waits in `/admin` ("Sign-ups waiting for you"): **Approve** adds the team to
  Teams, the captain and players to Rosters and the captain's email to Contacts (so availability and the short-team
  reminders work for the new team at once), **Decline** drops it.
  - **Cap and waitlist:** set *Most teams*; once the teams listed plus the sign-ups waiting reach it, the form says the
    league is full and later sign-ups go on a numbered waitlist, shown apart in `/admin`. *Sign-ups close after* shuts
    the form at the end of that date (UTC).
  - **Fee:** type the fee as you want it shown (`$450`) and, optionally, your own payment page (a Stripe, Square or
    PayPal payment link you made; only plain `https://` links are shown). After signing up, the captain sees the fee,
    the link and the team name to put in the payment's note; you tick **Mark paid** per team, before or after
    approving, and the "Approved, fee not marked paid" list shows who still owes. This server never sees a card, a key
    or a payment status.
  - **Emails:** with SMTP set (the same settings as reminders), the captain gets a confirmation (copied to
    `REMINDER_TO`) with the fee link; a decline sends nothing, so tell the team yourself.
  - **Records:** *Download every sign-up (CSV)* (`/admin/signups.csv?key=...`) lists approved, waiting and waitlisted
    teams with captain, email, phone, players, paid and the time they signed up (cells a spreadsheet would run as a
    formula are prefixed with `'`).
  - **Abuse limits:** the page is off until you open it; five sign-ups per address per hour (HTTP 429), 200 waiting at
    most, a hidden honeypot field, a 64 KB form cap, and team names limited to what the schedule, results and roster
    lines read back (no `:` `,` `;` `<` `>` or quotes, no leading list number, at least one letter, 40 characters).
  - **Approving after you publish** rebuilds the round robin with the new team. If the season has started, also add a
    Late teams line (`2026-11-03 Newbies`) so its earlier games move rather than fall in the past; `/admin` says so.
  - Alternatives: LeagueApps, SportsEngine and TeamSnap run registration with card processing and waivers on paid
    plans or a per-transaction fee; a Google Form plus a payment link is free but leaves the organiser to copy each
    team into the schedule and rosters by hand. This is the Google-Form route with the copying, the cap and the
    waitlist done for you.
  - Checked: `registration.test.mjs` (11 tests: team-name rules that the schedule, results and roster parsers read
    back; required fields, duplicates and the honeypot; cap and waitlist order; closing date; approve into Teams,
    Rosters and Contacts with the league still building and a result for the new team parsed; the paid tick; the CSV
    and its formula guard; the per-address limit; the payment-link filter; the confirmation email; and through the
    HTTP server: closed by default, sign-up, waitlist, kept values on a bad form, admin approve, decline, paid and CSV,
    and saving the settings). No real league has used it yet.
- **Free agents: players with no team (2026-11-18, latest, `freeagents.mjs`):** tick *Take free agents at `/join`*
  in `/admin` and share `/join` (public, like `/register`, which links to it while it is open). A player types their
  name, email, optional phone, how much they have played (new, a season or two, experienced), optionally a friend who
  is also signing up on their own, and a note (nights they cannot play, a position). Each waits in `/admin` under
  **Free agents waiting** with a team already picked in a drop-down: groups (a player and the friend they named, by
  full name or by a first name only one waiting player has; never a guess between two Sams; at most four) go most
  experienced first, each to the team with the fewest players (its Rosters line plus players suggested so far), ties
  to the team that has had the least experience from free agents, and no team past the *roster size to fill up to*
  (0 = no limit); a group that fits no team says why. **Place** (with the pick or another team) or **Place all as
  suggested** adds the name to that team's Rosters line, so the availability counts, the short-team reminders, the
  waiver list and the captain page see the player at once. With SMTP on, the player gets one email with their team,
  the team's contact address and the league link, and the team's contacts get the player's name, email, phone,
  experience and note (both copied to `REMINDER_TO`); a team with no contact is named in the admin note. **Remove**
  takes a player off without an email. *Download every free agent (CSV)* lists placed and waiting players with their
  team and times (formula cells guarded). An optional fee is shown as text; it is paid however the organiser says.
  Same abuse limits as `/register`: off until opened, a closing date, five joins per address per hour, a honeypot, 300
  waiting at most; a name already on that team's roster, or a full roster (40), is refused rather than renamed.
  - Alternatives: LeagueApps, SportsEngine and TeamSnap take free-agent registrations on paid plans and leave the
    organiser to assign them by hand; a Google Form gives a list to copy into rosters, with no view of which team is
    short. This keeps the list next to the rosters, picks a fair team for each player and does the copying and the
    introductions.
  - Checked: `freeagents.test.mjs` (8 tests: form checks and the honeypot; settings and the per-address limit; friend
    groups by full name, a unique first name and the four-player cap, two Sams left alone; suggestions on six sample
    teams: three experienced players spread over the three short teams, a pair kept together on the next-smallest, the
    size cap leaving a pair unplaced with the reason; placing into an existing line, an empty line and a team with no
    line, all read back by the league's own roster parser, a roster name clash and a full roster refused; both emails
    and the one-email case with no contact; the CSV formula guard and escaping in the admin list; and through the HTTP
    server: closed by default, opened from the admin form, two joins with a friend link, a bad form keeping what was
    typed, place-all landing the pair on the smallest roster with four emails, the CSV, a single placement, a removal,
    a wrong admin key, and SMTP off). No real league has used it yet.
- Tests: `node --test server.test.mjs deploy.test.mjs availability.test.mjs availability-roster.test.mjs registration.test.mjs confirm.test.mjs reschedule.test.mjs spirit.test.mjs freeagents.test.mjs`.

Open `index.html`. No build step, no dependencies. `node --test '*.test.mjs'` runs the suite.

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
- Doubleheaders (`Games per team per night`, 2 to 4): consecutive rounds share a night and the round robin is rearranged so each team plays its games back to back where the courts allow (README "Doubleheader nights").
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

**Americano (rotating partners).** For social padel, pickleball, badminton and tennis nights, "Build rotation" takes the players, the number of courts and rounds, and re-pairs everyone each round so people partner and oppose as many different players as possible. With a court for every four players and 4k or 4k+1 players it is a whist design: everyone partners everyone else exactly once and faces each of them exactly twice (section "Americano: partner everyone once, face everyone twice"). Sit-outs and games are shared within one of even, repeat partnerships are otherwise minimised by a seeded search and counted, and a validator re-checks the plan (`americano`, `validateAmericano`, `americanoStats`, `americanoText` in `calc.mjs`; tested for every size from 4 to 24 players). Not an official rating system: it does not score or rank the night.

**Mexicano (draw from the table).** For padel and pickleball nights where each round is drawn from the standings, "Draw next round" takes the players, the courts and every finished game (`Ana & Ben 21-17 Cy & Dee`), credits each player with their side's points, and pairs the leaders together: 1 & 4 against 2 & 3 in each group of four, or a split that avoids repeating a partner. The player who has played most sits out, and round one with no scores is a seeded random draw (`parseMexicanoScores`, `mexicanoStandings`, `mexicanoNextRound`, `mexicanoText` in `calc.mjs`; tested for 4 to 20 players on 1 to 3 courts, with games staying within one of even). A format helper, not a rating system.

**Forfeits.** In the results box, `Hawks w/o Owls` (or `wo`, `walkover`) awards Hawks the win at 3-0, counted in the table, goal difference, head-to-head and the play-off race like a played game. Leagues score forfeits differently, so apply your own rule by typing the score you want instead (`parseResults` in `calc.mjs`, `walkover` option).

**A message per team.** "Download a message per team" writes one ready-to-paste note for each team ("Hi Hawks, your fixtures: ...") with only that team's dates, venues, opponents and byes, so a coordinator can message each team instead of forwarding the whole league (`teamMessages` in `calc.mjs`).

**Third-place match.** Tick "Third-place match" next to the play-off size (single elimination, four or more teams) and the losing semi-finalists play `3P` on the final's day (`playoffBracket(seeds, { thirdPlace: true })`). The share link now also carries the double-elimination and third-place ticks; the double-elimination tick was being dropped on open.

## 57 players: a whist design from the projective plane of order 7 (2026-11-19, newest)

57 was the last whist size up to 64 with no stored design: 3.7 CPU-hours of starters and table matching,
55 CPU-minutes of tabu search and 100 CPU-minutes on Z19 x| Z3 found nothing (sections below), so a
57-player Americano night on 14 courts fell back to the greedy search. The search was the wrong tool;
a structure finds it in seconds.

**The construction.** 57 = 7^2 + 7 + 1, the number of points of the projective plane of order 7, and that
plane has a cyclic model: its 57 lines are the translates D + s of the Singer difference set
D = {0, 1, 3, 13, 32, 36, 43, 52} in Z57 (every nonzero difference of D occurs exactly once, so any two
points lie on exactly one line). A line has 8 points, and 8 players have a whist design of their own
(Wh(8), already stored). Seat that Wh(8) on every line the same way, shifted with the line. Then each
pair of players, lying on exactly one line, partners exactly once and meets exactly twice across the
whole season, which is what a whist design asks. What is left is fitting it into rounds: the base round
must be the 14 tables of the Wh(8) on D, table i moved by its own shift t_i, with the 14 moved tables
disjoint and covering every player but 0. Developing that base round over Z57 puts on each line D + s
exactly the Wh(8) shifted by s. Choosing the shifts is an exact-cover problem (14 tables x 53 allowed
shifts against 56 players), solved by dancing links; the seating of the Wh(8) on D is free, so the
program tries random seatings until one has a cover.

**Result** (`eval/whist-singer.c`, `eval/whist-singer.txt`): 10 of 10 seeds find a base round, after 1 to
49 seatings, in 0.05 to 22 s (median under 4 s) on one core. The stored base passes `checkWhist` pair
by pair when `eval/whist-bases-build.mjs` builds `whist-bases.mjs`, and a test checks that every one of
its tables lies on a Singer line.

Why the earlier searches missed it, as far as can be said: they searched base rounds with no structure,
where a design is a needle (the starter section estimates about 0.5 designs per starter, and the tree's
heavy tail ate the budget). Here every pair condition holds by construction, and only a disjointness
problem with tens of solutions per seating remains.

What it changes on the page (57 players, 14 courts, `americano` with and without designs, seed 57):

| | rounds | games each | repeat partners | pairs never partnered | times a pair meets |
|---|---|---|---|---|---|
| before (greedy) | 57 | 56 | 87 | 87 | 0 to 5 |
| now (design 57) | 57 | 56 | 0 | 0 | exactly 2 |

It builds in 9 ms instead of about 300 ms. Stored now: every whist size from 4 to 64 (52 by the starter
search, 57 by this construction); 51 still plays design 52 with one empty seat and near-whist covers
every 4k+2 from 6 to 62. The same idea needs a projective plane whose lines hold a multiple of 4
points, more than 4: order 3 fails (a Wh(4) table is a whole line, and two lines always meet), order 11 gives 133
players, past the 64 the card takes. Tested in `whist.test.mjs` ("57 players on 14 courts play the
Singer design", "every table of the stored base lies on one line").

## A second route to 57, and one that reaches 69: a base round fixed by multiplying by 37 (2026-11-19)

Another run on the same afternoon reached 57 by a different structure, before the Singer construction
above landed. It is kept as a check and as a method for sizes that are not projective planes. The page
still plays the Singer base (the build keeps the first file's base for a size).

The units mod 57 have two involutions besides -1: 20 and 37. `eval/whist-involution.c` searches only
base rounds that multiplication by m maps onto themselves. It starts from a random m-invariant layout
(37 fixes 19 and 38, which must share a table as {19, 38} vs {x, 37x}; every other table is either fixed
by m or paired with its image) and anneals with moves that swap p with q and m*p with m*q together.
That swap commutes with the multiplier, so every state stays invariant. The cost is
(partners(d) - 1)^2 + (opponents(d) - 2)^2 summed over the difference classes. The -1 multiplier was
already ruled out (patterned starters, below), and an order-3 multiplier cannot fix a whist table.

The multiplier was chosen on small cases first. At 21 and 33, the involution that is 1 mod 3 and -1 mod
the other prime (13 and 10) finds a design in 2 to 10 s. The other involution (8 and 23) found nothing in
10 s. At 57 that rule gives 37 (1 mod 3, -1 mod 19). **It found a design in 11 to 15 CPU-seconds in each of
the four seeds that finished**; the other four were stopped once those had landed
(`eval/whist-involution.txt`). The base passes `checkWhist` when developed, and `whist.test.mjs`
("57 by multiplier 37") checks it pair by pair and checks that it is fixed by x -> 37x.

Unlike the Singer route, this one is not tied to 7^2 + 7 + 1. Past the page's 64-player cap, the same
rule (m = 22: 1 mod 3, -1 mod 23) found a design for 69 in 100 CPU-s, re-checked in Python. 77 (m = 43
or 34) reached cost 4 and 6 in 120 s without one (`eval/whist-involution-over64.txt`, one seed each; not
stored, since the page stops at 64).


## Whist designs for 52 and near-whist for 58, by starter and table matching (2026-11-19)

Every earlier search (`eval/whist-search.c`, `eval/whist-anneal.c`, `eval/whist-orbits.c`, the near-whist
SAT) moved single players around the whole base round, and none found 52, 57 or near-whist 58 in 25 to
130 CPU-minutes. `eval/whist-starter.c` splits the base round into two problems:

1. **A starter**: pair up the points so the partner differences use each class {d, -d} exactly once
   (for 58: 1 to 28 once, never 29, with two points out). Random backtracking finds one in microseconds.
2. **A table matching**: pair up those partner pairs into tables so the four opponent differences of
   each table cover each class exactly twice (58: at most twice, and 29 exactly once). This is solved
   exactly, by backtracking on the opponent class with the fewest candidate tables left (for 4k+2, on
   the partner pair with the fewest tables left, since one class is used only once).

Why this should work: at 57 players a starter has 28 pairs, so 27!! = 2.1 x 10^14 ways to seat them at
tables, and a seating whose 56 opponent differences land exactly twice in each of 28 classes has
probability about 56! / (2^28 x 28^56) = 2.4 x 10^-15 if the differences fell at random. That is about
0.5 designs per starter (0.9 at 52), so the program keeps drawing starters until a matching completes,
giving up on a starter after a node budget.

Results (`eval/whist-starter.txt`, one line per run; every base re-checked pair by pair by `checkWhist`
or `checkNearWhist` when `eval/whist-bases-build.mjs` and `eval/near-whist-bases-build.mjs` store it):

| players | group | found | before |
|---|---|---|---|
| 58 | Z58, near-whist | 2.8 s, the first starter (1.1 M nodes) | nothing in 25 CPU-min tabu or 2.2 h SAT; greedy |
| 52 | Z51 + infinity | 18 CPU-min, the 8th starter (149 M nodes, 20 M per starter) | nothing in 60 CPU-min tabu; design 53 with an empty seat |
| 57 | Z57 | nothing in 6 runs, 3.7 CPU-h: 153 starters at 3 M to 60 M nodes each, none matched |  nothing in 55 CPU-min tabu, 100 CPU-min on Z19 x\| Z3; greedy |

The same program finds every smaller size quickly (21 in 28 ms, 33 in 1.6 s, 40 in 19 s, 45 in 13 s, 48
in 1.4 s; near-whist 10 to 54 in under 15 s each), but the matching's search tree has a heavy tail:
at 49 and 53, which have stored designs, it found nothing in 100 s with either 0.3 M or 2 M nodes per
starter. So a found size says the method works there; a size not found says nothing. At 57 the per-starter
budget made no difference either (85 starters at 3 M nodes, 32 at 8 M, 31 at 20 M, 5 at 60 M), so the next
step there is a different structure, not more hours: starters on Z19 x| Z3, or a product construction.

What it changes on the page, with a court for every four players (same players, courts and rounds;
`americano` before and after, seeds as in the tests):

- **52 players, 13 courts:** 51 rounds, 51 games each, every pair partners exactly once and meets
  as opponents exactly twice, every court used every round. Before: design 53 with an empty seat,
  53 rounds of 49 games each with one court idle, 52 partnerships never used.
- **51 players, 12 courts:** design 52 with one empty seat: 51 rounds, 48 games each, no partner
  twice, every pair meets once or twice. Before: the greedy search, 39 repeat partnerships and 90
  pairs who never partner.
- **58 players, 14 courts:** near-whist: 58 rounds, 56 games each, no partner twice, each player
  misses exactly one partner (29 pairs never partner), every pair meets once or twice. Before: the
  greedy search, 79 repeat partnerships and 108 pairs who never partner.

Tested in `whist.test.mjs` ("52 and near-whist 58 ... 51 plays 52 with one empty seat").

## Whist designs for 52 and 57: two more group structures, and why the shortcuts can't work (2026-11-19)

52 and 57 players are the two whist sizes up to 64 with no stored design (52 plays design 53 with an
empty seat; 57 falls back to the greedy search, which repeats 89 partnerships over 57 rounds at 14
courts). Every search so far used one base round on a cyclic group (Z51 + infinity, Z57). This run
tried two structures that search cannot reach, and checked the literature on why the shortcuts fail.

**Why multipliers and patterned starters fail here (literature, not new).** A base round whose
partner pairs are all {x, -x} is a *patterned starter* (Finizio's term), the shape the -1
multiplier forces (the section below). For 4k+1 players it exists only if the size is 1 or 5 mod 12
(Hu and Ge 2012, confirming Zhang and Chang 2009 and Abel, Anderson and Finizio 2011): 57 is 9 mod 12,
so none exists. For 4k players on Z_v + infinity with v = 3 mod 12, it needs v = 3^(2a+1) v1 with
v1 = 1 mod 12 (Hu and Ge): 51 = 3 x 17 and 17 is 5 mod 12, so none exists for 52 either. That
explains, and proves, what the search found below. Source: the survey in Section 2.1 of
arXiv:1911.07189 ("Partitionable sets, almost partitionable sets and their applications"), which
cites those results. A whist design exists for every 4k and 4k+1 size (settled in the 1970s, same survey), so 52 and
57 are a search problem, not an impossibility.

**Two structures searched** (`eval/whist-orbits.c`, tabu search as in `eval/whist-anneal.c`, but over
several base rounds or a non-abelian group; results in `eval/whist-orbits.txt`, found lines
re-checked pair by pair with `checkWhist` by `eval/whist-orbits-check.mjs`):

- **Non-abelian group Z19 x| Z3** (57 players; (a,b)(c,d) = (a + 7^b c, b + d)). Round g is g times
  the base round. On the small case, Z7 x| Z3 (21 players), it finds a design in 68 ms. At 57 it
  reached cost 2 (one difference class one game over, another one under) in every one of six runs:
  2 x 20 min and 4 x 15 min, tenures 3 to 10, restarts every 1,000 to 50,000 steps, about 100 CPU-min.
  At cost 2 the class over and the class under had different images in Z3 in 4 of 5 dumped states.
  The level counts that image implies were checked and are satisfiable, so it is not that simple
  an obstruction.
- **Three levels, Z17 x {0,1,2} + infinity** (52 players) and Z19 x {0,1,2} (57): three base rounds,
  each developed mod 17 or 19. It finds 16 players (Z5 x 3 + infinity) but nothing at 21, 28, 33 or
  40 in 60 s, and its best at 52 in 2 x 20 min was cost 12. This is worse than the plain cyclic
  search, so drop it.
- **The base round fixed by (a,b) -> (-a,b)** on the non-abelian group (`WHIST_SIGMA`): 21 is never
  found (3 x 20 s, cost 2-4), so this symmetry likely carries an obstruction like the -1
  multiplier's. Not tried at 57.

**57 on design 60 with three empty seats** (`eval/ghost-seats.mjs`, `eval/ghost-seats.txt`): of the
34,220 choices of 3 ghost seats, 1,298 leave every real player within one game of the rest, with 0
repeat partners. But each ghost sits at 59 tables and each pair of ghosts shares 3, so at most
59 x 15 - (177 - 9) = 717 games are left. That is 12.15 busy courts a round of 14, under the 90% that
`whistWorthIt` asks for (12.6), whichever seats are chosen. So the greedy search stays for 57.

Nothing changes on the page. Next for 57: a SAT encoding on Z19 x| Z3 (the near-whist SAT in
`eval/near-whist-sat.py` is the template), or a design built from smaller ones (product theorems,
Anderson, Finizio and Leonard 1999) rather than more tabu hours.

## Tabu search finds whist designs for 48 and 60 players, and near-whist designs for 46, 54 and 62 (2026-11-19, later)

The sizes below were left on a fallback because 20 CPU-minutes of backtracking (`eval/whist-search.c`)
found nothing for 48, 52, 57 or 60, and 15 minutes of annealing (`eval/near-whist-search.mjs`) nothing
for 46 or 54. `eval/whist-anneal.c` searches the same base round a different way: the state is a
permutation of the points (each four in a row are a table), the cost is how far the partner and
opponent difference counts are from a whist design (or the near-whist conditions for 4k+2 players),
and each step makes the best swap of two players at different tables, with the two players just
moved barred from moving again for a few steps (tabu search; `WHIST_TABU=<steps barred>`). Plain
simulated annealing in the same program kept stalling at cost 2, one difference class over and one
under; the tabu walk climbs out of those.

Results (`eval/whist-anneal.txt`, every base re-checked pair by pair by `checkWhist` or
`checkNearWhist` when `eval/whist-bases-build.mjs` and `eval/near-whist-bases-build.mjs` store it):

| players | group | found | before |
|---|---|---|---|
| 48 | Z47 + infinity | 1.5 s (tenure 4) | design 49 with an empty seat, one idle court each round |
| 60 | Z59 + infinity | 15 s (tenure 4) | design 61 with an empty seat, one idle court each round |
| 46 | Z46, near-whist | 9 s (tenure 4) | greedy |
| 54 | Z54, near-whist | 9 s (tenure 6, restarts every 50,000 steps; tenure 4 found nothing in 10 min) | greedy |
| 62 | Z62, near-whist | 148 s (tenure 4) | greedy |
| 52 | Z51 + infinity | nothing in 60 CPU-min (four runs, tenures 3, 4, 5, 7) | unchanged: design 53 with an empty seat |
| 57 | Z57 | nothing in 55 CPU-min (four runs, tenures 4, 5, 8) | unchanged: greedy |
| 58 | Z58, near-whist | nothing in 25 CPU-min (tenures 4, 6) | unchanged: greedy |

Also tried for 52: requiring the base round to be fixed by multiplying by 4 (a unit of order 4 mod 51
that, unlike -1, has no parity obstruction; fixed points 0, 17, 34 join infinity's table), through
`multiplierSearch` in `eval/whist-multiplier.mjs`: nothing in 7 minutes.

What it changes on the page, with a court for every four players (`eval/whist-vs-greedy.txt`):

- **48 players, 12 courts:** 47 rounds, 47 games each, every pair partners exactly once and meets as
  opponents exactly twice, every court used every round. Before: 49 rounds of design 49 with one court
  idle each round, 45 games each, 48 partnerships never used.
- **47 players, 11 courts:** design 48 with one empty seat: 47 rounds, 44 games each, no partner
  twice, every pair meets once or twice. Before: greedy.
- **60 and 59 players** the same way (design 60; 59 with one empty seat).
- **46 players, 11 courts:** near-whist: 46 rounds, 44 games each, no partner twice, each player
  misses exactly one partner. Before: greedy. **54 and 62** the same way.

Stored now: every 4k and 4k+1 size from 4 to 49, plus 53, 56, 60, 61 and 64; near-whist every 4k+2
from 6 to 54, plus 62. Still not stored: 52 (plays 53 with an empty seat), 57 and near-whist 58: the
two whist sizes are the two left whose group order is 3 times a prime (51, 57), though 21, 33 and 39
were found, so that is a pattern to test, not a proof. Tested in `whist.test.mjs` (48 and 60
full-court nights use their own design with no idle court; 47 and 59 play 48 and 60 with one empty
seat; 46, 54 and 62 among the stored near-whist sizes).

## Americano whist designs for 40 to 64 players: a field construction and multipliers (2026-11-19)

The plain backtracking search below stopped at 37 players plus 44: 40, 41, 45, 48 and 49 found nothing in
25 minutes each, so big socials (the card takes up to 64) fell back to greedy, which at 48 players on 12
courts repeats 45 partnerships over the cycle. Two kinds of structure instead of search
(`eval/whist-multiplier.mjs`, results in `eval/whist-multiplier.txt`, every base checked pair by pair with
`eval/whist-multiplier-check.mjs`):

- **4k+1 players, no search at all.** Take the field (or product of fields) R of that size and an E with
  E^2 = -1; multiplying by E splits the nonzero elements into foursomes {a, Ea, -a, -Ea}. Seat each foursome
  as a & -a vs Ea & -Ea. Partner differences are 2a times the foursome and opponent differences (1-E)a
  times it, twice, so as long as 2 and 1-E are units every pair partners once and meets twice. That needs
  each prime-power factor of the size to be 1 mod 4: **41** (GF(41)), **45** (GF(9) x GF(5), stored on
  Z3 x Z3 x Z5), **49** (GF(49) on Z7 x Z7), **53** and **61**. Checked from 5 to 101 in `whist.test.mjs`.
- **4k players: search one table per orbit.** Require the base round on Z_{4k-1} + infinity to be mapped
  onto itself by multiplying by a unit of order 3. For 40 players (Z39, unit 16) that fixes 0, 13 and 26,
  which must join infinity at its table; the other 9 tables come in 3 orbits, so only 3 tables are
  searched. **40** is found in about 1 s and **64** (Z63, unit 4) in about 4 s.

What does not work, and why (so the next run does not retry it): with the multiplier -1 every table must
be a & -a vs b & -b, and summing the squares of the opponent differences forces x^2 = 1^2 + 2^2 + ... +
h^2 (mod v) for the class x at infinity's table (h = (v-1)/2), or that sum = 0 (mod v) with no infinity.
Neither holds for Z47, Z51, Z55, Z59 (48, 52, 56, 60 players) or Z57 (57 players); the search agreed on
every small size (none for 8 to 24, found at once for 28 and 40, where the condition holds). Those groups
have no other usable multiplier, so 48, 52, 56, 57 and 60 need the plain search: `eval/whist-search.c` is
that search in C, about 60 times faster than the JavaScript one (29 players in 0.6 s against 37 s).
Run for 20 CPU-minutes each (`eval/whist-search-c.txt`), it found **56** (Z55, 191 s) and nothing for
48, 52, 57 or 60.

Stored now: every 4k and 4k+1 size from 4 to 45, plus 49, 53, 56, 61 and 64. The existing one-empty-seat
rule (use the next design up when its rounds fill at least 90% of the courts) now also covers 39, 55 and 63
players, and 48, 52 and 60, where it costs a court: 48 players on 12 courts play design 49 with one empty
seat, so one court sits idle each round. Over the cycle that is 0 repeat partners and every pair meeting
once or twice, against greedy's 45 repeat partners and pairs meeting up to 5 times, but 45 games each in
49 rounds instead of 47 in 47 (`eval/whist-vs-greedy.txt`). Still on greedy: 47, 51, 57 and 59 players.
Tested in `whist.test.mjs` (stored sizes, full-court nights at 40, 41, 45, 49, 56 and 64, one-seat nights
at 39 and 63, the field construction from 5 to 101).

## Near-whist designs by SAT: slower than tabu, and two shortcuts ruled out (2026-11-19)

The annealing search below stalled at 46 and 54 players (15 and 10 minutes, nothing). A SAT model of the same
base round, `eval/near-whist-sat.py` (python-sat, CaDiCaL), finds **46** in 107 s (the tabu search above, landed the same day, found it in 9 s and its base is the one
stored), and the developed design passes `checkNearWhist` (`eval/near-whist-check-line.mjs` checks a result line without storing it). It encodes
pairs, not seats, so the table order and the eight seatings of a table never enter the search: P(p,q) for
partners, T(p,q) for sharing a table (transitive, three table-mates each, so the tables are 4-cliques), opponents
as T and not P, exactly two points out (point 0 fixed out by translation), and each distance 1..2k a
cardinality constraint (partners exactly once, opponents at most twice, the half-circle distance never as
partners and exactly once as opponents). On sizes already stored it takes 0.04 s (14), 0.4 s (22), 4 s (30),
0.9 s (34) and 5 s (38) against annealing's 0.01 s, 1 s, 11 s, 4 s and 108 s; 42 with seed 0 found nothing in
300 s, so run times are heavy-tailed and seeds matter (`eval/near-whist-sat.txt`).

Two shortcuts that do not work, so the next run does not retry them:

- **A design mapped onto itself by x -> c - x (a mirror) does not exist for any 4k+2.** The solver says UNSAT in
  milliseconds for 6 to 30; the reason is short. A mirror sends a partner pair {a, b} to {c-a, c-b}, at the same
  distance. Every distance is used once, so each partner pair must be its own mirror image, b = c - a, and its
  distance c - 2a (or n minus it) has the parity of c, because n is even. The distances 1..2k include both
  parities, so the other parity is never covered. (For whist designs on an odd
  group, as in the section above, 2 is a unit and this parity argument does not apply.)
- **A multiplier.** On Z46, Z58 and Z62 every unit of order above 2 fixes only 0 and n/2, and the half-circle
  opponent pair would then repeat once per orbit (it must appear exactly once). Z54 has the order-3 unit 37
  with 18 fixed points; the model with that symmetry is UNSAT in 0.3 s.

**Which two points sit out.** A partner pair at an odd distance joins an even and an odd point; there are k
odd distances in 1..2k. With 2k+1 even and 2k+1 odd points, the seated evens and odds pair up only if the
two points out are an odd distance apart when k is even and an even distance apart when k is odd (every
stored base agrees, `whist.test.mjs`). Multiplying a design by a unit gives another one, so the second point
out can also be taken to be a divisor of n: `--out2 d` fixes it, which leaves one case for 62 (d = 2), two for
58 (1, 29) and three for 54 (2, 6, 18).

**Where SAT loses.** Plain runs of 50 minutes (54 with two seeds, 58, 62) and the `--out2` cases of 40 minutes
(54 with d = 2, 58 with 1 and 29, 62 with 2) found nothing and proved nothing (`eval/near-whist-sat.txt`),
while tabu found 54 in 9 s and 62 in 148 s. So for these sizes the local search is the tool, and SAT is
worth it only for a proof of impossibility, which it did not reach. 58 is the one near-whist size up to 62
that neither method has. The same restriction in the tabu search (`WHIST_OUT2=d` in `eval/whist-anneal.c`:
the two points out fixed to 0 and d) did not change that: 58 with d = 1 and 29, tenures 4 and 6, restarts every
50,000 steps, 15 minutes each on four cores, found nothing (`eval/whist-anneal.txt`).

## Americano for 4k+2 players: near-whist designs (2026-11-19)

The whist designs below cover 4k and 4k+1 players (and 4k+3 with one empty seat). 6, 10, 14, 18, 22 ...
players stayed on the greedy search, because two empty seats idle a court. A whist design for 4k+2
players cannot exist: there are (4k+2)(4k+1)/2 pairs, an odd number, and every game uses two
partnerships. So the best possible night leaves some pairs unpartnered, and for everyone to play the
same number of games the unpartnered pairs must form a perfect matching: each player misses exactly
one partner.

`whist.mjs` now plays exactly that bound, a **near-whist design**, built cyclically on Z_{4k+2} from one
stored base round (`near-whist-bases.mjs`): k tables seat 4k of the 4k+2 points and two sit out; round g
adds g to every seat. A pair at distance d (1 to 2k) recurs once per base occurrence; distance 2k+1
(half the circle) only every other round, which is what makes the matching {x, x+2k+1}. The base round
needs partner distances 1..2k exactly once and never 2k+1, opponent distances 1..2k at most twice and
2k+1 exactly once (4k opponent slots, so exactly one distance is used once). Over 4k+2 rounds:

- nobody partners anyone twice; each player partners 4k of their 4k+1 others;
- the one they miss, they face exactly twice; everyone else they face once or twice (no pair never meets);
- everyone plays 4k games and sits out exactly twice.

`eval/near-whist-search.mjs` finds the bases by simulated annealing on the base round (swap moves,
short restarts): 6 to 34 in under 12 s each, 38 in 108 s, 42 in 45 s, 50 in 8.6 min; 46 found nothing in 15 min
(seed 1) and 54 nothing in 10 min (`eval/near-whist-search.txt`). 46, 54 and 62 have designs since (tabu search,
section "Tabu search finds whist designs ..." above; 46 also by SAT).
`eval/near-whist-bases-build.mjs` keeps only bases whose developed design passes `checkNearWhist`, an
independent pair-by-pair check. Stored: 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54 and 62 players. Against the greedy search on the same
players, courts and rounds (`eval/whist-vs-greedy.txt`, a court for every four players):

| players | greedy repeat partners | greedy never partner | greedy opponents | near-whist repeat partners | near-whist never partner | near-whist opponents |
|---|---|---|---|---|---|---|
| 6 | 0 | 3 | 1-4 | 0 | 3 | 1-2 |
| 10 | 2 | 7 | 0-3 | 0 | 5 | 1-2 |
| 14 | 1 | 8 | 1-3 | 0 | 7 | 1-2 |
| 18 | 1 | 10 | 1-4 | 0 | 9 | 1-2 |
| 22 | 1 | 12 | 0-4 | 0 | 11 | 1-2 |
| 26 | 1 | 14 | 1-4 | 0 | 13 | 1-2 |
| 30 | 5 | 20 | 0-4 | 0 | 15 | 1-2 |
| 34 | 11 | 28 | 0-4 | 0 | 17 | 1-2 |
| 38 | 15 | 34 | 0-5 | 0 | 19 | 1-2 |
| 42 | 24 | 45 | 0-5 | 0 | 21 | 1-2 |
| 46 | 37 | 60 | 0-5 | 0 | 23 | 1-2 |

With fewer courts than tables the design is dealt into rounds as before (26 players on 3 courts: 52
rounds, 0 repeats, against greedy's 25 on the same 52 rounds), and the page hints that round count.
A shorter night still keeps the better of the design's first rounds and the greedy search. The page
says which it used ("Built from a near-whist design ..."). Tested in `whist.test.mjs` (every stored
size checked, 4k+2 nights from 6 to 30 players, broken designs rejected). An annealing try at the
missing 4k and 4k+1 whist sizes (40, 41, 45, 48, 49) did not reach even 29, 32 and 33 in 25 s each
(the exact "twice" condition leaves no slack), so it was dropped (not kept in eval/). 40, 41, 45 and 49 have
designs since (section "Americano whist designs for 40 to 64 players").

## Americano: partner everyone once, face everyone twice (whist designs, 2026-11-19)

The Americano card (rotating partners for padel, pickleball, badminton and tennis nights) used a greedy
round-by-round search. Over a full cycle with a court for every four players it repeats partners from 20
players up (20: 2 repeats, 24: 4, 28: 6, 32: 15, 48: 45) and never evens out opponents: some pairs meet
four or five times while others never face each other (`eval/whist-vs-greedy.txt`).

The fix is a **whist tournament**: rounds of tables a&b vs x&y in which every pair partners exactly once
and plays against each other exactly twice. They exist for every 4k and 4k+1 players. `whist.mjs` builds
them cyclically from one stored base round per size (`whist-bases.mjs`): for 4k+1 players the players are
the elements of an abelian group and round g adds g to every seat of the base round; for 4k players one
fixed player ("infinity") joins a group of order 4k-1. `eval/whist-search.mjs` finds the base rounds by
randomised backtracking on the difference counts (partner differences once, opponent differences twice);
9 players has no Z9 base (exhaustive), so it uses Z3 x Z3. `eval/whist-bases-build.mjs` stores only bases
whose developed design passes `checkWhist`. Stored by this search: 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29, 32, 33, 36, 37 and 44 players (more in the section above). Search times are in
`eval/whist-search.txt` (seconds up to 28; 37 s to 19 min from 29 on, eleven processes sharing four cores). 40, 41,
45, 48 and 49 found nothing in 25 minutes each (4e8-node budget); all but 48 are stored now by other means
(section "Americano whist designs for 40 to 64 players").

How `americano()` uses them (the greedy search stays as the fallback and the comparison):

- **A court for every four players, whole cycle:** the design. 16 players on 4 courts play 15 rounds,
  everyone partners all 15 others once and faces each of them twice; greedy gave opponents 1-4.
- **4k+3 players (7, 11, 15, 19, 23, 27 ...):** the next design up with one empty seat; the table holding
  it sits out. Same games per player as greedy, no repeat partner, every pair meets once or twice
  (greedy 0-4).
- **4k+2 players (6, 10, 14 ...):** a near-whist design (section above, 2026-11-19); two empty seats in a
  bigger design would idle a court and cost each player 2-3 games (18 players: 13-14 against 16).
- **Fewer courts than tables (20 players on 3 courts):** the design's games are dealt into rounds of at
  most 3, least-played players first. The whole design then takes 32 rounds instead of 19; the page says
  so ("set Rounds to 32") and uses it when asked. A prefix measured no better than greedy, so a blank
  round count stays on greedy.
- **A shorter night than the whole design:** both are built and the better kept (repeat partners, then
  the most times one pair meets as opponents). Measured honestly: on 6- and 8-round nights the two tie
  (max 2 meetings, no repeats, 12-28 players, 20 seeds each), and at 28 players over 6 rounds greedy is
  slightly better (max 1). The design's edge is the full cycle: multi-week social leagues, long club
  nights, and anyone who wants the guarantee in writing.

Seeds still change who gets which seat, so the same seed gives the same sheet. Tested in `whist.test.mjs`
(every stored design checked pair by pair, the four cases above, a broken design rejected). Guide:
`how-to-run-an-americano-tournament.html` ("Partner everyone once, face everyone twice"; its 8-player
worked example is now the whist design and still recomputed by `page.test.mjs`). Not yet used by a real
club night.

## Bowling league nights: averages, handicaps, points and standings (2026-11-19, latest)

The bowling page scheduled the lanes and stopped there, but a bowling league's weekly job is the
secretary's sums: each bowler's average and handicap, every match's games with handicap, points
won, and the standings sheet, then next week's position round from those standings. Leagues do it in
a spreadsheet they maintain themselves, or in paid desktop league secretary software, or on their
centre's scoring system if it has a league module. The page now does it from typed score sheets,
in the browser, on the schedule it just built (`bowling-recap.mjs`).

- **Input:** a `Week 1` line, then one line per team: `Pin Pals: Ana 180 165 201, Ben 140 152 133,
  Cy absent`. Optional entering averages (`Ana 165, Ben Ortiz 142`). Rules, all editable: games a
  night (3), bowlers a team (4), handicap % (90) of basis (220), highest handicap (none), points a
  game (2) and for the series (2), absent penalty (10), blind score (150).
- **Rules applied:** average = pins / games through last week, fractions dropped; a bowler with no
  games uses the entering average, else the night's own games (retroactive first night). Handicap =
  floor(pct x (basis - average) / 100), floor 0, capped; 0% is a scratch league. Absent bowlers
  score average - penalty plus handicap and the games never count to their average; absent with no
  average, or a short lineup, is a blind with no handicap. Ties split points. Against the Vacancy a
  team bowls to its par (each spot's average plus handicap). Standings: points won, then handicap pins.
  Position rounds are paired from the standings before that night (`1st place` v `2nd place` on the
  schedule becomes two team names).
- **Output:** standings, the last night match by match (each bowler's average, handicap, games and
  series, team totals and points), bowlers' averages and next week's handicap, highs and absences;
  copy as text, standings CSV and bowlers CSV (formula cells guarded). The typed nights stay in that
  browser's `localStorage` and are worked out again on the next visit; nothing is uploaded.
- **Checked:** `bowling-recap.test.mjs` (7 tests): handicap arithmetic (90% of 220: 160 gives 54,
  165 gives 49, cap, scratch); two nights worked by hand (retroactive average, absent at average - 10,
  absent with no average as a blind, 16-0 points, averages that skip absences); split points on ties
  with entering averages; a position round paired from night one's standings; a Vacancy match against
  par (tie, loss, win, tied series); typing slips named (no week line, unknown team, wrong game count,
  over 300, missing opponent, one bowler on two teams, a week past the season, too many bowlers);
  names with spaces and a team name inside another. In Chromium at 390 px: sample nights on the
  8-team sample season fill the tables, no sideways scroll, the nights return on reload, no console
  errors. Not yet used by a real league.
- **Not done:** split handicaps per game, mid-night substitutions, USBC sanctioned-average reports,
  awards and the prize fund; the league's own and its association's rules decide.

## Pool play into a knockout bracket, seeded so poolmates meet late (2026-11-19, latest)

Pool play listed its play-off seeds by record alone: every pool winner (best record first), then every
runner-up, and so on. Fed into a standard bracket (1 v 4, 2 v 3), that often pairs two teams from the
same pool in the first knockout round, a rematch nobody wants: with two pools of three and two
advancing, `b1, a1, a2, b2` puts b1 against b2 in the semifinal. Tournaments avoid this with a
crossover (A1 v B2, B1 v A2).

- **`poolPlayoffSeeds(tables, perPool)`** (`calc.mjs`) keeps the places in order (every winner is
  still seeded above every runner-up) and reorders teams inside each place so that poolmates can
  meet as late as the bracket allows. The objective is lexicographic: fewest possible same-pool
  meetings in round 1, then round 2, and so on, then the least movement from the record order, with
  a move near the top weighing more. It climbs by swaps inside a place, then runs an exact
  depth-first search over the places' orderings, pruned whenever a partial count is already worse
  (counts only grow as seeds are placed) and capped at 300,000 nodes. It returns the seeds, each
  seed's pool, and the possible poolmate meetings per round for the new order and the record order.
- **The pool card** now prints each seed's pool, a one-line note when the crossover changed the
  order, and the knockout bracket itself (single or double elimination and the third-place game,
  from the step 4 play-off options; play-off results typed in step 4 fill it in).
- **Checked:** the tests compare the result with a brute force over every ordering for 2 to 5
  pools; a swap-only version stalled in a local optimum on 3 pools x 4 and 4 pools x 4 (rounds-1-2
  counts 0, 1 against 0, 0), which is why the exact search follows. `eval/crossover-seeds.mjs`
  draws 500 random pool tables per shape: by record order, poolmates could meet in the first
  knockout round in 29 to 86% of draws (2 x 4: 383 of 500; 4 x 4: 428), and in rounds 1-2 in up to
  every draw; the crossover order has 0 in round 1 for every shape, and 0 in rounds 1-2 for every
  shape with three or more pools (`eval/crossover-seeds.txt`). Two pools can't keep poolmates out of
  rounds 1-2: each half of the bracket holds at least two teams of one pool, and they meet by round 2.
- **Not done:** pools with uneven strength (a pool's winner may deserve a lower seed than another
  pool's runner-up); places stay in order, the usual convention.

## Balanced teams from a player list (2026-11-19)

Before a league can be scheduled it needs teams. Rec, coed and "hat" leagues draft them from a sign-up
list, usually by hand in a spreadsheet. `balanced-teams.html` (page) and `teams.mjs` (engine, zero
dependencies) do that draft:

- **Input:** one player per line, `Name, rating, tag` (any rating scale, decimals allowed; the tag is
  optional, e.g. `F`/`M` for a coed league or `G` for goalies), pasted straight from spreadsheet columns
  (a header row is skipped). `together: Ana, Ben` keeps a group whole; `apart: Cy, Dee` splits a pair. A
  missing rating counts at the list's median and the page names who.
- **Hard rules:** team sizes within one; every tag split so its count per team differs by at most one;
  together groups whole; apart pairs split. A rule that cannot be kept (a together group bigger than a
  team, the same pair asked together and apart) is named, never silently dropped; `checkTeams` re-reads
  the output and confirms each rule independently of the search.
- **Objective:** inside those rules, the least gap between the strongest and weakest team rating total,
  then the least sum of squared distances from the mean total. Search: a per-tag snake draft, then
  simulated annealing on unit swaps and moves (a together group is one unit), six restarts, seeded and
  deterministic ("Another fair draw" changes the seed). For up to 16 players, when the gap is above the
  floor, an exhaustive search (with symmetry cut and a 3 million node cap) settles it.
- **Proof shown on the page:** `spreadLowerBound` (integer ratings whose total does not divide by k force
  a gap of 1; one unit stronger than the rest combined forces `big - (T - big)/(k - 1)`). When the gap
  meets that floor, or the exhaustive search finished, the page says "proved the most even possible";
  otherwise it prints the floor.
- **Hand-off:** "Build a schedule for these teams" opens the main page with the team names filled in
  (a share link, `encodeFields`), so the draft flows straight into a round robin.

**How it was checked** (`eval/balanced-teams-exact.mjs`, output `eval/balanced-teams-exact.txt`; invented
random lists, ratings 1-5, about 40% tagged F, 0-3 random together/apart requests): on 420 lists of 8 to
16 players (2 to 4 teams), 3 had no split keeping every rule; on the other 417 the shipped search found the
exhaustive least gap on all 417 with no rule broken. The annealing alone (exhaustive fallback off) found it
on 413 of 417, which is why the fallback ships. Big lists (ratings 1-10, 8 requests): 40, 80, 120 and 200
players into 4-16 teams reached the floor (proved least) in 31-343 ms; 400 players into 32 teams ended at
a gap of 2 against a floor of 1 (1.1 s), not proved. Tests: `teams.test.mjs` (9: parsing, duplicates,
median fill, the coed example proved, determinism, 40 random lists against the exhaustive search, a
200-player run, a too-big group named, outputs), and `page.test.mjs` checks the page's disclaimer, usage
events and FAQ. Clicked through in Chromium at 390 px over http (example, re-draw, hand-off to the
schedule page): no console errors, no horizontal scroll.

Limits: the rating is whatever the organiser types, so "even on paper" is only as good as those numbers;
totals are compared, so with uneven team sizes the larger team may carry a higher total. Two tags and late
sign-ups landed the same day (next section).

### Two tags per player, and late sign-ups onto announced teams (2026-11-19, later)

- **Two tags at once.** The tag cell can hold several tags (`F G`, `F/G`, `F+G`; `splitTags`), so a woman
  who keeps goal counts toward both splits. Each tag is spread on its own (count per team within one), which
  covers "one goalie and two women per team" without a separate quota syntax. The CSV writes both tags back
  and `parseTeamsCsv` reads them. Tested against the exhaustive search on 40 random two-tag lists
  (`teams.test.mjs`).
- **Late sign-ups.** Paste the announced teams (the page's CSV, or `Team, Player, Rating, Tag` columns; quotes
  and the formula-guard apostrophe handled) and put only the new players in the players box. `addLateSignups`
  pins every announced player to their team (`balanceTeams(..., { fixed, maxMoves, teamNames })`), keeps the
  team names and order, and places the newcomers with the same hard rules and objective. "Announced players
  who may switch teams" (default 0) lets the search move up to that many; among equal gaps it moves the
  fewest, and the page names every new placement, move and `drop: Name` leaver. A re-listed announced player
  updates their rating or tag. For up to 16 players the exhaustive search runs with the pins (no symmetry cut,
  since named teams differ). `checkTeams(parsed, result, before)` re-reads the output and also faults a
  renamed team or more switches than allowed. "Use the teams above" copies a fresh draft in, so a second
  round of late sign-ups is two clicks.
- **How it was checked** (`eval/late-signups.mjs`, output `eval/late-signups.txt`; invented lists, ratings
  1-5, ~40% F, ~20% also G; announced teams drafted by `balanceTeams`, then 3-12 late players):
  - with 0 moves, on every case where a least-filled rule (smallest team first, ties to the lowest total; the
    rule `freeagents.mjs` uses) kept the size and tag split, the shipped placement matched its mean gap
    exactly (e.g. 1.84 vs 1.84 at 9 players, 2.36 vs 2.36 at 40). Least-filled broke the coed or goalie split
    where the shipped placement kept it in 8, 7 and 22 of 40 small cases, 14 of 30 at 40 players, 15 of 20 at
    80 and 10 of 10 at 160. So with nobody moved the gain is the rules, not the gap.
  - allowing 2 moves cuts the mean gap from 2.02-2.52 to 0.65-0.72 at 9-12 players (a full redraft: 0.65-0.70)
    and 2.50 to 0.87 at 40 (redraft 0.80), moving 0.8-1.1 players on average. At 160 players and 12 late
    sign-ups on 16 teams 2 moves are not enough (4.40 to 3.60, redraft 0.80).
  - annealing alone (exhaustive fallback off) equalled the pinned exhaustive search on 95 of 95 small cases
    with a valid placement; 0 rule faults in any run; 160 players placed in 0.4 s at most.
  - Tests: `teams.test.mjs` 16 (7 new: tag splitting, two-tag lists against the exhaustive search, CSV read
    back, pinned placement, pins with and without moves, drops and re-rated players). Clicked through in
    Chromium at 390 px over http (example, use the teams above, three late players with a drop, 0 then 2
    moves, bad inputs): no console errors, no horizontal scroll.

Limits: a late player is placed by rating only, like the draft; with tags already uneven on the announced
teams and no moves allowed the page names the team that is off instead of fixing it. Next: a real league's
sign-up sheet and late list. The `/join` free agents went onto this search the same day (next section).

### Free agents from `/join` placed by the late-sign-up search (2026-11-19, latest)

The self-hosted league page used to pre-pick each free agent's team by a least-filled rule (smallest roster
first, ties to the least free-agent experience). It now runs `addLateSignups` from `teams.mjs`:

- **Rostered players are pinned**, free agents are the late sign-ups, friend pairs are `together` groups.
  Team sizes are evened up (the shortest rosters fill first), each team is capped at the organiser's
  "Roster size to fill teams up to" (`balanceTeams(..., { capacity })`, a new hard rule that the annealing
  and the exhaustive check both read), then the gap between the strongest and weakest team total is made as
  small as it can be.
- **Tag questions on `/join`.** The organiser types `Woman=F, Goalie=G` (up to 4; a plain label works too)
  and `/join` shows a checkbox for each. Each tag is spread so its count per team differs by at most one,
  like the balanced-teams page. The `/admin` list shows each player's answers and the CSV gains a `tags`
  column.
- **Optional ratings sheet.** Paste the balanced-teams page's CSV (`Team, Player, Rating, Tag`) in `/admin`:
  named rostered players count at their rating and tags, and a free agent's experience (1-3) is mapped onto
  the sheet's range (1 = lowest, 3 = highest). Without it rostered players count as 2 and carry no tags.
- **Kept only when it is no worse.** Who can be placed at all is still decided by the old rule (a group too
  big for any team's room stays unplaced with the reason). The search's answer replaces the old picks only
  if it keeps every tag at least as evenly (tag excess, the sum over tags of how far each tag's per-team
  spread goes past one) and its gap is no larger; the `/admin` note shows both gaps.
- **How it was checked** (`eval/free-agent-fit.mjs`, output `eval/free-agent-fit.txt`; invented leagues of
  4-16 teams with rosters of 6-11, 3-30 free agents, levels 1-3, ~40% ticking Woman and ~10% Goalie, ~20%
  in friend pairs, half with a cap of 12; 420 cases):
  - no sheet: cases with a tag split unevenly fall from 25-34 of 60 to 12 (4-6 teams), 32 to 13 of 40
    (8 teams), 26 to 11 of 30 (12) and 17 to 6 of 20 (16); mean tag excess 0.47-1.23 to 0.20-0.37; mean gap
    2.58-3.50 to 2.35-3.25.
  - with a sheet (ratings 1-10, rostered tags random, so most rosters are already uneven): mean gap 21.4-31.0
    to 18.3-25.6, mean tag excess 3.0-6.2 to 2.1-5.3.
  - the cap was never broken and friend pairs never split (0 of 420); the search's answer was kept in 410 of
    420 cases (in the rest the old picks stood). One suggestion took at most 302 ms (16 teams, 30 free
    agents); the `/admin` page computes it on each load.
  - Tests: `freeagents.test.mjs` 11 (3 new: tag questions and the form, the fit spreading tagged players
    under a cap with a pair kept together, a ratings sheet), the server test now sets a tag question through
    `/admin`, ticks it on `/join` and reads it back in `/admin`.

Limits: the ratings are what the organiser types or a 1-3 self-rating; size and tag rules are weighed the same,
so with a sheet the smallest roster after placing averaged 0.05-0.15 players smaller than the old rule in
three of the five sheet rows (it traded a short roster for a tag split). Placing still happens one click at a
time or all at once; nobody already on a roster is ever moved. Next: a real league's free-agent list.

## Play-off results fill the bracket (2026-11-18, latest)

Until now the bracket stopped at seeding: every later game read "winner of R1M1" for the whole play-off, and the
organiser redrew the bracket by hand each week. Now a **Play-off results** box (page section 4, the self-hosted
`/admin` form, and the share link) takes the games as they are played, and the bracket fills in.

- **What you type.** One game per line, any order: `Hawks 2 - 1 Owls`, `Hawks beat Owls` (no score),
  `Hawks w/o Owls`, the league formats (`Owls lost to Hawks 1-2`), or a level score with the winner in brackets,
  `Hawks 1 - 1 Owls (Hawks on penalties)`. A level score with no winner named is refused, since a play-off game
  needs one. Names are matched case-blind against the play-off teams.
- **How a line finds its game.** `playBracket(bracket, text)` in `calc.mjs` walks the bracket in round order and
  gives each game whose two teams are known the first unused line naming that pair. So lines can be pasted in any
  order, and a pair that meets twice (in double elimination: a winners-bracket game and the grand final, or the
  grand final and its reset) takes its lines in the order typed. Winners fill `winner of` slots, losers fill
  `loser of` slots (the losers' bracket and the third-place game), and the reset game is marked *not needed* when the
  winners-bracket team takes the grand final.
- **What it shows.** Each played game as `R1M2: #2 Owls 1 - 1 #3 Lynx (Lynx on penalties) -> Lynx`, later games with
  the teams now known (`R2M1: #1 Hawks vs #3 Lynx`), then `Next up: ...` or, once decided, `Champion: Hawks.
  Runner-up: Lynx. Third: Owls.` The same text goes to the league page download, the plain-text export and the
  self-hosted `/league` page. A line that fits no game due is named with its line number (`no game between Hawks and
  Bears is due in the bracket (check the earlier rounds' results and the spelling)`) on the page and in `/admin`.
- **Kept apart from the table.** Play-off results never reach the standings, so the seeding cannot move under the
  bracket once the play-off starts. "Start next season" clears them with the other results.
- **Alternatives:** Challonge and similar bracket sites (a separate account and a second place to type the results),
  or redrawing the bracket in a spreadsheet each round; league platforms do this on paid plans. Here the bracket
  seeded from your own table carries on to the champion in the same page.
- **Checked:** `playoff-results.test.mjs` (6 tests). Every single-elimination size from 2 to 24 teams, with and
  without a third-place game, played out with random winners in five typing styles: every game played exactly once,
  one champion with no losses, every other team out after one loss (two for the third-place loser), and the same
  bracket text when the lines are shuffled. Double elimination at 3 to 20 teams, six random play-outs each (108):
  the champion lost at most once and every other team exactly twice, the reset played or dropped as the grand final
  fell (both seen), the game count equal to `games` or `maxGames`, and the same champion from shuffled lines. Plus
  the error lines, penalties, the share link, and the self-hosted `buildLeague` path; and clicked in Chromium (6 teams,
  4-team play-off with a third-place game: champion, runner-up, third and the bad line shown). Made-up leagues only;
  no real league has used it yet.

## Promotion and relegation into next season (2026-11-18)

Leagues with tiers (Premier, Division 1, Division 2: darts, pool, squash, social football, pickleball ladders)
end every season the same way: the organiser reads the tables, moves the top team of each division up and the
bottom team down, handles the play-off, drops the teams that are not coming back, slots in new entrants, and
retypes every division. On the multi-division page this is now one box under the play-off seeding.

- **What it does.** `divisionsPromotion(schedule, standings, { ladder, up, down, playoff, winners, leaving, joining })`
  in `divisions.mjs` takes the standings (`divisionsStandings`) and a ladder (`Premier > Division 1 > Division 2`;
  blank means every division in the order listed). The top `up` teams of each division below the top move up one
  tier and the bottom `down` teams of each division above the last move down one; up and down can differ (two up,
  one down grows the top division). Divisions not in the ladder (age groups) are copied unchanged, and `(double)`
  stays on its division. With `playoff`, each line also gets a play-off between the last team that stays up and
  the first that stays down; until a winner is named the upper team keeps its place and the play-off is listed as
  still to play. It returns the text for the divisions box, a line per move with the reason (`A5: Premier ->
  Division 1 (place 5 of 5, relegated)`), and warnings.
- **Never guesses.** Games still to play in a ladder division, and two teams level on every tie-break at a
  promotion, relegation or play-off line (the tie-break notes' "entry order" case), come back as warnings to settle
  first. A move that would put two teams of one name in a division, a count larger than the division, a division
  left with fewer than two teams, an unknown ladder division or play-off winner: an error, and no text is made.
- **Page.** "Next season: promotion and relegation" on `multi-division-league-schedule.html`: ladder, numbers up
  and down, the play-off tick and winners, teams not returning, new teams; **Show next season's divisions**, then
  **Start next season with these divisions** puts them in step 1 and clears results, rainouts, blackouts and the
  start date. CLI: `node divisions.mjs spec.json --results results.txt --promote [N]` (spec fields `ladder`,
  `promote`, `relegate`, `playoff`, `playoffWinners`, `leaving`, `joining`).
- **Alternatives.** A spreadsheet the organiser edits by hand; League Republic, Pitchero and similar club sites
  carry tables and fixtures across seasons on their own accounts and plans. This is the move itself, checked, from
  the table you already have, with nothing uploaded.
- **Checked.** `promotion.test.mjs` (6 tests on a made-up three-tier league plus an age-group division: one up and
  one down with every team once and sizes kept; two up and one down; play-off pending and decided; games left and a
  boundary level on every tie-break warned; leaving, joining, a name clash and impossible counts refused; the CLI),
  and clicked in Chromium (`eval/promotion-click.mjs`, output in `eval/promotion-click.txt`: show, start next season,
  the box holds the moved teams and the new entrant, results cleared, the new season builds). Made-up leagues only;
  no real league's end-of-season moves compared yet.

## Time and court limits: kept exactly, and the impossible ones named first (2026-11-18, latest)

A captain's request ("Aces can only play at 18:30", "Slice Squad needs Court 2") was a heavy penalty inside the slot annealing: usually kept, never guaranteed, and when a set of requests could not all be kept the page only said afterwards that a team "only plays at 20:00, but is at 18:30", without saying why.

- **Exact per round.** After the annealing, any round that still breaks a limit is checked exactly: matches against the round's open slots as a bipartite matching (`legalRoundSlots`, Kuhn's augmenting paths starting from the annealed slots, so legal matches move only when they must). If a legal assignment exists the round takes it. One-game nights only; doubleheader nights keep the annealing (their team-clash rule is not a matching).
- **Named before the build.** `limitConflicts(teams, { times, courts, timeLimits, courtLimits })` finds limits no schedule can keep: two limited teams with no time (or court) in common, whose match breaks one limit wherever it goes; and more teams limited to a set of times than those times hold (k teams need ceil(k/2) slots even when all paired together, k when none are). Each becomes the first notice on the page ("Limits that cannot all be kept: Aces only plays at 18:30 and Topspin only at 20:00, ... Give one of them a time the other can play.").

Measured on 300 random leagues (6-16 teams, 1-3 courts, 1-5 random time or court limits; `node eval/limit-conflicts.mjs`, `eval/limit-conflicts.txt`): rounds with a legal assignment that kept a limit broken, 1 of 3,033 before and 0 of 3,033 after. Of the 90 leagues where some round could not keep every limit, 87 are named by `limitConflicts` before the build and 3 are not (crowding that depends on which teams meet in a round); no league was named that could keep every limit. Of the 149 rounds that could not, 139 hold a pair with no shared time or court and 10 are crowded. Tests: `limit-conflicts.test.mjs`. New guide: `tennis-league-schedule.html` (8 teams, two early-only teams and a one-court team, every limit kept; a test rebuilds its table).

## Bowling: fewer weeks on the same pair running, balance kept (2026-11-18)

A bowler notices two things about lanes: getting one pair more often than the others, and getting
the same pair two weeks running. The page put balance first, so its seasons with the hardest
balance had the most repeats: the stored SAT answers (seasons where the weeks divide evenly by the
pairs, so every team must bowl every pair exactly W/P times) came out of the solver with 9 to 39
repeats against 6 to 21 for the search's own seasons. The polish could not fix that: it never lets
a count leave its target, and when every count is pinned a single swap of two matches in a week
moves four teams' counts. Two changes:

- **A repeat anneal** (`cutRepeats` in `bowling.mjs`, on by default; `assignLanes(..., { anneal:
  false })` turns it off). Same move (two matches of one week trade pairs), priced 1 per
  out-of-bounds count plus 1 per back-to-back repeat, accepted by the Metropolis rule at a
  temperature falling from 0.6 to 0.05 over 600,000 steps (`ANNEAL_STEPS`). Counts may leave the
  target on the way; only seasons with every count back in target are kept, so the result is
  never less balanced than the input (and with every count at floor or ceil, each team's squared
  spread is fixed too). Weights and temperature were tuned on the 36-season grid (weight 3: 369
  repeats; 2: 332; 1: 269, at 200,000 steps). Deterministic per seed, a step budget not a clock.
  Lane limits stay hard: a move onto a banned pair is never taken.
- **Stored answers re-solved with a cap on repeats** (`eval/bowling-repeat-sat.py`): the
  encoding of `eval/bowling-lane-table.py` plus one indicator per team, week and pair for "this
  pair this week and the next", counted by a totalizer, and the cap lowered one solve at a time
  until UNSAT or a 400 s timeout. `eval/bowling-repeat-merge.mjs` keeps, per season, the answer
  with fewer repeats, re-checked at the bound. Six seasons the search already reached at the
  bound but with many repeats were added (6 x 30, 8 x 32, 10 x 30, 18 x 26, 20 x 32, 14 x 34).
  Each entry was then judged on the season the page builds from it (`eval/bowling-repeat-table.mjs`
  run on main and here): three were not kept (20 x 40, where the old entry's page season has
  fewer; 24 x 26 and 24 x 34, where the search's own seasons beat the stored answers).

**Measured** (`eval/bowling-repeat-sat.txt`, `eval/bowling-repeat-anneal.txt`,
`eval/bowling-lanes.txt`):

| | seasons | every team at the bound | back-to-back repeats |
|---|---|---|---|
| 36-season grid (6-24 teams x 26-34 weeks), before | 36 | 36 | 392 |
| same, now | 36 | 36 | **148** (13 seasons with none) |
| stored-answer and pinned seasons (38), before | 38 | 38 | 787 |
| same, now | 38 | 38 | **439** (8 with none) |

12 teams over 18, 24 and 30 weeks, and 10 teams over 30, now have every team on every pair exactly
equally often **and never on the same pair two weeks running** (they had 12, 17, 13 and 25). The
solver proved the least for this round-robin dealing on 9 seasons (0 on seven; 1 for 14 x 14; 4 for
6 x 30, which had 23). The anneal costs about 0.1 to 0.35 s a season (625 ms to 744 ms on
average over the grid, `eval/bowling-repeat-anneal.txt`).

Not done: the seasons the solver did not move in 400 s (18 x 27, 20 x 30, 20 x 40, 22 x 23, 24 x
35: still 18 to 44) need a longer run or a better model (symmetry breaking on the repeat
indicators, or the count model of eval/bowling-count-model.py with repeats); lane-limit shape
answers (`bowling-avoid-shapes.mjs`) were not re-solved for repeats; the lane-limit grids
(`eval/bowling-lane-avoid.txt`, `eval/bowling-avoid-shapes.txt`) were not re-measured for
repeats (their balance cannot change: the anneal keeps only in-target seasons).

## The bowling page builds in a worker (2026-11-18, latest)

The bowling page ran `bowlingSchedule` on the page thread. Since the most-even-dealing change
below, a season with five or more limited teams can run several full lane searches, and on the
slowest measured season (24 teams x 26 weeks, six teams off both end pairs) the tab froze for the
whole build: no scrolling, no clicks, and the "Dealing the lanes..." line was the only sign of life.

The search now runs in a Web Worker (`bowling-worker.mjs`: `bowlingSchedule`, `laneReport` and
`validateBowling`, results posted back as plain data). The page shows a seconds counter while it
works, a newer click (Build again, Reshuffle) terminates the older search so its result never
lands, and where a worker cannot start (an old browser, a page opened from disk) it builds on the
page thread as before. Same inputs, same season: the worker calls the same function.

**Measured** (`node eval/browser-bowling.mjs`, `eval/browser-bowling.txt`, headless Chromium in
this container; the script runs a 50 ms timer in the page and records the longest gap between
ticks while the slow season builds):

| | build time | longest page-thread gap |
|---|---|---|
| before (page thread; same script on the previous page) | 7,287 ms | 7,291 ms |
| after (worker) | 7,172 ms | 53 ms |

The build itself is no faster; the page stays usable while it runs. The script also checks that a
second click during a search replaces its result (19 checks, all pass). Not done: a Stop button
(a new click is the only way to cancel), and the round-robin page's other long builds were already
in workers.

## Five or more limited teams: the most even of several dealings (2026-11-18)

With five or more teams under lane limits there is no stored shape answer, so the page deals teams
to round-robin slots by search (`feasibleDealing`, below) and used to keep the first dealing whose
every week had a legal lane deal. Which teams meet in the weeks the limits squeeze decides how
close each team gets to its even share of pairs, so the first legal dealing was often not the best:
five teams off the last pair in a 10-team, 26-week season left 2 of 10 teams off target.

`evenDealing` (in `bowling.mjs`) now builds the season on several legal dealings (the first, then
`feasibleDealing` with seeds 2, 3, ... started from a seeded shuffle) and keeps the one with the
fewest teams off target, then the fewest off-target counts, then the fewest back-to-back repeats
(`dealingScore`). It runs only when the first season has a team off target and no stored shape
answer applies, stops as soon as every team is in target, and caps the number of dealings by the
season's size (`dealingsFor`: weeks x pairs^2, six on 10 teams, two on 24 teams x 26 weeks), since
each is a full lane search. Same input, same season. `bowlingSchedule` reports `dealingsTried`;
`spec.dealings` overrides the cap.

**Measured** (`node eval/bowling-many-limits.mjs`, `eval/bowling-many-limits.txt`; the same 112
seasons as below, 8 still refused as out of reach; before is the same script on the previous
`bowling.mjs`, run the same day):

| kind | seasons with every team in target | off-target counts | repeats | ms per season (all kinds) |
|---|---|---|---|---|
| five teams, last pair (28) | 22 -> 25 | 11 -> 4 | 409 -> 360 | |
| six teams, both ends (20 built) | 15 -> 17 | 23 -> 8 | 297 -> 285 | |
| five or eight teams, a random pair each (56) | 56 -> 56 | 0 -> 0 | 370 -> 370 | |
| all 104 built | | | | 1,212 -> 1,634 (slowest 5.0 s -> 10.7 s, 24 x 26 six off both ends) |

Seasons that moved: 10 x 26 and 10 x 30 five off the last pair 8/10 -> 10/10, 18 x 26 16/18 ->
18/18, six off both ends 14 x 30 11/14 -> 12/14, 16 x 30 12/16 -> 16/16, 18 x 30 15/18 -> 18/18,
24 x 26 20/24 -> 21/24. No season got worse on teams in target; 0 limits broken. With no cap
(six dealings everywhere) the totals were 26 of 28 and 18 of 20, at 1,959 ms per season and up to
25 s on one season; the cap keeps the page's wait near what it was. The 142-season grid (at most
three limited teams, `eval/bowling-lane-avoid.mjs`, before and after run the same day) keeps every
in-target count (36, 35, 35 and 33 seasons by kind); repeats 528 -> 524 (two teams off the last
pair) and 370 -> 366 (three random), the rest identical; 947 -> 1,103 ms per season. It uses stored
shape answers almost everywhere, so the change touches it only on the few seasons without one.
Tests: `bowling.test.mjs` ("the most even of several legal dealings": 10 x 26 five off the last
pair, teams off target fall with the default against `dealings: 1`, limits kept, validated, same
season twice).

Open: the remaining misses (10 x 32, 10 x 34 one team off; 24 x 26 three; 14 x 30 two) with more
dealings or SAT answers for the 5+ shapes; the bowling page now builds in a worker (section above).

## Five or more limited teams: a refused week re-dealt (2026-11-18)

The stored shape answers cover up to four limited teams; with five or more the page runs the
search on slot t = team t of the circle method. That dealing can make a week impossible that
another dealing would not: in a 10-team league with five teams off the last pair, the last pair
needs a match of two unlimited teams every week, and week 1 put all five limited teams in five
different matches. The page refused the season ("Week 1: ... loosen a limit") though the five
unlimited teams meet 10 times in a 9-round cycle, enough for one each round.

`feasibleDealing` (in `bowling.mjs`) checks every round the season plays for a legal lane deal
(a maximum bipartite matching of matches to allowed pairs, `weekShortfall`), and if one is
short, hill-climbs over dealings: swap a limited team's slot with another slot, keep the swap if
the summed shortfall does not rise, seeded restarts, a fixed work budget (about 3e7 matching
steps, so the same input gives the same season on any machine). Identity is tried first, so a
season that already had a deal every week is byte-identical. `bowlingSchedule` uses it after the
shape answers and reports `redealt`. Every team still meets every other as often as before.

**Measured** (`node eval/bowling-many-limits.mjs`, `eval/bowling-many-limits.txt`; 10-24 teams x
26-34 weeks x four kinds of 5+ limit: five teams off the last pair, five off a random pair each,
six off both ends, eight off a random pair each; 112 seasons):

| | seasons built | refused | limits broken |
|---|---|---|---|
| before | 100 | 12 | 0 |
| now | 104 | 8 | 0 |

The four 10-team seasons now built have 8-9 of 10 teams in target (11 counts off over the kind,
was 3 on the 24 it built before). The 8 still refused are out of reach for every dealing, by
counting: six teams off both end pairs need two all-unlimited matches every round, and 4 or 6
unlimited teams meet only 6 or 15 times in a 9- or 11-round cycle (18 and 22 needed). The
142-season grid (at most three limited teams) re-run: every row identical. The two random kinds
are every team in target in 56 of 56. Tests: `bowling.test.mjs` (10 x 26 five off the last pair
and 16 x 30 seven off both ends built and still round robins, a feasible season untouched, 8
teams four off the last pair refused with the new message, its 6-week season dealt).

Open (picking the most even dealing landed the same day, section above): the dealing search picked the first legal dealing, not the most even one (five teams off
the last pair: 22 of 28 in target); scoring dealings by the search's balance, or SAT answers for
5+ limited shapes on the misses (14, 16, 18 x 30 with six off both ends).

## Lane rotation solved on counts, not weeks: the last limit misses proved, 16 x 40 and 24 x 35 stored (2026-11-18, latest)

The SAT models so far (`eval/bowling-avoid-shapes.py`, `eval/bowling-lane-table.py`) pick a pair for
each match, week by week. Nothing they check depends on the order of the weeks: the bans are per
match and the targets are season totals. The circle method also repeats: a season of W weeks plays
only n-1 distinct rounds, round r played c_r times, so any two weeks playing the same round can swap
lane plans, and the solver carries about c_0! c_1! ... copies of every answer and every dead end
(6 x 32: 7!^2 6!^3, about 10^16).

`eval/bowling-count-model.py` keeps only y[r][m][p], how many of round r's weeks put match m on pair
p. Each y[r] has every row and column summing to c_r, so by Birkhoff-von Neumann (Konig's
edge-colouring theorem) it splits into exactly c_r week plans: the model has the same answers as
the week model, without the copies. OR-tools CP-SAT solves it; the script splits each y[r] back into
weeks by repeated perfect matchings and re-checks the season week by week (bans, `laneTargets()`)
before printing a code in the format of `bowling-avoid-shapes.mjs` or, with shape `-` (no limits),
`bowling-lane-table.mjs`. An eval tool, not part of the page (the page reads the stored answers).

**Results** (`eval/bowling-count-model.txt`):

| question | before | now |
|---|---|---|
| 6 x 32, two teams off the last pair, slots 0 and 4 | TIMEOUT at 300 s (week model) | UNSAT in 0.0 s: 15 of 15 slot pairs UNSAT, out of reach on every dealing |
| 6 x 26, three random limits (142-season grid) | UNSAT on the page's dealing; other dealings unchecked | 60 of 60 dealings UNSAT |
| 16 x 40, no limits | not run; page 8 counts off | SAT in 67.5 s, stored; page 16 of 16 at the bound (1.0 s) |
| 24 x 35, no limits | no answer in 420 s; page 2 counts off | SAT in 152.4 s, stored; page 24 of 24 at the bound (1.9 s) |
| agreement with the week model | | 17 of 17 settled cases give the same verdict (12 limit shapes, 5 lane-table seasons) |

So the page's three misses on the 142-season limit grid (139 of 142) are each proved out of reach
for any dealing of the circle method, not search failures. The count model only helps when rounds
repeat: on seasons of one cycle or less it is the week model with extra steps (16 x 24: 37 s against
25 s), and on the larger unanswered lane-table seasons it also timed out (22 x 33 and 34, 24 x 36 and 37, 26 x 38-40 at 240 s each; the seasons of one cycle or less were not run).
Test: `bowling.test.mjs` checks every stored table entry, 16 x 40 included (27 of 27 pass).

## Lane limits: shapes stored on other slots, and the last misses (2026-11-18)

The stored lane-limit answers (next section) put the limited teams on the circle method's first
slots, 0, 1 and so on. Six of the grid's 112 seasons were still missed: two shapes had no answer on
those slots (UNSAT) and four timed out at 300 s. **Which slots the limited teams take changes the
season**: in a season shorter than a full cycle, which teams meet in the first W weeks, and who
meets the fixed slot, depends on the slots. Balance still does not see names, so any slots will do.

- A shape key may now name its slots: `0:0;5:0` is two teams off one pair, on slots 0 and 5.
  `matchShape` returns the slots too and `avoidShapeSlots` deals the limited teams those slots
  (the other teams fill the rest in order). Keys on 0, 1, ... read as before; 171 old answers
  unchanged.
- `eval/bowling-avoid-slots.py` tries a shape on other slots (first team kept on slot 0, then
  tuples with the fixed slot, then the rest), 4 at a time, and stops at the first SAT.
  `eval/bowling-avoid-shapes.py` takes `SYMBREAK=1`: the pairs no limit names are interchangeable,
  so week 1's matches go on them in increasing order (keeps at least one answer).
- `eval/bowling-avoid-lns.py` repairs the search's near miss a few weeks at a time (Glucose,
  interruptible; the other weeks kept), for shapes whose whole-season model is slow.

**Results** (`eval/bowling-avoid-slots.txt`):

| season, limit | before | now |
|---|---|---|
| 20 x 9, two teams off one pair | UNSAT on slots 0, 1 (and 0-2, 0-3, 0-4); page 17 of 20 | SAT on slots 0 and 5 in 2.5 s; page 20 of 20 |
| 18 x 8, two teams each off the same two pairs | UNSAT on slots 0, 1 | SAT on slots 12 and 17 in 0.4 s; page 18 of 18 |
| 22 x 23, two teams off one pair | SAT timed out at 300 s; page 20 of 22 | the search alone on slots 0 and 1 is in target (the page's own dealing missed by 2); page 22 of 22 |
| 24 x 13, one team off one pair | SAT timed out at 300 s; page 22 of 24 | SAT with the symmetry break in 365 s; page 24 of 24 |
| 24 x 13, one team off both ends | timed out at 300 s; page 22 of 24 | symmetry break, 574 s; page 24 of 24 |
| 24 x 13, two teams off one pair | timed out at 300 s; page 22 of 24 | timed out at 1,800 s even with the break on slots 0, 1; SAT on slots 0 and 23 (the fixed slot) in 110 s; page 24 of 24 |
| 20 x 40, one team off one pair | timed out at 300 s; page 18 of 20 | symmetry break, 88 s; page 20 of 20 |
| 6 x 26 and 6 x 34, two teams off the last pair (142-season grid) | UNSAT on the page's dealing, called out of reach | SAT on slots 0 and 5, and 0 and 3, at once |

The symmetry break, not the slots, closed four of the five timeouts. The near-miss repair
(`eval/bowling-avoid-lns.py`) did not close either near miss it was given (2 counts off after 25
min on 20 x 40), so it stays a tool, not part of the page. Still out of reach on every dealing
tried: 6 x 32 with two teams off the last pair (14 of 15 slot pairs UNSAT; slots 0 and 4 unanswered at 300 s, proved UNSAT by the count model in the section above)
and, proved, with one team off both ends: UNSAT on all six slots, so no dealing of the circle method has an even rotation there.

On the 112-season grid the page now has every team in target in **112 of 112** (was 106; 0 counts off, was 14; `eval/bowling-avoid-shapes.txt`). On the 142-season limit grid (`eval/bowling-lane-avoid.txt`) it has **139 of 142** (was 137; 10 counts off, was 18). Tests: `bowling.test.mjs` (a shape on slots 0 and 5 matches and deals; 20 x 9, 18 x 8 and 22 x 23 seasons with those limits keep them, every team in target, no pair meeting twice in a cycle). 180 stored answers (171 before), 38 KB.

## Lane limits on the hard season lengths: stored answers per limit shape (2026-11-18)

The lane-limit search (next section) missed 9 of 142 measured seasons; a SAT solver showed 3 of
them, all 20 teams over 30 weeks, have a deal the search did not find. Restarting the walk from
the stored unlimited answer got 2 of the 3 in 0.7-37 s and never the third in 80 restarts, and a
weighted (breakout) walk did no better, so the fix is not more search. A stored answer keyed on
the limits looked like too many keys, but it is not: **balance does not see names.** The round
robin may deal any team any slot of the circle method (the organiser typed names, not slots), and
every lane pair plays the same role. So one SAT answer for "slots 0 and 1 avoid pair 0" serves any
two teams avoiding any one pair. A limit's *shape* is which teams avoid which pairs up to renaming
both; one team off one pair, two teams off one pair, one team off both ends and so on are a handful
of shapes.

- `bowling-avoid-shapes.mjs` (generated by `eval/bowling-avoid-shapes.py`, CaDiCaL via
  python-sat, merged by `eval/bowling-avoid-shapes-merge.mjs`): 171 answers, keyed
  `"teams,weeks|shape"` with the shape written on slots and pairs (`0:0;1:0` is two teams off one
  pair), over the 28 season lengths that already needed a stored answer with no limits. 36 KB.
- `matchShape` finds the renaming (limited teams onto slots, real pairs onto the shape's pairs;
  up to 4 limited teams and 5 named pairs, tried exhaustively). `bowlingSchedule` then deals the
  limited teams the shape's slots (`avoidShapeSlots`; the other teams keep their order), so the
  fixtures are still the plain circle method, every team meeting every other as often as before,
  just with the teams in other slots. With no limits, or no matching shape, nothing changes.
- `assignLanes` uses the answer only if the rounds are exactly that dealing, every match is on a
  pair its teams may use and every count is inside `laneTargets()` (`shapePlan`); else the search
  runs as before. "Try another lane deal" relabels the pairs no limit names, from the seed. The
  polish then cuts back-to-back repeats, as for the unlimited table.

**Measured.** On the 28 hard lengths x 4 kinds of limit (`node eval/bowling-avoid-shapes-grid.mjs`,
`eval/bowling-avoid-shapes.txt`; limited teams spread over the league, not on the shape slots):

| | seasons with every team in target | counts off target | ms per season |
|---|---|---|---|
| search alone | 60 of 112 | 100 | 1,940 |
| page with shape answers | 106 of 112 | 14 | 1,062 |

Of the grid's 49 search misses, 43 got a SAT answer (0.4-199 s each), 1 is UNSAT (20 teams x 9
weeks, two teams off one pair: that dealing has no deal) and 5 timed out at 300 s (20 x 40, 22 x 23
and 24 x 13 with one or two teams off one pair, one team off both ends): those 6 are the page's
misses left. A further 119 shapes on 12-18 teams were solved ahead of need (1 UNSAT: 18 x 8, two
teams each off the same two pairs). On the 142-season grid of the next section the page now has
every team in target in **137** (was 133), 18 counts off (was 24), and every season it still misses
is proved out of reach on its dealing (2026-11-18 later: 6 x 26 and 6 x 34 have answers on other slots, section above; `eval/bowling-lane-avoid.txt`; the 6 x 26 random-limit season, unchecked
before, is UNSAT too). The cost: back-to-back repeats rose from 2,338 to 2,436 over the grid, since
the polish starts from a stored answer it may not unbalance; balance comes first on this page. 20 x 30 with a limit takes 1.0-1.5 s, down from 3.5 s, since it skips the
search. Tests: `bowling.test.mjs` (shape matching, dealing, 20 x 30 under three limits and two
seeds all 20 of 20 in target, every pair of teams still meets once or twice). Browser check: 16
checks (`eval/browser-bowling.txt`; new: 20 teams x 30 weeks, one team off both ends, 20 of 20).

Not done (2026-11-18, latest, above, took the first two): an UNSAT shape is UNSAT for that
dealing only, so try other slots; the 5 timeouts need a longer solve. Shapes with more than 4
limited teams fall back to the search.

## Bowling lane limits: a team that must never bowl on a pair (2026-11-18)

Some leagues have a team that cannot use one pair (the end pair by the wall where a bowler with a
walker has no room, the pair by the bar). The bowling page now takes **lane limits**, one team per
line (`Pin Pals: 7-8`, `Spare Me: last`, `Gutter Gang: ends`, a single lane number for its pair;
`parseLaneAvoid` in `bowling.mjs`), and treats them as a hard constraint in every stage of the lane
search, not a fix-up after it:

- **Greedy and week re-solves:** a banned (match, pair) cell costs `FORBID` (2^26), above every
  balance price, so the Hungarian step never takes one when the week has any legal deal. The step
  is exact per week, so a banned cell in the greedy plan proves that week has no legal deal at all;
  `bowlingSchedule` then refuses the season and names the week ("Week 3: the lane limits leave no
  way ...") instead of building one that breaks a limit.
- **Walk:** moves that would put a team on a banned pair are skipped.
- **Stored SAT answers** are used only if they keep the limits (they never were built for them, so
  in practice the search runs).
- **Targets** (`laneTargets`): with no limits, floor..ceil(W/P) as before (byte-identical seasons;
  all 20 old bowling tests pass unchanged). With limits, the avoided pairs still host a match every
  week, so the other teams must bowl there more often. The fair share is the matrix scaling
  (Sinkhorn) of the allowed cells to row sums W_t and pair sums sum(W)/P; the target is
  floor..ceil of it, 0 on a banned cell. A rounding that keeps every row and pair total always
  exists; the weekly one-match-per-pair rule can still rule it out (below). `offBound`,
  `laneReport` (`inTarget`, `avoided`, `target` per row; spread and bound over the pairs a team may
  use) and the page's highlighted cells all use it; the avoided cell shows a dash.

**Measured** (`node eval/bowling-lane-avoid.mjs`, `eval/bowling-lane-avoid.txt`; 9 league sizes
6-24 x 4 lengths 26-34 x 4 kinds of limit: one team off the last pair, two teams off the last pair,
one team off both ends, three random teams off one random pair each). The baseline is the fix an
organiser makes by hand: the page's unconstrained season, then each week a limited team lands on
its pair, swap its match with the nearest match that may take that pair.

| | seasons with every team in target | counts off target | back-to-back repeats | limits broken |
|---|---|---|---|---|
| hand fix | 0 of 142 | 3,345 | 3,438 | 3 weeks (no legal swap found) |
| page | 133 of 142 | 24 | 2,338 | 0 |

Two random-limit seasons (6 teams x 30 and 34 weeks) have a week with no legal deal; the page
refuses them and they are left out. 0.81 s per season on average (3.5 s at 20 x 30).

**The 9 misses** (`eval/bowling-lane-avoid-sat.py`, CaDiCaL on the exact weeks, bans hard, every
count in target): 6x26, 6x32 and 6x34 with two teams off the last pair, and 6x32 with one team off
both ends, are UNSAT: on 3 pairs those limits put the target out of reach for any deal, so the
page's 1-5 off is the season's limit. 20x30 with one team off the last pair, two off the last pair
and one off both ends are SAT: the search's fault, on the one length (P divides W) that already
needed a stored SAT answer without limits. Two misses (20x30 and 6x26, random limits) were not
SAT-checked. Next: closing 20x30 under limits (a SAT call at build time is too slow for the page;
a stored answer keyed on the limits is too many keys; a longer walk on exact seasons is the
cheapest thing to try).

Position rounds put 1st v 2nd on the first pair; their teams are known only on the night, so the
page tells the organiser to check a limited team's pair on those weeks. Browser check:
`node eval/browser-bowling.mjs` (15 checks, 5 new: 8 of 8 in share, Pin Pals never on Lanes 7-8,
a dash in the avoided cell, an unknown team reported).

## Bowling lanes: every measured season at the bound (2026-11-18)

The six seasons the lane search left short (below, 2026-11-17) are closed: **36 of 36** measured
seasons now have every team at the bound (worst spread 1, down from 2), at 0.64 s per season.
Two additions to `assignLanes` in `bowling.mjs`: a stored answer is used first when the season has
one, and the walk runs only when the polish ends with a count out of bounds:

- **A focused walk** (`walkLanes`, the WalkSAT idea): each step picks a random team-pair cell
  outside floor..ceil, and among the swaps that move one of that team's matches off (or onto)
  that pair takes the one leaving the fewest out-of-bounds counts, or any of them with
  probability 0.2. Deterministic per seed, a step budget instead of a clock. It closed 10x30,
  18x26 and 24x34 (33 of 36 with the walk alone).
- **Stored SAT assignments** (`bowling-lane-table.mjs`): the other three (12x30, 16x32, 20x30)
  are seasons where P divides W, so every team needs every pair exactly W/P times. The week
  re-solves, a tabu swap search and the walk all stalled 4 to 12 counts short there (tried this
  session, up to 4 s and 200,000 steps each). `eval/bowling-lane-grid.mjs` runs the page's search on
  every even league of 4 to 28 teams and 2 to 40 round-robin weeks; `eval/bowling-lane-table.py`
  asks CaDiCaL about each miss and `eval/bowling-lane-table-merge.mjs` writes the solved ones as
  one base-36 digit per match. `tablePlan` uses an entry only if it is a permutation every week
  and puts every team at the bound for the rounds it is given, so a stale table costs speed,
  never balance; the seed relabels the pairs (balance kept) for "Try another lane deal", and
  the polish then cuts back-to-back repeats. Position weeks do not count, so the key is the
  number of round-robin weeks.

Repeats rose from 340 to 392 over the 36 seasons: balance comes first in the price, and the
repaired seasons have 9 to 39 repeats against 6 to 21 before.

**The wider grid** (`eval/bowling-lane-table.txt`): of 507 seasons (4 to 28 teams, 2 to 40
weeks) the search with the walk misses 90. CaDiCaL solved 28 (all now stored and at the bound:
every exact season of 12 to 20 teams up to 40 weeks, and the near-whole-cycle ones such as 18x17,
20x29, 22x23), proved 35 impossible, and gave no answer to 27 within 420 s or before the batch's
30-minute cap (16x40 and most seasons of 22 to 28 teams). Those 27 are where a longer SAT run, or a
solver on a bigger machine, should go next; the table merges new answers with
`eval/bowling-lane-table-merge.mjs`. The table is 6.4 kB.

**Proved impossible.** CaDiCaL returns UNSAT for every season exactly P weeks long that it was
asked about (6 to 24 teams), for 4 teams at all 21 lengths from 2 to 40 weeks where the search misses, and for 6x9, 8x3 and
12x5. A P-week season at the bound needs each team on every pair exactly once, so each pair's P
matches form a perfect matching with one edge from each round: a 1-factorization orthogonal to the
circle method's P rounds. A SAT check (`eval/bowling-lane-blocks.py`; `eval/bowling-lane-table.txt`, "Blocks") found none
for the first P rounds or for three random choices of P rounds at every even size from 6 to 20 teams
(32 of 32 UNSAT), which is also why splitting a season into perfect P-week blocks, tried first
this session, cannot work with these rounds. On those lengths the page's result is as close as the search gets.

## Bowling: seasons where an even lane split is proved impossible (2026-11-18)

The bowling page said "(best possible 0)" next to any team off the floor/ceil bound, which reads
as a missed deal. For some seasons no deal exists. `eval/bowling-bound-sweep.mjs` ran a lane
search on every even league of 4 to 32 teams for 1 to 60 round-robin weeks (900 seasons) and
`eval/bowling-bound-proof.py` gave each season it missed (145; the search was the page's
polish plus a min-conflicts repair tried this session, not shipped here) to CaDiCaL with the CNF of
`eval/bowling-lane-sat.py` over the exact weeks `bowlingSchedule()` plays. An UNSAT answer is a
proof about the season, not the search: no lane deal of those weeks puts every team at the bound.
Every such season is missed by every search, so the misses of any one search cover all of them;
the gap is seasons the solver did not settle in its time (UNKNOWN, listed in
`eval/bowling-bound-proof.txt`).

Proved out of reach (`bowling-proofs.mjs`, `OUT_OF_REACH`; full list in
`eval/bowling-bound-proof.txt`):

- **A season exactly as long as the lane pairs:** P round-robin weeks on P pairs (4 teams x 2
  weeks, 6 x 3, 8 x 4, ... 30 x 15): every league from 4 to 30 teams. Each team would need every
  pair exactly once, and the circle method's first P rounds allow it at none of those sizes. 32 x 16 was not
  settled in 150 s.
- **4 teams (2 pairs):** whenever the round-robin weeks are 2, 3 or 4 more than a multiple of 6,
  through 58 weeks (51 and 57 not settled). 4 x 2 by hand: week 1's two matches split the teams
  across the pairs, so in week 2 every team must change pair, but each week-2 match joins one team
  from each pair.
- **Other short seasons:** 6 x 9, 8 x 3, 12 x 5.

44 seasons in all; 17 misses were SAT (a deal at the bound exists: the search's fault) and 84 were
not settled, almost all at 20 to 32 teams, where the SAT checks of 2026-11-17 took 30 s and more.

The engine sets `boundProvedOutOfReach` on an even league's season (and `laneReport` carries it)
when its team count and round-robin weeks are listed; position rounds do not count, and an odd
league is never flagged (its proof would cover the Vacancy's row). The page then says the even
split is out of reach this season instead of "best possible". The search is improved in the section above (PR 17107), which
brings every measured season at the bound; the seasons listed here stay out of reach for any search.

## Bowling leagues: lane pairs rotated evenly (2026-11-17)

`bowling-league-schedule.html` (engine `bowling.mjs`, tests `bowling.test.mjs`) builds a whole
bowling season: the circle-method round robin repeated until the weeks run out, real dates on one
weekday with no-bowl dates stepped over, weeks held for position rounds (1st v 2nd, 3rd v 4th on
the pairs in order; they do not advance the round robin), a Vacancy for an odd league (it bowls
on its pair like any team, so 9 teams use 5 pairs), and lane-pair labels from the league's first
lane (`firstLane: 13` gives "Lanes 13-14", ...). Exports: CSV (formula-safe), text, print.
`validateBowling` re-checks each week (each team once, each pair once), that every pair of teams
meets `floor` or `floor + 1` times for the round-robin weeks played, and the dates.

**The lane problem.** A team that bowls W weeks on P pairs can at best have every pair
floor(W/P) or ceil(W/P) times ("at the bound"). Each week's matches go on pairs by an assignment
problem (Hungarian method, `hungarian`, tested against every permutation up to 6x6). The page then
runs an iterated local search: with every other week fixed, one week's best assignment is exact
(each team's count on one pair rises by one and its repeats depend only on the weeks either side,
so the price is a sum over (match, pair) cells); sweeps re-solve every week until none improves,
a kick re-deals one to three random weeks, a worse result is undone, and the season with the
fewest out-of-bounds counts, then fewest back-to-back repeats, is kept. Deterministic per seed;
"Try another lane deal" changes the seed.

**Measured** (`node eval/bowling-lanes.mjs`, `eval/bowling-lanes.txt`; 36 seasons, 6 to 24 teams x
26, 30, 32, 34 weeks; "all at bound" = every team at the bound):

| assignment | seasons with all teams at the bound | worst spread | back-to-back repeats (total) |
|---|---|---|---|
| naive (match k on pair k, a copy of the circle method) | 0 of 36 | 34 | 2,124 |
| hand rotation (every match one pair along each week) | 1 of 36 | 13 | 6,490 |
| greedy (week by week, Hungarian on counts so far) | 4 of 36 | 3 | 417 |
| page (greedy + iterated local search) | 30 of 36 | 2 | 340 |

About 0.55 s per season on this container. **The 6 misses are the search's fault, not the
problem's:** `eval/bowling-lane-sat.py` (CaDiCaL via python-sat; exactly-one per match and per
pair each week, cardinality bounds per team and pair, week 1 fixed for symmetry) finds an
assignment with every team at the bound for all six (`eval/bowling-lane-sat.txt`: 10x30, 12x30,
16x32, 18x26, 20x30, 24x34, each SAT). Balance does not depend on which week a round falls in, so
the answer holds for any round order.

Tried and dropped (numbers from this session's runs, same 36 seasons unless named): a simulated
annealing swap search (two matches of one week trade pairs) on squared deviation stalled at spread
2 on most sizes from 10 teams up; guided local search (raising penalty weights on out-of-bounds
cells) did worse than random kicks (10x30: 7 of 10 teams at the bound against 8); starting from a
balanced first cycle with pair labels shifted by one each cycle (which keeps full cycles within
one of even when the first cycle is a balanced tournament design) gave the same 30 of 36 and took
1.7 times as long, and the search did not find a balanced first cycle at 20 or 32 teams anyway;
closed forms f(round, diagonal) = (k + h r) mod P gave no balanced cycle for any h at 6 to 32, 40, 48 or 64 teams.

Browser check: `node eval/browser-bowling.mjs` (`eval/browser-bowling.txt`, 10 checks at 390 px:
sample 8 of 8 at the bound, odd league with the Vacancy and a skip date, reshuffle, an error
hiding the old schedule, no horizontal scroll, no console errors).

Open (the 6 misses closed 2026-11-18, above; lane limits landed 2026-11-18, above): a
"switch lanes each frame" note per pair for printed sheets; feeding real standings into the
position rounds.

## Calendar files that follow a rainout (2026-11-17)

A team's `.ics` file used to give each game an id built from its date and its place in the
round (`2-0-20261013-1@...`). A calendar import adds or updates events by that id and never
deletes one missing from the new file, so when a rained-out game moved and the organiser
re-sent the file, the player's calendar kept the old date as well as the new one. Every
match now carries a **fixture id** (`fixture` on each match, `assignFixtureIds` in
`calc.mjs`): the pair, lower team index first, and which meeting of that pair it is in the
season as built (`0-3-1` is the second meeting of teams 0 and 3). Rainouts, pins and late
entries copy the match and keep the id, and each move adds one to `moves`, written as the
event's `SEQUENCE`. When a team withdraws, its removed fixtures go out as `STATUS:CANCELLED`
events under the same ids, titled "Cancelled: ...", so a re-import marks them rather than
leaving them in place. Officials' files add `-official` to the id so a referee who also plays
does not have one event overwrite the other. The multi-division page (`divisionsIcs`) uses
the division, the round and the pair.

Measured with `node eval/ics-stable-uids.mjs` (`eval/ics-stable-uids.txt`): 9 league sizes
(4 to 16 teams), single and double, 4 seeds, two random nights rained out and then the last
team withdrawing mid-season. A player imports the first file, then the updated one; we count
the events left over that are a **ghost** (no game then) or a **duplicate** (the same game
twice). Old ids against fixture ids:

| | team files | matches moved | old ids: ghost + duplicate | fixture ids |
|---|---|---|---|---|
| single division, two nights rained out | 584 | 640 | 1,139 + 0 | 0 + 0 |
| then a team withdraws | 584 | | 512 + 2,222 | 0 + 0 |
| multi-division example, one night rained out (4 runs) | 80 | 26 | 52 + 70 | 0 + 0 |

The duplicates come from the old id's position-in-round part: removing or moving one game
renumbered the others on that night. No file repeats an id.

**Subscribe on the self-hosted league page.** `server.mjs`'s player page now offers, for the
whole league (`/league/ics?t=...&team=all`, new) and each team, a `webcal://` subscribe link,
a Google Calendar add-by-URL link, the plain address to paste into any app, and the download.
A subscribed calendar re-reads the feed on its own schedule (each app decides how often), so
a rainout reaches players without anyone re-sending a file. The address is taken from
`PUBLIC_URL` when set, else the request's host (`x-forwarded-proto` for https behind Fly or
Render); a host that is not a plain name is refused and the page falls back to downloads.
The feed is served `inline` with `cache-control: no-cache`.

**Not checked:** no real calendar app was used here. The counts above model an import that
matches events by UID as RFC 5545 describes; how Google, Apple and Outlook each treat a
re-imported file or a cancelled event, and how often they poll a subscription, is untested.
Ids are stable while the season's base setup (teams, dates, courts, seed) is unchanged;
editing those rebuilds the season and its ids.

## Import into TeamSnap or SportsEngine (2026-11-17)

Many leagues already pay for TeamSnap or SportsEngine for registration, payments and team
messaging, and those platforms' own schedulers are where this tool's fairness work (fewest
home/away breaks, even courts and slots, blackouts) does not reach. Typing a 10-team season
into either platform by hand is 45 games. Now the schedule card has **Import into TeamSnap
or SportsEngine**: two downloads that are each platform's own import file, so the season
built here goes up in one upload.

- **TeamSnap** (`teamSnapCsv`): the organisation schedule import, columns `Date, Start Time,
  End Time, Arrival Time, Short Label, Event Type, Division, Home Team, Away Team, Location,
  Location Details` in that order, dates MM/DD/YYYY and times h:mm AM/PM. You type the
  TeamSnap division name and, optionally, the location name (then each court goes in
  Location Details) and an arrival time in minutes. Arrival Time is left out when blank,
  which TeamSnap allows. The file is refused-in-advance where TeamSnap would refuse it: no
  division, a game with no start time. A game ending after midnight is flagged, because
  TeamSnap's template has no end date, and names with `% @ # *` are flagged because TeamSnap
  says those symbols trip imports.
- **SportsEngine HQ** (`sportsEngineCsv`, `parseTeamIds`): the 28-column Schedule Upload
  file (`Start_Date` ... `Division_Override`), 24-hour times, `TBD` for a game with no time
  slot, the end date rolled past midnight, `Event_Type` Game, `Team1_Is_Home` 1 for the home
  side. HQ matches games by its own team IDs, so you paste `Hawks = 2270996_271208` lines
  (HQ lists them on the template's Team/Division ID tab); a team without one is named in the
  error.

The column lists are copied from the templates the platforms publish, read 2026-11-17
(`eval/platform-templates-2026-11-17.md` has the URLs, header rows and SHA-256 of each file),
and `platform-import.test.mjs` pins them. **Not done:** no file has been uploaded to a real
TeamSnap or SportsEngine account (both need a paid organisation account), so what each
platform does with, say, a repeated Short Label is untested; the multi-division page has no
platform export yet.

## A shorter season with an even strength of schedule (2026-11-17)

"Rounds to play" cuts a round robin short: 20 teams with a ten-week season play the first
10 of 19 rounds. Those were the circle method's first rounds, and the circle method fixes
one team (the last listed) and rotates the rest, so that team met **teams 1 to 10**. With
the teams listed best first, as the pool-play and seeding boxes already ask, the bottom
seed got the ten strongest opponents (mean opponent seed 5.5 where an even share is 10.0),
and the gap grows with the league: 30 teams over 12 rounds were 8.5 seed places off.

Tick **"Shorter season: even out strength of schedule"** (`balanceSeeds: true` in a spec,
carried by the share link) and `balanceSeedStrength` in `calc.mjs` gives teams their
places in the shorter season so every team's opponents average close to the mean seed of
every other team. It searches relabellings by seeded annealing on pair swaps (sum of
fourth powers of each team's gap, keeping the least worst gap), with a fixed work budget
so a share link rebuilds the same season. A relabelling moves teams, not patterns: every
home/away sequence, break count and carry-over count is unchanged and no pair meets
twice. Blackout fit, which also relabels, now only takes swaps that keep the balance
(`fitPlanToBlackouts(..., { keep })`). `seedStrength(plan, n)` reports each team's
opponent mean, its even share and the gap.

How it was checked (`eval/seed-balance.mjs`, output `eval/seed-balance.txt`): worst
team's gap in seed places, plain first-k rounds to balanced, with the exact optimum over
all n! relabellings where that is small enough to enumerate:

| teams x rounds | plain | balanced | exact optimum | breaks (both) | time |
|---|---|---|---|---|---|
| 8 x 5 | 1.03 | 0.34 | 0.34 | 4 | 16 ms |
| 9 x 5 | 1.38 | 0.50 | 0.50 | 0 | 12 ms |
| 10 x 6 | 1.50 | 0.11 | 0.11 | 4 | 19 ms |
| 12 x 8 | 1.50 | 0.25 | - | 6 | 17 ms |
| 20 x 10 | 4.50 | 0.56 | - | 8 | 48 ms |
| 30 x 12 | 8.50 | 0.36 | - | 10 | 62 ms |
| 64 x 20 | 21.50 | 0.54 | - | 18 | 232 ms |

On all five sizes small enough to try every relabelling (6 x 3, 8 x 4, 8 x 5, 9 x 5 and
10 x 6) the search finds the exact optimum. Tests: `seed-balance.test.mjs`. Not done:
picking a different set of rounds as well as the relabelling. Tried while building this
(annealing over which k of the n - 1 rounds to play): it did not lower the worst gap
reliably and raised home/away breaks sharply (12 teams x 8: 6 to 34), so it was dropped.
The seeds are only the list order: a league with no idea who is strong should leave the
box off, and it changes nothing for a full round robin, where everyone meets everyone.

## Doubleheader nights: every team's games back to back (2026-11-15)

Many rec leagues play two games a night (adult softball doubleheaders, volleyball and cornhole nights, darts with
two matches each). Set **Games per team per night** to 2, 3 or 4 (`gamesPerNight` in a spec; it rides in the share
link). Consecutive rounds of the round robin share a night, inside a leg, so every team meets two different
opponents and a double round robin never mixes its halves. The validator allows that many games a night and refuses
a team booked twice at one time; breaks and carry-over are still counted round by round (`expandNights`), and rest
between nights ignores the second game of a night (`restReport`). Rainouts, late teams and blackouts work as before
(a moved match only goes to a night where neither team plays).

**What people use today:** a spreadsheet grid filled by hand, or a league platform (TeamSnap, LeagueApps) whose
generators treat a doubleheader as two separate rounds, so a team can finish at 18:00 and play again at 21:00. The
common complaint is the wait, not the opponent.

**The wait is in the timetable, not the slots.** Put a night's matches on a graph (teams are nodes, each match an
edge labelled by its round). Each connected component can sit on its own run of consecutive time slots, so its
teams play back to back; the night is wait-free when the components pack into the time rows with at most one match
per court per row (`nights.mjs` `nightLayout`). With two games a night the components are cycles that alternate the
two rounds, and the circle method's consecutive rounds join all eight teams of an 8-team league in one 8-cycle: on 2
courts and 4 times it cannot be laid out wait-free at all. `waitFreeNights` searches the round robin itself (partial
round swaps and round swaps between nights, from the circle method and then from a carry-over timetable) for a
plan whose nights all pack, then sets home and away with `assignVenues`; the slot search starts from that layout
(`seasonLayout`, which also evens out who plays early) and adds a penalty per empty slot between a team's games.
`waitFreePossible` is the counting bound that comes first: a team's games fill g rows in a row and a row holds two
teams per court, so for example 10 teams cannot all play two in a row on 4 courts and 3 times (every window covers
the middle row, which holds 8). When the bound fails, the page says how many courts back-to-back nights need.

Measured (`node eval/doubleheader.mjs`, `eval/doubleheader.txt`; 60 settings of 6 to 24 teams, 2 or 3 games, 3 to
5 times, the fewest courts that fit, seeds 1 to 3): all 180 seasons valid. Every two-game setting the bound allows
is now wait-free on every seed (18 of 18; 12 teams on 3 courts x 4 times went 30 to 0, the last one left by the
first version, which stopped at 10). Total waits 3,391 to 3,025 with the search on; what is left is in the
settings no layout can make wait-free. The cost: the time-row spread (most minus least games a team plays in one
time slot) rises, for example 20 teams from 6 to 15 a season, because a wait-free night fixes blocks of teams to
early or late pairs of slots; `seasonLayout` rotates the blocks night by night but does not close it.
`waitFree: false` turns the search off; it is also off with carry-over spreading or a shorter season (they choose
the timetable themselves).

### Three games a night (2026-11-15, later)

The first version said "7 of 7 three-game settings that pass the bound keep their waits". Four of those seven
were never possible, and the bound was wrong about them, which also made the page's "you need N courts" hint
too low for odd leagues:

- **An odd league has two kinds of team on a night.** With g games a night, g teams sit out one round each
  and play g - 1 games, so their windows are shorter. `waitFreePossible(teams, g, courts, times, short)`
  now places both kinds. 9 teams, 3 games, 3 courts x 4 times books all 12 slots, and six 3-game windows
  plus three 2-game windows cannot share 4 rows of 6 teams; the old bound counted only the six.
- **Every row holds an even number of teams** (two per match). 7 teams, 3 games, 2 courts x 5 times passes
  every count and fails on parity. Checked by exhaustion: all 32,970 possible nights of 7 teams on that
  grid, laid out by the exact search below with no node cap: none is wait-free (`eval/three-game-nights.txt`,
  part 2).

With the corrected bound the hint asks for one more court for every odd league of 7 to 13 teams at 4 or 5 times,
and for 7 and 11 teams at 6 times (9 teams at 4 times: 4 courts, not 3; `eval/three-game-nights.txt` lists both
counts per setting).

Three changes to the search and the layout:

- **A team skipping the middle game was called back to back.** The component layout puts a whole round in one
  row; in an odd league a team that sits out round 2 of 3 plays rounds 1 and 3, and the layout could put those
  two rows apart and still report the night as wait-free. It now checks those teams (`rowsWaitFree`).
- **Match-by-match layout** (`nightRowsExact`): when whole rounds of components do not pack, a depth-first
  search gives each match its own row (a team's games in distinct adjacent rows, at most one match per court
  per row), the match with the fewest open rows first, pruned by the rows every team's window must cover.
  It runs inside `nightLayout` (3,000 nodes) and so in the season's slot layout even with the search off:
  that alone made two-game nights of 9 teams on 2 courts x 4 times, 10 on 3 x 4, 14 on 4 x 4 and 18 on 5 x 4
  wait-free from the plain circle order (`eval/doubleheader.txt`, waits off column). It is not free in settings
  that cannot be wait-free: 11 teams, 3 games on 4 x 4 went 28 to 30 waits, because a layout the old check passed
  wrongly now goes to the leftover slots.
- **Two sessions a night** (`sessionBlocks`, `sessionNights`): with 6 time slots and 3 games, a night can hold
  an early and a late session. When the courts are tight every night must split into groups that only play
  each other: 12 teams on 3 courts x 6 times book all 18 slots, so each night is two groups of six. The hill
  climb could not find that, and for a reason worth knowing: its moves trade opponents along two-round
  cycles, which never leave the swap class of the starting round robin. From the circle method, simulated
  annealing over groups and rounds stopped at exactly 14 crossing matches on every seed and temperature;
  from a carry-over timetable it reached zero. A hand construction confirms the target exists (a prism on
  each half, then the two 3 x 3 crossings as complete bipartite blocks, then a 6-cycle on each half for the
  last two rounds). So each start (circle, then carry-over) gets both searches.

Measured (`node eval/three-game-nights.mjs`, `eval/three-game-nights.txt`; 39 settings of 6 to 24 teams, 3 games,
4 to 6 times, on the least courts the corrected bound allows, seeds 1 to 3; every season valid): at 4 and 5 times
every setting is wait-free on every seed, with or without the search, once the courts are enough. At 6 times:
10 teams on 3 courts 36 to 0, 16 teams on 4 courts 125 to 0, 12 teams on 3 courts 64 to 22 (4 of 6 seeds
wait-free), 14 teams on 4 courts 54 to 33; 18, 20 and 24 teams keep their waits (the annealing gets to 2
crossing matches with 6 million moves, not 0), and odd leagues at 6 times are not searched by groups (a team
sitting out the middle round of a group breaks its order). The group search costs up to about 3 s a build at
24 teams, and nothing at 4 or 5 times.

### Designed round robins for two sessions a night (2026-11-15, latest)

The search above stops at 2 crossing matches for 18 to 24 teams at 6 times, and 12 teams were wait-free on
only 4 of 6 seeds. Those nights need closed groups, and a closed-group round robin can be written down instead
of searched for (`designedRounds`, `designedNights` in `nights.mjs`). `waitFreeNights` tries it first whenever a
night has two or more sessions; it is used only if every night packs wait-free, and otherwise the search runs as
before. Two designs:

- **Teams a multiple of 12.** Split the league into halves A and B of m = n / 2. The first rounds play the circle
  method inside both halves at once, three at a time: a night is two groups of m, one per session. The m cross
  rounds pair team a of A with team a + k (mod m) of B, and the shifts k, k + m/3 and k + 2m/3 make one night:
  m/3 groups of six, three teams of A each playing the same three of B (a K3,3). The two rounds left over from
  the halves are a short two-game last night.
- **Teams a power of two.** Round r pairs team t with team t XOR r. A night of rounds a, b and a XOR b is
  groups of four that play everyone in their group (K4s, the parallel classes of an affine plane on 16 teams);
  any other three rounds give groups of eight. The rounds are grouped to hold as many K4 nights as possible.

Measured (`node eval/three-game-nights.mjs`, `eval/three-game-nights.txt`, seeds 1 to 3, every season valid):
24 teams on 6 courts x 6 times 254 waits to 0, 12 teams on 3 courts x 6 times 22 to 0 (6 of 6 seeds), and
the 16-team build 1.2 s to 0.4 s (same 0 waits, no annealing). Part 4 adds 28 to 48 teams at 6 times: the
designed sizes (32, 36, 48) reach 0; 28 teams has no design and keeps its waits. Settings with no waits 28 to
30 of 39; total waits 743 to 467.

**8 teams on 2 courts x 6 times cannot be wait-free** (part 3), though the counting bound allows it. Every
slot is booked, so the four teams in the first time slot fill slots 1 to 3 and the other four fill 4 to 6: a
wait-free night is two groups of four playing everyone in their group. The season has two three-game nights,
and no two of the 35 ways to split 8 teams into two fours share no pair (any four of one split puts two teams
together in the other). So one night always has a wait; the 30 waits in part 1 are that night.

Not done: groups for odd leagues; designs for 14, 18, 20 and 28 teams (20 teams on 5 x 6 is also fully booked,
so each night must be two closed groups of ten; the halves design needs K10,10 in three such nights plus a
matching, and annealing from it stops at 2 crossing matches); three sessions a night (9 times) by design; the
full-booking argument above as part of the courts hint.

### Closed sessions for every league size: a SAT solver writes the designs (2026-11-15, latest)

The halves and XOR designs above cover multiples of 12 and powers of two; for 14, 18, 20 and 28 teams the
annealing stopped at 2 crossing matches and the note said those sizes needed designs. They do not need a
construction: a SAT solver finds them in seconds (`eval/session-design-sat.py`, python-sat with CaDiCaL,
eval only). The encoding: x[r, i, j] for "i and j meet in round r" (every pair once, every team once a
round), y[t, v, k] for "team v plays in session k on night t" (each block at most 2 x courts teams), and
for every round of night t, a match joins two teams of the same block. Round 0 is fixed and team 0 sits
in block 0 every night, which costs no generality.

Results (`eval/session-design-sat.txt`; timeout 300 s a size, 4-core container):

- **Two sessions (6 time slots, the least courts, ceil(n / 4)):** every even league of 10 to 48 teams is
  satisfiable, in 0.1 s (14 teams) to 32 s (46 and 48). 8 teams on 2 courts is UNSAT, the solver
  re-deriving the hand argument of part 3 below.
- **Three sessions (9 time slots, ceil(n / 6) courts):** 15 of 19 sizes found (16 to 48 teams, 8 to 197
  s); 14, 38, 40 and 46 ran out of time. 12 teams on 2 courts x 9 is UNSAT: every night would be three
  K4s, and no round robin of 12 holds three such nights edge-disjoint (a full booking forces each
  session's four teams to fill its three rows, so the blocks are not a modelling choice).

The 32 designs are stored, one character per team per round, in `session-designs.mjs` (33 KB, generated by
`eval/write-session-designs.mjs`, which re-checks each). `designCandidates(n, g)` lists the algebraic
design first and then the stored ones; `designedNights` relabels each by the seed and keeps the first
whose nights all pack. A test re-checks every stored design in JS (each pair once, each round perfect,
each night's components packing into its blocks).

Measured (`node eval/three-game-nights.mjs`, `eval/three-game-nights.txt`, seeds 1 to 3, every season valid):

- Part 1 at 6 slots: 14 teams on 4 courts 33 waits to 0, 18 on 5 courts 101 to 0, 20 on 5 courts 194 to 0.
  Builds there take 0.26 to 0.34 s instead of 2.1 to 2.5 s (no annealing). Settings with no waits 30 to
  33 of 39; total waits 467 to 143. What is left at 6 slots is odd leagues
  (7, 9, 11, 13 teams; groups for them are still open), 6 teams on 2 courts and the 8-team night proved
  impossible.
- Part 4 now runs every even size 22 to 48 at 6 slots: all 13 reach 0 waits on every seed (28 teams 360 to
  0; 22, 26, 30, 34, 38, 40, 42, 44 and 46 are new), in 0.4 to 2.3 s a build.
- Part 5 (new) runs 12 to 48 teams at 9 slots on ceil(n / 6) courts: 16 of 19 sizes at 0 waits on every
  seed. 12 teams keep 78 (proved, above), 40 and 46 keep theirs (no design yet); 14 and 38 need none.

Two bugs found on the way, both fixed with a test:

- **A team booked twice at one time** (44 teams, 3 games on 11 courts x 6 times, seed 2, search off).
  The slot annealing priced a clash at 1,000, and one swap touching four teams can save more than that in
  idle slots at 200 each, so it traded a double booking for fewer waits. A clash now costs 10^7, above
  any one swap's gap change. A scan of 504 seasons (2 and 3 games, 6 to 44 teams, 4 to 9 slots, the least
  courts, seeds 1 to 3, search off) found this one season on `main` and none after. Leftover matches the
  night layout cannot place now also go to a row holding neither of their teams.
- **Waits the plan said were not there** (26 teams on 5 courts x 9 times, 0 waits planned, 69 in the
  season). The season's layout orders the exact search by each team's time-row usage so far; on six of
  nine nights that order spent the 3,000-node budget where the plain order finds a layout at once. It now
  tries the plain order when the usage order fails. 26, 32, 38 and 44 teams at 9 slots went to 0 waits
  with the search off.

Open (updated below): three-session designs for 14, 38, 40 and 46 (longer solver runs, or a
symmetry such as a cyclic group acting on the teams). 40 and 46 closed 2026-11-16 with a cyclic group
(section "Three sessions at 40 and 46 teams" below); 14 and 38 reach 0 waits without a design.

### Big odd leagues at 9 slots: 33 to 63 teams, one pattern laid out once (2026-11-16)

`MAX_TEAMS` is 64, but before this run no odd league above 31 teams had a stored design, so every odd
league of 33 to 63 teams at 9 time slots kept its waits on the least courts: 33 teams on 6 courts 377
waits over seeds 1 to 3, 63 teams on 11 courts 2,643 (`node eval/odd-cyclic-check.mjs`, before).

For an odd league n = 3k (33, 39, 45, 51, 57, 63) the rounds split into k nights with no short
night, and `eval/odd-cyclic.py`'s patterned starter (the circle method as a 1-rotational round robin)
covers Z_n with the k translates of one pattern, {0, 1, 2}. So one SAT layout of one night, about
1.5 n matches, is the whole season. On the least courts at 9 slots these nights leave 6 slots spare
(48 of 54 at 33 teams, 93 of 99 at 63), and the first pattern laid out every time:

| Teams | Courts x 9 | Matches a night / slots | Layout solve (s) / whole script (s) | Waits before (3 seeds) | Waits now | Build (ms), before to now |
|---|---|---|---|---|---|---|
| 33 | 6 | 48 / 54 | 0.4 / 5 | 377 | 0 | 5,350 to 769 |
| 39 | 7 | 57 / 63 | 0.2 / 14 | 583 | 0 | 5,283 to 849 |
| 45 | 8 | 66 / 72 | 3.8 / 36 | 966 | 0 | 3,790 to 823 |
| 51 | 9 | 75 / 81 | 4.1 / 55 | 1,354 | 0 | 3,601 to 1,213 |
| 57 | 10 | 84 / 90 | 1.2 / 111 | 1,896 | 0 | 4,981 to 1,372 |
| 63 | 11 | 93 / 99 | 7.0 / 197 | 2,643 | 0 | 7,035 to 1,884 |

The builds also got 3 to 7 times faster: with a stored design the tool lays each night out from the
stored rows instead of annealing.

**Where it does not reach (measured this run).**

- **n = 3k + 2 (35, 41, 47, 53, 59 teams), the same class as 29.** On the least courts these nights
  have 3 spare slots (51 of 54 at 35 teams, 60 of 63 at 41), like 29 on 5 x 9 (42 of 45). 35 on 6 x 9
  and 41 on 7 x 9 were stopped after 8 to 12 minutes with no pattern laid out (the runs shared 4 cores with three others). The proof in the 29-team
  section rules out the group method for all of them. 29, 35 and 41 were later closed by the SAT
  neighbourhood search (`eval/odd-lns.py`, sections below); 47 and up are open.
- **6 time slots.** The odd leagues above 29 teams on the least courts at 6 slots are fully booked or
  3 slots short of it (31 on 8 x 6: 45 of 48; 33 on 8 x 6: 48 of 48). No pattern laid out at 31 on 8 x 6
  (145 patterns on each of two starters, 560 s) or 39 on 10 x 6 (307 s).
- **37 teams on 6 x 9 is fully booked** (54 matches in 54 slots; n = 3k + 1, k = 12), so it went to
  `eval/odd-orbit.py`, the turned-night construction of the next section: SAT in 2,783 s (111,006
  variables; 31 teams took 626 s), waits over seeds 1 to 3 701 to 0, 1,246 ms a build. 43 on 7 x 9
  (k = 14) ran the same script alongside and was stopped after 39 minutes with no answer; a later run
  given the time answered SAT in 9,849 s, so it is wait-free now (1,073 waits to 0; section "43 teams
  on 7 x 9" below, `eval/odd-orbit.txt`).
- **49 teams on 9 courts x 9** is already wait-free without a design (spare courts), so its design was
  not stored. On the least courts, 8, it is fully booked (n = 3k + 1, k = 16), the turned-night case.

(The whole script's time is mostly checking and decoding the season; up to four runs shared the 4 cores.)

### Fully booked odd nights: one night turned by three k-cycles, 19, 25 and 31 teams (2026-11-15)

19 teams on 3 courts x 9 slots and 25 on 4 x 9 use every slot of a three-round night (27 matches
in 27 slots, 36 in 36). The three earlier methods all failed there: the whole-season model ran past
30 minutes, no cyclic pattern laid out (below), and `eval/odd-pack.py`, which searches for any
renamings of one wait-free night that pack edge-disjoint into the round robin, ran 25 minutes with
no answer. `eval/odd-orbit.py` fixes the renamings in advance with a group.

**The construction.** Let n = 3k + 1 with k even (7, 13, 19, 25, 31, 37, ...) and let g turn three
rings of k teams (0..k-1, k..2k-1, 2k..3k-1) one step each, fixing team 3k and the bye. Under g a
pair of half-turn opposites in one ring ({0, k/2}, ...) has an orbit of k/2. Those 3k/2 pairs and
{3k, bye} cover every team once, so together they are one round: the last night, one game per
team. Every other pair has an orbit of exactly k, and there are 3(n + 1)/2 such orbits, exactly the
pairs of one three-round night with its bye pairs. So a wait-free night H that takes **one pair
from every full orbit** gives the season: nights H, gH, ..., g^(k-1)H use every pair once, each is
H with its teams renamed (the same rows), and the short orbits are the last round. The SAT model
is one night (`odd-night-sat.py`'s match rows and window shapes plus "exactly one pair per orbit").

| Teams | Courts x 9 | k | Solve (s) | Waits before (3 seeds) | Waits now |
|---|---|---|---|---|---|
| 19 | 3 | 6 | 23 | 171 | 0 |
| 25 | 4 | 8 | 141 | 281 | 0 |
| 31 | 5 | 10 | 626 | 499 | 0 |

It also finds the stored 13 on 3 x 6 (fully booked) in 0.0 s and 19 on 5 x 6 in 0.2 s (the
whole-season model: 3.4 s and 66 s), and it is UNSAT for 13 on 2 x 9, which the whole-season model
solved, so a "no" rules out this group only. Sizes 3k + 2 (29 teams) are not covered: with odd k the
short orbits are a triangle, not two rounds. Measurements: `eval/odd-orbit.txt`;
`node eval/odd-cyclic-check.mjs 19:3:9 25:4:9 31:5:9` reruns the tool's before and after.
`doubleheader.test.mjs` builds all three wait-free (and with waits when the search is off), and the
stored-designs test re-checks the solver's rows for all 24 designs. (`odd-night-sat.build` gained a
`fix_round0` flag, on by default, so a caller with its own structure can drop the round-0 fix.)

29 on 5 x 9 (3k + 2; no group of order k can work, proved in the next section) was solved by a
neighbourhood search instead (two sections down). 37 on 6 x 9
was solved by the same script on 2026-11-16 (2,783 s, section above) and 43 on 7 x 9 on 2026-11-17
(9,849 s); 49 on 8 x 9 is the next fully booked size.

### 29 teams on 5 x 9: why one turned night cannot work, and what was tried (2026-11-16)

29 teams on 5 courts x 9 slots is the open size from the section above (42 matches a night in 45
slots). The tool leaves 334 waits over seeds 1 to 3 (`node eval/odd-cyclic-check.mjs 29:5:9`,
3.6 s a build). This run did not find a wait-free season. It found why the method that solved 19,
25 and 31 cannot, measured three other routes, and left a script for the next run.

**No group of order k can turn one night into the season (proof).** Write n = 3k + 2 (k = 9 at 29
teams), so N = n + 1 = 3(k + 1) counting the bye. For `eval/odd-orbit.py`'s idea the k full nights
must be one orbit of a group G of order k acting on the teams, and every element must fix the bye
(a rename that moves the bye puts a sitting-out team on a court). Take a prime p dividing k (p is
odd, since k is) and h in G of order p. The points h fixes number N mod p, which is 3 mod p, or 0
when p = 3; it includes the bye, so h fixes at least 3 points. A pair of h-fixed points lies on
some night X with hX = X, and in one regular orbit of nights no full night is fixed by h, so every
such pair is on the short two-round night. Three h-fixed points give a triangle there, and two
matchings cannot hold a triangle. So the "triangle, not two rounds" note above is not a quirk of
the three k-cycles: no group of order k works, for any 3k + 2 with k odd (17, 23, 29, 35, ...).

**What was tried, all on this 4-core container (`eval/odd-triple.txt`):**

- **1-rotational round robins** (`eval/odd-cyclic.py --random-only`, new flag: skip the patterned
  starter). Three more random starters (seeds 101 to 103), 126 night patterns each, 447 to 461 s a
  starter: none lays out. With the three tried before, 756 patterns, none.
- **One night exists.** `odd-night-sat.py 29 --courts 5 --times 9 --shape --nights 1` is SAT in
  575 s (151,246 variables). Its layout is three near-closed sessions: 8 teams in rows 0 to 2,
  7 in rows 3 to 5, 8 in rows 6 to 8, and six teams (the three sitting out among them) bridging
  the sessions. A 1-rotational night spreads every team's opponents round Z_29, which is likely why
  none of its patterns fit this shape.
- **A rename of order 3 with fixed nights** (`eval/odd-triple.py`, new). g turns eight 3-cycles and
  fixes six points (five teams and the bye). The five rounds g fixes hold the six fixed points'
  15 pairs as the one 1-factorization of K6 and are the short night plus one fixed night; the other
  24 rounds fall into eight orbits {R, gR, g^2 R}, laid out either as orbit nights (three nights,
  one layout) or as "turned" nights {R, gR, g^2 R}. The model lays out 6 to 10 distinct nights
  instead of 10. At 29 the fixed night alone lays out in 3 s, but the whole model (2, 5 or 8 turned
  nights; CaDiCaL 1.5 and 1.9) gave no answer in 50 minutes each. It is UNSAT for 11 teams (two
  3-cycles give only three g-fixed matchings, five are needed) and for 17 on 3 x 9 with one turned
  night (its fixed night has no layout, 0.9 s), so it is not a route to those sizes either; 17 and
  23 are solved already by other scripts.

Solved since by a different route, the next section (`eval/odd-lns.py`, no group). An order-2 rename
was not needed: worked through, an involution fixing two points forces one round (every swapped pair
plus the two fixed points) and leaves six of the ten nights to lay out, about what odd-triple.py had.

### 29 and 35 teams, solved: two nights re-dealt at a time (2026-11-16, latest)

The open size above now has a wait-free season, stored like the others: over seeds 1 to 3 the tool
goes from 334 waits to **0**, and a build from 3.6 s to 1.1 s (`node eval/odd-cyclic-check.mjs
29:5:9`). The next size of the same class followed: 35 teams on 6 x 9, 505 waits to **0**, 3.8 s to
1.5 s a build. Both came from `eval/odd-lns.py` (new), which uses no group at all.

**The search.** The state is a whole round robin (29 rounds of K_30, the bye as team 29) in the
tool's night order: nine nights of three rounds and a last night of two. A night is good when its
own matches have a wait-free layout, a small SAT question (one night's 42 matches, not the 435 pairs
the one-night model chose from, which is why that model took 575 s). A step frees two nights, at least
one bad, and asks the solver to deal the 90 pairs they hold into the same six rounds again, each pair
once and each team once a round, with a layout for both nights, a good-night indicator per night
that switches its back-to-back clauses on, and "at least one more good night than before". The
other eight nights keep their pairs, so every state is a round robin. When six steps in a row find no
improvement inside their 120 s, it takes a sideways step (as many good nights, pairs re-dealt with
random phases) so the bad night sees new pairs. Each team's rows are encoded as one start row and a
window of g rows, or g - 1 for a team that sits out tonight, which the solver handles far better
than the betweenness clauses (row a and row c imply every row between).

| Run (4 at once, 4 cores) | Good nights over time | Result |
|---|---|---|
| seed 6 | 1 at 29 s, 5 at 123 s, 8 at 1,018 s, 10 at 1,186 s | stored |
| seeds 3, 5 | 9 of 10 at 991 s and 1,046 s | stopped when seed 6 finished |
| seed 4 | 8 of 10 at 1,049 s | stopped |
| 35 teams, seed 1 | 1 of 12 at 205 s, 5 at 764 s, 10 at 2,413 s, 12 at 4,724 s | stored |
| 35 teams, seed 2 | 10 of 12 at 2,920 s | stopped |
| 41 teams, seeds 1, 2 | 1 of 14 at 262 s, no step landed | stopped to free cores |

What did not work on the way (`eval/odd-lns.txt`): Glucose 4 with the betweenness clauses sat at
1 of 10 nights for 10 minutes; three nights freed a step climbed more slowly than two (6 of 10 at
2,000 s). A first version also held the two-round last night to three-game windows, which it can
never meet, and stalled at 9 of 10 for 112 steps; windows now follow the night's round count.

`doubleheader.test.mjs` builds 29 on 5 x 9 wait-free (and with waits when the search is off), and
the stored-designs test re-checks the solver's rows for all 33 designs (35 on 6 x 9 is built the same way). `eval/write-odd-designs.mjs`
gained `--append` (keep the stored designs, add new ones), since the earlier solver output is not
kept in the tree; a plain run with no files rewrites the file unchanged.

Open: the same class at 47 on 8 x 9 (41 on 7 x 9 closed, next sections) (3 spare slots
a night, no group of order k), and the fully booked 49 on 8 x 9 (43 on 7 x 9 closed 2026-11-17 by
`eval/odd-orbit.py`, the section after next).

### 49 teams on 8 x 9: a turn-fixed night does not lay out, and two hours of four solvers (2026-11-17, latest)

The open fully booked size, 49 teams on 8 courts x 9 slots, was estimated at about 11 hours for
`eval/odd-orbit.py` on one core. This run tried to cut that and did not. Both results are negative,
and both are written down so the next run skips them (`eval/odd-orbit-sym.txt`).

- **A second symmetry: no layout on a fully booked night.** `eval/odd-orbit-sym.py` adds to the
  orbit model that the night's set of pairs is also fixed by turning the three cycles (A to B to C to
  A, same position). That commutes with g and moves every full orbit, so the solver picks one pair
  per class of three orbits. The pairs alone always exist (`eval/odd-orbit-sym-pairs.py`, SAT at 13
  and 19). With the layout, every fully booked size tried was UNSAT: 13 on 3 x 6 in 0.5 s, 19 on
  3 x 9 in 82 s, and 25 on 4 x 9 gave no answer in 11 minutes against 141 s without the symmetry.
  With a court to spare it is SAT (13 and 19 on 4 x 9; 7 on 3 x 6). Fixing only some kinds of orbit
  (`--only`) was UNSAT at 13 or no faster at 19 (39 s against 34 s). 49 on 8 x 9 is fully booked, so
  this is not a route there. Two other symmetries fail on paper: swapping A and B pointwise maps an
  orbit onto itself with no fixed pair, and any turn whose cube is a power of g other than the
  identity puts two pairs of one orbit in the night.
- **The plain model with four solvers at once, two hours each: no answer.** CaDiCaL 1.9, CaDiCaL
  1.5.3, MapleChrono, and CaDiCaL 1.9 with totalizer instead of sequential-counter cardinalities,
  one per core, all stopped at 6,600 to 7,000 s. That fits the ~4x-a-size trend (43 on 7 x 9 took
  9,849 s alone).

What is left for 49: one run of `eval/odd-orbit.py 49 --courts 8 --times 9 --solver cd19` of about 11 hours
on its own core (a session's background limit is 2 hours, so it needs a resumable or split search),
or a model that fixes the window shapes and team positions first. The tool still builds 49 on 8 x 9
with waits.

### 47 teams on 8 x 9: five more runs from 13 of 16, no climb (2026-11-17, later)

The next step the section below asked for, run as written plus one new setting: three resumes of
`eval/odd-lns.py` from the stored 13-of-16 state, side by side on four cores, 6,000 s each, and
`eval/lns-bad-night.py` on the fourth (full logs at the end of `eval/odd-lns.txt`).

| Seed | Settings | Steps | Sideways | Better | Failed repairs |
|---|---|---|---|---|---|
| 131 | `--also 15` | 23 | 4 | 0 | 18, all timeouts |
| 132 | `--also 15 --sideways-after 2` | 28 | 11 | 0 | 18, all timeouts |
| 133 | `--free 3` (new at 47) | 20 | 1 | 0 | 19, all timeouts |

- **The search has stalled at 13.** With seeds 121 and 122 from the last session, five runs from 13
  have found no climb in 26,870 core-seconds. The bad nights stay 2, 3 and 11. The sideways steps
  re-deal their pairs without making any of them lay out.
- **Night 2 alone is not proved impossible.** Its 69 matches (7,485 variables, 17,103 clauses)
  came back UNKNOWN after 3,600 s with the one-night model. At 41 teams the last bad night was UNSAT
  in 677 s, and that verdict pointed straight at a re-deal. Here a layout may exist, but the search's
  300 s repairs never reach it. A longer budget (seed 92, 900 s) already did worse.
- **Freeing three nights did not help.** `--free 3` made one sideways step in 6,208 s, the slowest
  of the three. That matches 41 teams, where freeing three nights a step also stalled.

The stored state is unchanged (13 of 16). Throwing more seeds at the same moves is unlikely to pay
off. The next attempt should change the method: an orbit model like the one that closed 43 on 7 x 9
(`eval/odd-orbit.py`, with the 4x-a-size cost) for the n = 6m + 5 family, or a one-night model with
symmetry breaking so that night 2 returns SAT or UNSAT within an hour.

### 47 teams on 8 x 9: 5 to 13 of 16 nights, and why the repairs fail (2026-11-17, later)

The state saved by the last run (5 of 16, "47 teams on 8 x 9: 5 of 16 nights" below) is now **13 of 16** wait-free nights,
stored in `eval/lns-states/47-8x9.json` and checked by `lns-state.test.mjs`. The tool still anneals
47 on 8 x 9, with waits, until the last three nights lay out. Same script, `eval/odd-lns.py`, four
cores, about 4.5 hours, one container restart; full logs in `eval/odd-lns.txt`.

- **A relay, not one long run.** Each time a run found a better state it was committed, and the
  slowest run was restarted from it: seed 71 took the state from 5 to 11 (12,757 s, steps at
  2,915, 6,496, 8,614, 9,201, 12,202 and 12,757 s), seed 78 found a 10 of its own from 9, and after
  the restart seed 103 took 11 to 12 on its first step (372 s) and to 13 at 1,348 s. Seed 112
  reached 12 separately.
- **Every failed repair ran out of time; none was proved impossible.** The script now counts failed
  repairs by cause (`timeout`, `unsat`, `unconfirmed`, printed with each step). Over the instrumented
  runs: at least 98 failed repairs, every one a timeout, 0 UNSAT, 0 unconfirmed. That differs from 41 teams, whose last bad
  night was UNSAT on its own pairs (`eval/lns-bad-night.py`), and says the step budget, not the
  pairs, is what stops a step here.
- **But a longer budget did worse.** Seed 92 with 900 s repairs made one sideways step in about
  6,500 s and never climbed; the 300 s runs climbed in the same time. Most climbs came within one to
  four repairs of a sideways step (as many good nights, pairs re-dealt), which the search tries only
  after 6 failures in a row. `--sideways-after N` (default 6) makes that number an option; seed 112
  with 2 reached 12 from 11 at 841 s, seed 103 with 6 at 372 s, so there is no verdict yet. The
  last two runs, from 13 with `--also 15` (one with `--sideways-after 2`), took 8 sideways steps
  between them in about 4,000 s each and no climb.
- **Freeing the short night helps here.** At 41 teams `--also` (always free the short last night
  with a bad one) was untested. At 47, both of seed 103's climbs, 11 to 12 and 12 to 13, freed night
  15 with a bad night, so its 2 rounds (46 matches in 72 slots) took the pairs that did not fit.

Next: `python3 eval/odd-lns.py 47 --courts 8 --times 9 --seed S --step 300 --also 15 --resume-check 60
--resume eval/lns-states/47-8x9.json --save /tmp/47.json` on four cores (two of them with
`--sideways-after 2`), then, once the season is whole, `node eval/write-odd-designs.mjs --append`.

### 43 teams on 7 x 9: one fully booked night, turned fourteen times (2026-11-17)

**43 teams on 7 courts x 9 slots now plays three back-to-back games a night for every team, every
night.** Through the tool, seeds 1 to 3 (`node eval/odd-cyclic-check.mjs 43:7:9`): **1,073 waits to
0**, 2.5 s a build. It is the fifth size of the fully booked n = 6m + 1 family after 19, 25, 31 and
37: three rounds of 22 pairs is 63 real matches a night in exactly 63 slots, so every court is busy in
every slot and every team plays rows r, r + 1, r + 2.

- **Nothing new in the method, only the time.** `eval/odd-orbit.py` (three 14-cycles, team 42 and the
  bye fixed; one night that takes one pair from each of the 66 full orbits, turned 14 times, plus the
  half-turn pairs as the last round) was stopped after 39 minutes on 2026-11-16. Run alone on a core
  with CaDiCaL 1.9 (`--solver cd19`), it answered SAT in **9,849 s** (166,511 variables, 377,525
  clauses). The solve times so far grow about 4x a size: 23 s, 141 s, 626 s, 2,783 s, 9,849 s.
- **Stored and checked.** The season was re-checked whole by `odd-night-sat.check` before it printed,
  appended with `node eval/write-odd-designs.mjs --append eval/odd-designs/43-7x9.json` (35 designs),
  and `doubleheader.test.mjs`'s stored-designs test re-checks its rows like the others.

At 9 slots on the least courts every odd league from 11 to 45 teams is now wait-free except 47 (8 x 9,
n = 3k + 2, the neighbourhood search: best state 13 of 16 nights since 2026-11-17 later,
`eval/lns-states/47-8x9.json`, section above) and 49 (8 x 9, fully booked; at the 4x trend the orbit model needs about 11 hours on a core).

### 47 teams on 8 x 9: 5 of 16 nights, saved for the next run (2026-11-17)

47 teams on 8 x 9 (69 matches a night in 72 slots, 15 nights of three rounds and a short night of two)
is the next size of the 29, 35, 41 class. `eval/odd-lns.py` ran on it for the first time this session
(container restarted once; `--save` kept the states). Best state: **5 of 16 nights**, stored as
`eval/lns-states/47-8x9.json`; `lns-state.test.mjs` now checks every file in `eval/lns-states/`
(round robin, and each stored night wait-free on its own courts x slots), not only the 41-team one.

| Run | Good nights over time | End |
|---|---|---|
| seeds 1, 3 (fresh, 300 s steps) | 1 at 300 s, 2 at ~500 s | restarted with the container |
| seed 2 (fresh) | 1 at 300 s; 3, 4, 5 at 5,169, 6,024, 6,123 s | 5 of 16 at 9,166 s |
| seed 11 (resumed from seed 1 at 2) | 3 at 3,650 s | 3 of 16 at 9,067 s |
| seed 13 (resumed from seed 3 at 2) | 4 at 4,476 s, 5 at 5,370 s | 5 of 16 at 9,012 s |
| seeds 31, 41, 51, 61 (resumed at 5; 51, 61 with `--also 15`) | 5 at 661 s (60 s re-checks); no step accepted | lost to a second container restart (31: ~1.3 h in) |

The climb is slower than 41 teams' (1 to 7 good nights in about 4,200 to 5,500 s there, 1 to 5 in
5,000 to 6,000 s here), and a resume spends up to 180 s re-checking every unlaid night before its
first step (`--resume-check 60` cut that for the later resumes). Next:
`python3 eval/odd-lns.py 47 --courts 8 --times 9 --seed S --step 300 --limit 14000 --resume-check 60
--resume eval/lns-states/47-8x9.json --save /tmp/47.json`, four seeds on four cores, and the short last
night (night 15) freed with the bad one once few bad nights are left (`--also 15`), the move that
closed 41.

### 41 teams on 7 x 9: the last night, and a season with no waits (2026-11-16)

The 13-of-14 state below is finished: **41 teams on 7 courts x 9 slots now plays three back-to-back
games a night for every team, every night.** Through the tool, seeds 1 to 3: 752 waits to 0, and a
build takes 2.0 s instead of 3.4 s, because it lays each night out from the stored rows instead of
annealing.

- **The bad night was impossible, not slow.** `eval/lns-bad-night.py` takes a saved state and solves
  each night with no stored layout alone, with the same one-night model the search uses, under one
  long limit. Night 5's 60 pairs came back UNSAT in 677 s: no layout of them is wait-free, so no
  amount of extra solve time on that night would have helped. Only a re-deal could fix it.
- **What fixed it.** A resumed run (`--free 2 --step 300`, seed 23) freed night 5 together with the
  short last night (2 rounds, 40 matches in 63 slots, 23 spare) on its ninth step. The step re-dealt
  those five rounds' pairs and laid both nights out: the short night took the pairs night 5 could not
  place. The pick was random. A new `--also 13` option, which always frees the short night with the
  bad one, was started after the UNSAT verdict and had not landed a step when seed 23 finished, so
  it is untested. Two runs freeing three nights a step made one sideways step in 45 minutes.
- **Stored and checked.** The season was re-checked whole before it printed, written to
  `odd-designs.mjs` by `eval/write-odd-designs.mjs` (which checks it again, match by match), and
  `eval/lns-states/41-7x9.json` now holds the finished state, which `lns-state.test.mjs` checks in Node.

The n = 3k + 2 class on the least courts is now wait-free at 29, 35 and 41 teams. 47 on 8 x 9 is next;
it has 3 spare slots a night like the others and 16 nights. Full log: `eval/odd-lns.txt`.

### 41 teams on 7 x 9: 13 of 14 nights, and a search that survives the session (2026-11-16)

41 teams on 7 courts x 9 slots (60 matches a night in 63 slots) is the next size of the 29 and 35
class. An earlier run of `eval/odd-lns.py` sat at 1 of 14 good nights with no step accepted. This run
did not finish the season: the best state has **13 of 14 nights** wait-free, and three resumed runs
of 80 minutes each could not lay out the last one. The tool still anneals 41 on 7 x 9, with waits.
What landed is the search's ability to get that far and to carry on later:

- **A repair keeps its own layouts.** The solver lays out every night it marks good while it re-deals
  the pairs; the script used to throw that away and lay each night out again under a 20 s limit,
  rejecting the step when the second solve timed out. At 41 teams it often did. Now the repair's
  layouts go straight into the cache (the final season is still re-checked whole before it prints).
  With this change four fresh seeds climbed from 1 to 9, 10 and 11 of 14 in their 3.9 hours, where
  the old code had not landed one step.
- **`--save` and `--resume`.** The state (the round robin and the layouts of its good nights) is
  written after every accepted step; `--resume` starts from it and re-checks each stored layout
  match by match (`night_ok`) instead of solving it again. The first resumes had only the rounds and
  re-checked under 20 s, so 11 good nights came back as 9 or 10; nights with no stored layout now get
  180 s (`--resume-check`), and 12 came back as 12. Resuming a new seed on the best state is how the
  run went from 11 to 13 (seed 4, then seed 8).

| Run | Good nights over time | End |
|---|---|---|
| seeds 1, 3, 4 (fresh) | 1 at ~250 s; 7, 6, 7 at ~4,200 to 5,500 s | 10, 9, 11 of 14 at 14,000 s |
| seed 8 (resumed from seed 4 at 11) | 11 at 696 s, 13 at 6,081 s | 13 of 14 at its limit |
| seeds 11 to 13 (resumed from seed 8 at 13) | no gain in 4,800 s each | 13 of 14; the bad night moved (4, 2, 5) |

The state is in the tree, `eval/lns-states/41-7x9.json`, and `lns-state.test.mjs` checks it in
Node: a whole round robin, and each of the 13 stored nights wait-free on 7 x 9 (one row per match,
at most 7 a row, each team's games back to back). The next run resumes from it:
`python3 eval/odd-lns.py 41 --courts 7 --times 9 --seed S --step 150 --resume
eval/lns-states/41-7x9.json --save /tmp/41.json`. Full log: `eval/odd-lns.txt`.

### Three sessions at 40 and 46 teams: one night turned by a group, solved in 0.1 s (2026-11-16)

40 teams on 7 courts x 9 slots and 46 on 8 x 9 were the two even sizes left with waits at three
sessions a night (Part 5 of `eval/three-game-nights.txt`: 794 and 1,201 waits over seeds 1 to 3,
and 18.5 s and 11.8 s a build spent searching). The whole-season SAT model
(`eval/session-design-sat.py`) ran out of its 300 s on both. `eval/session-orbit.py` (new) asks
for one night instead, the idea `eval/odd-orbit.py` used for fully booked odd leagues.

**The construction.** Write n = 3k + 1 with k odd (40 = 3 x 13 + 1, 46 = 3 x 15 + 1). Let g add 3
(mod 3k) to every team but the last, which it fixes. Then g has order k, and because 3k is odd no
power of g except the identity fixes a pair, so every pair's orbit has exactly k pairs: there are
n(n - 1) / 2k = 3n / 2 orbits, exactly the number of matches in a night of three rounds. A night H
that is three perfect matchings, takes one pair from every orbit, and splits into three closed
blocks of at most 2 x courts teams gives the season: H, gH, ..., g^(k-1) H are k nights of three
rounds (all 3k = n - 1 rounds), every pair meets once, and each night is H with its teams renamed,
so its blocks have the same sizes. Unlike the odd case nothing is left over for a short night.
The SAT model is one night: 3 x n(n - 1)/2 pair-and-round variables plus block membership.

| Teams | Courts x 9 | k | Model (vars / clauses) | Solve | Blocks | Waits before (3 seeds) | Waits now | Build before / now |
|---|---|---|---|---|---|---|---|---|
| 40 | 7 | 13 | 10,472 / 37,022 | 0.1 s | 14 + 14 + 12 | 794 | 0 | 18.5 s / 1.5 s |
| 46 | 8 | 15 | 13,883 / 49,154 | 0.1 s | 16 + 16 + 14 | 1,201 | 0 | 11.8 s / 2.1 s |

(Solve times repeated three times each, same answer; 4-core container, CaDiCaL 1.5 via
python-sat 1.9.dev22.) The two designs are stored in `session-designs.mjs` like the others
(`node eval/write-session-designs.mjs --append out/40-3x9.json out/46-3x9.json`; `--append` is
new, because the earlier solver output is not kept in the tree and a full rewrite would drop the
32 stored designs). `doubleheader.test.mjs` re-checks both codes and builds both leagues wait-free.
With them every even size of 14 to 48 teams has 0 waits at 9 slots on the least courts; only 12
teams on 2 courts keeps its 78 (proved impossible above).

The same script also solves 22, 28 and 34 teams (k = 7, 9, 11; already stored from the whole-season
model) and 52, 58 and 64 teams (k = 17, 19, 21; 0.3 s each, blocks 18 + 18 + 16, 20 + 20 + 18,
22 + 22 + 20). Those three are not stored: the eval and the stored designs stop at 48 teams, and
the one-character code covers 64 teams at most. n = 3k + 1 with k even (14, 26, 38) is not
covered: there the half-turn pairs in each ring have orbits of k / 2.

### Odd leagues one night at a time: 21 and 23 teams on 4 x 9, 27 on 5 x 9 and 7 x 6 (2026-11-15, latest)

The whole-season model above timed out on every odd size from 19 teams up at 9 slots. Those runs
ask for the round robin and all of its nights at once. `eval/odd-cyclic.py` fixes the round robin
instead, so it only has to solve one night.

**Why one night is enough.** In a 1-rotational round robin of n odd teams (a *starter*: the nonzero
residues mod n in pairs, using each difference +-d once; round r is the starter plus r, and team r
sits out), adding 1 to every team maps round r to round r + 1. So the night made of rounds
{s, s + a, s + b} is the night {0, a, b} with its teams relabelled. If one night's layout exists,
every translate of it has the same layout. The script:

1. asks a small SAT model (about 3n matches, each given a time row; at most `courts` a row; no team
   twice in a row; each team's rows consecutive) for the layout of each pattern {0, a, b};
2. covers Z_n with disjoint translates of the patterns that pass, leaving n mod 3 rounds for the
   short last night (depth-first search);
3. orders the rounds night by night, re-checks the season with `odd-night-sat.py`'s own `check`,
   and prints the same JSON, so `eval/write-odd-designs.mjs` stores it unchanged.

It tries the patterned starter (the circle method's {-k, k}) first, then random starters
(`--starters`, `--seed`).

| Teams | Courts x 9 | Courts at 6 slots | Starter | Solve (s) | Waits before (3 seeds) | Waits now |
|---|---|---|---|---|---|---|
| 21 | 4 | 5 | patterned, pattern {0,1,2} | 0.2 | 102 | 0 |
| 23 | 4 | 6 | 5th tried (random, seed 1) | 26 (221 in all) | 184 | 0 |
| 27 | 5 | none stored | patterned, {0,1,2} | 0.3 | 231 | 0 |

At 6 slots it also found **27 teams on 7 courts** (39 matches a night in 42 slots; the whole-season
model passed 40 minutes): the 10th starter tried has one pattern, {0, 4, 14}, whose nine translates
cover all 27 rounds (56 s on that starter, 849 s in all). Waits over three seeds 201 to 0.

It also found the stored 15 and 17 on 3 x 9 again in 0.1 s and 22 s, where the whole-season model
took 51 s and 245 s.

**Where it fails: fully booked nights.** At 13 teams on 3 x 6, 17 on 4 x 6, 13 on 2 x 9, 19 on 3 x 9
and 25 on 4 x 9 every slot of the night is used. No pattern of any starter tried laid out (42
starters x 51 patterns at 19 teams), while the whole-season model solves the 6-slot ones in seconds.
One 19-team night on 3 x 9 does exist (`odd-night-sat.py ... --nights 1`, SAT in 33 s), so 19 on
3 x 9 is still open. Only the translation structure has been ruled out, for the starters tried.
Measurements: `eval/odd-cyclic.txt`. `node eval/odd-cyclic-check.mjs 23:4:9` reruns the tool's
before and after.

`doubleheader.test.mjs` builds 21 and 23 teams on 4 x 9, 27 on 5 x 9 (with waits when the search is
off) and 27 on 7 x 6 wait-free. The stored-designs test re-checks the solver's rows for all 21 designs.

Open: 19 on 3 x 9 and 25 on 4 x 9 (solved since, above: `eval/odd-orbit.py`), and 29 on 5 x 9
(see `eval/odd-cyclic.txt`).

### Odd leagues at 9 time slots: fewer courts, and three more proofs (2026-11-15, later)

The odd designs above were all solved at 6 time slots. A league with 9 slots (three sessions a
night) could use them, but only on the 6-slot court count, and on the courts the count bound asks
for at 9 slots the tool left long waits: 11 teams on 2 courts 31 waits over seeds 1 to 3, 13 on 2
courts 95, 17 on 3 courts 60, 19 on 3 courts 171, 25 on 4 courts 281
(`eval/three-game-nights.txt`, part 7 "before").

`eval/odd-night-sat.py ... --times 9 --shape` (the same model; `window_shapes` already took any
slot count) found seasons for:

| Teams | Courts x 9 | Courts at 6 slots | Solver (s) | Waits before (3 seeds) | Waits now |
|---|---|---|---|---|---|
| 9 | 2 | 3 | 1.3 | 0 | 0 |
| 11 | 2 | 3 | 6.0 | 31 | 0 |
| 13 | 2 | 3 | 100 | 95 | 0 |
| 15 | 3 | 4 | 51 | 0 | 0 |
| 17 | 3 | 4 | 245 | 60 | 0 |

(Four runs shared a 4-core container, so the solver times are rough.) 9 and 15 teams were already
wait-free at 9 slots without a design (spare slots), so their designs are a guarantee, not a gain.

**Three settings proved to keep a wait** (UNSAT without the shape constraints, so the proof does not
lean on `window_shapes`): 5 teams on 1 court x 9 (0.0 s), 7 on 1 court x 9 (0.0 s) and 7 on 2 courts
x 9 (12 s). They join `PROVED_NO_WAIT_FREE`, so 7 teams on 2 courts x 9 now get "need at least 3
courts ... checked for every possible 7-team season on 2 courts" instead of a bound they can't reach.

**Stored per slot count.** `eval/write-odd-designs.mjs` used to keep one design per team count (the
fewest courts); a 9-slot design on fewer courts would have replaced a 6-slot one and left 6-slot
leagues without any. It now keeps the fewest courts per (teams, slots), and a 9-slot design only
when it saves a court over the 6-slot one (`designedNights` already takes any design with
`times <=` the league's). `doubleheader.test.mjs` checks both: 11 and 13 teams on 2 x 9 build
wait-free (and keep waits with the search off), and 11 on 3 x 9 still uses the 6-slot design.

Open: 19 teams on 3 x 9 (fully booked; the `--shape` run passed 30 minutes), 21 on 4 x 9 (passed
20), 23 and 25 on 4 x 9, 27 and 29 on 5 x 9 (29 passed 25), and 27 on 7 x 6 (passed 40 this time,
25 before). At 9 slots a full night allows far more window shapes than at 6, so the implied
constraints prune less; a symmetry break on the first night, or solving night by night with the
pairs left, are the next things to try (`eval/odd-night-sat.txt`).

### Odd leagues, three games a night: solved with the layout, and two proofs (2026-11-15, later)

An odd league could not use any of the above. Each round one team sits out, so on a night of three
rounds three teams play two games and the rest play three; a closed block cannot hold a two-game
team whose bye falls in its middle round, and `sessionBlocks` returns null for odd n. At 6 time
slots on the least courts the search left 7 teams 7 waits, 9 teams 31, 11 teams 16 to 22 and 13
teams 52 (`eval/three-game-nights.txt`, part 1).

**The solver lays the night out itself.** `eval/odd-night-sat.py` asks for a round robin of n + 1
teams (team n is the bye) and, for every night, a time row for each match: at most `courts`
matches a row, no team twice in a row, and each team's rows consecutive (q[a] and q[c] imply q[b]).
That is the question `nightRowsExact` answers for one night, asked of the whole season at once.

**The shape of a full night is forced, and saying so is what makes it solvable.** When every slot
is booked (9 teams on 2 courts, 13 on 3, 17 on 4, 21 on 5, 25 on 6, all at 6 slots), every row
holds exactly 2 x courts teams, and the row counts leave one way to start the windows: the
three-game teams split evenly into rows 1-3 and rows 4-6, and the three two-game teams take rows
1-2, 3-4 and 5-6 (derived by hand for 9 teams in `eval/nine-on-two.py`, and enumerated for every
size by `window_shapes`). With a few slots spare (15 on 4, 19 on 5, 23 on 6) six shapes fit.
`--shape` adds these as implied constraints: each team takes one window, the night follows one
allowed shape (a selector), and the two-game windows go to that night's bye teams. Without them
the solver ran past 30 minutes on 9 and 13 teams and past 20 on 15 and 19; with them 13 teams
takes 3 to 4 s, 15 teams 1 s, 19 teams 66 s, 25 teams 78 s.

**Two settings are proved to keep a wait**, though the one-night count allows both:

- **7 teams on 2 courts x 6 times:** UNSAT in 0.1 s (2.4 s without the shapes).
- **9 teams on 2 courts x 6 times:** the forced shape makes each night two groups of four (the
  three-game teams of one session and a two-game team) that play K4 minus one edge, joined through
  the middle two-game team. `eval/nine-on-two.py` enumerates all 45,360 such nights, fixes the first
  by relabelling, and finds 56 possible second nights and no third: no season exists
  (`eval/nine-on-two.txt`, 1.3 s). The SAT model with `--shape` agrees (UNSAT, 11 s).

Both join `PROVED_NO_WAIT_FREE` (with 8 teams on 2 x 6 and 12 on 2 x 9 from earlier), so the
waits notice now says "need at least 3 courts ... checked for every possible 7-team season on 2
courts" where it used to say "more courts or fewer time slots close them".

**In the tool.** The designs are stored in `odd-designs.mjs` (generated by
`eval/write-odd-designs.mjs`, which re-checks each; JSON in `eval/odd-designs/`), one per size on
the fewest courts found: 5 to 25 and 29 teams (12 designs, 7 KB with their rows; per-size solver
times in `eval/odd-night-sat.txt`).
`oddDesigns(n)` decodes them, and `waitFreeNights` tries `designedNights` first for an odd league
with a stored design, as it does for even ones. Two details:

- **The tool's own layout search could not always find the solver's layout.** A fully booked
  21-team night packed under one relabelling of the teams and ran out of its 3,000 nodes under
  another; a 25-team night needed up to 100,000. So each design carries the solver's rows too
  (`layout`, one character per match), `designedNights` registers them for its relabelling, and
  `nightLayout` uses a stored layout only when its own search finds nothing, after checking it
  (rows in range, at most `courts` a row, every team back to back; `knownLayout`). It also tries up
  to `ODD_RELABELS` = 8 relabellings of the seed before giving up on a design.
- The test re-checks every stored design in JS (each pair once, every team once a round and once
  out, every night's stored rows back to back on its courts) and builds 11 to 25 teams wait-free.

Measured (`node eval/three-game-nights.mjs`, `eval/three-game-nights.txt`, part 6, seeds 1 to 3,
every season valid), waits with the search off and on, the least courts at 6 slots:

| Teams | Courts | Waits before | Waits now | Build (ms) |
|---|---|---|---|---|
| 11 | 3 | 22 | 0 | 144 |
| 13 | 3 | 52 | 0 | 185 |
| 15 | 4 | 53 | 0 | 344 |
| 17 | 4 | 86 | 0 | 311 |
| 19 | 5 | 89 | 0 | 383 |
| 21 | 5 | 148 | 0 | 428 |
| 23 | 6 | 125 | 0 | 581 |
| 25 | 6 | 217 | 0 | 610 |
| 27 | 7 | 201 | 201 | 3,352 (no design yet) |
| 29 | 7 | 293 | 0 | 981 |

7 and 9 teams need 3 courts (proved) and are wait-free there, as before. Part 1's 39 settings: total
waits 143 to 75, settings with no waits 33 to 35 of 39; what is left there is the proved-impossible
6, 7, 8 and 9 teams on 2 courts. 5 teams on 1 court x 6 is UNSAT too (0.0 s) and joins the list.

Open: 27 teams on 7 courts (the `--shape` run passed 25 minutes; 23 and 29 took 5 and 6); odd leagues at 9 time slots (three sessions);
the forced shape as a construction rather than a solver run (a full night is two near-complete
groups joined through one team, which may have a closed form for every n = 4c + 1).

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
  search's gap to the floor (12 teams: 136 non-cyclic since the refill search below, against a
  floor of 120; whether that is the optimum is unknown).

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

## Refilled rounds: 12 teams from 152 to 136 (2026-11-11, latest)

At 12 teams every earlier method stopped at 152 to 156 against a floor of 120: sampled starters,
the annealed and O(p) climbs (starters are a small family, every round a shift of the first), and
the annealing search from both starts. `eval/round-refill.mjs` searches all round robins instead.

- **The move.** Take 2 to 5 rounds out (half the time next to each other, half anywhere). Their games
  form a w-regular graph. Refill the w slots with every split of that graph into w perfect matchings,
  in any order, by depth-first search, and keep the split with the least total carry-over (ties at
  random, so the search walks plateaus). The DFS places one game at a time and adds the carry-over
  cells it creates at once (team a meeting b in round r makes prev(a) -> b and b -> next(a)). A cell
  that already holds c costs 2c above the floor, so any branch past the incumbent is cut. With a
  small probability a move takes a random refill within a few units of slack instead (a kick). After
  1,500 moves with no change it restarts from the start timetable with its rounds shuffled. Each
  result is re-scored with `carryOverFromOpponents` and checked to be a round robin.
- **Measured** (12 teams, all playing, non-cyclic; 420 s per seed from the circle method, 4 seeds):
  136, 136, 136 and 152. At 136 every count is 0, 1 or 2, and 8 cells hold 2. These four runs used
  the first restart rule (after 4,000 moves with no change, the best so far with two rounds
  swapped). The shuffled restart above came later and was used for the other sizes below. The search does not show whether 136 is the
  least possible.
- **Stored timetables** (`TIMETABLES`, `storedTimetable` in `carryover.mjs`). The best result is
  stored whole as opp[r][t]. It is a third start (`start: "timetable"`), beside the circle method
  and the starter, and the search keeps the best of the three on its own score. It does not
  replace the starter. At first it did, and the 12-team season at seed 2, weight 10 got worse:
  596 / 46 from the new leg, against 618 / 40 from the starter. A leg with less carry-over can
  leave the season's break pass a worse pattern. At 12 teams and 9 teams a search now runs from three
  starts instead of two, so it takes about half as long again.
  Through the search (`node eval/field-start.mjs 12`, seed 1, effort 1; carry-over / breaks):

  | 12 teams | Before | Now | Floor |
  |---|---|---|---|
  | Single, carry-over only | 152 / 18 | **136 / 20** | 120 |
  | Single, break weight 10 | 152 / 18 (score 332) | 180 / 14 (score 320) | 120 |
  | Season, carry-over only | 538 / 62 | **530** / 68 | 492 |
  | Season, break weight 10 | 598 / 46 (score 1,058) | 618 / 42 (score 1,038) | 492 |

  Each setting's own score went down. With a break weight, the search now trades some of the new
  carry-over for 4 fewer breaks.
- Tests (`starter.test.mjs`): every stored timetable is a round robin. Its value is pinned and is
  below the starter it replaces at every start. `lowCarryOverRounds` from it returns no more than
  the stored value.
- **Other sizes** (300 s, one or two seeds each, `eval/round-refill.txt`). 9 teams (10 with a bye): 69,
  against 71 for the starter, floor 63. The 10-team run tied the starter at 94 with all ten playing, but
  the same timetable with one team as the bye scores 69. It is stored as `TIMETABLES[10].odd`,
  relabelled so the bye is team 9, and the 9-team search now returns 69 / 12. 11 teams (searched with a
  bye) tied the circle search at 115. 14 teams stopped at 220 from the circle start, worse than the
  starter's 212. Past 12 teams the refill DFS has many more splits per move, so it needs a longer
  run or a starter start.
- Open: 12 teams at 132 (was 136; "12 teams at 132" below) against a proved 124 (a timetable below 132, or 124 to 130 ruled out); the refill
  from the climbed starters at 14 to 18 teams; refilling the second leg of a season.

## SAT bounds: 10 teams cannot go below 90 (2026-11-12)

The searches above can only find timetables; they cannot say a value is impossible.
`eval/carryover-sat.py` asks a SAT solver (CaDiCaL 1.9.5 through python-sat, MIT; the eval needs it,
the tool does not) whether any single round robin of n teams, all playing, has non-cyclic carry-over
at or under V. SAT returns a timetable; UNSAT is a proof that none exists.

- **Encoding.** x[r,i,j]: i meets j in round r (each pair once, each team once a round; teams labelled
  so team 0 meets team r + 1 in round r, which any round robin allows). p[t,r,a,b] is forced true when
  t meets a in round r and b in round r + 1, and each carry-over cell counts its p's with a
  totalizer. The cells always sum to n(n - 2), so value = n(n - 2) + 2E with E = sum of C(c, 2) over the
  cells; E is held to (V - n(n - 2)) / 2 by a second totalizer. Cells are capped at 4, which never binds
  when C(5, 2) = 10 > E (the script says when it does). A found timetable is re-scored from its
  opponents alone.
- **Checked against what was already known.** 6 teams: UNSAT at 40, SAT at 42, the same least value
  as the enumeration of all 720 ordered 1-factorizations above. 8 teams: SAT at the floor, 48.
- **10 teams** (all playing, CaDiCaL, one core each, this container):

  | Asked: value <= | Answer | Time |
  |---|---|---|
  | 80 (the floor) | UNSAT | 0.9 s |
  | 82 | UNSAT | 10.8 s |
  | 84 | UNSAT | 78 s |
  | 86 | UNSAT | 387 s |
  | 88 | UNSAT | 1,302 s |
  | 90 | no answer, stopped | 69 min |
  | 92 | no answer, stopped | 98 min |

  So no 10-team round robin has non-cyclic carry-over below 90 (values are even), against 94, the best
  the refill search found with all ten playing. The least is 90, 92 or 94. Each step of 2 cost the
  solver 3 to 7 times the last.
- **12 teams.** A run at 120 (the floor) and one at 134 (below the stored 136) were both stopped after
  about 65 and 70 minutes with no answer. A descending probe (240 s per value): SAT at 170 in 24 s
  (a timetable at 166), no answer at 160. So at 12 teams this
  encoding does not yet reach the heuristic's 136, let alone prove anything: the open question above
  stays open. Next: symmetry breaking for round reversal (it transposes the matrix and keeps the
  value) and for the remaining relabellings, an incremental solve that tightens V on one solver, or a
  cube-and-conquer split over the second team's round order, before longer runs.
- **On the page.** `carryOverFromOpponents` now returns `proven` (`PROVEN_LEAST` in `carryover.mjs`)
  for single non-cyclic round robins of 6, 8 and 10 teams, and the schedule's report says when the
  floor is not reachable: at 10 teams, "80 is the floor for this many games, but no 10-team round robin
  can go below 90; a SAT solver proved it". Tests (`carryover.test.mjs`): the 6-team value matches
  the enumeration, and no search result goes below a proved least.
- Not claimed: the cyclic value (Russell's definition) was not run; none of this has been checked
  against the published optimisation literature on carry-over, which this run did not read.

## The least carry-over at 10 teams is 94: an exact search (2026-11-14)

The SAT section above left 10 teams open: no round robin at 88 or under, the refill search's best at
94, and CaDiCaL silent after 69 minutes at 90 and 98 at 92. `eval/carryover-bnb.c` (plain C, no
dependencies) settles it by depth-first search over the timetable itself.

- **Search.** Rounds are filled in order and, inside a round, the lowest unplaced team takes a
  partner. Team t meeting u in round r adds one to two carry-over cells (t's last opponent -> u and
  u's last opponent -> t), and a cell already holding c costs c more of E (value = n(n - 2) + 2E, as
  in the SAT encoding), so a branch is cut the moment E passes the bound. A round where some unplaced
  team has no unused unplaced partner is cut too.
- **Symmetry.** Relabelling teams keeps the value, so round 0 is fixed to (0 1)(2 3)...; in round 1
  team 0 meets team 2 (the relabellings that keep round 0 and team 0 reach any other choice) and
  team 1 meets team 3 or 4 (the same argument with team 2 fixed). Round reversal is not used.
- **Checked against what was already known** (`eval/carryover-bnb.txt`): 6 teams, none at 40 and a
  42 found (the enumeration's least); 8 teams, the floor 48 found; 10 teams, none at 80, 82, 84, 86
  and 88, the same answers CaDiCaL gave, in 0.2 to 34 s against its 0.9 to 1,302 s.
- **10 teams** (one core each, this container):

  | Asked: value <= | Answer | Nodes | Time |
  |---|---|---|---|
  | 88 | none | 246 M | 34 s |
  | 90 | none | 540 M | 73 s |
  | 92 | none | 1,069 M | 145 s |
  | 94 | found (largest cell 2) | 15 M | 2 s |

  So **94 is the least non-cyclic carry-over of any 10-team round robin**, and the refill search had
  already found it. `PROVEN_LEAST[10]` is now `{ least: 94, exact: true }`.
- **On the page: a carry-over-only season.** Checking the page showed it did not reach 94. Every one of
  its tries weighs breaks against carry-over (break weights 10 to 80, or a cap on breaks), and at 10
  teams the ten tries' best was 106 (the squeezed and regrounded seasons after them reached 102, but the
  choices only look at the ten); with "the most even carry-over" chosen it kept 106 / 10
  (`eval/browser-proved-least.mjs`, before). The plain search with no break weight
  (`lowCarryOverRounds`) reaches 94 at seeds 1 to 3. So the page now adds one more season after the
  squeezes, polishes and floor-priced seasons, searched on carry-over alone (`carryOverPure`, at the
  base seed; nothing is added when an earlier season already has that carry-over or less), and "the
  most even carry-over" chooses among every season instead of the first ten. The other three choices
  look at the same ten tries as before and keep the same season; the new one joins the list a person
  can pick from. At 10 teams "the most even carry-over" now keeps 94 / 14 instead of 106 / 10, and the
  report says "80 is the floor for this many games, but no 10-team round robin can go below 94, and
  this schedule reaches it; an exhaustive search proved it". The same holds wherever the stored
  timetables and starters beat the weighted tries (`bestCarryOverRounds`, 8 weighted + 2 capped tries,
  seed 1, carry-over / breaks kept by "the most even carry-over"): 9 teams 89 / 5 to **69 / 12**, 10
  teams 106 / 10 to **94 / 14**, 12 teams 168 / 14 to **136 / 20**; with a break weight of 10 the kept
  season is the same with and without it at all three. It costs one more search after the others: at
  20 teams 0.9 s for a single round robin (360 / 52) and 1.6 s for a home-and-away season (1,460 / 126),
  measured in Node on a busy container. `bestCarryOverRounds` takes `pure: true`
  for the same on the command line (off by default, so earlier results are unchanged).
- Tests (`carryover.test.mjs`): the timetable the search found is a round robin and scores 94; the
  plain search at seed 1 reaches it; with `pure` "the most even carry-over" keeps 94 and the other
  choices keep what they kept. `eval/browser-proved-least.mjs` builds the 10-team league in Chromium
  and reads the line.
- **12 teams.** The same search does not finish: asked only whether the floor (120) is reachable,
  four parts (`./carryover-bnb 12 0 P 4`) on four shared cores were stopped after 23 minutes with no answer (`eval/carryover-bnb.txt`).
  Each step of 2 cost about 2x at 10 teams, so the 12-team tree is the problem, not the bound. Next:
  a lower bound on the carry-over the remaining rounds must add (each team's remaining opponents
  are known), which would cut far higher in the tree.
- Not claimed: this is the non-cyclic value used throughout this README; Russell's cyclic value
  (last round to first) was not searched, and nothing here was compared with published tables,
  which were not reachable from this session.

## 12 teams cannot reach 122: a matching bound and a symmetry cut (2026-11-14, later)

The exact search above did not finish at 12 teams even when asked only about the floor. Two changes
to `eval/carryover-bnb.c` make it finish there, and they keep every answer it gave at 6, 8 and 10.

- **A bound that is exact for the rest of a round.** Inside one round every team is met once, so each
  carry-over column (the team being met) gains exactly one entry, and the costs of a round's pairs add
  without interacting. The least E the teams still unpaired in a round can add is therefore a min-cost
  perfect matching. `can_pair` answers "is there one within the remaining budget" by depth-first search
  with failures remembered per round start, and a branch is cut when there is not, at every node and
  when each round starts. Alone it cuts nodes 2.6x but saves only a fifth of the time.
- **Round 1 once per cycle type.** Rounds 0 and 1 together are disjoint alternating cycles of length 4
  or more, and the relabellings that keep round 0 take any round 1 to any other with the same cycle
  lengths. So round 1 is placed once per partition of the n / 2 pairs into cycles (at 12 teams four
  ways: 12, 8 + 4, 6 + 6, 4 + 4 + 4), where the first version fixed only two teams' round-1 opponents.
- **Measured at 10 teams** (`eval/carryover-bnb.txt`; asked value <= 88, every run "none"): first
  version 246 M nodes, 33.5 s; bound alone 94 M, 26.8 s; symmetry alone 28 M, 3.9 s; both 10.5 M,
  3.0 s. The proof that 94 is the least now takes 13 s at 92 instead of 145 s.
- **12 teams** (four parts on four cores): none at 120 (about 3 min each, 1.8 billion nodes in all),
  none at 122 (about 25 min each, 15.2 billion nodes). So **no 12-team round robin has non-cyclic
  carry-over below 124**, and the best known timetable was 136 (README "Refilled rounds"; 132 since "12 teams at 132" below). 124 itself
  was not asked: each step of 2 cost about 9x, about 4 hours on four cores.
- **On the page.** `PROVEN_LEAST[12]` is `{ least: 124, exact: false }`, so a 12-team single round
  robin's report now says "120 is the floor for this many games, but no 12-team round robin can go
  below 124; an exhaustive search proved it", and does not claim a schedule reaches it. Tests
  (`carryover.test.mjs`): the circle method and the plain search at 12 teams stay at or above 124, and
  14 teams have nothing proved.
- Not claimed: the gap from 124 to 136 is open (124 to 132 since the next section). Round reversal is still unused (about 2x), and so is
  any bound across rounds; nothing here was compared with published carry-over tables.

## Freeing up to 8 rounds at once: 136 at 12 teams and 212 at 14 hold (2026-11-14, latest)

The refill search (above) re-deals 2 to 5 rounds per move. `eval/carryover-lns.c` frees more: each
move keeps the first k rounds of the current timetable, or of its reversal (reversing the rounds
transposes the carry-over matrix and keeps the value), and the exact search of `carryover-bnb.c`,
with its per-round matching bound, completes the last w = 4 to 8 rounds from the games left. So a
move tries every way to deal those games into w rounds in any order, within a node cap (2 to 8 M per
move), asks first for strictly less carry-over, then may take a different completion at the same
value, and after 200 idle moves swaps two rounds. Every result is rescored from its opponents alone
and checked to be a round robin. Raw output: `eval/carryover-lns.txt`.

- **Checked where the answer is known.** 10 teams from the circle method (value 374): 94, the proved
  least, after 19 moves and 4 s.
- **12 teams** (four runs of 1,500 s on four shared cores): from the stored 136, two runs (2,523 moves,
  423 at the same value) found nothing lower. From the circle method (768), one run reached **136 on
  its own, by a different timetable** (not checked for relabelling equivalence), after 1,120 s; the other
  stopped at 150. So two unrelated searches, the refill and this one, both stop at 136.
- **14 teams** (four runs of 1,200 s): from the stored starter at 212, three runs (4,662 moves freeing
  4 to 8 of the 13 rounds) found no completion below 212; from the circle method (1,378) one run
  reached 224, against the refill's 220. The floor is 168.
- **What it changes.** Nothing on the page: no stored timetable improved, so `TIMETABLES` and
  `PROVEN_LEAST` are unchanged. (Later the same day the refill search in C, next section, found 210 at 14 teams.) It is evidence, not proof, that 136 is hard to beat: re-dealing up to
  8 of the 11 rounds from either end found nothing lower, so the next step at 12 teams is the proof
  side, 124 to 134 by the exact search (round reversal, a cross-round bound), rather than more local
  search.
- Not claimed: moves that hit the node cap were not counted, so "nothing lower" is "nothing found",
  not a proof that the stored timetables are optimal within 8 rounds.
## The refill search in C: 14 teams at 210, and 12 teams' 136 again (2026-11-14, latest)

`eval/round-refill.mjs` found 136 at 12 teams in 3 of 4 seven-minute runs, and stopped at the
starter's 212 at 14 and 318 at 18; the 8-round exact re-deal (`eval/carryover-lns.c`, section above) also
held at 136 and 212. `eval/refill-search.c` (plain C, no dependencies) is the same
move with three changes, to ask whether those numbers are walls or just where a slow search stopped.

- **The move** is unchanged: take 2 to `WMAX` rounds out, refill them with the least-carry-over split
  of their games into perfect matchings, in any order, by a depth-first search that cuts a branch as
  soon as its carry-over passes the budget (a node cap of 20,000 per move).
- **Acceptance**: the budget is the current value plus a slack drawn from an exponential with mean 1
  (rounded down to even), so a slightly worse refill is taken only when nothing in the budget is better.
- **Kicks and restarts**: after 2,000 moves with no new best for the climb, back to the climb's best and
  2 to 5 random refills within a wide budget (a kick); after 30 kicks with no new best, a fresh climb
  from the circle method with its rounds shuffled. `CLIMBS=1` prints each climb's best.
- **Speed**: about 1,300 moves a second at `WMAX` 5 and 47,000 at `WMAX` 3 (12 teams, one core), against
  the Node script measured no rate; `WMAX` 3 turned out the better setting at 12 and 14 teams.

Measured on four shared cores (`eval/refill-search.txt`, every best re-scored from scratch and checked
to be a round robin; the page's `carryOverFromOpponents` agrees):

| Teams | Runs | Climbs | Best | How often | Before | Proved floor |
|---|---|---|---|---|---|---|
| 12 | 4 (2 x 900 s at `WMAX` 5, 2 x 600 s at `WMAX` 3) | 631 | 136 | every run; 5 of the 598 climbs at `WMAX` 3 | 136 | 124 (README above) |
| 14 | 8 (240 to 900 s) | 865 at `WMAX` 3 | **210** | 2 of 8 runs (one climb each) | 212 (starter) | 168 (counting floor) |
| 18 | 2 x 900 s | 173 | 356 | both runs | 318 (starter) | 288 |

- **12 teams**: no climb out of 631 went below 136, and the lowest five all landed on it. That does
  not prove 136 is the least (the exact search above proves only 124), but four independent runs and a
  different program hitting the same wall make a 12-team timetable below 136 look unlikely to come from
  more of this search. (Later the same day `eval/window-refill.c`, the section after next, found 132.) The useful next step there is the proof side: 124 to 134 ruled out.
- **14 teams: 210**, two below the starter, found by two separate runs (seeds 44 and 51). Every count is
  1, 2 or 3 (129 cells at 1, 18 at 2, one at 3). It is stored as `TIMETABLES[14].even` in
  `carryover.mjs`, so the page's search starts from it beside the circle method and the starter and
  keeps whichever ends best (`eval/stored-14.mjs`, seeds 1 to 3, effort 1):

  | 14 teams | Before | Now |
  |---|---|---|
  | Single round robin, carry-over only | 212 / 32 breaks | **210 / 26** (fewer breaks too) |
  | Single, break weight 10 | 252 / 18, 240 / 18, 238 / 20 | the same (the starter is kept) |
  | Home and away, either setting | 732 / 84 ... 842 / 54 | the same |

  Nothing got worse at any seed or setting. The page's own weighted tries (`carryOverTry(14, i, { seed: 1,
  weighted: 8 })`) moved too, and each of the seven that changed scores lower on its own weight (carry-over
  + weight x breaks): single round robin try 1 (weight 20) 250 / 18 to 244 / 18, try 3 (weight 80) 238 / 20 to
  250 / 18, try 5 (weight 20) 244 / 20 to 250 / 18; home and away try 2 (weight 40) 1,290 / 42 to 1,030 / 46,
  try 3 (weight 80) 1,014 / 46 to 1,078 / 42, try 5 (weight 20) 880 / 52 to 942 / 46, try 7 (weight 80)
  1,118 / 44 to 908 / 46. The two MaxSAT-checked 14-team seasons in `orient.test.mjs` are now rebuilt
  without the stored start, so the proofs still apply to the timetables they were run on. As 12 teams showed (README "Refilled rounds"), a leg with
  less carry-over does not always make a better season, which is why it is a third start, not a
  replacement. At 13 teams the same timetable with one team as the bye scores 179, worse than the 169
  the search already finds, so it is stored for 14 only.
- **18 teams**: from the circle method the search stops at 356, well above the starter's 318. Past 14
  teams a climb from scratch is too slow; the next try is the refill started from the climbed starters
  (`start` takes a timetable file) with restarts that re-shuffle the starter rather than the circle.
- Tests (`starter.test.mjs`): the stored 14-team timetable is a round robin, scores 210, is below the
  starter at every start, and the search from it returns 210 or less.
- Not claimed: 210 is a heuristic result, not a proved least at 14 teams; nothing here was compared with
  published carry-over tables.
## 12 teams at 132: a window refill that walks plateaus (2026-11-14, latest)

The two sections above stopped at 136 at 12 teams and called it a likely wall. It is not:
`eval/window-refill.c` (plain C, no dependencies; written in parallel with `eval/refill-search.c` and
landed after it) finds **132**, so the least at 12 teams is now 124 to 132. It is a close cousin of
`refill-search.c`; the differences are in what a move accepts and where a stalled search restarts:

- it takes the *first* refill its randomised DFS finds under the target, not the least one, with the
  target one below the incumbent and then equal to it, so most moves are uniform-ish random steps
  across a plateau of equal value rather than a best-refill climb;
- the removed rounds are anywhere half the time (not only adjacent), and a stall restarts from the
  best timetable with two rounds swapped or all reversed, never from a fresh circle method.

Which of these matters was not tested.

- **Move.** Take w rounds out (w from 2 to 6; contiguous half the time). Their games form a w-regular
  graph; refill the w rounds with a split of it into perfect matchings by depth-first search, rounds in
  order, the lowest unplaced team first, partners in random order. A game placed in round r adds the
  carry-over cells from round r - 1 and, when r + 1 is not refilled, into round r + 1; a cell already
  holding c costs c, so a branch is cut as soon as the total passes the target. The target is first one
  below the incumbent (an improvement), then equal to it (a plateau step), or, 2% of the time, 1 or 2
  above (a kick). Each search stops after a node limit; after a stall the search restarts from the best
  with two rounds swapped or all reversed. Every new best is re-scored from its opponents and checked to
  be a round robin.
- **Checked:** at 10 teams it reaches the proved least, 94, from the circle method in under 0.1 s.
- **12 teams** (`eval/window-refill.txt`; one process per core): four 120 s runs stopped at 136 to 140.
  Of four 900 s runs, three found 132 (after 107, 369 and 575 s) and one stopped at 140; the two with
  small windows (w 2 to 4, 50,000 nodes) both found it. A further 600 s from the 132 found nothing lower.
  At 132 six cells hold 2 and the rest 0 or 1. `TIMETABLES[12].even` is now this timetable.
- **The page keeps every setting at or below what it gave.** With the 132 alone, the carry-over-only
  home-and-away season at seed 1 got worse (530 / 68 to 538 / 62): as with the 136 before it, a leg with
  less carry-over can seed a worse season. So the 136 stays as a fourth start (`TIMETABLES[12].evenAlt`,
  "second timetable" in `constructionStarts`) and the best of all starts is kept, as before. Through the
  search (`node eval/field-start.mjs 12`, seed 1, effort 1; carry-over / breaks):

  | 12 teams | Before | Now |
  |---|---|---|
  | Single, carry-over only | 136 / 20 | **132 / 18** |
  | Single, break weight 10 | 170 / 14 | 170 / 14 |
  | Season, carry-over only | 530 / 68 | 530 / 68 |
  | Season, break weight 10 | 602 / 40 (score 1,002) | **576 / 40** (score 976) |

  A 12-team search now runs from five starts (circle, starter, two timetables, and the weighted starter
  when a break weight is set); `field-start.mjs 12` took 12 s for all four settings.
- **Past 12 teams it did not help.** From the built-in starters at their best start, 600 s each: 14 teams
  212, 18 teams 318, 24 teams 570, all unchanged (floors 168, 288, 528). From the circle method it got no
  nearer than 220, 396 and 770 in about 3 minutes. The DFS has far more splits per window at these
  sizes; a cheaper bound inside the refill, or windows chosen by where the cells at 2 sit, is the next
  thing to try there.
- Tests (`starter.test.mjs`): both stored 12-team timetables are round robins, their values are pinned
  (132 and 136), each is below the starter, and the search from them returns no more than the value.
- Not claimed: whether 124 to 130 is reachable; nothing here was compared with published carry-over
  tables.

## Starters picked with their breaks (2026-11-11, latest)

The open item above was "pick the start by carry-over + weight x breaks when a weight is set". Two
findings, one negative.

- **The start does not matter.** Start t's round r is start 0's round r + t, and renaming every
  ordinary team u to u - t (the fixed team stays) turns one into the other, so the carry-over, and
  every home/away a full search can find, is the same at every start. `starter.test.mjs` checks it
  (every start of the 12-, 18- and 26-team entries, both parities), and `eval/starter-breaks.mjs`
  checks it on every entry. Picking the start on the weighted score changed no result at 12, 20 or 24
  teams. The loop over starts in `bestStarterOpp` only settles the greedy venue pass's ties, and the
  "every start is an O(N) correction" line above is moot. What can change is **which starter**.
- **A second table, `STARTERS_WEIGHTED`** (`carryover.mjs`). `eval/starter-breaks.mjs` reruns the O(p)
  climb of `eval/starter-climb.mjs` keeping a wide pool (250 starters whose cyclic sum D^2 is within
  6 + p/4 of the best) and rescores each on exact non-cyclic carry-over + 10 x the breaks of the full
  venue search (`assignVenues`). Raw starters (`eval/starter-breaks.txt`, carry-over / breaks,
  carry-over-first entry -> weighted pick): 26 teams 716 / 104 -> **716 / 74** (same carry-over, 30
  fewer breaks), 28 teams 828 / 114 -> 978 / 76, 30 teams 948 / 138 -> 1,164 / 86, 40 teams
  1,816 / 230 -> 2,112 / 144, 18 teams 318 / 52 -> 348 / 38.
- **Through the search.** With a break weight, `lowCarryOverRounds` and `lowCarryOverDoubleRounds`
  now run one more search from the weighted entry (`start: "weighted starter"`), beside the circle,
  starter and stored-timetable starts (`constructionStarts`), and keep it only when its score is
  strictly lower (so no size can score worse; `weightedStarter: false` turns it
  off). Measured at weight 10, seed 1, effort 1 (`node eval/starter-breaks-search.mjs 10 <sizes>`,
  `eval/starter-breaks-search.txt`; carry-over / breaks, before -> now; 12 teams rerun after merging
  the refilled-rounds start of PR #14847):

  | Teams | Single | Season (home and away) |
  |---|---|---|
  | 12 | 180 / 14 -> 170 / 14 (-10; before = the refilled timetable start) | 618 / 42 -> 602 / 40 (-36) |
  | 14 | same | 854 / 52 -> 870 / 50 (-4) |
  | 18 | 456 / 30 -> 348 / 40 (-8) | 1,556 / 76 -> 1,316 / 98 (-20) |
  | 25 | same | 2,813 / 272 -> 2,889 / 262 (-24) |
  | 26 | 716 / 102 -> **716 / 74** (-280) | 2,618 / 230 -> **2,714 / 164** (-564) |
  | 28 | 828 / 114 -> 978 / 76 (-230) | 3,148 / 246 -> 3,564 / 178 (-264) |
  | 30 | 948 / 136 -> 1,164 / 92 (-224) | 3,624 / 288 -> 3,950 / 194 (-614) |
  | 33 | same | 5,069 / 526 -> 5,151 / 507 (-108) |
  | 34 | 1,274 / 166 -> 1,460 / 142 (-54) | same |

  The 26-team season loses 66 of its 230 breaks for 4% more carry-over. No change at 9, 13, 17, 19,
  21, 22, 23, 27 or 29 teams, so the table keeps only the entries that gained: even 12, 14, 18, 26,
  28, 30 and 34, the bye entries for 25 and 33, and even 36, 38 and 40 (raw gains of 80 to 564 in
  score, not yet run through the search). Odd leagues rarely gain: their circle start already has a
  zero-break home/away.
- **Cost.** The extra run is only made at sizes with an entry and a break weight: a 26-team season at
  weight 10 took 6.3 s and now 9.6 s in Node. The page's eight weighted tries pay that; carry-over
  only, the capped tries and every size without an entry are unchanged.
- **Real fixtures** (`eval/carryover-real.txt`, rerun; the guide's table): the tool's 18-team season is
  now 1,316 / 98 (was 1,556 / 76), and mirrored 1,426 / 90 (was 1,902 / 72); both Ligue 1 seasons
  (1,840 / 74, 1,948 / 96) still sit between them on the trade. 20 teams unchanged (1,460 / 116).
- Tests (`starter.test.mjs`, 4 new): every weighted entry is a round robin for a size STARTERS has;
  start invariance; the 26-team entry has 716 carry-over and at most 80 breaks against 96 or more;
  the weighted run is kept only when strictly better (12 and 18 teams, single and season), and is not
  used without a weight.
- Open: run 36 to 40 through the search; a climb that scores breaks inside the move (the pool
  rescore takes 30 to 160 s a size, so only 250 starters are tried); odd sizes, where the weighted
  pick should be compared with the circle's zero-break orientation rather than the starter's.

## Home and away that moves with the starter (2026-11-11, latest)

The venue search (`assignVenues`) is general: it takes any timetable and anneals home/away. On the
built-in starter timetables it does badly with a bye. The 24-team starter played by 23 teams gave it
127 breaks. A home/away read straight off the starter gives 44, at the same carry-over. Starter
timetables now get that home/away as a candidate of its own.

- **The shift orientation** (`carryover.mjs`, `shiftOrientation`, `shiftVenues`). At step 1, round
  r plays each starter pair {x, y} as {x + r, y + r} (any step is a renaming of the teams, as
  above). Give each pair a host and keep it in every round; the fixed team alternates. With H(u) = 1
  when position u hosts, team t is at position t - r in round r, so its home/away run is H read
  backwards. Each team hosts once per pair, so every team is balanced. Each team's rounds pass
  every neighbouring pair of positions but one. With E the number of u in 2 .. p - 1 where
  H(u) = H(u - 1), the breaks are exactly

  breaks = (p - 1)(E + 1) with all N playing, (p - 1) E with a bye

  The circle method has E = 0, the familiar N - 2 breaks, and none with a bye. The least E over the
  2^((p-1)/2 - 1) orientations is found exactly by a Gray-code walk with an O(1) update, at most
  40 ms at 40 teams. Tests: the formula against a direct count and the balance check on every
  built-in starter, and the walk against brute force at 12 teams.
- **In the search.** With a break weight, `lowCarryOverRounds` now also scores every built-in starter
  as it is, with these venues and no annealing, and keeps one only when its carry-over +
  weight x breaks is strictly lower than every searched start's (`start: "... , shift venues"`;
  `shift: false` turns it off). Carry-over only, nothing changes.
- **A third table, `STARTERS_SHIFT`** (`eval/starter-orient.mjs`, `eval/starter-orient.txt`). This is
  the O(p) climb of `eval/starter-climb.mjs` with breaks priced inside the move:
  p x sum D^2 (+ 2p) + 10 (p - 1)(E + [even]), with E from a few sweeps of single-pair flips (an upper
  bound). The 60 best are then scored exactly. It is kept where it beats every built-in entry on
  carry-over + 10 x shift breaks (30 s per size and parity): with a bye at 12, 14, 18, 22, 26, 28,
  30, 34, 36, 38 and 40 (11 to 39 real teams), and all playing at 22, 30, 34, 36, 38 and 40.
- **Measured through the search** (`node eval/shift-search.mjs 10 <sizes>`, seed 1, effort 1,
  `eval/shift-search.txt`; carry-over / breaks, `shift: false` -> default):

  | Teams | Before | Now | Score |
  |---|---|---|---|
  | 11 | 141 / 17 | 153 / 10 | 311 -> 253 |
  | 13 | 199 / 25 | 253 / 12 | 449 -> 373 |
  | 17 | 313 / 67 | 343 / 32 | 983 -> 663 |
  | 19 | 323 / 75 | **323 / 36** | 1,073 -> 683 |
  | 21 | 399 / 104 | 475 / 40 | 1,439 -> 875 |
  | 23 | 565 / 127 | **565 / 44** | 1,835 -> 1,005 |
  | 25 | 665 / 164 | 713 / 48 | 2,305 -> 1,193 |
  | 26 | 716 / 74 | 716 / 72 | 1,456 -> 1,436 |
  | 27 | 823 / 174 | 923 / 52 | 2,563 -> 1,443 |
  | 29 | 891 / 206 | 1,105 / 56 | 2,951 -> 1,665 |
  | 30 | 1,164 / 92 | 1,110 / 84 | 2,084 -> 1,950 (both lower) |
  | 33 | 1,269 / 280 | 1,579 / 64 | 4,069 -> 2,219 |
  | 34 | 1,460 / 142 | 1,460 / 96 | 2,880 -> 2,420 |
  | 35 | 1,419 / 310 | 1,617 / 68 | 4,519 -> 2,297 |
  | 36 | 1,620 / 170 | 1,752 / 102 | 3,320 -> 2,772 |
  | 37 | 1,575 / 351 | 1,925 / 72 | 5,085 -> 2,645 |
  | 38 | 1,928 / 154 | **1,928 / 108** | 3,468 -> 3,008 |
  | 39 | 1,813 / 404 | 2,477 / 76 | 5,853 -> 3,237 |

  No change at 9, 10, 12, 14, 18, 20, 22, 24, 28 or 40. Run time is unchanged within noise (each
  candidate is one exact score; the Gray walk is at most 40 ms). Odd leagues of 17 to 39 teams had
  been left with 4 to 10 breaks per team by the venue search. They now have under 2 per team: every
  odd pick from 17 teams up has E = 2. At 19, 23
  and 38 teams the carry-over is the same and only the breaks drop. Elsewhere the weight-10 score
  trades some carry-over for far fewer breaks. The page's "fair" pick (weight 0) is unchanged.
- **Why the venue search misses it.** It works one match or one run at a time from a greedy or
  colouring start. The shift orientation changes every team's pattern at once, and a single flip
  away from a bad start rarely improves enough to be accepted. This is a guess from the moves, not
  measured.
- **Negative: refilling from the climbed starters** (`eval/round-refill.mjs <N> 360 <seed> starter 6
  [bye]`, `eval/round-refill.txt`). 14 teams stayed at the starter's 212 and 18 teams at 318; 17
  teams stayed at 313. 13 teams went from 187 to 179, still above the circle search's 169. The
  starters are local minima for 2- to 5-round refills. The run also found a bug in the climbs'
  `repair`: it saved the freed residues' partners before shuffling them, so a rejected move restored
  the wrong partners. `eval/starter-climb.mjs` almost never rejects a move, so its tables are
  unaffected; it is fixed in both scripts.
- Open: seeding `assignVenues` with the shift orientation after the search's moves; longer
  climbs, and a better break bound inside the move than single-pair flips.

## Shift venues for a home-and-away season (2026-11-11, latest)

The shift candidates above reached only the single round robin. `lowCarryOverDoubleRounds` builds
each leg one from a searched start (circle, starter, weighted starter), so a home-and-away season
never saw them: 25 teams stayed at 2,889 carry-over with 262 breaks.

- **The change** (`carryover.mjs`). With a break weight, every shift candidate (`shiftStarts`: each
  built-in starter as it is, with its least-break shift venues) is now also a leg one. Leg two is
  then handled as for any leg one: it starts as leg one played backwards and is annealed with the
  breaks counted exactly from leg one's hosts, and the plain mirror (leg one again, grounds swapped)
  is scored too. A candidate is kept only when its carry-over + 1000 x repeats + weight x breaks is
  strictly lower than every searched start's (`start: "... , shift venues"`; `shift: false` turns it
  off; a `leg1` option takes the given leg one). Carry-over only (weight 0): nothing changes.
- **Measured through the search** (`node eval/shift-double.mjs 10 <sizes>`, seed 1, effort 1, weight
  10, `eval/shift-double.txt`; each season checked as valid: every ordered pair once, the two
  meetings in different legs, every team n - 1 home games; carry-over / breaks recounted from the
  rounds):

  | Teams | Before | Now | Score |
  |---|---|---|---|
  | 11 | 487 / 31 | 497 / 23 | 797 -> 727 |
  | 13 | 719 / 43 | 733 / 35 | 1,149 -> 1,083 |
  | 17 | 1,333 / 87 | **1,285 / 65** | 2,203 -> 1,935 |
  | 19 | 1,525 / 119 | **1,311 / 87** | 2,715 -> 2,181 |
  | 21 | 1,891 / 171 | 1,937 / 97 | 3,601 -> 2,907 |
  | 23 | 2,381 / 211 | **2,189 / 109** | 4,491 -> 3,279 |
  | 25 | 2,889 / 262 | **2,685 / 117** | 5,509 -> 3,855 |
  | 26 | 2,714 / 164 | 2,714 / 164 | unchanged |
  | 27 | 3,315 / 304 | 3,359 / 148 | 6,355 -> 4,839 |
  | 29 | 3,885 / 370 | 3,951 / 165 | 7,585 -> 5,601 |

  Odd seasons of 17 to 29 teams go from 5 to 13 breaks per team to 4 to 6, and at 17, 19, 23 and 25
  teams (bold) the carry-over drops as well: the searched leg ones were worse on both counts. At 19
  and 21 teams the plain mirror of the shift leg one won. 26 teams (even, all playing) keeps its
  weighted starter. Each row's time (9 to 23 s) is both searches together; the extra candidates
  are up to three leg-two searches, so a home-and-away search with a break weight takes longer at
  sizes with built-in starters.
- Not claimed: one seed, one weight, ten sizes; the page's best-of-k tries at weights 10 to 80 run
  this inside each try, but their picks were not re-measured.

## Shift venues carried through the search (2026-11-12)

Three follow-ups to the shift venues above, measured at weight 10 on seeds 1 and 2. One clear gain,
one small one and one negative.

- **15 and 31 teams: shift starters at the field sizes** (`eval/field-shift.mjs`,
  `eval/field-shift.txt`). When the league, a bye included, is a power of two, the search starts from
  the field timetable and never saw a shift candidate. With a bye that left 15 teams at 41 breaks
  and 31 teams at 245 (7.9 per team). `eval/starter-orient.mjs 30 10 16` and `... 32` climbed
  starters for both, and the odd ones are now in `STARTERS_SHIFT`. With a break weight the field
  search keeps one only when it scores strictly lower. 15 teams: 195 / 41 to **195 / 28** (same
  carry-over; seed 2 was 239 / 35). 31 teams: 899 / 245 to **1,189 / 60** (score 3,349 to 1,789). 7,
  8, 16 and 32 teams: the climbed starters do not beat the field search, so nothing changes.
  Carry-over only (weight 0): nothing changes.
- **Capped shift candidates** (`shiftCapped`, on by default). Each shift candidate is also run
  through `lowCarryOverCappedRounds` from that start (new `start: { opp, venues }` option): it
  anneals carry-over with the home/away carried along and the candidate's own breaks as the cap.
  11 teams: 253 to 237 and 239 (153 / 10 to 137 / 10 and 139 / 10). 13 teams: 373 to 335 (253 / 12
  to 215 / 12). 39 teams, seed 2: 3,237 to 3,219. Nothing changes at any other size from 9 to 40
  (`eval/shift-carry.mjs`, `eval/shift-carry.txt`). Each candidate adds about 0.3 s. From 17 teams
  up the climbed shift starters look like local minima for these moves: with 2 to 16 breaks of
  slack and four times the effort, only 39 teams moved.
- **Negative: carrying the starter's hosts through the search's moves** (`carryHosts`, off by
  default). Every carry-over move keeps the set of pairs, so the starter's shift home/away gives
  each pair a host (`pairHostsOf`). That gives a valid, equally balanced home/away for whatever
  timetable the search ends on (`venuesFromHosts`; `starterShiftVenues` builds the shift venues at
  any step and start). As one more start for the venue search (`carryHosts: "seed"`,
  `assignVenues(..., { hosts })`), it changed 1 row of 60: 22 teams, seed 2, 66 to 64 breaks. At 19,
  23 and 26 teams it only tied the shift candidate it already had. Also pricing moves with the
  carried hosts' breaks (`carryHosts: true`) made 14 teams worse (432 to 462). The search's moves
  break the shift pattern faster than the venue search can use it, so the shipped default
  leaves both off.
- Open: the home-and-away season (`lowCarryOverDoubleRounds`) does not yet score the 16 and 32
  shift starters or the capped candidates. Sizes 17 to 40 need moves that keep the shift pattern,
  not a cap on single moves.

## Shift candidates in a home-and-away season, part two (2026-11-12, later)

The open item above, measured on seeds 1 and 2 at weight 10 for every size from 9 to 40
(`node eval/shift-double-capped.mjs`, `eval/shift-double-capped.txt`). Each season was checked as
valid (every ordered pair once, the two meetings in different legs, every team n - 1 home games).
Every figure was recounted from the rounds.

- **Capped shift leg ones** (`withShiftLegOnes`, `shiftCapped`). Each built-in starter with shift
  venues was already a leg one. Now the capped version is one too: that start annealed on
  carry-over with its home/away carried and its breaks as the cap (`lowCarryOverCappedRounds` with
  `start`, as the single search does). Leg two is searched against it as usual. The gains are at 11
  and 13 teams, on both seeds, and carry-over and breaks both drop:

  | Teams | Seed | Before | Now | Score |
  |---|---|---|---|---|
  | 11 | 1 | 497 / 23 | **481 / 22** | 727 -> 701 |
  | 11 | 2 | 509 / 21 | **505 / 19** | 719 -> 695 |
  | 13 | 1 | 733 / 35 | **721 / 32** | 1,083 -> 1,041 |
  | 13 | 2 | 739 / 32 | **721 / 29** | 1,059 -> 1,011 |

  Nothing changed at any other size from 9 to 40, and the extra leg-two searches added 30 to 40% to
  the run time there. So the default (`shiftCapped: "small"`) uses capped leg ones only up to 16
  slots (11 to 16 teams). From 17 teams up the time is the same as before. `true` runs them at every
  size and `false` turns them off.
- **Negative: the 16 and 32 shift starters at 15 and 31 teams** (`fieldShift`, off by default).
  A field-size league now tries each shift starter, plain and capped, as a leg one. On both seeds
  nothing changed (15 teams 795 / 67, 31 teams 4,341 / 161 and 4,337 / 167), and the run time
  doubled. Two reasons. The field search's leg one already comes from the single search, which takes
  the 31-team shift starter when it wins (README "Shift venues carried through the search"). And a
  field leg one played twice is perfectly balanced, so its plain mirror is hard to beat.
- Carry-over only (weight 0): nothing changes. The capped leg ones are not used with a season
  cap (`maxBreaks`) either.
- Open: moves that keep the shift pattern for 17 to 40 teams; re-measuring the page's best-of-k
  picks with every shift candidate in.

## The page's four choices, re-measured on its own ten tries (2026-11-12, latest)

The best-of-k tables above were measured on 2026-11-11 with four weighted tries and three choices.
Since then the page runs 8 weighted + 2 capped tries and offers four choices (`CARRY_OVER_PICK`:
most even 0, balanced 10, fewer back-to-back 40, fewest 1000), and the starters, field start,
capped breaks, odd-league colouring and shift venues all landed underneath. `node eval/best-of-k.mjs
--page` now runs exactly that search (`carryOverTry` for tries 0 to 9, `combineCarryOverTries` per
choice, as the page does), recounts carry-over and breaks from the kept rounds (it throws if the
search's own figures differ; they never did) and sets 18- and 20-team results against the 20 real
top-flight seasons (`eval/best-of-k-page.txt`; home-and-away seasons, seeds 1 to 5, odd leagues
seeds 1 to 3).

| Teams | Most even | Balanced | Fewer back-to-back | Fewest | Real seasons |
|---|---|---|---|---|---|
| 18 | 1,355 / 92.8 | 1,467 / 78.0 | 1,803 / 58.8 | 2,493 / 48 | 1,840-4,342 / 48-96 (6) |
| 20 | 1,460 / 117.2 | 1,460 / 116.4 | 2,102 / 85.6 | 5,039 / 54 | 2,278-2,564 / 70-146 (14) |
| 11 | 484 / 21.3 | 491 / 20.7 | 578 / 17.0 | 578 / 17.0 | - |
| 13 | 698 / 31.7 | 704 / 29.7 | 734 / 27.7 | 1,216 / 24.7 | - |
| 15 | 795 / 67 | 949 / 48.7 | 1,156 / 36 | 1,156 / 36 | - |
| 17 | 1,237 / 73.7 | 1,252 / 69.3 | 1,286 / 66.7 | 2,837 / 42.7 | - |
| 19 | 1,311 / 87 | 1,311 / 87 | 1,392 / 83.0 | 5,090 / 48 | - |

(carry-over / breaks a season, means over the seeds.) Read plainly:

- **Everything underneath moved the low end a long way.** On 2026-11-11 the four tries kept 1,498 to
  1,538 carry-over at 18 teams and 1,678 to 1,820 at 20 on "most even"; now 1,298 to 1,426 and 1,460
  on every seed (the 20-team floor from the field start). Every 20-team "most even" season is below
  all 14 real 20-team seasons' carry-over (2,278 and up) and every 18-team one below all six real
  18-team seasons' (1,840 and up).
- **Eight + two tries beat the old four on the same code.** Rerunning `--picks` (four weighted tries)
  on today's code at seeds 1 to 3: 18 teams "fewer back-to-back" 1,638/68, 1,918/60, 1,890/60 against
  the page's 1,662/58, 1,800/60, 1,784/60; "balanced" at pick 10 scores 2,296, 2,250, 2,296 against
  2,242, 2,250, 2,210. At 20 teams the gain is one seed (1,952/96 to 1,934/86).
- **"Fewest" is the only choice with as few breaks as the real seasons' best, and it costs a lot.**
  At 18 teams it keeps 48 breaks (the Bundesliga's own figure) at 2,398 to 2,638 carry-over and
  dominates 4 of the 6 real seasons. At 20 teams its 54 breaks are below every real season's (70 and
  up) but its carry-over (4,542 to 5,920) is twice theirs: it dominates none. At 17 and 19 teams it
  costs 2.2 and 3.7 times the carry-over of "fewer back-to-back".
- **At the field sizes most tries are the same season.** At 19 teams seven of the eight weighted tries
  return 1,311 / 87 whatever the break weight (seed 1; at 20 teams three of eight return 1,460), so
  "best of ten" there is really four results. The page's read-out now says so: "Best of 10 searches
  for an even carry-over, 4 different results (... 1311/87 ×7, 1517/84, 5741/48, 3731/59 ...)"
  (`carryOverCandidatesText`, `carryOverDistinct` in `carryover.mjs`; two tests in
  `best-of-k.test.mjs`). Nothing about which season is kept changed.
- **The capped tries are rarely kept at 11 and 13 teams** (0 of 12 choices at 11, 1 of 12 at 13):
  the weighted tries (capped shift leg ones included, up to 16 slots) already reach 13 to 29 breaks there. At
  11 teams "fewest" is "fewer back-to-back". At 15, 17, 19 and 20 they are the only low-break points.
- Time on one thread: 18 teams 33 s, 20 teams 21 s, 11 to 17 teams 28 to 34 s, 15 teams 8 s (the
  page spreads the ten over up to eight workers).
- Open: the gap between "fewer back-to-back" and "fewest" at 17 to 20 teams (19 teams: 83 to 48
  breaks with nothing between but a 3,731 / 59 try): the duplicate weighted tries could run capped
  ones at caps in between, but changing what a try does changes the season a share link builds, so
  it needs a versioned share link; the same measurement on single round robins.

## Pick any season on the frontier (2026-11-12, latest)

The page's four choices keep one season each, but the ten tries hold more than four useful ones.
At 19 teams the read-out above lists 1,311 / 87, 1,517 / 84, 3,731 / 59 and 5,741 / 48: nothing
between 84 and 59 back-to-back home or away games, and an organiser who wanted about 70 had no
way to get it. Two changes:

- **The list under the report.** After a carry-over search the page now shows every season on the
  frontier, meaning every season where no other try has both less carry-over and fewer
  back-to-back games, as buttons ("1367 carry-over, 83 back-to-back"). A click keeps that season. The
  read-out then says "Picked from 12 searches" and a "Back to the choice above" button returns to
  the choice. The pick goes into the share link as `carryOverKeep`, e.g. `11@20d3`: try 11 of a
  20-team home-and-away search at seed 3. It is applied only when the teams, single or double and
  seed all match (`carryOverKeepText`, `carryOverKeepIndex`). Change any of them, or the choice,
  and the pick drops. The tries are cached by teams, single or double and seed, so changing the
  choice or picking a season needs no new search.
- **Two gap tries.** `CARRY_OVER_GAP = 2` more capped tries run after the 8 + 2, with caps further
  along the same sequence (`cappedTryBreaks` j = 2, 3: an even league's minimum plus 8 and 12 a
  leg, plus 24 and 36 a season). These are the caps between the two capped tries and the weighted
  ones. The four choices still pick among tries 0 to 9 only (`combineCarryOverTries(..., { among:
  10 })`). So **every share link made before today builds the same season it always did**, with
  no version number in the link. The gap tries only add to the list.

What the gap tries add (`node eval/frontier-gap.mjs`, `eval/frontier-gap.txt`; seeds 1 to 3 at 17
to 20 teams home and away, seeds 1 and 2 elsewhere):

| | Runs where a gap try joins the frontier | Widest break gap, before -> after (examples) |
|---|---|---|
| 17-20 teams, home and away | 9 of 12 | 19 teams: 25 -> 13, 19 -> 12; 18 teams: 18 -> 10; 20 teams: 20 -> 16 |
| 15-20 teams, single round robin | 10 of 10 | 17 teams: 14 -> 6 (both seeds); 19 teams: 16 -> 8 |
| 11-15 teams, home and away | 5 of 6 | small: the tries already reach 2 to 6 apart |

- At 19 teams (seed 1) the new frontier is 1,311 / 87, 1,517 / 84, **3,203 / 72**, 3,731 / 59 and
  5,741 / 48. At 17 single it gains 703 / 22 and 653 / 26 between 807 / 18 and 343 / 32.
- An odd league's capped try also runs a heavy-weight search and keeps whichever has fewer breaks
  (`carryOverTry`). Sometimes that lands at the far end instead of the gap (11 teams: 1,495 / 9),
  which is still a new choice but widens the "widest gap" figure (11 teams seed 2: 2 -> 10).
- Cost: 2 more tries. On a 4-core device the longest queue is 3 tries either way (10 or 12 over 4
  threads), so the wait is unchanged. On one core it is about a fifth longer (20 teams home and
  away: about 2 to 3 s a try here).
- Tried and dropped first: a "squeeze" that starts the capped search from the best weighted try's
  leg one and walks the cap down, paying carry-over per break over it. From a starter timetable it
  never got below the start's breaks (18, 19 and 20 teams single, caps 4 to 26 below). Moves that
  keep the timetable cannot cut breaks, and the venue-flip moves break the home/away balance. Heavier
  break weights (80 to 640) left the weighted tries on the same starter season (19 teams: 1,459 to
  1,517 at 79 to 83 breaks).
- Tests: `frontier-pick.test.mjs` (the four choices unchanged with the gap tries present; a kept
  try wins; a pick for another size, seed or kind is refused; the schedule's own recount is the
  kept try's; the share link keeps a valid pick and drops a malformed one).
  `eval/browser-frontier-pick.mjs` drives the real page in Chromium (12 teams home and away): the
  list shows, a click keeps that season, the share link reopens on it, and "Back" and changing the
  choice restore the first season (8 checks, all pass).
- Open: the frontier still has gaps above 20 breaks at 17 (home and away) and 20 teams where
  neither the weighted nor the capped search reaches. The capped search from the circle method is
  poor between about 66 and 90 breaks (20 teams: 2,892 / 78 against 2,396 / 72 from a weighted
  try).

## Squeezing a season under a cap (2026-11-13)

The ten tries plus the two gap tries leave holes in the frontier of a home-and-away season. At 20
teams (seed 1) the list jumped from 1,916 carry-over / 92 back-to-back to 2,396 / 72, and from
1,460 / 116 to 1,916 / 92: an organiser who wanted about 80 or about 104 had nothing near it. The
searches that made those seasons can't fill the holes. The capped search starts from the circle method
and is poor between about 66 and 90. The weighted searches move only leg two, against leg one's
fixed grounds. Moves that keep the grounds can't cut breaks, and flipping grounds one match at a
time breaks the home/away balance.

**`squeezeDoubleRounds(n, start, { maxBreaks })`** searches the timetable and the grounds together.
Each pair keeps one host, at home in leg one and away in leg two. So any timetable move inside a leg
(round swap, partial round swap, team swap) carries every match's ground with it and never changes
a team's home count. Three moves change grounds:

- flip one pair;
- flip two pairs of one team, one it hosts and one it visits (that team's count stays the same);
- flip a whole alternating run: every pair one team meets over a stretch of a leg where it
  alternates home and away. The run stays alternating, so only its two ends can gain or lose a break.

The cost is carry-over plus 200 per break over the cap. A move is refused if it leaves any team's
leg-one home and away games more than one apart. The search keeps the best season found within the
cap, so started from a season already under the cap, it never returns more carry-over than that
season had.

**Where it starts matters.** Started from the lowest-carry-over season (20 teams, 1,460 / 116), it
only got down to 112 breaks at any cap from 66 to 90. That season is perfectly balanced and a deep
local minimum. Started from the season *below* a gap and given a cap above it, it trades breaks back
for carry-over: from 2,396 / 72 it found 2,048 at 82 and 1,982 at 84 (effort 1, about 0.4 s each). At
its own cap of 72 it found 2,186, which dominates the season it started from.

**`carryOverSqueeze(n, results)`** picks the next target from the results so far
(`squeezeTargets`). It aims at the widest gap between neighbouring frontier seasons (at least 8
breaks apart), with a cap halfway across, starting from the season below the gap. When no gap is
left, it polishes frontier seasons at their own break counts. Each squeeze sees the ones before it,
so the second one aims at the widest gap the first one left. The targets depend only on the tries,
and each squeeze has its own seed, so the same settings always give the same seasons.

**On the page.** A home-and-away season runs `CARRY_OVER_SQUEEZE = 4` squeezes on one more worker
after the 12 tries (about 1.5 s more at 20 teams; on the page thread if workers are unavailable).
The squeezed seasons join the list under the report as tries 12 to 15. Like the gap tries, they are
never picked by the four choices (`combineCarryOverTries(..., { among: 10 })`), so every older share
link builds the same season. A squeezed season picked from the list goes into the share link like
any other (`carryOverKeep` `13@18d1`), and the link rebuilds it. The CLI and tests reach the same
code through `bestCarryOverRounds(n, { double: true, squeeze: 4 })`, or the `buildSchedule` spec field
`carryOverSqueeze: 4`. Since the next section, a single round robin squeezes too.

What it adds (`node eval/squeeze-gap.mjs --sizes N --seeds 1,2,3`, `eval/squeeze-gap.txt`, 17 to
20 teams home and away). In each column the first figure is carry-over, the second back-to-back home or away games:

| Teams, seed | Frontier of the 12 tries | Squeezed seasons added |
|---|---|---|
| 20, s1 | 1,460/116, 1,916/92, 2,396/72, 3,802/66, 4,884/54 | 1,862/104, 2,048/82, 3,412/66 (beats 3,802/66), 3,646/60 |
| 20, s3 | ... 2,782/80, 3,456/78, 4,462/62, 5,920/54 | 1,808/110, 3,000/74, 3,210/70, 4,204/58 |
| 18, s1 | 1,316/98, 1,426/88, ... 1,662/58, 2,496/48 | 1,406/92, 1,550/74, 1,644/62, 2,070/52 |
| 17, s2 | 1,249/71 ... 2,323/65, 2,381/43 | 1,815/65 (beats 2,323/65), 1,897/61, 1,967/54, 2,281/48 |
| 19, s2 | 1,311/87, 1,367/83, 1,469/81, 4,021/60, 4,651/48 | 3,283/65, 4,259/54 |

- In all 12 runs, 2 to 4 squeezed seasons join the frontier (42 in all), and 10 seasons the tries
  had found are now beaten on both counts.
- Take the least carry-over available within each break budget, from the fewest breaks on the
  frontier to the most. Squeezes cut it by 5.2% on average over the 12 runs, and by up to 33% at
  one budget (20 teams s3, 70 breaks: 4,462 to 3,210).
- The widest gap between neighbours fell in 10 of 12 runs (20 teams s1: 24 to 12; 17 teams s2: 22
  to 7). In the other two, 19 s3 and 20 s2, it rose (12 to 14 and 16 to 18), but only because a
  squeeze beat a season the gap used to end at.
- **Not solved:** the 19-team jump. Every seed still goes from about 1,311 to 1,517 carry-over at
  79 to 87 breaks to 3,100 or more at 78 and under. The squeezes work down from below the gap
  (19 s1: 3,203/72 to 3,143/78) but cannot reach the 1,500s there. The tries above the gap are
  shift-starter seasons whose low carry-over comes with their break pattern, and no squeeze starts
  from one under a cap below its breaks.
- Tests: `squeeze.test.mjs`, 7 tests. At 8, 9 and 12 teams a squeezed season is a valid
  home-and-away season: every pair meets once a leg, the return game is at the other ground, and
  leg one is balanced within one. Its reported breaks and carry-over match the schedule's own
  recount, it stays within the cap, it has no more carry-over than its start, and it is seeded. The
  other tests cover the target order, each squeeze reading only the results before it, and the four
  choices unchanged with squeezes present. `eval/browser-frontier-pick.mjs` now picks a squeezed
  season when one is listed. At 18 teams it picked 1,406/92 (try 15), and its share link reopened
  on it. All 9 checks pass (`eval/browser-frontier-pick-18.txt`).

## Squeezing a single round robin (2026-11-13 later)

The same gaps exist when everyone meets once. At 19 teams every seed's tries jump from 323
carry-over at 36 back-to-back home or away games to 959 to 1,079 at 24 to 28; at 20 teams from 360
at 52 to about 550 at 36 to 42. A single round robin ran no squeezes, so the list stopped there.

**`squeezeSingleRounds(n, start, { maxBreaks })`** is the squeeze on one leg. The two searches share
their code (`squeezeLegs`): every match keeps its ground while the timetable moves, and the ground
moves are the same three (flip one match, flip two of one team's matches where it hosts one and
visits the other, flip a whole alternating run), refused when a team's home and away games end up
more than one apart. There are no repeats across a halfway point to price. `carryOverSqueeze`
now tells the two kinds apart by the number of rounds and aims at gaps of 4 breaks or more on one
leg (8 on two: one leg has about a third of a season's breaks). `bestCarryOverRounds(n, { squeeze })`,
the `buildSchedule` spec field `carryOverSqueeze` and the page all run it for either kind; the page
adds tries 12 to 15 to a single round robin's list as well, about a second more on one thread, and
the four choices and every older share link are unchanged.

What it adds (`node eval/squeeze-single.mjs --sizes 10,...,20 --seeds 1,2,3`,
`eval/squeeze-single.txt`, 24 runs at 10, 12, 14, 16, 17, 18, 19 and 20 teams). Carry-over / breaks:

| Teams, seed | Frontier of the 12 tries | Squeezed seasons added |
|---|---|---|
| 19, s1 | 323/36, 1,079/24, 1,141/20, 1,421/16 | 897/32, 955/30, 1,019/26, 1,295/18 |
| 19, s2 | 323/36, 959/28, 1,079/24, 1,197/20, 1,359/16 | 903/32, 1,105/22, 1,235/18 |
| 17, s2 | 343/32, 651/26, 727/22, 809/18, 975/14 | 539/29, 651/24 (beats 651/26), 731/19, 761/16 |
| 18, s2 | 348/38, 436/32 ... 674/16 | 434/30 (beats 436/32 and 440/30), 452/26 (beats 452/28), 490/22, 644/18 |
| 20, s1 | 360/52, 546/36 ... 1,424/18 | 1,250/20 only |

- 42 squeezed seasons join the frontier over the 24 runs (0 to 4 a run) and 9 of the tries' seasons
  are now beaten on both counts. The least carry-over within each break budget falls 1.5% on
  average: 3.9% at the odd sizes (17 and 19), 0.7% at the even ones. The largest cut is 21.9%
  (17 teams s2, 16 breaks: 975 to 761). Four squeezes take 0.6 to 1.2 s.
- **Where it does nothing.** The gap under the lowest-carry-over season at 20 teams (360/52 to
  546/36 on seed 1) is not narrowed on any seed: squeezed from 546/36 with a cap of 44 it stays at
  546/36, and walked down from 360/52 two breaks at a time it never gets under 50 (scratch run, not
  kept). 360 is a starter whose every carry-over count is 0 or 1; its low value is tied to its break
  pattern, as at the top of the 19-team home-and-away jump. At 14 teams 2 of 3 seeds gain nothing
  (the tries' frontier is already 2 breaks apart).
- **Tried and not shipped: a three-cycle ground move.** In an odd league's single round robin every
  team plays an even number of games, so balance means exactly half at home, and every ground move
  above that touches a team once is refused. Reversing a directed three-cycle of hosts (x hosts y,
  y hosts z, z hosts x) keeps every count. On the same 24 runs it gave a 1.4% mean cut against 1.5%
  without (odd sizes 3.3% against 3.9%), and on the 19-team home-and-away jump it found nothing the
  plain moves did not (from 1,311/87 under caps of 75 to 83: 1,479/83 against 1,385/83). It stays
  behind `cycles: true`, off. The odd sizes gain anyway because a timetable move changes which
  matches sit next to each other, which moves breaks without moving a ground.
- Tests: `squeeze.test.mjs`, 13 tests. At 8, 9, 12 and 13 teams a squeezed single round robin is
  valid (every pair once, nobody twice in a round, each team's home and away games within one), its
  breaks and carry-over match the schedule's own recount, it stays within the cap, it never has more
  carry-over than its start, and it is seeded. The three-cycle move keeps a 9-team league at exactly
  4 home games each; a home-and-away start is refused; `carryOverSqueeze` numbers single squeezes
  after the tries with no target twice; and `bestCarryOverRounds` squeezes a single round robin
  without moving its choice. `eval/browser-frontier-pick.mjs --single` runs the page check on a
  single round robin (`eval/browser-frontier-pick-single.txt`).

## The gaps are in the timetables: a MaxSAT proof, and regrounded seasons (2026-11-13, latest)

The open question from the last two sections: under the lowest-carry-over seasons (20 teams single
360 / 52, then nothing until 546 / 36; 19 teams home and away 1,311 / 87, then 3,071 at 78) is the
venue search leaving breaks behind, or does the timetable itself need them? Carry-over depends only
on who meets whom in which round, not on who is at home, so if those timetables allowed far fewer
breaks, a better home/away alone would fill the gap at the same carry-over.

**The proof** (`eval/orient-maxsat.py`, python-sat, eval only). For one fixed timetable it finds the
fewest breaks under the tool's own rules: one host per match (per pair in a season, at home in leg
one and away in leg two), each team's home and away games within one (leg one of a season), a break
being two consecutive rounds at the same ground with a bye resetting the run, as `teamBreaks` counts.
Each "no break" is a soft clause, so RC2's optimum is the least number of breaks, proved.
`eval/orient-maxsat-check.mjs` re-checks every oriented season in JS (same pairs every round, same
carry-over, balance, recount equal to the proof): all pass.

- **The gaps are structural.** 20 teams' 360 timetable needs at least **50** breaks (the page gives it
  52); the 19-team home-and-away 1,311 timetable needs **85** (page: 87) and 1,517 needs 84 (page: 84).
  No home/away can bring either near the gap. The next try has to change the timetable.
- **The venue search is nearly optimal.** Over the 12 tries at 12, 14, 16, 17, 18, 19, 20, 22 and 24
  teams (seed 1, single, 108 timetables), 106 were proved in 240 s each; **89 of 106 already had the
  fewest breaks** their timetable allows. The other 17 were 2 to 5 over: the capped and gap tries (12
  teams 170 / 20 needs 16; 14 teams 314 / 20 needs 16; 19 teams 2,749 / 17 needs 12), the 18- and
  20-team starters (348 / 40 needs 38; 360 / 54 needs 50) and the 24-team starter (570 / 66 needs 64).
  `eval/orient-maxsat.txt`.
- **Round rotations do not help** (the `next:` item's suggested move). Every rotation and reversal of
  the 20-team starter keeps its 360 carry-over; the four orders proved within 120 s each (rotations 0
  and 3, reversal 0) all need 50; the other four timed out and the run was stopped there (8 of 38
  orders).

**Regrounded seasons** (`polishSeasonVenues`, `carryOverPolish`, `CARRY_OVER_POLISH = 4`). Since a
season's timetable fixes its carry-over, the page now runs each listed season's own timetable through
the venue search once more (single: `assignVenues` seeded with its own hosts; home and away:
`assignVenuesDouble` from its own pair hosts), after the squeezes, on the same worker. A regrounded
season with strictly fewer breaks that passes the season's own checks (balance; a pair's two games at
opposite grounds) and that nothing else beats on both counts joins the list as tries 16 and up
(`polishedFrom` names its source). Like the gap tries and squeezes it is never picked by the four
choices, so every older share link builds the same season; a regrounded season picked from the list
goes into the share link like any other and the link rebuilds it. The CLI and tests reach it through
`bestCarryOverRounds(n, { polish: 4 })` or the `buildSchedule` spec field `carryOverPolish: 4`.

What it adds (`node eval/polish-frontier.mjs <teams> <seed> [d]`, `eval/polish-frontier.txt`; 21 single
round robins at 12 to 20 teams and 10 home-and-away seasons at 12 to 20, seeds 1 to 3 and 1 to 2):

| Teams, seed | Regrounded | Effect on the frontier |
|---|---|---|
| 14 single, s1 | 314 / 20 -> 314 / 16 | beats 334 / 16 |
| 20 single, s3 | 360 / 54 -> 52, 550 / 46 -> 44, 1,050 / 30 -> 26, 1,312 / 22 -> 20 | four seasons beaten; least carry-over within 26 breaks 1,078 -> 1,050 |
| 20 home and away, s1 | 1,460 / 124 -> 1,460 / 112 | within 112 to 115 breaks: 1,880 -> 1,460 (22%) |
| 20 home and away, s2 | 1,460 / 120 -> 1,460 / 114 | within 114 to 115 breaks: 1,880 -> 1,460 |

- 7 seasons join the frontier in 4 of 31 runs; 27 runs gain nothing, which the proof predicts: the
  venue search already had the fewest breaks for most frontier timetables. Mean cut in the least
  carry-over at a break budget: 0.2% over all 31 runs, up to 34.5% at one budget (20 single s3).
- It is cheap: 0.4 to 3.4 s for a single round robin, 1.2 to 4.8 s for a home-and-away season at 12 to
  20 teams, on the worker after the squeezes (`polishS` in the file).
- Not reached (until the next section's exact solver): 18 teams' 348 / 40 (the proof says 38) on seeds 1 and 3, and 20 teams' 360 / 52 (needs
  50). The venue search's annealing finds them only on some seeds; an exact orientation in the page
  would need a solver in the browser.
- Tests: `polish.test.mjs`, 5 tests: 14 teams' 314 / 20 regrounds to 314 / 16 on the same pairs every
  round; a season already at its least returns null; validity on 8 and 9 teams single and home and
  away and 12 home and away (same pairs, same carry-over, balance, opposite grounds, recount); the
  polished seasons are numbered after the results, on the frontier, seeded and never repeated; and
  `bestCarryOverRounds` keeps its choice while `buildSchedule` rebuilds a kept polished season.
  `eval/browser-frontier-pick.mjs --teams=14 --single --polished` picks 314 / 16 on the page and its
  share link reopens on it; all checks pass (`eval/browser-frontier-pick-polished.txt`).

## The fewest breaks of a timetable, exactly, in the page (2026-11-13, latest)

The last section proved, offline with a MaxSAT solver, that the frontier gaps sit in the timetables
and that the page's venue search sometimes leaves 2 to 5 breaks its timetable does not need (18
teams' 348 / 40 needs 38; 20 teams' 360 / 52 needs 50). It closed with "an exact orientation in the
page would need a solver in the browser". `orient.mjs` is that solver, in about 200 lines and no
dependencies.

**How.** In a single round robin each match belongs to one round, and a team's break between rounds
r and r + 1 depends only on who hosts in those two rounds. So the hosts of one round are a state
(2^k of them for k matches: 1,024 at 20 teams), and the least breaks up to round r + 1 is a
minimum over the states of round r. Each state's teams-at-home is a bitmask, so one transition is
one xor and one popcount: 19 x 1,024 x 1,024 at 20 teams, about 30 ms. That gives the `floor`, the
least breaks with every match free. The tool also wants each team's home and away games within one;
a seeded depth-first walk back over the programme's table finds a balanced host choice at the floor,
then at the floor + 1, + 2 and so on (each step's remaining slack keeps it to host choices within
the target, and a team that can no longer end within one prunes the branch). A level walked to the
end with nothing found proves that many breaks impossible, so the first balanced hit is the least,
`proved`. A step budget (5 M by default, 2 M in the page) bounds the walk; out of budget it returns
the floor and `least: null`. Up to 12 matches a round (24 or 25 teams); bigger returns null.

**Checked against the MaxSAT proofs** (`node eval/orient-dp.mjs`, `eval/orient-dp.txt`, the same 108
tries at 12 to 24 teams as `eval/orient-maxsat.txt`):

- **105 of 106** MaxSAT-proved tries get the same least, proved. The other one (22 teams, try 3,
  floor 38, MaxSAT 42) runs out of budget after 16 s.
- **Two tries MaxSAT did not prove in 240 s are proved here:** 22 teams' 440 timetable (tries 0 and
  4) needs **58** breaks; the page gave it 66. Each took 3 s.
- Time: 0 to 40 ms at 12 to 20 teams when the floor is balanced (most tries), 0.1 to 3 s when the
  walk has to climb above it (20 teams' try 5: floor 34, least 36), 0.6 to 3.4 s at 24 teams.
- `orient.test.mjs` checks the programme against every host choice counted by brute force at 5 and 6
  teams (6 tries each; floor and balanced least equal), the circle method's textbook n - 2, 20 teams'
  360 at 50, an unbalanced floor (14 teams try 4: 18, least 20) and the out-of-budget path.

**In the page.** `polishSeasonVenues` now regrounds a single round robin with `leastBreaks` first and
falls back to the annealing only when the timetable is too big or the walk runs out of budget; a
season regrounded at a proved least carries `leastProved: true`. Re-run of `eval/polish-frontier.mjs`
on 24 single round robins at 12 to 22 teams, seeds 1 to 3 (`eval/polish-frontier-exact.txt`, against
`eval/polish-frontier.txt` from the annealing):

| | annealing (12-20, 21 runs) | exact (12-20, same 21 runs) |
|---|---|---|
| seasons joining the frontier | 5, in 2 runs | 15, in 9 runs |
| mean cut in the least carry-over at a break budget | 0.18% | 0.76% |
| polish time per run | 0.4 to 3.4 s | 0.02 to 3 s |

- **18 teams' 348 / 38 and 20 teams' 360 / 50 now reach the page on every seed** (20 teams: 360 / 52
  -> 360 / 50, the least carry-over within 50 to 51 breaks falls from 546 to 360, 34%).
- 17 teams: two seasons join on every seed (653 / 26 -> 653 / 24, 623 / 28 -> 623 / 26).
- 19 teams seed 1: the gap try 2,749 / 17 regrounds to 2,749 / 12, the least MaxSAT proved.
- **22 teams** (no earlier measurement): 440 / 66 -> 440 / 58 on every seed, and 692 / 52 -> 692 / 42
  (seed 2): 2 to 3 seasons join per run, mean cut 3.6 to 6.8%, up to 38%. The cost is time: 6.8 to
  11.7 s of polish on the worker, after the squeezes (the list grows while the page is usable).

**Not solved.** A home-and-away season keeps one host per pair, which ties rounds a leg apart, so the
programme does not model it; `relaxedBreakFloor` runs it over both legs with every match free and gives
a valid but loose floor (19 teams' 1,311 timetable: 74, where MaxSAT proves 85), so home-and-away
regrounding stays with the annealing. The next step the floor makes cheap is a timetable search that
scores its moves on the proved break floor (30 ms per timetable at 20 teams).

## Fewest breaks of a home-and-away season, proved: branch and bound on pairs (2026-11-13, latest)

The exact programme above handles a single round robin only. In a home-and-away season each pair
keeps one host (at home in its first game, away in the return), and that ties rounds far apart, so
the programme could only give a loose floor with the rule dropped (`relaxedBreakFloor`; 19 teams'
1,311 timetable: 74, MaxSAT 85). Home-and-away regrounding stayed with the annealing.
`orient.mjs` `pairLeastBreaks(opp, n, { upperHint, maxNodes })` now solves it exactly where its tree
stays small, in the browser, with no dependencies.

**How.** The pair rule (h1 + h2 = 1, h = 1 when the pair's lower team hosts) and leg one's balance
rule are priced back into the same programme (Lagrangian relaxation: a price per pair and per team
on the host bits, each round's prices added to its states, Float64 min-plus steps, a Polyak
subgradient on the argmin's violations). Pricing alone does nothing: flipping every host keeps every
break and negates every violation, so the priced floor is even in the prices and peaks at zero
(measured: no rise at all). Fixing one pair's hosts first (any season can be flipped to it, same
breaks, same balance) breaks that symmetry, and the floor rises (19 teams' 1,311: 74 -> 78). That is
still 7 under the truth, so the search branches on the pair the argmin breaks with the largest
price, depth first, each node warm-started from its parent's prices and pruned once its floor
reaches the best season found. Each argmin, its first games kept and its return games flipped,
gives a season that keeps the pair rule; the balanced ones are the incumbents. The budget counts
nodes, not time, so a share link rebuilds the same season on any machine.

**Checked against MaxSAT** (`node eval/pair-exact.mjs`, `eval/pair-exact.txt`; the page's 12 tries
at 8, 10, 12, 14, 16, 18 and 20 teams, seed 1, home and away; proofs in
`eval/orient-maxsat-double.txt`, `eval/orient-maxsat.py --double`, 120 s each), with the try's own
breaks as the starting bound and 400 nodes:

| | tries |
|---|---|
| timetables | 84 |
| proved by MaxSAT in 120 s | 80 |
| proved here | 79 |
| proved by both, same least | 75 (0 disagree) |
| proved here, MaxSAT out of time | 4 |
| fewer breaks than the page's season | 8 |

- **20 teams' 1,460 timetable needs exactly 108 breaks** (tries 0, 4 and 5; the page had 116, 118
  and 124, the annealing's regrounding 112 to 114; MaxSAT times out). Here the relaxed floor is
  already 108, so it is proved in 0.3 to 0.5 s with no branching.
- 18 teams' 1,426 timetable: 88 -> 84, proved in 1 s (MaxSAT out of time). 12 teams 608 / 48 -> 46,
  14 teams 1,014 / 46 -> 44 and 1,118 / 44 -> 42, each the MaxSAT least.
- Not proved in 400 nodes: four capped or gap tries at 10 to 14 teams (already at the MaxSAT least)
  and 18 teams' 1,316 / 98, taken to 92 where MaxSAT proves 90.
- Time (one process beside three others on 4 cores): 0 to 0.6 s for most tries up to 14 teams, 1 to
  6 s at 18 and 20, up to 65 s for one hard 20-team try (384 nodes).

**In the page.** `polishSeasonVenues` runs it on a home-and-away season after the annealing, bounded
by the annealing's breaks, with `PAIR_EXACT_NODES = 40` nodes; a season regrounded at a proved least
carries `leastProved: true`, as single round robins do. Re-run of `eval/polish-frontier.mjs` on the
same 10 home-and-away runs at 12, 16, 18, 19 and 20 teams, seeds 1 and 2
(`eval/polish-frontier-pair.txt`, against `eval/polish-frontier.txt`):

| | annealing alone | annealing, then the pair search |
|---|---|---|
| seasons joining the frontier | 2, in 2 runs | 6, in 5 runs |
| 20 teams' 1,460 season | 112 (s1), 114 (s2) breaks | 108 on both, proved |
| polish time per run | 1.2 to 4.8 s | 4.7 to 76 s (3 runs at once on 4 cores) |

- New on the frontier: 18 teams s1 1,426 / 84 (was 88), 19 teams s1 4,003 / 52 and 6,297 / 46 (the
  least carry-over within 46 to 48 breaks down 30%), 19 teams s2 3,491 / 64; mean cut in the least
  carry-over at a break budget 1.42% and 0.71% -> 2.84% at 20 teams (s1, s2), 0 -> 0.33 to 0.76% at 18 and 19.
- Nothing at 12 and 16 teams: their frontier seasons are already at their least (the proofs above).
- The cost is time on the worker, after the squeezes: 26 to 76 s at 18 to 20 teams in this
  contended run. The list grows while the page is usable, as with the floor-priced searches.
- Tests: `orient.test.mjs`, 5 new: `pairLeastBreaks` equals every pair-host choice counted by brute
  force on 18 timetables at 4, 5 and 6 teams (proved, valid, recounted); 14 teams' 46 -> 44 and
  44 -> 42 (the MaxSAT least), seeded; a season at its least is proved with no grounds returned; out
  of nodes is not proved and never worse; `polishSeasonVenues` regrounds 14 teams' 1,014 / 46 to 44,
  `leastProved`.

## Pricing the break floor: timetables searched on their proved least breaks (2026-11-13, latest)

The last two sections showed that the frontier's widest gaps are in the timetables (20 teams, one
leg: 360 carry-over at 50 breaks, then nothing until about 546 at 36 to 44) and gave the page an
exact solver for the fewest breaks of one timetable. The squeezes could not cross that gap: they move
the timetable with every match's ground carried along, so a timetable that would be good with
*other* grounds looks bad to them, and walked down from 360 / 52 they never got under 50.

**`floorPricedSingleRounds(n, start, { maxBreaks })`** searches the timetable alone and prices every
move on carry-over + 60 per break of the timetable's **proved break floor** above the cap (the fewest
breaks any host choice allows, `orient.mjs`), then picks the grounds exactly at the end with
`leastBreaks` (balanced, proved). Two things make that affordable:

- **An incremental floor.** `floorTable(opp, n)` keeps the programme's forward table; a move that
  changes rounds from `lo` on reruns only rounds `lo` to the end, about half the programme on a
  random move (tested equal to the full programme after every swap, `floor-priced.test.mjs`).
- **Refusing before pricing.** The annealing draws its acceptance line first; the floor's penalty is
  never negative, so a move whose carry-over alone is over the line is refused with no floor to
  compute. At 20 teams 3,000 moves need 60 to 800 floors.

The floor ignores the balance rule (home and away games within one), so the least balanced choice can
be a break or two above it; the six best timetables within the cap are kept and the one with the least
carry-over whose balanced least is within the cap wins.

**In the page** (`carryOverFloorPriced`, `CARRY_OVER_FLOOR_PRICED = 2`, single round robins of 6 to 21
teams; 22 since "A faster break floor" below): after the regrounded seasons, the widest gap of 4 or more breaks on the list's frontier is
searched from the season above it at caps of its breaks - 2, - 4 (3 searches at most); a result
nothing beats joins the list (`floorPricedFrom` names its source), never the four choices, so every
older share link builds the same season; one picked from the list rebuilds from its link
(`bestCarryOverRounds(n, { floorPriced })`, spec field `carryOverFloorPriced`). It runs on the same
worker as the squeezes, after them.

What it adds (`node eval/floor-priced.mjs <teams> <seed> --page`, `eval/floor-priced.txt`; the page's
whole list of 12 tries, 4 squeezes and 4 regrounded seasons, then the floor-priced searches):

| Teams, seed | Gap on the list | Floor-priced seasons | Least carry-over within the new budget |
|---|---|---|---|
| 20, s1 | 360 / 50 .. 546 / 36 | 440 / 48, 516 / 46 | 48 breaks: 546 -> 440 (19%) |
| 20, s2 | 360 / 50 .. 552 / 42 | 414 / 48, 434 / 46 | 48: 552 -> 414 (25%); 46: 552 -> 434 |
| 20, s3 | 360 / 50 .. 550 / 44 | 412 / 48, 460 / 46 | 48: 550 -> 412 (25%) |
| 18, s1-s3 | 348 / 38 .. 426-434 / 30-32 | 392 / 36, 418 / 34; 370 / 36, 428 / 34; 408 / 36 | 36: 430 -> 392, 434 -> 370, 426 -> 408 |
| 17, s1-s3 | 343 / 32 .. 539-623 / 26-27 | 379 / 31; 385 / 29; 369 / 30 | up to 41% at one budget |

- Over 18 runs (14, 16, 17, 18, 19 and 20 teams, seeds 1 to 3) **15 seasons join the frontier in 10
  runs**; the least carry-over at a break budget falls 1.1% on average over the whole frontier and
  3.6 to 17% inside the gap at 17, 18 and 20 teams. Nothing at 14 teams (the gaps are 2 breaks),
  nothing at 19 (the gap under 323 / 36 is 4 to 6 breaks wide and every search found 36 or more).
- Time on the worker: 0 to 26 s, 4 to 21 s at 17 to 20 teams; 19 teams seed 3 spends 26 s and adds
  nothing (three searches that end above their cap). The list grows while the page is usable.
- **The wider sweep** (`node eval/floor-priced.mjs <teams> <seed>`, every cap across the gap from the
  season above it and from the season under it, 3,000 moves each, 21 runs including 22 teams) finds
  the same picture: the season above the gap, 2 to 4 breaks down, is where it pays (20 teams: 408 to
  426 at 48 breaks on every seed); starting under the gap helps at 16 and 17 teams (16 s2: 266 / 22
  and 300 / 20 against 316 / 18), rarely at 20. **22 teams** gain too (s2: 512 / 56 and 586 / 56
  inside a 440 / 58 .. 690 / 48 gap; 6 to 7% inside the gap on s2 and s3, 1.5% on s1), but one search
  takes 22 to 86 s (2,048 states a round), so the page stops at 21; the function takes up to 25.
- **Not reached.** The middle of the 20-team gap (40 to 44 breaks) stays at about 516 to 550: the
  best found there are 524 / 40, 530 / 40 and 530 / 44 from the sweep, 1 to 4% under the list. The
  floor prices breaks exactly but the timetable moves are still small; a bigger neighbourhood (round
  re-solves, or a starter family built for breaks) is the next step.
- Tests: `floor-priced.test.mjs`, 10: the incremental floor equals the programme after every move at
  5, 6, 9, 10, 13 and 14 teams; too-big timetables refused; at 8, 9, 12 and 13 teams a floor-priced
  season is valid (every pair once, nobody twice a round, balanced), its breaks and carry-over match a
  recount, and its grounds are the proved least for its timetable; seeded; `carryOverFloorPriced`
  lists only frontier seasons numbered after the results and nothing for home and away;
  `bestCarryOverRounds` keeps its choice and `buildSchedule` rebuilds a kept floor-priced season;
  20 teams seed 1 from 360 to a cap of 48 gives 410 / 48, proved.

## Re-dealing three rounds at once (2026-11-13, latest)

The section before closed with the one thing the floor-priced search could not do: the middle of the
20-team gap (40 to 44 breaks) stayed at about 516 to 550, because its moves are small — swap two
rounds, swap two teams over the rounds where that is legal, flip one alternating cycle. A timetable
that would be good two moves away is never seen. `threeRoundDeals` is the bigger move: **take three
rounds and re-deal their matches among themselves, every legal way.**

**How, and why the list is complete.** The matches of three rounds give every team exactly three
opponents, so they form a cubic graph on the teams. Splitting them back into three rounds is a
proper 3-edge-colouring of that graph: pick a perfect matching for the first round, and what is left
is a union of cycles, each of even length, whose alternate edges go one to the second round and one
to the third. So the list is: every perfect matching of the cubic graph (a short backtracking walk),
times 2^(number of cycles) ways to orient them. The rounds as they stand are always in it. At 20
teams a random triple gives about 117 deals and takes 0.7 ms to list; a cap (20,000) bounds the rare
dense one. Every pair still meets exactly once, because no match moves between teams — only between
rounds.

**Pricing them cheaply.** A deal move draws the annealer's acceptance line first, scores every deal
on carry-over alone (the floor's penalty is never negative, so anything above the line is out), and
computes the proved break floor for only the three cheapest that survive — the floor is the
expensive part. The incremental floor table reruns from the first of the three rounds, as for a
swap. `deals` (0.15, `CARRY_OVER_DEALS`) is the share of moves that re-deal; the rest are the old
three.

**What it finds** (`node eval/floor-priced.mjs 20 <seed> --deals 0` then `--deals 0.15`, same cached
lists, 3,000 moves a search, `eval/floor-priced.txt`, 20 teams, seeds 1 to 3):

| Seed | Least carry-over at 48 breaks, swaps only | with re-deals | Frontier seasons joined | Mean cut inside the gap |
|---|---|---|---|---|
| 1 | 410 | **384** (-6.3%) | 3 -> **5** | 5.97% -> **8.58%** |
| 2 | 408 | **374** (-8.3%) | 3 -> 3 | 10.14% -> **10.78%** |
| 3 | 426 | **384** (-9.9%) | 2 -> 2 | 11.15% -> **13.70%** |

Seed 1 is where the middle of the gap finally moves: 456 / 46 (nothing was under 534), 516 / 44
(was 530), 524 / 42 (was 558). A search costs 1.2 to 1.5x the time (169 s to 256 s for seed 1's
twelve searches).

**In the page, both searches run and the better is kept.** Re-deals are not better everywhere: run
alone they lost seasons at 17 and 18 teams on some seeds (a different random walk, not a worse
neighbourhood). So `carryOverFloorPriced` now searches each cap **twice** — swaps alone, and swaps
with re-deals — and keeps the one with the least carry-over within the cap (the fewest breaks when
neither gets under it). Measured against the same page run of the section before
(`--page`, 17, 18 and 20 teams, seeds 1 to 3):

| Teams, seed | Page's floor-priced seasons before | now |
|---|---|---|
| 17, s1 | 379 / 31 | **347 / 29** (gap cut 6.5% -> 22.2%) |
| 18, s1 | 392 / 36, 418 / 34 | **366 / 36**, 418 / 34 (2.9% -> 4.4%) |
| 20, s1 | 440 / 48, 516 / 46 | **382 / 48**, 528 / 46 (3.6% -> 4.8%) |
| 20, s3 | 412 / 48, 460 / 46 | **374 / 48**, 460 / 46 (13.8% -> 16.1%) |
| 17 s2, s3; 18 s2, s3; 20 s2 | unchanged | unchanged |

No seed's frontier gets worse: the cut inside the gap rises in 4 of 9 and holds in the other 5. (At
20 teams seed 1 the second season is 528 / 46 rather than 516 / 46: the first cap now returns a much
better season, which changes which later results are not already beaten.) The step costs 13 to 42 s
on the worker, against 4 to 21 s, and still runs after the squeezes with the page usable throughout.
Share links keep their season inline, so a link made before this change still builds what its maker
saw; a link that stores only the frontier index of a floor-priced season (the server-side rebuild
path) and was made between the two changes of 2026-11-13 can rebuild a different season of the same
list.

A search that finds nothing better than the season it started from now returns **that** season,
regrounded: the start's own timetable competes with the ones the search kept, so a result can never
carry more breaks than its start (`floor-priced.test.mjs`; at 13 teams a re-dealt search used to
come back with 13 breaks against the start's 12).

- Tests: `floor-priced.test.mjs`, now 14: `threeRoundDeals` lists each deal once, every team keeps
  its three opponents one per round, the rounds as they stand are among them, the cap holds, and
  every pair still meets once; a re-dealt floor-priced season at 12 teams is valid, balanced,
  seeded, and its breaks and carry-over match a recount.

## Pricing the balanced least: floor-priced searches that land inside their cap (2026-11-13, latest)

The floor-priced search (two sections up) prices a timetable on its **break floor**, the fewest breaks
any host choice allows. The floor ignores the tool's balance rule (each team's home and away games
within one), and the grounds the page finally picks must keep it, so a timetable at the floor can need
1 to 3 more breaks once it is balanced. That is why several searches ended over the cap they were
given: 17 teams at a cap of 28 came back at 29, 30 and 31 breaks on seeds 1 to 3 (floors 27-28); at 20
teams the step sometimes kept a cap-46 search that came back at 48.

**The fix: price the balanced least once the floor is in reach.** When a move's floor is within the
cap, the search now walks the floor programme's own table for the least *balanced* host choice within
the cap (`floorTable(...).balanced(cap)`, the same seeded depth-first walk `leastBreaks` uses, moved
into `balancedWalk` so both share it). The forward table is already there from the floor, so no
programme is rerun: the walk is the only extra cost. A timetable with a balanced choice inside the cap
is priced at it (no penalty); one without, or whose walk runs out of its 50,000 steps, is priced as the
cap + 2. The best timetables are only remembered while they are balanced inside the cap, so the
six the search keeps for the end are ones that can actually be used. `floorPricedSingleRounds(n, start,
{ balanced })` (default on; `balanced: false` is the old floor-only pricing) and `carryOverFloorPriced`
pass it through; the result reports `walks`.

**What it changes on the page** (`node eval/floor-priced.mjs <teams> <seed> --page` with and without
`--floor-only`, same cached lists, 16 to 20 teams, seeds 1 to 3, `eval/balanced-priced.txt`):

| Teams, seed | floor alone | balanced least priced | cut inside the gap |
|---|---|---|---|
| 17, s1 | 347 / 29 (cap 28) | 367 / 30, **391 / 27** | 22.2% -> **32.3%** |
| 17, s2 | 385 / 29 (cap 28) | 369 / 30, **381 / 28** | 17.1% -> **24.3%** |
| 17, s3 | 369 / 30 (cap 28) | **371 / 28** | 13.6% -> **27.0%** |
| 18, s1 | 366 / 36, 418 / 34 | 366 / 36, **408 / 34** | 4.4% -> 5.0% |
| 18, s2 | 370 / 36, 428 / 34 | **366 / 36**, 428 / 34 | 4.0% -> 4.3% |
| 18, s3 | 408 / 36 | **404 / 36** | 1.4% -> 1.7% |
| 20, s1 | 382 / 48, 528 / 46 | 382 / 48, **444 / 46** | 4.8% -> **7.0%** |
| 20, s2 | 414 / 48, 434 / 46 | **384 / 48**, 460 / 46 | 11.6% -> 11.8% |
| 20, s3 | 374 / 48, 460 / 46 | 374 / 48, **458 / 46** | 16.1% -> 16.2% |
| 16 s1-s3, 19 s1-s3 | | unchanged (nothing joins in either mode but 16 s3's 348 / 22) | |

- **No run's cut inside the gap got worse; 9 of 15 rose, 6 held.** Mean cut inside the gap 6.3% ->
  **8.6%**; mean cut in the least carry-over at a break budget over the whole frontier 1.8% -> 2.5%.
  Seasons joining the frontier: 15 -> 17.
- **Every season the step adds is now within its cap for balance's sake.** Floor-only pricing returned
  4 seasons over their cap; with the balanced least priced the only one left is 16 teams seed 3's 348 /
  22 at a cap of 20, whose *floor* is 22 in both modes (the search found no timetable with a floor
  under the cap at all, a different limit).
- **The cost is worker time:** 20 s a run on average before, 32 s now (304 s -> 479 s over the 15
  runs). The worst is 19 teams, 4 to 5 s before and 35 to 46 s now, adding nothing either way: odd
  leagues near the cap often have no balanced choice inside it, and each such walk spends its budget
  before giving up (corrected below: a profile shows the cost was the break floor's programme, not the walks; "A faster break floor"). A smaller budget (10,000 steps) did not help 19 teams (37 s) and lost seasons at
  17 (32.3% -> 26.4% inside the gap), so 50,000 stays. The step still runs after the squeezes with
  the page usable throughout.
- Tests (`floor-priced.test.mjs`, now 16): `floorTable.balanced` returns `leastBreaks`' proved balanced
  least at and above it, null and proved one break under it and under the floor, and reads a trial's
  table rather than the committed one (30 timetables at 8, 9, 12, 13 and 14 teams); at 17 teams from
  343 / 32 with a cap of 28 the floor-only search returns 371 / 32 and the balanced-priced one 391 /
  28, recounted.

**Two things that did not work, for the home-and-away floor** (the `next:` item "an exact or tighter
floor for home and away"):

- **A Lagrangian floor cannot beat the relaxed one, by symmetry.** Pricing each pair's tie (host in
  leg one = away in leg two) with a multiplier and running the programme over both legs looked like
  the cheap way to tighten the 74 MaxSAT beats with 85 (19 teams, 1,311 timetable). It returned 74
  after 225 steps, on both the 1,311 and 1,517 timetables, with and without the leg-one balance
  priced too. The reason is exact, not a tuning matter: flipping every host of a season keeps every
  break, and the average of any host choice and its flip meets every pair's tie (a_e + b_e = 1 on
  average), so the Lagrangian dual, which is the linear relaxation over the programme's paths, always
  has a solution at the relaxed floor. A tighter floor has to break that symmetry, for example by
  branching, not by pricing.
- **Exact block descent finds nothing to improve.** Trying every host choice of the pairs of one or
  two rounds at a time (one leg-one round, one leg-two round, adjacent rounds, the seam, and each
  leg-one round joined with each leg-two round: up to 18 pairs, 262,144 choices) leaves the page's 87
  and 84 at 87 and 84 (`eval/double-blocks.mjs`, `eval/double-blocks.txt`, 26 to 43 s each). The page's
  grounds are already optimal over every such block, so the 2 breaks MaxSAT saves on the 1,311
  timetable need a change spread over more than two rounds' pairs.

## Blackout fit on the multi-division page (2026-11-13, latest)

The multi-division page used to build the season first and then move every match that fell on a team's
unavailable date (`applyDivisionBlackouts`). It now fits first, as the single-league page does.

The reason it is cheap here: **which night a match position lands on does not depend on who plays in it.**
The night loop (`takeNight`, pulled out of `buildDivisions` unchanged) hands each night's open court slots
to the divisions with the most rounds left, and it reads only how many matches each round has. So
`divisionMatchNights(spec)` runs that loop once, without the court assignment, and every
(home, away, night) position it lists stays put under any renaming of a division's teams. Skip dates,
court closures, shared slots and split rounds are already in those nights, because they come from the
same loop.

`fitDivisionsToBlackouts` then searches each division's renamings separately (a seeded hill climb on
pair swaps with sideways moves, each swap moving a team that has a blackout, 3,000 evaluations a
division) for the fewest positions where a team is out that night. That count is exact and costs one
pass over the division's matches, so the search is milliseconds. `buildDivisionsWithBlackouts` builds
the season with the renamings from four fit seeds and with none, runs the existing mover on each, and
keeps the season that leaves the fewest matches unplaced, then moves the fewest, then ends earliest,
then has the fewest home/away breaks. The unfitted season is one of the candidates, so the result is
never worse on that order. `buildDivisions(spec)` takes `spec.perms` (one renaming per division) for
this; the court assignment, travel, linked teams and venue fairness all run as before on the renamed
round robin. The page and `node divisions.mjs spec.json` use it whenever the blackout box has dates
and print a "Blackout fit:" line saying what changed; `"blackoutFit": "no"` in the spec (or
`blackoutFit: false` in code) turns it off.

**Measured** (`node eval/division-blackout-fit.mjs 8 1`, `eval/division-blackout-fit.txt`): 96 random
leagues of 2 to 4 divisions of 4 to 12 teams (30% double), Tuesday and Thursday, two time slots, courts
for about half of the league's matches a night (never fewer than the biggest round needs) plus 0 or 1, so
divisions take turns. Every team gives 1 or 2 dates it cannot play, from the first 24 nights
("spread") or from three nights only ("clustered"). Each league is built with the fit off and on:

- matches moved off a blackout date 1,323 -> 929 (30% fewer); 0 -> 0 left unplaced;
- the mean season ends 11.63 -> 11.43 weeks after the start;
- home/away breaks 4,010 -> 3,255 (19% fewer), because fewer make-ups break up the home/away pattern;
- 0 invalid schedules (`validateDivisions` on both), and no league worse on (unplaced, moved).

On a second set of 96 leagues (seed 2, not looked at while building it): moved 1,298 -> 861 (34%
fewer), season 11.39 -> 11.09 weeks, breaks 3,684 -> 2,820. With one fit seed instead of four the
moves are the same (929 -> 930); the extra seeds buy a little of the end date and breaks
(3,423 -> 3,255). The cost is the extra builds: about 30-100 ms a league against 3-9 ms.

The gain is smallest in "clustered" leagues with 2 dates a team (76 -> 65, 173 -> 139): when a third of
a division is out on the same night there is little to rearrange. Synthetic leagues only; no real
club's sign-up export has been tried. Tests: `division-blackout-fit.test.mjs` (the nights match the
build's, with skip dates, closures and split rounds; a renamed league validates; never more moves than
without the fit; the same seed gives the same season; an odd division puts a blackout on a bye; no
blackouts means the same season as before).

## Blackout fit: teams placed in the round robin around their blackout dates (2026-11-13)

Until now a team's blackout dates were handled after the timetable was fixed: each play night took the
remaining round with the fewest blocked matches, and every blocked match went to a makeup round after the
season. But **which team takes which position of the circle method is free**. Renaming the teams leaves a
valid round robin, and each team's home/away sequence moves with its new label. So the order can be chosen
so that a team's blackout night falls on its bye (odd leagues) or on a night it meets another team that is out too.

`fitPlanToBlackouts` (calc.mjs) searches those relabellings with a seeded hill climb on pair swaps,
moving at least one team that has a blackout each time. It scores each candidate by running the real
placement (`placeRounds`, the old loop pulled out unchanged) and ranks seasons by, in order: fewest
displaced matches, earliest last date, fewest home/away breaks. It starts from the plan as given, so it is
never worse on the first key, and it stops early once it reaches the season the league would have with no
blackouts at all. The budget is counted in work, not time, so a share link rebuilds the same season. That
is up to 4,000 evaluations, fewer for big double round robins: about 0.2-0.5 s at 16 to 30 teams, against
about 0.07 s before. It runs by default whenever any team has a blackout. `blackoutFit: false` in the spec
turns it off, and the page shows a "Blackout fit:" notice saying what changed. A carry-over plan is
relabelled the same way, and carry-over counts move with the labels too.

**Measured** (`node eval/blackout-fit.mjs 8 1`, `eval/blackout-fit.txt`): 640 random leagues of 5 to 16
teams, single and double, played on one weekday. Every team gives 1 or 2 dates it cannot play, drawn either
from every play night ("spread") or from three nights only ("clustered", a school holiday). Each league is
built with the fit off and on, same seed:

- makeup matches 5,431 -> 3,911 (28% fewer); the mean season 18.04 -> 17.22 weeks;
- home/away breaks 20,156 -> 14,732 (27% fewer), because breaks are the search's third key and
  the old placement's round reordering had been adding them;
- 0 invalid schedules (`validateSchedule` on both builds).

The gain is largest in odd leagues, where a blackout can sit on a bye: 13 teams, single, 1 date each:
48 -> 27 makeups. In clustered double leagues it is large too: 7 teams, 2 dates: 30 -> 3, 5 of 8 leagues
with no makeup at all. Even leagues gain less, because every team plays every night, so a blackout always
displaces its match unless the opponent is out too: 16 teams, single, 1 date: 107 -> 93.

Not everything improved. Breaks rose in a few cells where the search traded them for fewer makeups (for
example 10 teams, single, 2 dates: 156 -> 188), because a makeup ranks above a break. A seasoned
organiser may weigh those differently. Synthetic leagues only; no real league's blackout list has been
tried. Tests: `blackout-fit.test.mjs` (relabelling keeps a round robin and moves each team's sequence with
its label; never worse than the plan as given; the same seed gives the same season; no blackouts means no
change). The multi-division page gets the same fit in the next section.

## Stopping a refused trial early: measured, not kept (2026-11-17, latest)

The flagship row asked for a cheaper 30-team floor-priced step: the step is 31 of the page's 62 s. One way to
spend fewer steps is to stop a trial once it is sure to be refused. The search only needs to know whether a
timetable's break floor is at most `maxBreaks + floor((line - carry-over) / over)`, so a trial could stop as
soon as a lower bound on its floor passes that. Tried, measured, and left out of `main`, because it bought
nothing the machine's noise does not hide (`eval/trial-cutoff.txt`; the code is `eval/trial-cutoff.patch.txt`).

- **Two rounds alone never force a break in an even league.** The cheapest bound counts the odd cycles the
  teams of two consecutive rounds form (each such cycle forces one break; checked by brute force on 400 random
  pairs). On every pair of rounds of a 30-team starter it is 0. Breaks come from three rounds or more:
  disjoint 3-round windows give 56 of that starter's 84, 5-round windows all 84.
- **Refused moves miss by a break or two.** Of the trials that ran to the end, 1,044 were refused by one
  break and 1,432 more by 2 to 5. A bound has to be within a break or two of exact to stop a trial early.
  The pair bound plus the table so far stopped 7,211 of 11,307 trials, but near their end: 5.9% fewer steps,
  and the floor-priced step took 55.5, 56.3 and 54.1 s against 60.4, 56.0 and 55.3 s without it.
- **Exact windows cost more than they save.** Caching the exact least of every window of 4 or 6 unchanged
  committed rounds gives a much tighter bound, but a commit every ten trials changes about three rounds, so
  the windows are recomputed so often that the run takes 40,654 to 66,540 extra steps to save 21,000 to
  29,000 (67.4 and 68.6 s).
- **The step itself is near its limit.** A profile puts 28 of 54 s in the int16 step, which keeps one cycle
  open at a time (tables of 2^(k+1) at most) and moves about 3.8 billion entries a second. A shuffle-free
  inner loop gave the same tables at the same speed.

So the next saving at 30 teams is fewer trials, not cheaper ones, and has to be judged on the seasons it
finds. Same seasons, same code on the page; nothing changed for users.

## A trial's steps kept in the module: 30 teams join the page (2026-11-17)

The flagship row asked for 30 teams in the page's floor-priced step, and named the next thing to cut:
the step's copy-in and copy-out, which had grown about as large as the step itself. Counted first
(guards lifted locally, 30 teams, seed 1): one page run makes **11,360 trials of 19 steps each on
average, and commits only 1,118 of them** (245 more are walked for their balanced least). Nine trials
in ten are scored and thrown away, yet every one of their 216,167 steps sent its table out of the
module into JS, sliced a copy, and sent it back in for the next step.

**The change.** `floorTable`'s trial now hands its whole run of rounds to `chainLeast` (`orient.mjs`),
which plans every step first and then runs them in the module back to back: between steps,
`chain_i32` (`wasm/minplus.c`) moves the last step's output straight into the next step's input
layout, and `chain_min` takes the least against the backward table there too. Only that one number
comes back. The trial's tables and home masks are rebuilt in JS (the old path) only if the trial is
committed or walked. Anything the module cannot take (a table too big, no WebAssembly, values that
could leave int16) falls back to the old path before any state changes.

The move between layouts went through three versions (`eval/chain-step.txt`):

| Version | 30 teams, off -> on | 28 teams, off -> on | the move's own time |
|---|---|---|---|
| scatter and gather: two lookups per entry | 91.1 -> 78.2 s | 42.3 -> 35.5 s | 20.3 s |
| sequential writes, one composite bit permutation read | 94.6 -> 76.3 s | 44.9 -> 36.5 s | 16.3 s |
| the same in blocks of 64 (committed) | **93.8 -> 62.0 s** | **45.7 -> 30.2 s** | 3.5 s |

The composite permutation works because both layouts are permutations of the same round's host bits:
input bit `xPos[j]` is output bit `ys[j]`. For the symmetric step, the folded bit's place reads its
complement, which in output terms is one xor with every kept bit. In blocks of 64, the low six bits'
part of that place and of the unary costs is a 64-entry table, and the high bits add one constant per
block. **About 34% off the page's floor-priced step at 28 and 30 teams, with the same seasons on every pair.**
26 teams gained 7% with the first version (21.9 -> 20.4 s), since fewer of its steps take the symmetric step.

**30 teams join the page; 29 does not** (two processes at once, so slower than solo):

| Teams, seed | Floor-priced step | Gap | Added |
|---|---|---|---|
| 30, 1 | 62.0 s (solo) | 1110/84 .. 2542/68 | 1152/82, 2542/64 |
| 30, 2 | 105.1 s | 1110/84 .. 2576/60 | 1164/82 |
| 30, 3 | 74.3 s | 1110/84 .. 2718/58 | 1162/82, 2066/80 |
| 29, 1 | 80.7 s | 3641/47 .. 4049/38 | nothing |
| 29, 2 | 75.9 s | 1105/56 .. 3597/45 | 3597/44 |
| 29, 3 | 74.2 s | 3659/50 .. 4063/44 | nothing |

30 teams add seasons on 3 of 3 seeds, including one in the middle of the gap (2066/80 on seed 3) and
one that beats a listed season outright (2542/64 against 2542/68), at about what 28 teams cost when
they joined (47-64 s). So `carryOverFloorPriced` runs at up to 30 teams (`maxTeams` 30,
`FLOOR_PRICED_MAX_MATCHES` 15). 29 teams added one season, one break better, on 1 of 3 seeds for
75-80 s, so they are skipped (`skip: [29]`).

- Tests: `orient.test.mjs` compares `floorTable` with and without the chain (`chain: false`) over
  trials at 9 to 30 teams, a third of them committed and every seventh walked: same least, same walk.
  `floor-priced.test.mjs` checks the new size gate (30 in; 29 and 31 out; `maxTeams: 28` still works).
  `FLOOR_CHAIN=0` in the environment turns the chain off, for comparison.
- Not claimed: times are from one shared cloud machine, not a phone or laptop browser. The step itself
  (31 s of 62 at 30 teams) is now most of the time. Halving it again needs a different elimination,
  not less copying.

## Half the table: flipping every host (2026-11-16)

The flagship row asked for 29 and 30 teams in the page's floor-priced step, profiling 30 first. With the
size guards lifted locally (not committed), 30 teams took **128 s solo** (138 to 196 s three at once)
against 47 to 64 s for 28, and added one or two seasons a seed, all just under the top of a very wide
gap: seed 1's list jumps from 1110/84 to 2542/68, and the step added 1152/82 and 2542/64; seed 2 added
1164/82. 29 teams (seed 1) added nothing in 110 s. The profile: 116 of 128 s in the floor trials, the
WebAssembly step 66 s, its copy in and out 17 s, the JS around it 18 s.

**The symmetry.** Flipping every host in every round leaves every team's breaks as they were (two home
games in a row become two away games). So every whole-break table the floor programme builds, which starts
at zero, has f[x] = f[~x], and so does the next one. `minPlusStep(fr, A, B, { sym: true })` uses it: one of
B's host bits is fixed at 0, the two teams of that match become unary costs on fr's bits ("this team breaks
when A's host bit i equals f"), the step runs on one fewer bit, and the other half of the output is read
from the first (g[y] = g[~y]). The unary costs are added in the module's copy-in (`in_i32u`) and the fold
in its copy-out (`out_i32s`), so no extra pass runs in JS (a first JS version was slower than the plain
step). The bit fixed is the first one the elimination meets, so every table after the first step is
halved: 0.44 to 0.35 ms a step at 30 teams (the last bit: 0.39; the best bit by measured time would save
more, but scoring the bits costs more than it saves). `floorTable` passes `sym` on every step; the priced
(Float64) tables and `leastBreaks`' other callers are unchanged. Below 13 matches the extra planning
costs what it saves, so the step only takes the flag from 13 matches (26 teams) up (`SYM_MIN_MATCHES`).

**The page's floor-priced step, off against on** (`eval/symmetric-step.txt`; `FLOOR_SYM=0` turns it off;
two processes side by side on one shared 4-CPU machine, same seasons in every pair):

| Teams, seed | off | on | seasons added (the same) |
|---|---|---|---|
| 28, 1 | 58.0 s | 52.1 s | 1252/72, 1250/70 |
| 28, 2 | 53.6 s | 48.6 s | 1260/72, 1248/70 |
| 28, 3 | 63.9 s | 56.6 s | 1220/68, 1318/66 |
| 26, 1 | 27.9 s | 26.5 s | 1014/58, 1068/56 |
| 26, 2 | 20.1 s | 18.7 s | 738/68, 776/66 |
| 30, 1 (guards lifted, last bit fixed) | 129.2 s | 103.8 s | 1152/82, 2542/64 |

**28 teams 175.5 s to 157.3 s over three seeds (10%), 26 teams 48.0 to 45.2 s (6%), 30 teams 20%**, with
identical seasons. That is not enough for 30 teams: at about 100 s they still cost twice the 28-team step,
for seasons near the top of the gap, so 29 and 30 stay off the page (`maxTeams` 28). At 28 teams the step
is a smaller share of the run (a bare step goes 0.23 to 0.19 ms), so the rest of the time is the moves,
the closing walks and the JS around each step.

- Tests: `orient.test.mjs`: on 240 random rounds of 2 to 16 matches (byes included), symmetric tables
  small, at the int16 edge and wide int32 give the JS loop's table with `sym` and a symmetric output;
  `floorTable` gives the same floor and trials with the symmetry on and off at 9, 14, 20 and 24 teams.
- Not claimed: times are from one shared cloud machine, not a phone or a laptop browser; per-step times
  in `eval/symmetric-step.txt` are noisy to about 10%. Next for 30 teams: the copy-in and copy-out are now
  about as large as the step (keep tables in the module between steps instead of copying each one out).

## Starting under the gap: 27 and 28 teams join the page (2026-11-15)

The section below left 28 teams (14 matches a round) off the page: 94 s of floor-priced search that
added nothing. Profiled first (`node --cpu-prof`, 28 teams, seed 1; `eval/under-start.txt`): of 78 s in
the step, 64 s were the floor trials and 10.5 s the closing `leastBreaks` walks. Every search
came back empty for two reasons, and fixing both lets the page's floor-priced step take up to
**28 teams** (`maxTeams` 26 -> 28, `FLOOR_PRICED_MAX_MATCHES` 13 -> 14).

- **The walk's heavy tail.** `balancedWalk` (the depth-first search for the least balanced host
  choice) tried a round's equally cheap host choices in a seeded random order. On the 28-team
  starter timetable (978 / 74, balanced least 74) it needed 0.9 to 6.8 million steps depending on the
  seed, and the closing check gets 2 million, so the search returned null even for the season it
  started from. Now the walk first tries the choices in order of how even they leave the teams'
  home and away counts (least sum of squares first, the shuffle still breaking ties), on a tenth of
  the budget (`GUIDE_SHARE`), then the old seeded order on the rest, from the first level the guided
  pass did not finish (a finished level is proved whatever the order). Most seasons then take one
  step a round (27 steps at 28 teams). The guide alone was worse on a few seasons (a 24-team one
  went from 9 of 20 seeds found to 0 of 20), hence the fallback. Over the page's lists at 22, 24, 26
  and 28 teams, 20 walk seeds each (`eval/walk-guide.mjs`, `eval/walk-guide.txt`): **33 of 960 walks
  out of budget, against 40 in the old order; 146 million steps against 191 million** (28 teams: 1
  against 9, 8.4 against 36.0 million).
- **The start above the gap is rigid.** At 28 teams the season above the widest gap is a starter
  timetable, and no move of the search gets its floor under the first cap. From the season *under*
  the gap the same search lands inside it (28 teams, seed 1: 1,252 / 70 and 1,346 / 66 where nothing
  was between 978 / 74 and 1,466 / 64). So `carryOverFloorPriced` now switches to the season under
  the gap once the search from above lands nothing within a cap, for that cap and every lower one
  (`underStart`, on by default; one search with re-deals there). Where the search from above
  already lands, nothing changes.

**The page's floor-priced step, old code against new** (`eval/under-start.txt`, same cached lists,
old and new side by side on one shared 4-CPU machine; the old code with its size guards lifted
locally to run 27 and 28 teams):

| Teams, seed | gap | old: seasons added (cut inside the gap) | new | old time | new time |
|---|---|---|---|---|---|
| 28, 1 | 978/74 .. 1466/64 | none | 1252/72, 1250/70 (5.9%) | 80.2 s | 48.1 s |
| 28, 2 | 978/74 .. 1400/62 | none | 1260/72, 1248/70 (3.6%) | 80.9 s | 46.9 s |
| 28, 3 | 1300/70 .. 1418/62 | 1220/68, 1194/70 (3.5%) | 1220/68, 1318/66 (5.3%) | 43.7 s | 54.8 s |
| 27, 1 | 923/52 .. 1311/48 | none | none | 9.0 s | 19.2 s |
| 26, 1 | 1104/60 .. 1238/50 | 1014/58 (3.6%) | 1014/58, 1068/56 (6.4%) | 33.0 s | 22.5 s |
| 26, 2 / 26, 3 | | 738/68, 776/66 / 1104/56, 1140/54 | the same | 17.6 / 22.6 s | 16.1 / 22.0 s |
| 25, 1 | 1163/41 .. 1171/37 | 1119/39 (2.2%) | the same | 11.2 s | 11.4 s |
| 25, 2 | 713/48 .. 1083/37 | 715/47 (3.1%; over its 46 cap) | 991/44, 983/42 (5.0%) | 28.5 s | 31.5 s |
| 25, 3 | 713/48 .. 1127/42 | none | none | 19.4 s | 24.4 s |
| 24, 1 | 570/64 .. 862/58 | 614/62, 640/60 (18.2%) | the same | 9.3 s | 9.5 s |
| 24, 2 | 570/64 .. 862/54 | 620/62, 610/62 (5.9%) | 620/62, 822/60 (6.5%) | 10.1 s | 12.4 s |
| 22, 1 / 20, 1 | | 440/58 / 382/48, 444/46 | the same | 14.0 / 2.2 s | 14.8 / 2.1 s |

**No run's cut inside the gap went down; five went up** (28 teams on all three seeds, 26/1, 25/2,
24/2), and the fourteen runs took **335.7 s against 381.7 s**. 28 teams take 47-55 s on the worker
and add two seasons on every seed, at the top of what 24 to 26 teams already cost (10-50 s), so
they join the page. 27 teams (28's timetable with a bye, 13 matches) add nothing on seed 1 in either
version but cost 19 s, so they are not special-cased.

- An earlier cut of the guide (half the budget guided) cost 22 teams' 440 / 58 on seed 1: the old
  order needs 1.02 million steps there and the half left it 1 million. At a tenth it is back.
- Tests: `orient.test.mjs`: on 48 shuffled timetables of 7 to 16 teams the guided walk gives the old
  order's least whenever both prove it, its hosts are balanced with exactly that many breaks, and it
  takes fewer steps on at least half; on budgets the guided pass cannot finish in, the fallback stays
  within the budget and a proof is still the least. `floor-priced.test.mjs`: 22 to 28 teams pass the
  size gate, 29 do not, `maxTeams: 26` keeps the old gate, and `floorPricedSingleRounds` refuses 29.
- Not claimed: times are from one shared cloud machine, not a phone or a laptop browser; no real
  28-team league has been tried; the lists here were built once by the new code, so they are not the
  lists of the sections below (24/1 is the same; 26/1's list differs).

## Every starter, not a sample: 26 teams 716 to 670, 28 teams 828 to 778, 30 teams 948 to 894 (2026-11-15)

The built-in starters (`STARTERS`) came from sampling: `eval/starter-search.mjs` drew random starters
for 20 s per size (3,242 draws at 18 teams) and `eval/starter-climb.mjs` climbed from them. Nobody had
asked what the *best* starter is. `eval/starter-exhaust.c` (plain C, no dependencies) answers it for
every size up to 30 teams by enumerating all of them.

- **Why one step is enough.** A start only renames the teams, and starter S at step s is the starter
  s^-1 S at step 1 with the teams renamed (multiplying by a unit keeps a starter a starter). So the
  least over every starter at step 1 is the least over every starter, step and start. A new test in
  `starter.test.mjs` checks this by brute force at 6 to 14 teams: every starter, every step coprime to
  N - 1 and every start, against the C program's step-1 least.
- **Exact pruning.** Pairs are added in residue order; once both residues z - 1 and z have partners,
  the N - 2 transitions through them are known and counted. Cells only grow, so a partial starter's E
  bounds every completion and a branch stops once it reaches the best found. With `NOPRUNE=1` it visits
  every starter: 1, 3, 9, 25, 133, 631, 3,857, 25,905 and 188,181 of them for 6 to 22 teams.
- **Results** (`eval/starter-exhaust.txt`, every best re-scored from scratch and checked to be a round
  robin; the page's `carryOverFromOpponents` agrees):

  | Teams | Least over every starter | Stored starter before | Floor | Time |
  |---|---|---|---|---|
  | 18 | 318 | 318 | 288 | 0.0 s |
  | 20, 22 | 360, 440 (the floor) | 360, 440 | 360, 440 | 0.4 s, 4 s |
  | 24 | 570 | 570 (climbed) | 528 | 4 s |
  | 26 | **670** | 716 | 624 | 26 s |
  | 28 | **778** | 828 | 728 | 265 s (capped at the old 828) |
  | 27 (28's timetable, one bye) | **773** | 823 | 675 | |
  | 30 | **894** | 948 | 840 | 24 min (capped at the old 948) |
  | 29 (30's timetable, one bye) | **889** | 891 | 783 | |

  So 18 and 24 teams are settled *for starters*: the 318 and 570 the searches kept hitting are the least
  any starter reaches, and going lower needs a timetable that is not a starter. 26 and 28 teams were not
  settled, nor was 30: sampling had missed starters 6% lower.
- **On the page.** All three are stored as a further start (`TIMETABLES[26].even`, `TIMETABLES[28]`
  and `TIMETABLES[30]`, even and odd), so the search still runs from the old starter too and keeps the best of all starts, as
  for 12 and 14 teams. Through `lowCarryOverRounds` / `lowCarryOverDoubleRounds`, seeds 1 to 3, effort 1
  (carry-over / breaks; the full table is in `eval/starter-exhaust.txt`):

  | Setting | 26 teams before | after | 28 teams before | after | 27 teams before | after |
  |---|---|---|---|---|---|---|
  | Single, carry-over only | 716 | **670** | 828 | **778** | 823 | **771-773** |
  | Season, carry-over only | 2,618 (all seeds) | 2,610-2,618 | 3,146-3,148 | **3,038-3,044** | 3,015-3,079 | 2,953-3,015 |
  | Either, break weight 10 | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged |

  30 teams (seeds 1 to 3): single, carry-over only 948 to **894**; season, carry-over only 3,614 to
  **3,502**; break weight 10 unchanged. 29 teams (seed 1): single 891 to **879**, the rest unchanged.

  Nothing got worse at any seed or setting. The page's carry-over-only season (`carryOverPure`) and its
  "most even carry-over" pick get these numbers; the break-weighted settings keep the weighted
  starter's seasons. The cost is one more start: a 26 or 28 team search takes about 30-40% longer
  (seed 1, all four settings: 26 teams 19 s to 26 s; 28 teams 20 s to 26 s; 30 teams 23 s to 30 s).
- **Hot windows tried and not kept as a result.** `eval/window-refill.c` gained `HOT=p`: with
  probability p a window is built around a transition that feeds a cell at 2. Four 600 s runs from the
  18 and 24 team starters (HOT 0.5 and 0.9, small and default windows) found nothing below 318 or 570.
  Knowing now that both are the least starters, the gap at 18 (318 against the floor 288) and 24 (570
  against 528) is a non-starter problem; the option stays in the program, off by default.
- Not claimed: these are the least over starter timetables, not over all round robins (12 teams show
  the difference: the best starter is 156 and a non-starter timetable reaches 132). Nothing here was
  compared with published tables, which use the cyclic definition.

## Whole-break tables in int16: 26 teams join the page (2026-11-15)

The section below put `minPlusStep`'s inner loop in WebAssembly and left the kernel at 62% of a
24-team run. A 26-team league (13 matches a round) was still off the page: with the guards lifted it
took 71 s on seed 1, with the int32 kernel at 73% of the profile. The whole-break kernel now runs on
int16 with explicit SIMD, and the page's floor-priced step takes up to **26 teams** (`maxTeams` 25 -> 26).

- **Why int16 is exact.** The floor programme's whole-break tables start at zero and a step adds at
  most 2 to an entry, so a 26-team season's entries stay under 60. `in_i32` scans the input: when every
  entry is under 30,000 (16 steps at most, so no overflow) the module copies it to int16 buffers and
  runs the int16 step, eight lanes per SIMD instruction instead of four; otherwise it keeps the int32
  loop. No caller of `orient.mjs` passes a wide table, but the test does, with negatives, to keep that
  path checked. Priced (Float64) tables are unchanged.
- **Explicit SIMD, not the autovectoriser.** The first int16 version, a plain C loop, was slower than
  int32 (0.166 against 0.126 ms at 12 matches): clang widened every lane back to 32 bits. The step
  now uses `wasm_simd128.h`. Eight entries z0 .. z0 + 7 (z0 a multiple of 8) share every bit of z from
  bit 3 up, so each edge's break bit is either a fixed lane pattern (it reads bit 0, 1 or 2) or one
  splatted value per group; the old table's pairs split into evens and odds with one shuffle each.
  Blocks under 8 entries (the last steps) take a scalar loop.
- **Thirteen matches for the floor-priced search only.** `ORIENT_MAX_MATCHES` stays 12, so
  `leastBreaks`' other callers (regrounding, the home-and-away branch and bound) do the same work as
  before. `floorTable(opp, n, { maxMatches })` and `leastBreaks(..., { maxMatches })` take
  `FLOOR_PRICED_MAX_MATCHES` = 13 from `floorPricedSingleRounds`, which now accepts up to 26 teams.

**The step** (`eval/minplus-bench.mjs --against` the old module, same tables): 10 matches 0.034 -> 0.019
ms, 12 matches 0.126 -> 0.049 ms (2.6x).

**The page's floor-priced step, old code against new** (`eval/int16-step.txt`, same cached lists, old
and new side by side on one shared 4-CPU machine):

| Teams, seed | old | new | seasons added (the same in both) |
|---|---|---|---|
| 24, 1 | 19.6 s | 10.2 s | 614/62, 640/60 (18.2% inside the gap) |
| 24, 2 | 22.0 s | 11.5 s | 620/62, 610/62 (5.9%) |
| 24, 3 | 40.0 s | 22.9 s | 610/62 (5.6%) |
| 25, 1 / 2 / 3 | 16.8 / 49.8 / 33.4 s | 11.2 / 30.3 / 22.8 s | none / 715/47 (3.1%) / none |
| 22, 1 | 5.0 s | 3.8 s | 670/50, 662/48 |
| 20, 1 | 2.3 s | 2.5 s | 382/48, 444/46 |
| 26, 1 | 70.7 s (guard lifted) | 33.9 s | 1014/58 (3.6%): beats 1030/66, 1088/62 and 1104/60 on the list |
| 26, 2 | refused | 19.2 s | 738/68, 776/66 (11.4%) |
| 26, 3 | refused | 24.0 s | 1104/56, 1140/54 (4.9%) |

**188.9 s -> 115.2 s over the eight runs both can do (1.64x)**, with identical runs, results and
frontiers. 26 teams take 19-34 s and add one or two seasons on every seed, inside the 10-50 s that 24
and 25 teams already cost, so they join the page. 28 teams (14 matches) took 94 s on seed 1 and added
nothing, so they stay off.

- Tests: `orient.test.mjs`: the WebAssembly step equals the JS loop on 240 random rounds of 2 to 16
  matches for int16-sized whole tables, wide int32 tables (negatives included) and tables at the
  int16 edge (29,997-29,999), plus priced tables. `floor-priced.test.mjs`: 22 to 26 teams pass the size
  gate, 27 do not, `maxTeams: 25` keeps the old gate; at 26 teams the default limit still returns
  null and `FLOOR_PRICED_MAX_MATCHES` gives a floor table that agrees with `leastBreaks`.
- Not claimed: times are from one shared cloud machine, not a phone or a laptop browser; no real
  26-team league has been tried. Browsers without WebAssembly SIMD (Safari before 16.4) run the JS
  loop, which is slower at 26 teams than the old module was at 25.

## minPlusStep in WebAssembly: 23 to 25 teams join the page (2026-11-14)

The section below left 24 and 25 teams off the page at 54 to 184 s of worker time, with `minPlusStep`
and the trial loop it is inlined into 94% of a 24-team profile. The step's inner loop now runs in
WebAssembly, and the page's floor-priced step runs at up to **25 teams** (`maxTeams` 22 -> 25).

- **The kernel** (`wasm/minplus.c`, about 40 lines of C, no libc; `sh wasm/build.sh` builds it with
  clang 18 for wasm32 with SIMD128 into a 3 KB module, kept as base64 in `wasm/minplus-wasm.mjs`,
  which `orient.mjs` imports, so the page and its workers need no extra fetch). `minPlusStep` still
  plans the elimination in JS (order, edge bits, sizes), then hands every step to the module. The
  table's input and output permutations run there too, from the same two 6-bit lookups `perm` builds.
- **A flat loop.** For the new table's entry z, the old table's pair sits at 2 (z mod 2^(lx + ly0)),
  where lx is the x bits left and ly0 the y bits met before the step. So the new table is blocks that
  each read the same contiguous run of the old one, and the break count reads z's own bits. A
  first version looped over the y part, then the x part. Its inner loop ran 1 or 2 entries in the
  late steps.
- **Bit-identical.** Priced tables (Float64Array) round in the JS order, `(T + both) - d`, not
  `T + (both - d)`. Whole-break tables are Int32 and exact either way. When WebAssembly or SIMD is
  missing (`WebAssembly.validate` fails), a table would not fit the module's buffers (2^18 entries),
  or `MINPLUS_JS=1` is set in Node, the JS loop runs as before. Checked in headless Chromium: the
  module loads on the page thread and in a module worker, and gives the JS loop's table.
- **homeMasks, one xor an entry.** With the step about 5x faster, building every round's home masks
  bit by bit (2^k x k) was as slow as the step itself. Each host choice x now comes from x without
  its lowest set bit, by one xor. It gives the same masks (2,000 random rounds of 1 to 14 matches,
  checked against the old loop).

**The step**: 12 matches 0.80 -> 0.15 ms, 10 matches 0.18 -> 0.04 ms (`eval/minplus-bench.mjs`, same
tables). Built without SIMD the module takes 0.21 ms at 12 matches, so leaving JS gives most of it
and SIMD about a third more.

**The page's floor-priced step, old code against new** (`eval/wasm-step.txt`, same cached lists, two
processes at a time on one shared 4-CPU machine):

| Teams, seed | old | new | seasons added (the same in both) |
|---|---|---|---|
| 24, 1 | 89.7 s | 21.3 s | 614/62, 640/60 (18.2% inside the gap) |
| 24, 2 | 110.5 s | 25.6 s | 620/62, 610/62 (5.9%) |
| 24, 3 | 178.0 s | 41.9 s | 610/62 (5.6%) |
| 25, 1 | 60.3 s | 16.1 s | none |
| 25, 2 | 211.3 s | 50.4 s | 715/47 (3.1%) |
| 25, 3 | 132.0 s | 34.0 s | none |
| 23, 1 / 2 / 3 | 22.5 / 23.3 / 56.9 s | 4.9 / 5.0 / 11.3 s | none |
| 22, 1 | 15.0 s | 5.2 s | 670/50, 662/48 |
| 20, 1 | 4.0 s | 2.4 s | 382/48, 444/46 |

**903 s -> 218 s in all (4.1x)**, with the same runs, results and frontier in all eleven. 22 teams were
admitted at 35-64 s of worker time; 24 and 25 now take 16-50 s, so `carryOverFloorPriced` defaults to
`maxTeams` 25. 23 teams still add nothing on three seeds but cost only 5-11 s, so they are not
special-cased. A 24-team profile after the change: the kernel 62%, the balanced walk 11%, the JS
around the step (planning, lookups) 6%.

- Tests: `orient.test.mjs` (now 16): the WebAssembly step equals the JS loop (a second copy of
  `orient.mjs` loaded with `MINPLUS_JS=1`) on 240 random rounds of 2 to 16 matches, Int32 and
  Float64 tables, byes and repeated pairs included. The double-loop test now runs against the
  WebAssembly step. `floor-priced.test.mjs`: 22 to 25 teams pass the size gate, 26 do not, and
  `maxTeams: 22` keeps the old gate. `page.test.mjs`: `orient.mjs` imports only `calc.mjs` and the
  generated module, which holds nothing but the base64 string. Full suite: 517 tests.
- Not claimed: times are from one shared cloud machine, not a phone or a laptop browser. No real
  24-team league has been tried. The kernel's last 1.35x is SIMD, which needs Safari 16.4 or later.
  Older browsers get the JS loop, at the old speed.

## A backward table: the floor-priced step 2.1x faster again, same seasons (2026-11-13)

The section below left two costs at 24 teams: the programme's step (87 s of a 152 s run) and the
balanced walk's predecessor scan (37 s). Both are smaller now, and every search still follows the
same path to the same season.

**The walk remembers its predecessors.** Walking back from round r with hosts y, the walk scanned
all 4,096 host choices of round r - 1 for the ones within its slack. Counted on 24 teams seed 1:
**3.48 million scans over only 16,828 distinct (round, hosts) states**, about 207 scans of each,
because the walk comes back to the same state at every slack level and from every branch that
reaches it. `balancedWalk` now scans a state once, keeps the choices within its largest slack (as
`x | extra << 16`, in x order, at most 4 million entries a walk) and filters that list by the
current slack. The filtered list is the fresh scan's list in the same order, so the seeded shuffle
draws the same numbers. After this the walk's share of the profile is about 2 s.

**A move is priced on its own span** (`floorTable(opp, n).trial(lo, hi)`). The table used to rerun
the programme from the first changed round to the last round of the season. It now also keeps a
backward table (`bwd[r][x]`: least breaks in rounds r..R-1 with round r's hosts x), runs forward
only over the changed rounds lo..hi, and takes one more step to meet `bwd[hi + 1]`. A commit leaves
forward tables after its span and backward tables before it stale; the next trial that needs them
recomputes them from rounds the move did not touch. A balanced walk still needs the whole forward
table, so `balanced()` runs the trial's table on to the end (and a commit keeps that). The gain is
smaller than hoped: the search's moves span **15.2 of 23 rounds on average** (5,845 trials,
88,730 round steps on 24 teams seed 1). A partial team swap or a three-round re-deal touches rounds
far apart, and everything between them has to be rerun.

**The step itself, about 1.15x**: the edge test in `minPlusStep`'s inner loop is branch-free, and
the bit permutations at either end use two 64-entry lookups instead of a loop over bits. A 12-match
step went from 0.68-0.77 ms to 0.59-0.70 ms (`eval/minplus-bench.mjs`, which also checks the two
versions return identical tables). Splitting the loop so the edge costs were constants over the x
bits measured slower at 12 matches (0.81 against 0.72 ms), so it was dropped.

**The page's floor-priced step, old code against new** (`eval/backward-table.txt`, same cached
lists, run side by side on one 4-CPU machine; `--max-teams 25` so 24 and 25 run):

| Teams, seed | old | new | seasons added (same in both) |
|---|---|---|---|
| 20, 1 | 8.7 s | 3.6 s | 382/48, 444/46 |
| 22, 1 | 31.8 s | 13.9 s | 670/50, 662/48 |
| 24, 1 | 129.9 s | 80.3 s | 614/62, 640/60 |
| 24, 2 | 147.1 s | 102.0 s | 620/62, 610/62 |
| 24, 3 | 283.2 s | 172.7 s | 610/62 |
| 25, 1 | 123.9 s | 54.0 s | none |
| 25, 2 | 377.2 s | 183.8 s | 715/47 |
| 25, 3 | 230.8 s | 114.6 s | none |

**1,533 s to 725 s in all**, with the same results, frontier and floor counts in all eight runs. 22
teams, which the page runs, now take about 14 s on seed 1. 24 and 25 teams still take 54 to 184 s
in a worker, so they stay off the page (`maxTeams` stays 22). The cost left at 24 teams is the
step over wide spans: in a CPU profile of 24 teams seed 1 taken with the walk cache and the
backward table in (before the step tweak), `minPlusStep` and the trial loop it is inlined into
were 94% of the time and the walk 2%.

- Tests: `orient.test.mjs` (now 10): walks that keep their lists give the same least, proof, step
  count and hosts as walks that scan afresh (`nearCache: 0`) and as walks whose cache fills
  part-way, on 48 shuffled circle timetables of 7 to 16 teams. `floor-priced.test.mjs` (now 18):
  `trial(lo, hi)` equals the whole programme's floor over 640 moves (two-round swaps and
  three-round rotations, kept or undone, with balanced walks between them on 6 to 14 teams). Two
  seeded faults, a backward table left current after a commit and a forward table marked current
  for the whole season, each fail it. The rest of the suite passes unchanged
  (`run_venture_tests.py league-schedule-generator`).

## A faster break floor: 3.8x less worker time, and 22 teams in the page (2026-11-13)

The section above put the 19-team cost (35 to 46 s for nothing) on the balanced walks running out of
budget. **A profile says otherwise**: on 19 teams seed 3 the walks took under 1 s of 143 s; the rest
was the break floor's own programme, `f[r + 1](y) = min over x of f[r](x) + cost(x, y)`, a double
loop over 2^k x 2^k host choices (k matches a round: 262,144 popcounts a round at 19 teams, 16.7
million at 24 and 25). Balanced pricing had made it worse by keeping the search above its cap, where
nearly every move passes the carry-over line and needs a floor (1,412 to 2,878 floors a search
against 166 to 1,083 on the floor alone).

**`minPlusStep` (orient.mjs) does that step without the double loop.** The cost of a pair of host
choices is a sum over teams, and each team plays one match a round, so each host bit of round r
touches at most two host bits of round r + 1: the bits form paths and cycles. Eliminating round r's
bits one at a time along those paths keeps a table over the bits not yet eliminated plus round r +
1's bits met so far, never much more than 2^(k + 1) entries, so a step costs about k x 2^(k + 2)
additions. It returns exactly the double loop's table (`orient.test.mjs`: 300 random rounds with
byes, sitting-out teams, repeated pairs and any table to come). `leastBreaks`, `relaxedBreakFloor`
and `floorTable` all use it; nothing else changes, so every search follows the same path and returns
the same season.

| One round's step | double loop | minPlusStep |
|---|---|---|
| 9 matches (18-19 teams) | 2.6 ms | 0.12 ms |
| 10 matches (20-21 teams) | 11.5 ms | 0.20-0.26 ms |
| 12 matches (24-25 teams) | 203 ms | 0.85-1.3 ms |

A whole floor (`leastBreaks`, no walk) at 24 teams: 1,263 ms to 39 ms; 25 teams 1,524 to 56 ms.

**The page's floor-priced step, same lists, old code against new** (`eval/faster-floor.txt`, 16 to 20
teams, seeds 1 to 3, one run at a time on the same machine): **the same seasons and the same frontier
in all 15 runs, 485 s -> 127 s** in all. 19 teams, which add nothing, 38 / 48 / 134 s -> 8 / 8 / 18 s;
20 teams 32-36 s -> 11-12 s; 17 teams 13-29 s -> 8-15 s.

**22 teams join the page** (`carryOverFloorPriced(n, results, { maxTeams })`, default 22, was a fixed
21; `node eval/floor-priced.mjs <teams> <seed> --page --max-teams 25`):

| Teams | Seeds 1-3: seasons added | cut inside the gap | worker time |
|---|---|---|---|
| 22 | 670 / 50 + 662 / 48; 488 / 56 + 592 / 54; 470 / 56 + 604 / 54 | 4.0%, 8.7%, 9.8% | 35-64 s |
| 23 | none (the 565 / 44 .. 1,667 / 40 gap is not entered) | 0 | 28-77 s |
| 24 | 614 / 62 + 640 / 60; 620 / 62; 610 / 62 | 18.2%, 5.9%, 5.6% | 152-334 s |
| 25 | 715 / 47 on seed 2 only | 0-3.1% | 136-426 s |

22 teams gain on every seed for about what 19 teams used to cost for nothing, so the page now runs
the step there; at 23 it adds nothing, and 24 and 25 gain but take 2 to 7 minutes, so they stay
off (the function itself still takes up to 25). Every 22-team season added is listed after the
regrounded ones, never one of the four choices, so share links made before this change build the
same season. What is left at 24 teams is still the step (87 s of a 152 s run) and the walk's
predecessor scan (37 s, 4,096 states a round).

- Tests: `orient.test.mjs` (now 9): `minPlusStep` equals the double loop on 300 random cases; a
  24-team floor in seconds. `floor-priced.test.mjs` (now 17): 22 teams pass the page's size gate,
  23 do not. The other 21 orient and floor-priced tests pass unchanged.

## Team sheets and a duty rota for a one-division league (2026-11-13, latest)

Most leagues are one division, and until now the snack stand / scoreboard rota and the printable team
sheets (one page per team) lived only on the multi-division page. The one-division page
(`index.html`) now has them:

- **Box 7, "Team duties"**: `Snack stand: 2`, one duty per line. After a build, a line under the
  downloads says how many slots were filled, the spread per team and how many nights had no team free.
- **"Download team sheets to print (.html)"**, with a title and a contact line: one page per team
  with its games in date order (time, court, home or away, opponent, the official when officials are
  listed, and "Your duty" on the nights it has one), **its bye weeks** (new; a one-division league
  with an odd number of teams has one every round), then the duty rota night by night with unfilled
  slots marked "find a volunteer". **"Download team duty rota (text)"** for the group chat.
- Both refuse to download when `validateDivisionDuties` finds a fault or a duty line is bad
  (e.g. `Snack stand: 99`), and say why.

How: `singleAsDivisions(schedule)` in `divisions.mjs` turns the one-division schedule (rounds with a
bye) into the multi-division shape (nights; rounds on the same date share a night; the bye kept as
`night.byes`), so the page reuses `assignDivisionDuties`, `validateDivisionDuties` and
`divisionsTeamSheetsHtml` rather than a second copy. Duties, title and contact go in the share link.

**The print check found three faults in the team sheets, all fixed** (`eval/print-check.mjs`, new
document "single-team-sheets": 9 long team names, so a bye every round, 3 officials and 2 duties,
rendered to PDF on Letter and A4): "Court 1", "Snack stand" and "Jordan Price" broke over two lines;
an empty Venue column was printed (a one-league schedule has no venues); and with those fixed the
table ran 12 px past A4's printable width. Now date, time, court, official and duty cells never wrap,
the Venue column appears only when some venue differs from its court (this also applies to the
multi-division sheets), and print uses 15 px type with 0.35 rem padding. After: 91 checks, 0 failures
(`eval/print-check.txt`).

Checked: `divisions.test.mjs` (one new test over 5, 6 (double) and 7 teams with officials: every
match on both teams' sheets, one bye row per bye, no duty for a team on its bye, rota re-checked,
no empty division labels, hostile names escaped, input unchanged), `page.test.mjs` (one new source
test), the share-link round trip in `calc.test.mjs`, and a Chromium click,
`node eval/browser-click-team-sheets.mjs` (`eval/browser-click-team-sheets.txt`: five teams, two
officials, two duties; 6 sheets, 5 bye rows, 20 game rows, rota text, bad line refused, no page
errors). Usage events: `team_sheets_downloaded`, `duties_downloaded`. Made-up leagues only; not
printed on a real printer, and no real league's rota compared.

## Print check: every printed output rendered to PDF (2026-11-13)

Organisers print this tool's output for the clubhouse wall and the scorer's table, and six outputs
said "printed layout not checked on paper". `node eval/print-check.mjs [--out dir]` renders each of
them to PDF in headless Chromium, on Letter and A4 at the browser's default margins: the one-league
score sheets (10 teams; 20 teams on five courts with six officials), the downloadable league page,
the branded print pack, the multi-division score sheets and team sheets, and both pages' own
"Print" after building a league through the real form. It checks, on the laid-out page and on the
PDF's text (`pdftotext`; without it the page checks are skipped and said so):

- nothing is wider than the printable width;
- short labels (12 characters or fewer: a time, "Court 2", "Round 4", a date) stay on one line;
- no column is printed with a header and nothing under it (score boxes excepted);
- no blank page, and no heading left as the last line of a page with its table on the next;
- score sheets print one sheet per page; the pages' forms and buttons are not printed.

**What it found** (first run, 12 failures; all fixed):

- "Court 1" broke over two lines in every output and both pages ("Round 4" too in the main page's
  team view): the time, court, round and official cells now never wrap (`.s{white-space:nowrap}` in
  the generated files, a print rule on `#rounds-table` and `#byteam`).
- One-league score sheets always printed an empty Official column, taking width from the team names;
  it now appears only when someone is assigned.
- The league page left "Round 6 Tue 10 Nov 2026" at the foot of page 2 with its games on page 3:
  rounds are now kept whole and headings stay with what follows.
- 20 teams with officials ran 3 px past A4's printable width: print padding is 0.35 rem.
- Also: the scorekeeper and notes lines are two lines rather than one that wrapped mid-rule, a
  venue's table on the multi-division sheets is not split, and the last sheet has no page break after it.

After: 82 checks, 0 failures (`node eval/print-check.mjs`). Pinned by `print.test.mjs` (3 tests).
Not checked: a real printer and paper, printers' own margins, and the browser's dark-mode print.

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
- **Set scoring for volleyball (2026-11-03).** `standings(teams, results, { setScoring: true })` reads each score as sets won and awards points the FIVB way: a win by two or more sets earns the full win value (3) and the loser 0; a one-set win (3-2) earns 2 and the loser 1. Default scoring is unchanged. Checked by one calc.test.mjs test on made-up results (175 tests pass). A "Volleyball set scoring" checkbox on the single-league page (2026-11-04) passes it to the standings table and the download; checked by a page.test.mjs wiring test and, since 2026-11-04, clicked in Chromium (`node eval/browser-click-single.mjs`: three made-up teams, 3-2 and 3-0 results; unticked Aces 6, Blockers 0; ticked Aces 5, Blockers 1; unticking restores 6). Not checked against a real league's table. **2026-11-20: the rest of the page now counts the same points.** Before, only the table used set scoring; the play-off race, play-off odds, weekly post and head-to-head mini-table counted plain wins, and on random volleyball leagues the race called a team clinched that could still finish fifth. One `matchPoints()` helper now feeds all of them. The race searches all five outcomes of a match (exact up to 8 remaining matches under set scoring, the same work as 3^12), and the odds simulate one-set wins as often as the typed results contain them. Checked by three calc.test.mjs tests that fail on the old code, one of them exhaustive over every 3-0/3-2/2-3/0-3 outcome in 60 random leagues.

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

## Officials pick their own games on the league page (2026-11-20)

`officiating.mjs`, wired into `server.mjs`. The organiser lists officials in the browser page's format
(`Sam Ortiz (Hawks): Tue, Thu max 8`) in a new Officials box in `/admin`. Every game gets one official by
`assignOfficials`' rule (least loaded, then fewest games with these teams), and saving pins those picks
per fixture id, so adding an official later does not reshuffle games people were already told about,
and a rained-out game keeps its official when the new night still suits them.

Each official has a private link, `/league?t=LEAGUE_TOKEN&o=KEY` (KEY an HMAC of the name under
ADMIN_KEY, like a captain's; a wrong key counts against the same lockout as a wrong token). It shows:

- their upcoming games, with **Can't make it**: the game opens at once for everyone else; inside two
  days it is flagged short notice and, with SMTP set, the organiser (REMINDER_TO) gets an email;
- **open games they can take**: only those they are free for (weekday, not their own team, not
  already on a game at that time, under their cap), so a take can never break a rule; a second
  official who tries the same game is told someone took it first;
- a calendar feed of only their games (`/league/ics?t=...&o=KEY`, the same fixture event ids), which
  drops a given-back game and adds a taken one on the next poll.

Every saved pick is re-checked each time the page is built. A pick a later change broke (the game
moved to a night the official cannot work, the official's team joined, the name left the list) is
taken off the game and named in `/admin` with the reason; nothing stays silently wrong. `/admin`
also lists every game with no official, each with an Assign box holding only the officials free
for it, plus **Fill open games** (the dealing rule over the open games) and **Deal upcoming games
again**. The league page shows who officiates the next two game nights.

Tested in `officiating.test.mjs` (6 tests: keys, dealing under the rules with `validateOfficials`
re-checking from the output, pins surviving a new official, a broken pick named, a rainout keeping
its official, give back / take / organiser assign / fill / deal again, and the full server flow with
the email and the feed). No real league's officials have used it yet; that is the next information.

## Flighted play-offs for golf leagues (2026-11-20)

`golfPlayoffs(recap, season, opts)` in `golf-playoffs.mjs`, and a "Play-offs by flight" block on `golf-league-schedule.html` under the recap, turn the season's standings into the play-off nights: consecutive places cut into flights (as even as possible, larger first, or `sizes: [8, 2]`), a single-elimination bracket per flight (byes for the top seeds of an uneven field, optional third-place match), the date and nine of each round, and a tee time or shotgun hole for every group. Every flight's final is on the last night (a shorter flight starts later); a tie across a flight cut is named, never broken. Text and CSV. Tested in `golf-playoffs.test.mjs` (6 tests, hand-checked pairings); no real league's play-off night has used it yet.

## Box leagues: even boxes, results, up and down (2026-11-21)

`box-league.html` and `boxleague.mjs`. Squash, badminton, tennis, table tennis and racketball clubs
run box leagues: members ranked, split into boxes of four to six, a round robin in each box over a
few weeks that players book themselves, then the top of each box up and the bottom down. Until now
the generator had a challenge ladder and promotion between whole divisions, but nothing for this
format, which club organisers otherwise keep in a spreadsheet or pay a club platform for.

- **Boxes:** `boxSizes(n, size)` uses the fewest boxes at or under the target, sizes within one,
  bigger boxes on top, never a box under 3 (when the target cannot hold without one, one box fewer).
  Checked for every n 3-200 and target 3-8.
- **Results:** per match on the page (two scores, or a walkover to either player), or pasted from a
  group chat (`Ana 3-1 Ben`, `Ana beat Ben 3-1`, `Ana w/o Ben`), with bad lines named by number.
  Games scoring checks the winner has ceil(bestOf/2) games (best of 3, 5, 7); one-score scoring
  takes any two different numbers.
- **Tables:** win / loss / walkover-loss points and a per-game bonus, all settable (default 3/1/0,
  no bonus); ties by head-to-head between exactly two, then game difference, games won, seeding.
- **Closing a round:** top `up` and bottom `down` move (top and bottom boxes excepted); a player
  with no match played (walkovers aside) drops whatever the table says and the box below sends its
  next best up to fill the place; leavers removed, joiners at the foot of the bottom box or of a
  named box (`Name: 2`); then the ranked list is re-split so boxes stay even. Every move is listed
  with its reason, and any points tie on a movement line is named with what decided it.
- Copy (boxes and fixtures, standings), CSV of every result (formula-looking names defused), print,
  read-only share link carrying the league in the URL; saved in localStorage; nothing uploaded.
- Guide: `how-to-run-a-box-league.html`, a worked 14-player example whose tables and moves a test
  recomputes from the module.

Checked: `boxleague.test.mjs` (20 tests: sizes over the whole grid, fixtures, scores, standings and
both tie paths, pasted results, one and two up/down with upsets, no-shows above and on the
relegation place, joiners and leavers, 12 rounds of random results on 37 players with 2 up 1 down
keeping every player once and boxes even, text/CSV/link round trip, page wiring, the guide's
numbers). Clicked through in Chromium at phone width (example league, typed and pasted results, a
leaver and a joiner, close, reload resumes; no console errors, no sideways scroll). Made-up players
only; no club has run a round on it yet, which is the next information.

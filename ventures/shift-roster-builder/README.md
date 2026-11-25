# Shift Roster Builder

A free browser tool for restaurants, cafés, salons, shops and clinics that schedule named people by the week: **list the
shifts you need covered and your staff with availability, weekly hour limits and wages, and get a roster that covers as
many shifts as possible, avoids overtime, respects rest gaps, and tells you which shifts it could not fill and why**.
Nothing is uploaded.

**Live tool:** https://marisstella.app/shift-roster-builder/

After using this, you can now **build a week's schedule that nobody has to be moved around in, see which shifts are
unfillable before the week starts, and find the people the week depends on**, which used to be an hour of spreadsheet
shuffling on Sunday night.

**Start without typing:** pick a template (café or restaurant, hair salon, retail shop, clinic front office) from "or start from a template" and the page builds a roster for an invented team straight away; replace the names and wages with yours (`TEMPLATES` in `calc.mjs`).

## Hosted team hub (built 2026-11-25, not live yet)

The same hub, run for you: sign in at `/start`, create a hub for your team, and get its admin link and team link; no
server, no Cloudflare account. Many teams share one deployment on AWS (`aws/app.mjs`, stack
`platform/aws/stacks/shift-roster`); each team's state is one Postgres row written under a row lock, so two staff
posting at once cannot overwrite each other (the Durable Object's guarantee, kept). Only SHA-256 fingerprints of the
links are stored, so lost links are replaced ("New links"), not recovered. Differences from self-hosting: chat
webhooks are off (the hosted app makes no outbound calls), and settings are the same names as the self-host
environment, per team. **Moving in:** `aws/migrate-hub.mjs` copies a self-hosted hub (Node or Worker) into a hosted
one from its new `/admin/export.json` backup (also linked on the admin page). **Not claimed:** it is not deployed
(there is no AWS account yet), no team has used it, and pricing is not set: one hub per account is free and more
answer "subscription required" until checkout exists. Tested: `aws/app.test.mjs` (in memory), `aws/pg.test.mjs`
(Postgres 16, twenty simultaneous replies, none lost), `aws/console-browser.check.mjs` (Chromium: sign-in with code +
PKCE against a faked Cognito, create, publish, staff view, delete).

## Run your own team schedule (self-hosted)

The browser tool builds the roster; `server.mjs` is the part that gets it to your staff. You build and publish the
week, and your team opens **one link** to see their shifts, add them to their calendar (`.ics`) and send you their
availability, which you merge into the staff list in one click. No accounts, no per-seat price, no third party:
zero dependencies, one JSON file on a disk you own.

- **Alternatives today:** When I Work, Deputy, Homebase and 7shifts charge per user per month and hold your staff
  data. This is the same publish-and-notify loop for a single small team, on your own server, FSL-1.1-MIT-licensed. It does
  not do payroll, photo clock-ins or push notifications; if you need those, use one of them. Since
  2026-11-15 it has a simple time clock and timesheet (section "Time clock and timesheets" below).
- **Secrets:** `ADMIN_KEY` unlocks `/admin?key=...` (edit, build, publish, merge). `TEAM_TOKEN` is the secret in the
  staff link `/team?t=...`. The server refuses to serve without both. Wages, hour caps and payroll never appear on the
  staff page (tested). Put it behind HTTPS (Fly and Render do); the key is in the URL, so do not share admin links.
- **Run:** `ADMIN_KEY=a TEAM_TOKEN=b STATE=./state.json node server.mjs`, or one of:
  `docker compose up -d` (`docker-compose.yml`), Fly (`fly.toml`), or Render
  (`render.yaml`, deploy from your fork; it generates both secrets). Nothing runs on the author's accounts.
- **Free on Cloudflare, no server, no card (2026-11-15):** [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder), or from a clone of this folder `npx wrangler deploy` then `npx wrangler secret put ADMIN_KEY` and `npx wrangler secret put TEAM_TOKEN`. Details in "Free on Cloudflare" below.
- **On the phone:** the staff page is an installable web app (manifest + a small service worker, `server.mjs`). "Add to home screen" opens it full-screen like an app, and the last schedule the phone saw stays readable with no signal. Only the schedule page is cached; forms are never replayed offline. No app-store account, no push notifications.
- **Labor budget from a script (2026-11-08):** `node cli.mjs --budget 2400 staff.txt shifts.txt` compares payroll with a weekly dollar budget and, when over, lists the drops (from `trimOptions`) that close the gap, safe ones first; tested in `cli.test.mjs` on a hand-built week and the sample week.
- **Time clock and timesheets (2026-11-15, on unless `TIME_CLOCK=0`):** staff clock in and out on the team page (the server's clock, shown in your `TIMEZONE`); `/admin/timesheet` shows hours worked beside the published week, flags late starts, early finishes, time past the shift's end, shifts with no punch and missing clock-outs, lets you add a missed punch (marked as yours) and downloads a CSV for payroll. Since 2026-11-16, optional per-person clock PINs and an optional site geofence (section "Clock PINs and a site geofence"); without them it is an honour system. Also since 2026-11-16, paid sick leave (or PTO) earned per hour worked at the rate and caps you set, off until `LEAVE_ACCRUAL` is set (section "Paid sick leave from the time clock"). Details in "Time clock and timesheets" below.
- **Oregon's voluntary standby list (2026-11-16, with `FAIR_WORKWEEK=oregon`):** staff join it in writing on their page and leave any time; a call-out can be offered to the list first, and the hours someone on it accepts owe no predictability pay (ORS 653.432). The Oregon preset was checked against the statute's text: start or end changes of 30 minutes or less are free, a separate added shift always owes the hour. Section "Oregon's voluntary standby list" below.
- **Your payroll service's own template, filled (2026-11-17, with the time clock on):** `/admin/payroll` takes the blank hours-import template from your payroll service (choose the file or paste its first row, once), matches each column by its name to the regular, 1.5x and 2x hours, leave hours, payroll ID, name, rate, gross or week dates, and each week downloads the same columns in the same order filled from the timesheet. Section "Fill your payroll service's template" below.
- **Schedule changes and notice pay (2026-11-16, the log always on, pricing off until `FAIR_WORKWEEK` is set):** every change to a posted week is logged with the moment it was made and who asked for it (a week published again, an approved trade or pick-up, a call-out given to someone); `/admin/changes` prices each under Seattle's, Oregon's, Chicago's, Philadelphia's, Los Angeles's, New York City's, San Francisco's, Emeryville's or Berkeley's predictive-scheduling numbers (or your own), flags shifts posted under 14 days ahead and short rests, and downloads a CSV. Section "Schedule changes and fair-workweek pay" below.
- **Overtime, meal periods and rounding (2026-11-15 later, `PAY_RULES`):** the timesheet turns punches into regular, 1.5x and 2x hours under federal, California, Alaska or Colorado rules, flags California meal breaks that came late or not at all (with the extra hour owed), rounds punches to 5, 6 or 15 minutes if you ask (never under California rules) and estimates gross pay at each person's wage. Since 2026-11-15 also Nevada (daily overtime by the 24-hour workday for staff under 1.5x the minimum wage) and meal-period flags for 13 more states (section "Nevada, and meal periods in 13 more states").
- **Call-outs from a script (2026-11-07):** `node cli.mjs --cover "Tue 17:00" --json staff.txt shifts.txt` prints who can take the shift outright, who is blocked and why, and the hand-over chains as JSON (tested in `cli.test.mjs`).
- **Call-outs:** the staff page has a "Cannot make a shift?" form. Your manager sees the request in `/admin` with who could cover it without moving anyone else, cheapest first (overtime flagged), from the same `coverOptions` as the browser tool. It only asks: nothing changes until you edit and publish again (which clears the list). **Give to (2026-10-29):** each candidate has a one-click **Give to Ana** button; it moves the shift on the published schedule, keeps both people's hours in step, and drops that call-out and any trade request on the shift (`applyCover`, `/admin/cover`; tested in `server.test.mjs`, not on a live team).
- **Shift trades:** staff pick their shift and a colleague's on the team page ("Want to trade shifts?"). `/admin` shows each request with the same check as the browser tool's trade checker (rest gaps, hour limits, availability, payroll change) and enables **Approve** only when both weeks stay inside the rules. Approving swaps the two people on the published schedule; declining changes nothing. Nobody is notified automatically (the "Tell the team" links give you the text to send).
- **Calendar feed (2026-11-02):** each person on the team page has a "Live feed" link (`/team/feed.ics?t=...&person=...`) to paste into a calendar app's "add calendar from URL". Unlike the one-week `.ics` download it lists the last 12 published weeks and keeps each event's id tied to the shift (person, day, times, label), so publishing again updates the phone instead of duplicating events (`rosterFeedIcs`, `state.history`; tested in `server.test.mjs` with two weeks and a republish). Calendar apps choose their own refresh rate (the feed asks for hourly); not tried in a real Google, Apple or Outlook calendar.
- **Open shifts:** shifts nobody on the list was free for appear on the team page as "Open shifts you can pick up". A staff member asks to take one; `/admin` shows the request with the rule it would break (availability, rest, hour limits), and lets you **Approve anyway** once you have agreed it with them, as your own decision. A request that fits is approved normally. Approving fills the shift on the published schedule and clears that person's other requests so they are re-checked.
- **Alerts to your own Slack, Discord or ntfy (2026-10-29, off by default):** set `NOTIFY_WEBHOOK_URL` and the manager channel gets a line when staff send a call-out, trade, open-shift ask, time-off ask or availability reply; set `TEAM_WEBHOOK_URL` and the team channel gets each person's shifts when you publish. `NOTIFY_FORMAT` is `slack` (default), `discord`, `ntfy` or `json`; `PUBLIC_URL` adds a link (the manager alert links `/admin` without the key; the team alert links the staff page, so point it at a channel only your team reads). The webhook is yours: nothing goes through a service we run, there are no wages or keys in a message, staff-typed text is escaped so it cannot ping `@channel` or `@everyone`, and a dead webhook never blocks a request (`webhookBody`, `notifier` in `server.mjs`; tested against an injected fetch, not a live Slack, Discord or ntfy).
- **Time off:** the team page has a "Need days off?" form (name, first and last day, note). `/admin` lists each request; **Add to staff list** puts the dates in that person's `off:` cell (joining an existing one), and **Decline** drops it. It only asks: it applies when you set that week's Monday and build, and never changes a roster you already published (`parseTimeOffRequest`, `addTimeOff` in `calc.mjs`).
- **Tell the team:** after a publish, `/admin` lists each person's shifts with **Text** and **Email** links (`sms:` and `mailto:`) that open your own messaging app with the message filled in (the same text as `--messages`, `rosterMessages` in `calc.mjs`). The server sends nothing and holds no phone numbers or email addresses, so there is no per-message cost and no consent list to keep; you pick the contact and press send. Tested as links in the page (`server.test.mjs`), not opened in a phone's messaging app.
- **Staff replies** are checked with the same parser as the browser tool and capped at 200 waiting lines and 64 KB
  per request. Read them in `/admin` before merging.
- Tests: `node --test server.test.mjs`.

- **Share link:** "Copy share link" puts the whole setup (staff, wages, shifts, rules) in the URL fragment, so a co-manager opens the same setup in one click. The fragment is never sent to a server; it still shows pay, so share it only with people who may see wages.
- **Command line:** `cli.mjs` builds the same roster from a staff file and a shifts file with no browser and no network, for owners and bookkeepers who keep the week in text files and want a Sunday cron or a script: `node cli.mjs staff.txt shifts.txt`, `--last-week roster.csv` to carry end times over Monday, `--csv`, `--hours`, `--json`, `--ics` (with `--week-start`, and `--person` for one person's calendar), `--messages` (a paste-ready text per person), `--open-post` (a group message listing the shifts left open and who could take each), and `--check` (exit 1 if any shift stays open), `--prove` (below), and `--weeks 4 --week-start 2026-11-02` (a month in one run: rest gaps and the tough-shift tally carry week to week, dated `off:` entries land in their week, and the report ends with each person's weekend/closing/opening shifts added up; `--tough-balance 0-100`, `--csv` adds a week column, `--json`, `--check`; `planWeeks`, `planFairness` in `calc.mjs`). `--changes posted.csv --week-start 2026-11-02 --changed-at "2026-11-01 12:00"` (2026-10-27) compares the roster you posted with the new build and lists every shift added, cancelled or moved, with its notice and the premium on your own `--notice-hours` (default 336), `--premium-hours` (default 1) and `--exempt "Ben,Cleo"`, the same `scheduleChanges` as the page's changes report; tested on the sample week, not on a real payroll or any ordinance. `--cancel-hours 0.5` and `--premium-flat 10` (2026-11-04) change how `--changes` prices a short-notice change: a cancelled shift at its own hours of pay (some rules charge a cancellation at a fraction), or a fixed dollar amount per change whatever the wage (`scheduleChanges` options `cancelHours`, `flat`; `flat` also takes `{added, moved, cancelled}`); you type the numbers, no ordinance is preset or checked, tested on hand-built rosters. `--rest-under 11` (2026-11-04) lists every pair of one person's shifts with less than that many hours between them (a close then an open) and the premium on your own `--premium-hours` (default 1 hour of pay) and `--exempt` names, from `restPremium` in `calc.mjs`; inside one week, or with `--last-week roster.csv` (2026-11-04) also last Sunday night to Monday morning (listed as "Sun (last week)"; last week's own pairs are not repeated; the build already honours `--rest` across that boundary, so this mostly shows what `--rest 0` or a hand edit would owe), tested on hand-built rosters, no jurisdiction preset and no claim about any ordinance. `--sales "1200,900,..."` (2026-11-05) prints each day's labor cost as a share of seven daily sales figures (Monday first), flags days over `--labor-target <%>` and days whose hours differ from what `--splh <$>` calls for, from the page's `dailyLabor` and `salesPerLaborHour`; tested on hand-built weeks, sales are typed in, nothing is forecast. `--hours-watch 30` (2026-11-04) lists everyone whose planned week reaches that many hours, or lands within `--watch-within` hours (default 2) under it, for an owner watching a full-time or benefit line they typed; one week only, tested on hand-built weeks, no rule preset and no claim about any benefit or employer-mandate law. `--tips 200` (2026-11-05) splits a tip pot over the planned hours in whole cents that add back to the pot, and `--short-under 4` lists every assigned shift shorter than that, the page's `tipPool` and `shortShifts`; tested on the sample week, who may share a pool is the employer's call. `--long-over 10` (2026-11-06) lists every assigned shift longer than that many hours (`longShifts`; a shift of exactly that length is not listed, report only, tested on a hand-built week, no rule preset). `--days-off 2` (2026-11-05) lists everyone with no run of that many days off in a row in the Monday-to-Sunday week (`daysOffRuns`; a day counts on the day a shift starts, the week is not wrapped, report only; tested on a hand-built week). `--import-staff export.csv` (2026-10-30) turns a staff export from another scheduler (name or first + last, hourly rate, max and min hours, position; inactive rows skipped) into this tool's staff lines, availability set to `any`; the page has the same file box (`importStaffCsv`, `import-staff.mjs`). Column names are matched by synonym and were written from memory: tested on invented layouts, not on a real 7shifts, When I Work or Homebase export (wanted: one). `--import-shifts schedule.csv` (2026-10-30) does the same for the shifts: a published-schedule export (date or datetime, start, end, position; one row per scheduled shift) becomes shift-requirement lines, counted per weekday, time and position, the busiest week when the file spans several; the page has a second file box (`importShiftsCsv`, `import-shifts.mjs`). A published schedule shows who was scheduled, not who was needed. Since 2026-11-13 it reads two real exports, a Deputy timesheet export with the rostered shift beside the worked one and a retail workforce-management week with first-published and final shifts side by side (`--use schedule|final|initial|timesheet|plain` picks the version, `--location <name>` one site of several; section "Two real schedule exports" below); 7shifts and When I Work are read from their APIs instead (`--import-7shifts`, `--fetch-7shifts`, section "Reading 7shifts directly"; `--import-wheniwork`, `--fetch-wheniwork`, section "Reading When I Work directly"); Homebase layouts are still from memory. `--weeks` also reports anyone who works more than six days in a row across a week boundary (`planStreaks`, 2026-10-30; the per-week seven-day flag cannot see Wed to the next Tue; report only, not limited by the search, tested on hand-built plans). `node cli.mjs --example` runs an invented week. Zero dependencies; names and wages never leave the machine (the only network calls are the `--fetch-*` readers, each to your own account with your own token).

- **How close to optimal (exact check):** the roster comes from a seeded simulated-annealing search, which is fast but can miss the best answer. The exact check runs by itself on every week since 2026-11-12 (it was weeks of up to 14 shifts before; see "The exact check on by default, every size" below; `--no-prove`, `exact: false` or "Off" turns it off): with `exact: true` or the default, a branch-and-bound solver searches every assignment of people to shifts, cutting branches that break a hard rule or cannot beat the annealed score (`exactSearch` in `calc.mjs`). If it finishes inside its limits (400,000 nodes, 8 s) the answer is the proven best and the report says so, or says how far off the annealed roster was; if it does not finish it keeps the best roster it found and says the result is not proven. On the built-in sample week (7 people, 32 shifts) the default anneal leaves 19 hours open and the exact search finds a roster with 15 open; it does not finish the cheapest-roster proof there, so the result is shown as a better roster, not a proven one. What it does prove on that week is the coverage: a max-flow / min-cost-flow bound over shifts, person-days and weekly hours (whole shifts only, no two overlapping or breaking the rest rule on one day) shows 15 hours cannot be covered however the week is arranged, which puts the root bound within about $70 of the roster found (it was 79% below, because the old bound counted only total hours) and the report says so. In 40 random 3-5 person, 10-shift weeks (a deliberately weak 3,000-iteration anneal) the exact search proved 16 anneals optimal, improved 15, and ran out of limits on 9. Tested against brute force with overtime, balance, tough-shift, prefer and avoid terms on. **Interchangeable people (symmetry cuts).** People who differ only by name (same wage, limits, availability, preferences and history) are tried once per distinct set of shifts held, so a crew of equal part-timers is not searched in every mirrored order. Measured on equal 15/h, 40 h, any-time crews: 5 people, 8 shifts 132,172 -> 1,160 nodes (2.9 s -> 0.1 s); 4 people, 10 shifts 278,722 -> 11,634 nodes (5.5 s -> 0.4 s); 6 and 8 people on 10 shifts went from not proven at the 8 s limit to proven in 0.4 s and 0.3 s. It does nothing for a crew of all-different people, so the 7-person sample week is still not proven (`exactSearch`; test in `calc.test.mjs`). **Cheap bound first.** Each node builds a flow graph for the coverage bound; now the bound from total weekly capacity alone is checked first and the flow is skipped when that already cuts the branch. On the sample week the same 8 s search visits 220,160 nodes instead of 137,216 (1.6x), and the result is unchanged (still not proven; 15 uncoverable hours, within $69 of the roster found). 129 tests pass, including the brute-force comparisons. **Where the last $69 sits (measured 2026-10-20).** Raising the limits to 6M nodes / 150 s on the sample week visits 3.36M nodes and still does not prove it, so more search is not the way. The best roster's pay is $3,690, exactly the root bound's pay; the other $68.95 of its $3,758.95 score is the hours-balance term (every person's hours are held near a target, and whole shifts and availability stop the targets being met together). The bound minimises each person's balance term alone, so the next gain is a bound that couples people through the fixed total of covered hours, not more dominance cuts. **Balance coupled through covered hours (2026-10-21).** That bound is now in (`coupledHours` in `exactSearch`): the covered hours are fixed in total (the coverage flow says how many), so the people cannot all sit at their own best hours; a Lagrangian price on hours (any price is a valid bound, the best is found by ternary search) charges the squeeze. On the sample week the root gap fell from $68.95 to $55.81 of a $3,758.95 score. On 30 seeded random 3-5 person, 9-11 shift weeks the same 300,000-node limit proves 27 against 26 before, with 1.90M nodes in all against 2.04M (7% fewer). A modest gain: the rest of the gap is whole shifts and availability, which a bound on hours alone cannot see. The sample week is still not proven. **Whole-shift hours bound, tried and dropped (2026-10-21).** Replacing each person's balance minimum over any hours in [now, now + what could still be added] with the minimum over hours they can actually reach (a quarter-hour subset-sum of the undecided shifts that each still fit them) left the sample-week root gap at $55.81 and cut nodes only about 5% on 30 seeded random weeks (5,973 -> 6,126 nodes in the 13-15 shift set, 5,218 against 5,510 with 7-9 hour shifts and balance 80; every case was already proven either way), at the price of a subset-sum per person per node. Whole shifts are not where the gap is; it is who can work when, so the next bound has to couple availability with the balance targets (for example a flow with convex per-person hour costs), not hour sums. **Hours terms inside the coverage flow (2026-10-21).** That bound is now in. Each person's edge into the sink carries the convex hours curve (shortfall below the minimum plus the balance term) as 8 tangent lines, cheapest stretch first, so the min-cost flow prices who can work when together with each person's hours target (a max of tangents lies under the curve, so it is still a lower bound). Sample week root gap: $55.81 -> $0.10 of a $3,758.95 score (`node eval/bound-bench.mjs`; `flowBalance: false` gives the old bound back). On 30 seeded random 4-6 person, 12-14 shift weeks at a 100,000-node limit: proven 27 -> 28, nodes 486,892 -> 459,146. The sample week is still not proven inside 8 s (68,608 nodes): the bound is now tight at the root, and what remains is a tree that is deep because fifteen hours of shifts must stay open and every way of choosing which ones is a branch. **Stop at a stated tolerance (2026-10-22).** The remaining $0.10 was the tangent lines' slack, and the search kept exploring branches that could win by less than that (478,208 nodes in 60 s, never proven). The search now cuts a branch whose bound is within `exactTolerance` of the best (default $0.50 of score, 0 gives the strict proof back; the report says "to within $0.50 of score"). The sample week is proven in 2,545 nodes, about 0.5 s, with 15 hours forced open; before, not proven in 60 s. The 28 of 30 random weeks and the brute-force comparisons are unchanged (`node eval/bound-bench.mjs`; test in `calc.test.mjs`). Only the sample week's seed and the 30 random weeks were tried. **Coverage first (2026-10-22).** Before the cost search, a pass counts only the hours left open (no pay, no balance): the same branch and bound with the coverage flow as its bound, given the same node limit and half the time. If it finishes, the least open hours are proven, and the cost search uses that as a floor (open hours >= proven minimum minus those already open), because cost bounds are weak against whole open hours worth BIG each. On the 30 seeded random weeks at 100,000 nodes: proven 28 -> 29 of 30 (`node eval/bound-bench.mjs`); the two that failed before (cases 4 and 10) needed 128,006 and 29,893 coverage nodes, so case 4 still needs a limit above 100,000. Run at 3M nodes, all three previously unproven weeks (4, 10, 27) prove in under 12 s. A week the pass cannot finish is searched as before; the pass can cost up to the node limit again. Only these seeded weeks were tried; a result of `coverOpen` in the optimality object reports the proven minimum. **Coverage pass gets twice the node limit (2026-10-22).** Its nodes carry no cost terms, so `exactSearch` lets it run to 2 x `exactNodes` (time still half the limit). On the 30 seeded random weeks at 100,000 nodes: proven 29 -> 30 of 30 (case 4 needs 128,006 coverage nodes; 434,057 nodes in all, 17 s; `node eval/bound-bench.mjs`). Branch-order changes in the coverage pass (no cost sort; fewest-hours-first) were tried and left case 4 at 100,001 nodes, so they were dropped. Same 30 weeks only; a harder week still needs more nodes.

## Time clock and timesheets (2026-11-15)

Every subscription scheduler sells a time clock beside the schedule, and Homebase gives one away to win small teams. The team
hub had none, so a manager who used it still needed a paper sign-in sheet or a second app to know who actually worked. It now
has one, on the Node server and the free Cloudflare Worker alike (`timeclock.mjs`, no Node built-ins).

- **Staff:** the team page has "Clock in or out": pick your name, press a button. The time is the server's when the button is
  pressed, not the phone's, so a phone set five minutes slow does not move a punch. The page lists who is on the clock now.
  A second clock-in while one is open, or a clock-out with nothing open, is refused (a double tap cannot make a zero-length
  shift); an open clock-in older than 16 hours counts as a missing clock-out, not someone still working.
- **Manager:** `/admin/timesheet` (linked from `/admin`) shows each person's hours worked against hours scheduled for the
  published week, or any of the last 12 weeks kept for the calendar feed, and every stretch worked matched to the scheduled
  shift it overlaps most (or one starting within two hours). Flags: late by more than the grace (`TIME_GRACE_MIN`, default 5),
  left early, past the shift's end, a scheduled shift with no punch once it has started, time on no scheduled shift, unpaired
  punches, and hours over 40 in the week. A lunch break is simply a clock-out and a clock-in; both stretches count toward the
  same shift. **Add a missed punch** types a date and time in the site's zone; it is stored as added by the manager and shown so
  in the page and the CSV. **Remove** deletes a wrong punch. **Download CSV for payroll** gives one line per stretch (date, in,
  out, hours, scheduled shift, flags), the unpaired punches, and a total line per person.
- **Time zone:** `TIMEZONE` is an IANA name (`America/Chicago`, `Europe/London`); unset or unknown means UTC. Punches are stored
  as instants and shown on the site's wall clock, so daylight-saving changes do not shift them (tested on Chicago in November
  and July, and a repeated 01:30).
- **Storage:** up to 3,000 punches (about 100 days of 15 people punching twice a day), oldest dropped first; on the Worker the
  last-resort size guard keeps the newest 1,500.
- **What it is not:** proof of presence. Out of the box anyone with the team link can punch for anyone; the
  manager's edits and the "added by manager" marks are the check, which is fine for a ten-person café. Optional clock PINs
  and a site geofence (section "Clock PINs and a site geofence") close the two commonest gaps, a colleague punching for a friend and a punch
  from the bus; there is still no photo check. Overtime, meal premiums and rounding are in the next section (`PAY_RULES`). Keeping time records may be a legal duty where you are; this keeps them
  only as long as the 3,000-punch cap, so download the CSV each pay period.
- **Checked:** `timeclock.test.mjs` (six tests: zone conversion across a clock change, double-tap and out-without-in refusals,
  a week with an on-time split shift, late, early, past-end, unscheduled, missing clock-out and no-show cases, a Chicago week
  read in the right and wrong zone, manager punches, the 40-hour line, and the hub end to end: punch, refusals, wrong token,
  the staff page shows no wages, the timesheet page and CSV, `TIME_CLOCK=0`). Also on Cloudflare's runtime locally (wrangler
  4.40.0 `wrangler dev`, 2026-11-15, `TIMEZONE=America/Chicago`): a week published from a browser-built owner array, a
  clock-in shown as 09:01 Chicago time, the second clock-in refused, a clock-out, and the CSV and timesheet page served.
  Not claimed: no real team has used it, and it has not run on a live Cloudflare account.

## Fill your payroll service's template (2026-11-17)

The timesheet CSV is this tool's own layout, so every week a manager still copied its numbers into the hours-import
file their payroll service wants: one more retyping step, and the one where overtime gets put in the wrong column.
Each payroll service imports hours from a spreadsheet with its own columns, and their layouts change, so the hub does
not ship a guessed layout per provider. The manager gives it the provider's blank template instead, and the template
says what is wanted.

- **Once:** on `/admin/payroll`, choose the blank template file (only its first row is read, in the browser) or paste
  that row; add payroll IDs as `Name = ID` lines (leading zeros kept); save. Comma, tab and semicolon templates are
  read, and the download keeps the template's separator.
- **Matching:** each column name is normalised (case, punctuation, `#` read as "number") and matched to a field by
  spelling (`Employee ID`, `File #`, `Reg Hours`, `O/T Hours`, `Double Time Hours`, `Sick Hours`, `PTO`, `Pay Rate`,
  `Pay Period End` and so on, `payroll-export.mjs` `FIELDS`), then by a whole-word match inside a longer name, most
  specific first (`Double Time 2x` is double time, not overtime). A generic word alone never makes a guess, and a
  column named as a code, type or department is never guessed (`Hours 3 Code` and `Hours 3 Amount` stay empty). The
  page shows how each column was filled, marks guesses, and lists the columns left empty.
- **Fixes:** a `Column = field` line picks the field for a column, `Column = blank` empties it, and `Column = "value"`
  puts the same value on every row (a company code or batch number).
- **Numbers:** regular, overtime and double-time hours are the PAY_RULES estimate the timesheet page shows; leave hours
  are the uses recorded on the leave page with a date inside the week; rate and gross come from the staff list's
  wages. Zero hours are left empty unless the box is ticked. People still on the clock or with an unpaired punch are
  named, because their open stretch is not counted.
- **Warnings:** someone with overtime, double time or leave and no column for it; no column naming the employee; a
  template column for IDs with people missing one; no hours column at all (an employee-import template by mistake).
- **What was checked:** `payroll-export.test.mjs` fills hand-built templates (comma, tab; quoted names; a formula typed
  as a name is defused) and runs the hub from saving a template to downloading a week from real punches. The column
  spellings in the tests are ones seen in published hours-import layouts; no file has been uploaded to a real Gusto,
  ADP, Paychex or QuickBooks account, so check the provider's import preview before you submit payroll.

## Overtime, meal periods and rounding (2026-11-15 later)

The time clock above stopped at hours: "It does not compute overtime pay, meal-break premiums or rounding." That left the
step a manager actually dreads (turning a week of punches into what to pay) to a spreadsheet, and it is the step where the
subscription schedulers charge extra (labour-compliance add-ons) and where small employers get sued: California's daily
overtime, seventh-day rule and meal-period premiums are not what the 40-hour line on the timesheet shows. `payrules.mjs`
now does it, read on the timesheet page and in the CSV.

- **Set `PAY_RULES`** to `federal` (default), `california`, `alaska` or `colorado`. What each applies, from the text named:
  - federal: 1.5x over 40 in the workweek (FLSA, 29 U.S.C. 207(a)(1)).
  - california: 1.5x over 8 in a workday and over 40 in the workweek, 2x over 12 in a workday; on the seventh consecutive
    day worked in the workweek, 1.5x for the first 8 hours and 2x after (Labor Code 510(a)). Meal periods (Labor Code 512(a)):
    a 30-minute clock-out must start before the end of the fifth hour worked, and a second before the end of the tenth; a
    missing one is flagged with "fine only with a signed waiver" when the work period is 6 hours or less (or 12 or less for
    the second, first taken), otherwise as owing one extra hour at the regular rate, at most one per workday (Labor Code
    226.7).
  - alaska: 1.5x over 8 in a day or 40 in a week (AS 23.10.060; it covers employers with 4 or more employees).
  - colorado: 1.5x over 40 in the week, 12 in a workday or 12 consecutive hours, whichever pays more (COMPS Order #39,
    Rule 4.1.1); the 30-minute meal period over 5 hours (Rule 5.1) is a note, since it carries no premium.
  No hour is counted twice: weekly overtime is regular hours past 40 after daily overtime is taken out, which for a
  1.5x-only state equals "whichever is greater".
- **Pay estimate:** each person's wage comes from the published week's staff list. The regular rate is straight-time pay over
  hours worked (29 CFR 778.115), so if stretches carry different rates the overtime premium uses the blend; with one wage it
  is that wage. Gross = straight time + 0.5 x regular rate per overtime hour + 1.0 x per double-time hour + one hour per
  meal-premium day. Shown to the cent, with a total.
- **Rounding (`PUNCH_ROUND_MIN` = 5, 6 or 15):** each punch to the nearest step, which 29 CFR 785.48(b) presumes lawful if it
  averages out over time. The page and CSV show each person's net minutes gained or lost, since a total that always leans
  against staff is what makes rounding unlawful. Under the California rules it refuses to round at all: the California
  Supreme Court held that meal-period punches may not be rounded (Donohue v. AMN Services, 2021).
- **Assumptions to know:** the workweek is the published week (Monday 00:00 to Sunday 24:00) and the workday the calendar day in
  `TIMEZONE`; a stretch crossing midnight splits there for daily overtime, and one past Sunday midnight stays in its clock-in
  week. Stretches less than 2 hours apart are one work period (so a 3-hour gap is a split shift); a meal break is any
  clock-out of 30 minutes or more. Paid rest breaks are not punched and not checked. Not in the estimate: tips, bonuses,
  commissions and shift differentials (which belong in the regular rate), city minimum wages, predictive-scheduling pay,
  split-shift premiums, union rules, and every state not listed (Nevada and 13 meal-period states were added later the same
  day, next section).
- **Checked:** `payrules.test.mjs` (eight tests, every expected figure worked by hand in the test's comments): five 9-hour days
  federal (40 + 5) and California with and without lunch (one extra hour a day without); a 13-hour California day (8 + 4 +
  1 at 2x, two missed meals, one premium); a seventh consecutive day (8 at 1.5x, 2 at 2x) with waivable six-hour periods;
  six 8-hour days (8 weekly overtime); Alaska four 10s (8) against federal and Colorado (0); Colorado's 14-hour day and an
  overnight 13 hours that is 6 + 7 by calendar day but 13 in a row; quarter-hour rounding with its net, and its refusal under
  California rules; a blended regular rate (30 h at $10 and 20 h at $20: $14, $770); and the hub's page and CSV end to end.
  Not claimed: no payroll provider has read the CSV, no real team's punches have been through it, and none of this is legal
  advice: it is an estimate to check before you pay.

## Nevada, and meal periods in 13 more states (2026-11-15 later)

`PAY_RULES` covered four rule sets, and the README said "Nevada's daily overtime depends on the wage against the minimum and
is left out rather than guessed". A café in Las Vegas, Seattle or Portland got federal overtime and no break check. Both gaps
are now filled from text read this session, not from memory:

- **`PAY_RULES=nevada`** (`nv`), from the statute (leg.state.nv.us, NRS chapter 608, read 2026-11-15):
  - NRS 608.018(1): 1.5x over 8 hours in a workday and over 40 in a week for anyone paid less than 1.5 times the NRS 608.250
    minimum; 608.018(2): only over 40 a week at or above it. The minimum is $12.00 (the US DOL state minimum-wage table, read
    the same day), so the line is $18.00 an hour; `MIN_WAGE` changes it. A person's blended rate for the week decides which
    side they are on; with no wage on the staff list the daily rule is applied and the row says so.
  - NRS 608.0126: the **workday is 24 hours from when the employee begins work**, not the calendar day. This is the part a
    spreadsheet gets wrong: a close Monday 14:00-22:00 and an open Tuesday 06:00-14:00 are 8 hours on each calendar day but
    16 hours in one Nevada workday, so 8 hours of overtime (`rollingWorkdays` in `payrules.mjs`; the Alaska rules on the same
    punches give none).
  - The mutually agreed four 10-hour days of 608.018(1)(b): set `NV_FOUR_TENS=1` and the daily rule is off (an agreement the
    tool cannot see, so it is a setting, not a guess).
  - NRS 608.019(1): a 30-minute meal period in any continuous 8 hours; a break under 30 minutes does not interrupt the
    continuous period. Flagged, with no premium (the section sets none). The paid 10-minute rest periods of 608.019(2) are not
    punched, so they are a note.
- **Meal-period flags for 13 states** from the US Department of Labor's "Minimum Length of Meal Period Required under State
  Law" table (dol.gov/agencies/whd/state/meal-breaks, revised 2023-01-01, read 2026-11-15): `washington`, `oregon`,
  `connecticut`, `delaware`, `illinois`, `kentucky`, `maine`, `massachusetts`, `minnesota`, `new-hampshire`,
  `rhode-island`, `tennessee`, `west-virginia` (names in any case, spaces or underscores, or two-letter codes). Each is a
  small rule in `MEAL_RULES`: how long the work period must be, how long a clock-out counts as a break, and the window it must
  start in (Washington between 2 and 5 hours from the start; Connecticut and Delaware after the first 2 hours and before the
  last 2 of a 7.5-hour period; Illinois 20 minutes within 5 hours; Oregon's two windows for 6-7 and over 7 hours; Rhode
  Island's 20 minutes at 6 hours and 30 at 8; Tennessee not in the first hour; and so on). Overtime in these states stays
  federal, with one exception: the DOL's state minimum-wage table (read the same day) lists general daily overtime only for
  Alaska, California, Colorado and Nevada among the states, but also Kentucky's **seventh-day rule** (1.5x for the hours on the
  seventh day when all seven days of the workweek are worked; not when the employee is not permitted over 40 in the week), so
  `PAY_RULES=kentucky` pays the seventh day at 1.5x in a week over 40 and then regular hours past 40, never an hour twice. The
  same table's narrower premiums are printed as notes, not applied: Oregon's 10-hour day in mills, factories and canneries,
  Connecticut restaurants' seventh consecutive day, Rhode Island's Sunday and holiday pay in retail, and Minnesota's own
  48-hour line (federal 40 is used, since it covers most employers). The meal-period table lists premium pay for a missed
  break only in California and Puerto Rico, so these are flags, not money, and each state's
  exceptions the punches cannot show (eating while working in New Hampshire and West Virginia, fewer than three on duty in
  Maine, written waivers) are printed as a note under the row.
- **Where the table's words leave room** ("between 3rd and 5th hour"), the window is read on the wide side, so a flag means the
  punches plainly miss it. New York's noonday rules, North Dakota's "if desired" and Vermont's "reasonable opportunities" are
  not checked; nor is any city ordinance.
- **On one invented week** (`node eval/pay-rules-by-state.mjs`, `eval/pay-rules-by-state.out.txt`: four people, an opener with
  lunch at 4 hours, a closer with a clopen and 20-minute breaks, a $24 lead on four 10s with lunch at 6 hours, a part-timer on
  6.5-hour shifts with no break): overtime is 9 hours federally and in the 13 meal-period states, 17 in California, Alaska and
  Nevada (by different routes: Nevada's 8 are the closer's clopen, Alaska's the lead's 10-hour days, which Nevada leaves to the
  weekly rule at $24), and meal flags run from 0 (federal) and 2 (Minnesota, where any clock-out to eat counts) to 12
  (Washington, Kentucky, New Hampshire, California).
- **Checked:** seven new tests in `payrules.test.mjs`, each figure worked by hand in the test: Nevada daily overtime at $15 against
  weekly-only at $20, a lower `MIN_WAGE`, `NV_FOUR_TENS`, no wage; the 24-hour workday on the clopen and across its boundary;
  the meal period with a 20- and a 30-minute break; Washington, Connecticut, Delaware, Illinois, Oregon, Rhode Island,
  Massachusetts, Minnesota and Tennessee windows on both sides of each line; Kentucky's seventh day (50 h: 8 + 2; 42 h: 6 against 2 federally;
  35 h: none); the name and code parsing; and the hub page and
  CSV end to end under Nevada rules ($712.50 for five 9-hour days at $15). Not claimed: no Nevada or other-state employer has
  read it, no labour office or lawyer has checked the readings, the DOL table is a summary that says to consult the state, and
  none of this is legal advice.

## Clock PINs and a site geofence (2026-11-16)

Buddy punching (a colleague clocking in for a friend who is running late) and punching from the car park, or the bus, are
the two reasons owners give for paying for Homebase's, When I Work's or 7shifts' time clock rather than using a free one.
The hub's clock was an honour system. It now has two optional checks, both off until you turn them on, on the Node server and
the free Cloudflare Worker alike (`clockguard.mjs`, Web Crypto, no Node built-ins).

- **Clock PINs.** On `/admin/timesheet`, "Clock PINs" sets a 4 to 8 digit PIN per person (or removes one); tell them in
  person, it is not shown again. A person with a PIN must type it on the team page to clock in or out; people without one
  punch as before, so you can start with the one person you have doubts about. `CLOCK_PIN=required` makes everyone use one
  (anyone without a PIN is refused and listed in red on the timesheet page). PINs are stored salted and hashed
  (PBKDF2-SHA256, 10,000 rounds; about 3 ms per check on Node 22), never in the clear and never shown back. Five wrong PINs
  for one person within 15 minutes lock that person's punches for 15 minutes (HTTP 429), so the team link cannot be used to
  try the 10,000 four-digit PINs; the right PIN clears the count, and setting a new PIN clears a lock.
- **Site geofence.** `CLOCK_GEOFENCE=lat,lon,radius_m` (radius 25 m to 5 km, for example `41.8789,-87.6359,150`). When
  someone presses Clock in or Clock out, the team page asks the phone for its location (up to 10 s) and posts it with the
  punch; the server works out the great-circle distance to the site and keeps **only that distance in whole metres and the
  phone's stated accuracy**, never the coordinates. The phone's accuracy is allowed for, up to 100 m (a reading of 178 m
  +-90 m on a 100 m fence passes; 445 m +-300 m does not). `CLOCK_GEOFENCE_MODE=flag` (the default) records every punch and
  flags the far ones ("clock-in 890 m from site (phone accuracy 12 m)") and the ones sent with no location ("location
  refused", "location unavailable") on the timesheet and in the payroll CSV; `=block` refuses them with a message telling the
  person to try on site or ask you to add the punch. A malformed value is reported on the timesheet page and the fence stays
  off rather than half-applied. The team page says, beside the buttons, that location is checked and what is kept.
- **What it does not do.** A determined person can fake a phone's location or share a PIN; these stop the casual cases and
  leave the decision with you, which is what the flag mode is for. There is no photo check. Location data about staff is
  personal data in many places (GDPR in the UK and EU, notice rules in some US states): tell staff before you turn the
  geofence on. Nothing about where anyone is goes anywhere but your own server, and even there only the distance is stored.
- **Checked:** `clockguard.test.mjs` (five tests): PIN format, salted hashes with no PIN in the clear, the five-try lock and
  its expiry and reset; the distance (Westminster to the Eiffel Tower within 1.5 km of 340.5 km), the accuracy allowance and
  its cap, no coordinates kept, staff-typed reason text stripped; place flags on the timesheet and in the CSV; the hub end to
  end for PINs (set, wrong, right, lock at 429, remove, `CLOCK_PIN=required`) and for the fence (flag mode with and without
  scripts, block mode, a misconfigured fence). Also run once in headless Chromium with a granted location 67 m from the site
  (recorded as `{ m: 67, acc: 20, away: false }`) and with location not granted (the punch still arrives). Not yet tried on a
  real phone at a real site.

## Paid sick leave from the time clock (2026-11-16)

Homebase, 7shifts, When I Work and Deputy all sell leave tracking beside the time clock, and many US states and cities
require paid sick leave that is earned per hour worked (one hour per 30 or per 40 worked is a common form), so a small
team's manager otherwise keeps a balance per person on paper from the payroll stubs. The hub now does it from the punches
it already records (`leave.mjs`, no Node built-ins, the Node server and the Cloudflare Worker alike). **Off until you set
`LEAVE_ACCRUAL`.**

- **Your policy, in env vars:** `LEAVE_ACCRUAL=1/30` (hours earned per hours worked; `1 per 40`, `1:52` and `0.025`
  also read), and optionally `LEAVE_YEAR_CAP` (most earned in a leave year), `LEAVE_BALANCE_CAP` (most held at once;
  earning pauses at it and resumes after a use), `LEAVE_CARRYOVER_CAP` (most carried into a new leave year; the rest is
  dropped and flagged), `LEAVE_YEAR_START=MM-DD` (default 01-01, in your `TIMEZONE`) and `LEAVE_NAME` (default "Paid
  sick leave"; "PTO" works). **No state's or city's rule is preset**: the page says the numbers are yours. Waiting
  periods, front-loading, who is covered and what counts as hours worked are not modelled; check your own law.
- **Earned from closed stretches only:** each clock-in/clock-out pair earns at its clock-out, in time order with the uses,
  so the caps bite in the order they would in a real year. Someone still on the clock earns at clock-out.
- **`/admin/leave`** (linked from `/admin` and the timesheet): each person's leave year, hours worked in it, earned,
  used and balance, with flags for the balance cap, the year cap, hours dropped at the carryover cap and any use that took
  someone below zero (recorded anyway: it is your decision, but you see it). A form records leave taken (date, hours in
  quarter hours, a note) and each record can be removed. **Opening balances:** moving from paper or another system, set a
  person's balance as of now and hours from then on add to it. `/admin/leave.csv` downloads the balances and every use, with
  the formula guard on names.
- **The punch trim no longer forgets:** the clock keeps the newest 3,000 punches (1,500 on the Worker's size guard). Before
  dropping older ones, `trimPunches` (timeclock.mjs) folds their closed stretches into `state.leaveBank` per person and
  day, so a balance built over a year survives (tested: the balances are identical before and after a trim). A stretch whose
  clock-in is dropped and clock-out kept is lost, as it already was for the timesheet.
- **Staff do not see balances** on the team page: the team link is shared by everyone, and it shows nobody's hours.

Tests: `leave.test.mjs` (rate parsing; one hour per 30 from 30 h worked; an open stretch earns nothing; a use below the
balance flagged; the balance cap pausing and resuming after a use; a 5 h year cap; the carryover cap at the new year; an
opening balance; a July leave year; the trim keeping the balances identical; the hub off by default, 404 on its forms
when off, the page, a recorded and a removed use, an opening balance, the CSV and its formula guard). Not claimed: not
tried on a live team or against any state's rule text; a manager's view of the policy wording is the next thing to get.

## Los Angeles County (2026-11-17, latest)

`FAIR_WORKWEEK=los-angeles-county` (or `la-county`, `county-of-los-angeles`) prices changes under the Los Angeles County
Fair Workweek Ordinance (County Code Title 8, Chapter 8.102), in force since 2025-07-01 for retail employers with 300 or
more employees worldwide, and only in the county's **unincorporated areas** (East LA, Altadena, Marina del Rey and the
like); the City of Los Angeles keeps its own preset (`los-angeles`). **Read from the county's own text**, fetched from
this session on file.lacounty.gov: the ordinance as sent to the Board of Supervisors on 2024-04-09 (supdocs 189905) and
the amendment to 8.102.080 adopted 2025-11-18 (supdocs 208681).

| | Los Angeles County, from the ordinance text |
|---|---|
| Posted | 14 days before the work period (8.102.060.A) |
| A change to a date, time or location with no lost time, or adding more than 15 min | 1 h of pay per change (8.102.080.A.1) |
| Work time cut by at least 15 min, a cancelled shift, an on-call shift not called in | half the regular rate for the time not worked, anywhere inside the 14 days (A.2 as amended 2025) |
| Free | added time of 15 min or less; time taken away under 15 min |
| Exempt | employee-initiated changes (B.1); hours accepted to cover another employee's absence (B.2), with the voluntariness notice and documented consent |
| Rest | a shift starting under 10 h after the last one: written consent and time and a half for each hour of it inside the 10 h (8.102.100) |

Two new rule fields, usable in any rule set:

- `minCutMin` (`FWW_MIN_CUT_MIN`): time taken away under this many minutes owes nothing. The 2025 amendment folded the
  old "subtracting hours", "start or end time ... loss of more than fifteen minutes", "changing the date" and
  "cancelling" items into one: the employer "reduces the Retail Employee's work time ... by at least 15 minutes". So 15
  minutes owes and 14 does not; the original text had said "more than fifteen".
- `coverAccept` (`FWW_COVER_ACCEPT=1`): hours accepted to cover a colleague's absence owe nothing whether they came from
  the written team offer or a one-to-one ask. Seattle's and Oregon's exception needs the group offer (`massOffer`); the
  county's B.2 does not, but it needs the employer to have said taking the hours is voluntary and may be declined, and
  to have documented the request and the consent. The changes page says so on each exempt line. The hub's plain
  "Give to" cover cannot see whether that was done: if it was not, the hours were also given without the consent
  8.102.060.C requires, and the "Employee asked" mark does not help; the deployer turns the exception off with
  `FWW_COVER_ACCEPT=0`.

How it differs from the city next door: no team-offer exception in the city (its FAQ prices volunteers), a short rest paid
on the whole later shift in the city but only on the hours inside 10 h in the county, and no minute floor on cuts in the
city. What it changes, at $18 an hour (`eval/la-county-compare.mjs`, `eval/la-county-compare-2026-11-17.md`):

| Change | los-angeles-county | los-angeles | seattle | chicago | berkeley |
|---|---:|---:|---:|---:|---:|
| Monday's 8 h shift cancelled 10 days ahead | $72.00 | $72.00 | $72.00 | $18.00 | $18.00 |
| 1 h cut off Tuesday's 8 h shift, Monday 23:00 | $9.00 | $9.00 | $9.00 | $9.00 | $18.00 |
| 10 min cut off Wednesday's end, 3 days ahead | $0.00 | $1.50 | $1.50 | $18.00 | $18.00 |
| Ben asked one-to-one to cover Ana's Thursday call-out | $0.00 | $18.00 | $18.00 | $18.00 | $18.00 |
| Close Fri 24:00, open Sat 08:00 (8 h rest) | $18.00 | $72.00 | $18.00 | $9.00 | $27.00 |
| **Total** | **$99.00** | **$172.50** | **$118.50** | **$72.00** | **$99.00** |

Not modelled: who is covered (retail and grocery NAICS codes, 300 employees, two hours a week in an unincorporated
area); B.3, hours accepted from the 72-hour offer to current staff before hiring (8.102.070), which the hub has no
form for; B.4 and B.5 (discipline, operations compromised by law); B.6, extra hours already paid at overtime under
Labor Code 510; the good-faith estimate (8.102.040) and the record keeping (8.102.130). Tests:
`notice-la-county.test.mjs` (names and the city kept apart, the 14-day half with no 24-hour tier, the 15-minute floor at
14 and 15 minutes, 1 h moves and adds, cover exempt one-to-one and by team offer and priced by the city and Seattle,
on-call, rest on the inside hours only, the two env fields, the changes page).

## Evanston (2026-11-17, later)

`FAIR_WORKWEEK=evanston` (or `evanston-il`) prices changes under Evanston, Illinois's Fair Workweek Ordinance
(24-O-23, City Code Title 3 Chapter 34), the last of the commonly listed fair-workweek jurisdictions without a preset.
**Read from search summaries only**: the city's Fair Workweek page, Municode and the ordinance PDF on CivicWeb were all
refused by this session's network, so the numbers come from summaries of the city page and of law-firm alerts (Jackson
Lewis, Littler, Fox Rothschild, Epstein Becker Green). The changes page says so.

| | Evanston, as the summaries agree |
|---|---|
| Posted | 14 days before the first scheduled shift |
| Under 14 days, more than 24 h | 1 h of pay per changed shift |
| Under 24 h, hours cut or shift cancelled | 4 h or the length of the scheduled shift, whichever is less (Emeryville's reading) |
| Under 24 h, any other change | 1 h |
| Free | nothing found: no de minimis minutes in any summary, so none applied |
| Exempt | employee-requested and mutually agreed changes, events outside the employer's control (the hub's "Employee asked" mark) |
| Hours volunteered from a team offer | priced: "agreeing to work additional hours does not exempt" the employer |
| Rest | hours starting under 11 h after the previous shift, worked with written consent, at time and a half |

No new pricer code: the preset reuses Emeryville's notice tiers with no grace and Berkeley's rest reading (after any
previous shift; `FWW_REST_ACROSS_DAYS=1` to count only a prior day's). Readings to check against the ordinance text:

- **Where notice is counted to.** The city page says schedules are posted 14 days before the first scheduled shift,
  and one alert counts change notice to the first shift of the workweek. The preset counts to each changed shift, like
  Chicago; `FWW_NOTICE_FROM_WEEK=1` counts to the week's first day instead (which also moves the 24-hour tier).
- **A move to another date** stays a cancellation plus an addition (two changes); `FWW_PAIR_DATES=1` makes it one.
- **The rest multiplier.** Most summaries give 1.5x; one table lists 1.25x beside a 10-hour rule. `FWW_REST_MULT`
  overrides it.
- **Enforcement date.** Summaries give 2023-09-01, 2024-01-01 and a later postponement. Check the city's notice.

Coverage (the industries listed, employer size, two hours a week in Evanston), the right to decline, the offer of
hours to part-timers and the good-faith estimate at hire are not modelled. What it changes, at $18 an hour
(`eval/evanston-compare.mjs`, `eval/evanston-compare-2026-11-17.md`):

| Change | evanston | berkeley | emeryville | chicago | seattle |
|---|---:|---:|---:|---:|---:|
| 1 h cut off Monday's 8 h shift, Sunday 23:00 | $72.00 | $18.00 | $72.00 | $9.00 | $9.00 |
| Tuesday's 4 h shift cancelled, Monday 20:00 | $72.00 | $72.00 | $72.00 | $36.00 | $36.00 |
| 5 min added to Wednesday's end, Tuesday 22:00 | $18.00 | $0.00 | $0.00 | $0.00 | $18.00 |
| Thursday's 8 h shift cancelled 3 days ahead | $18.00 | $18.00 | $18.00 | $18.00 | $72.00 |
| **Total** | **$180.00** | **$108.00** | **$162.00** | **$63.00** | **$135.00** |

Tests: `notice-evanston.test.mjs` (names, both tiers, the shift-length cap against Berkeley's, no grace against
Emeryville's, the team offer, date moves, rest, the changes page).

## Berkeley (2026-11-17)

`FAIR_WORKWEEK=berkeley` prices changes under Berkeley's Fair Workweek Ordinance (Berkeley Municipal Code Chapter 13.102,
operational 2024-01-12). Read from the city's own documents, fetched from this session on berkeleyca.gov: the official
employee notice of January 2024 and the city's FAQ revised 2024-08-23. The code's own text (berkeley.municipal.codes)
returned 403, so it was not read; the changes page says the numbers come from the notice and FAQ.

| | Berkeley | Emeryville, for contrast |
|---|---|---|
| Posted | 14 days ahead | 14 days ahead |
| Under 14 days, 24 h or more | 1 h of pay for any change (FAQ 12a) | 1 h |
| Under 24 h, hours cut or shift cancelled | the lesser of the hours taken away and 4 h (FAQ 12b; FAQ 14: cut 15 min early, 0.25 h) | the lesser of the scheduled shift's hours and 4 h |
| Under 24 h, added or moved | 1 h (FAQ 12c) | 1 h |
| Shift moved to another date | one change, 1 h | logged as a cancellation and an addition, 1 h each |
| Free | starting up to 10 min early and finishing up to 10 min late (FAQ 17), each end on its own | 10 min or less added or taken at each end |
| Swaps and cover employees arrange | exempt (FAQ 15) | exempt |
| Hours volunteered from a team offer | priced: the notice says pay is owed "when employees voluntarily agree to such changes" | priced |
| Rest | time and a half on hours worked under 11 h after the end of the previous shift (FAQ 23) | the same, after the previous day's shift |

Three small additions to the pricer, open to any preset or `custom`:

- `cutLostCap` on a notice tier: hours taken away pay the lesser of those hours and the cap. Emeryville's
  `cutShiftCap` caps the scheduled shift's length instead, which is why taking 1 hour off an 8-hour shift the evening
  before owes 4 hours there and 1 hour here. A shift both moved and shortened under 24 h owes the greater of the cut's
  pay and the move's 1 h; the FAQ does not say whether the two stack, and this reading never pays more than one of them.
- `extendEach` (`FWW_EXTEND_EACH=1`): the added-time grace applies to the start and the end separately (10 min early
  and 10 min late is still free), not to their sum. The grace covers time added, not time cut: 10 minutes off the end
  under 24 h is a cut and owes 0.17 h.
- `pairDates` (`FWW_PAIR_DATES=1`): a cancellation and an addition for the same person, logged in the same moment by
  the same cause, are one change of date. New York City already paired them; the pairing now also works when the staff
  list has no wage (the pair is one change to price, not two).

Readings to check against BMC 13.102 before relying on them. The notice and FAQ say rest is counted after "the previous
shift", not "the previous day's", so a same-day split shift with a 4-hour gap puts its whole second piece inside the
11-hour window; `FWW_REST_ACROSS_DAYS=1` turns that off if the code's definition of a shift says otherwise. The FAQ's
"up to 30 minutes after the end to finish serving a customer" is a stay on the day, not a change to the posted
schedule, so it is not modelled. Coverage (10 or more employees in Berkeley and 56 or 100 worldwide by industry,
franchisees included), the right to decline, the offer of hours to part-timers and the good-faith estimate at hire are
not modelled either. Tests: `notice-berkeley.test.mjs` (the FAQ's examples 12a-c, 14, 17 and 23, the date move, the
team offer, the split-shift reading and the changes page).

## San Francisco and Emeryville (2026-11-16, later)

Two more presets for the hub's change log: `FAIR_WORKWEEK=san-francisco` (or `sf`) for San Francisco's Formula Retail
Employee Rights Ordinances, and `FAIR_WORKWEEK=emeryville`. Unlike the six before them, both were read from the cities'
own documents, which answered from this session:

- San Francisco: Ordinance 117-15 as passed (sfbos.org, `o0117-15.pdf`, Police Code 3300G.4(c)-(e), now Labor and
  Employment Code 42.4) and the Office of Labor Standards Enforcement's FAQ dated 2025-08-08 (`FRERO_FAQs_8.8.25.pdf`).
- Emeryville: the city's official employee notice for the Fair Workweek Ordinance (Municipal Code Title 5, Chapter 39)
  and its "Predictability Pay Structure" reference sheet (emeryville.org). The municipal code itself (municode) returned
  403, so the code text was not read.

| | San Francisco (formula retail) | Emeryville (retail and fast food) |
|---|---|---|
| Posted | 14 days ahead | 14 days ahead |
| Premium window | under 7 days | under 14 days |
| Under the window, 24 h or more | 1 h of pay per changed shift, added or cut | 1 h of pay |
| Under 24 h | 2 h if 4 h or less change, 4 h if more | hours taken away: the lesser of the scheduled shift's hours and 4 h; any other change 1 h |
| Free changes | none listed | 10 min or less added or taken at a shift's start or end |
| Cover after a colleague's absence | exempt when the employer had under 7 days' notice of the absence (3300G.4(e)(4)), whoever was asked | priced: the sheet lists finding another employee to cover as pay due |
| On-call shifts | their own table (3300G.4(d)): not called in, or released under 24 h ahead, 2 h (4 h or shorter) or 4 h | priced as hours taken away |
| Rest | no premium | time and a half on hours worked under 11 h after the previous day's shift |

The new shape: both pay a fixed number of hours per change by notice tier, not a share of the hours lost, so a new
`tiers` table carries them (`[{ fromH, add, cut, overH, over, cutShiftCap }]`, highest notice first). San Francisco's
"shift of four hours or less" is read as the hours added or subtracted, which is how OLSE's 2025 FAQ restates it
("Number of hours added or subtracted"); for a shift moved with its length kept, the shift's own length decides. The
FAQ's worked example (a 4 h shift made 6 h on the day, 2 h of pay) is a test. Three more fields, open to any preset:
`postDays` (the posting window, when it differs from the premium window: San Francisco posts 14 days ahead but owes
premiums only under 7), `onCallPay` and `coverAbsenceDays`. For the cover exception the hub now stores, on the covering
person's added shift, whose absence it covers and when the call-out came in (`coverFor`, `absenceAt`), for a direct
cover as well as a team offer or a standby-list pick. A cover with no call-out time on record (a call-out logged before
this change) is priced, and the reason says so.

Readings to check: Emeryville's sheet pays a cut under 24 hours by the scheduled shift's length, so taking 1 hour off
an 8-hour shift the evening before owes 4 hours of pay; the preset follows the sheet, not a share of the cut. Its
notice says time and a half "for any hours worked between closing and opening shifts that are separated by less than
11 hours", which the preset reads as the hours inside the 11-hour window, after a previous day's shift.

Not modelled: who is covered (San Francisco: formula retail with 40 or more establishments worldwide and 20 or more
employees in the city; Emeryville: retail with 56 or more employees worldwide, fast food with 56 worldwide and 20 in the
city), San Francisco's other exceptions (threats, utility failures, acts of God, mandatory overtime, a colleague late or
sent home for discipline), Emeryville's right to decline, its offer of hours to part-timers up to 35 h, its exceptions for
working past the end to finish a sale and for overtime pay that exceeds the premium, and the disciplinary exception the
city's sheet and a 2017 law-firm alert disagree on. Planning aid, not legal advice: check the current text.

Tested (`notice-sf-emeryville.test.mjs`, 10 tests): aliases; each San Francisco tier for adds, cuts and length changes,
the FAQ's example, the 7-day premium window against the 14-day posting check; on-call release at 25 h, 3 days and 4 h,
and never called in; the cover exception at 2 days' notice of the absence, through a team offer, refused at 8 days and
with no time on record, and still priced in Seattle; Emeryville's 1 h tier, the lesser-of rule (3 h shift: 3 h; 8 h
shift: 4 h; a 1 h cut of 8 h: 4 h), the 10-minute edges, the team offer priced, an 8 h rest after a 23:00 close priced
at 3 h x 0.5 and a same-day split not counted; and the hub end to end (a cover posted through `/admin/cover` under
`FAIR_WORKWEEK=sf` stored with the call-out time, exempt, and the rule set stated in words on the changes page).

## New York City fast food (2026-11-16, later)

A sixth preset, `FAIR_WORKWEEK=new-york-city` (or `nyc`), for the fast food half of New York City's Fair Workweek Law
(Admin. Code 20-1201 et seq.). It is the first preset that does not fit the "hours of pay" shape the other five share,
so three new pieces carry it:

| | New York City (fast food) | The other presets |
|---|---|---|
| Premium | a flat sum per change, by notice: 14 to 7 days $10 (added or moved) / $20 (hours taken away); 7 days to 24 h $15 / $45; under 24 h $15 / $75 | hours of pay at the person's wage |
| Notice counted to | 12:00 a.m. on the first day of the work schedule (rule 7-622(a)) | the start of the changed shift |
| Free changes | start and end each moved by 15 min or less, whatever the shift's length becomes (final de minimis rule) | per city |
| A shift moved to another day | one change: $10 at 14 to 7 days (7-622(a) example 3) | a cancellation plus an addition |
| Volunteers, open-shift pick-ups, fill-ins | priced (7-622(e)(5)-(7)); consent does not waive it (7-622(b)) | exempt in Seattle, Oregon, Philadelphia |
| Rest | a clopening (under 11 h, across two calendar days) pays $100 (20-1231) | per city |

Why the week's first day matters: a Thursday shift cancelled on the Sunday before a Monday-start week is a change with
under 24 hours' notice in New York City ($75), though the shift is four days off. Seattle, counting to the shift, calls
the same change 4 days' notice. `noticeFromWeek` (`FWW_NOTICE_FROM_WEEK=1`) and `edgeEach` (`FWW_EDGE_EACH=1`) are
switches any preset or `custom` can take; the flat table itself is the preset's and is not typed from the environment.
The changes page states the table in words, and the CSV leaves "hours of pay" empty for a flat premium.

Sources, read 2026-11-16 (the city's code library returned 403 and the DCWP page 404 from this session): the premium
table of 20-1222(a) as the city's Office of Labor Policy and Standards set it out (CLASP conference slides, 2018); DCWP's
proposed rules (rules.cityofnewyork.us notice of hearing, January 2022: 7-601 definitions, 7-607 de minimis, 7-622
schedule changes with its five worked examples, 7-623 clopenings); and Fisher Phillips's summary of the June 2022 final
rules, which changed de minimis from 15 minutes in total to 15 minutes at each end, and confirmed hours (336, 168) as the
measure of days. Check the current RCNY title 6 chapter 7 text before relying on it.

Not modelled: who is covered (fast food chains with 30 or more locations nationally), the retail half of the law (72
hours' notice, no on-call shifts, no premiums), the exception for a shortened shift that is still paid in full, the
regular-schedule rules of 7-622(g), the good-faith estimate, access to hours (offering shifts to current staff before
hiring), and written consent for added hours and for each clopening (the page counts the $100, it does not collect
the consent). The absent employee owes nothing (7-622(d)); the hub already logs a call-out's dropped shift as
employee-asked.

Tested (`notice.test.mjs`, 21 tests, 3 new): the rules' examples 1 to 3 ($75 for a cancellation on the Sunday before,
$45 at 151 hours, $10 for a Thursday shift moved to Friday at 228 hours, where Seattle prices the same pair at $100 on a
$20 wage), each tier for adds and cuts, the de minimis edges (15 min each way free, both ends together free, 20 min priced
$15 or $45), the team offer still priced, an employee request exempt, the $100 clopening with no wage and a same-day split
not counted, the CSV row, and the changes page's table in words.

## Philadelphia and Los Angeles (2026-11-16, later)

Two more presets for the hub's change log, so a covered shop in either city can turn the pricing on with one setting
(`FAIR_WORKWEEK=philadelphia` or `philly`; `FAIR_WORKWEEK=los-angeles` or `la`). Both cities' own sites (phila.gov,
wagesla.lacity.gov, the American Legal code library) were out of reach from this session (403 or no DNS), so the numbers
come from search summaries of the cities' FAQs and regulations and of law-firm alerts, cross-checked where two agreed.
Check them against Phila. Code ch. 9-4600 and LAMC ch. XVIII art. 5 before relying on them; the page says so.

| | Philadelphia | Los Angeles (city) |
|---|---|---|
| Notice | 14 days | 14 days |
| Added shift, added time, moved shift with no hours lost | 1 h of pay | 1 h of pay |
| Free changes | start or end moved by 20 min or less (the regulations' exception) | added work time of 15 min or less |
| Hours taken away | half their pay, anywhere in the 14 days | half their pay |
| Team offer after a call-out | exempt (written "mass communication") | priced: the city FAQ says pay is owed even when the employee volunteers |
| Rest | 9 h after a prior day's shift (or one that ran across two days); with written consent, $40 each such shift | 10 h; time and a half for the whole shift that follows |

Three new switches carry the rest rules, and any preset takes them as overrides: `FWW_REST_FLAT` (a flat sum per short
rest, owed whatever the wage), `FWW_REST_WHOLE_SHIFT=1` (the multiplier on the whole later shift, not only its hours
inside the window) and `FWW_REST_ACROSS_DAYS=1` (a same-day split shift is not a short rest). The changes page states the
rest rule in words and the short-rest table shows the hours paid and the sum owed.

What the sources disagreed on, and what was chosen: for Los Angeles one vendor blog and the city's FAQ wording ("time and
a half for the Shift following the insufficient rest period") say the whole shift, while a county summary says the hours
in the gap; the preset follows the city's wording, and the LA County ordinance (unincorporated areas, from 2025-07-01) is
not a preset (`custom` with `FWW_REST_WHOLE_SHIFT=0` types it). One summary of the LA rules also gives a one-week line for
cancellations; the preset prices half of the lost hours anywhere inside the 14 days, the reading two other summaries give.

Not modelled for either city: who is covered (Philadelphia: retail, hospitality and food service with 250+ employees and
30+ locations; Los Angeles: retail with 300+ employees worldwide), Los Angeles's 72-hour offer of extra hours to current
staff before hiring, the good-faith estimate, and the right to decline.

Tested (`notice.test.mjs`, 17 tests, 3 new): each city's arithmetic (Philadelphia: a 20 min later start free, 21 min half
of 21 min = $3.50 at $20; a cut at 3 days' notice half of 8 h = $72 at $18; the team offer exempt; Los Angeles: 15 min
added free, 16 min one hour; the team offer priced), the rest rules side by side on Sunday 16-24 then Monday 08-16 at
$20 (Seattle $20 on 2 h inside the window, Los Angeles $80 on the whole 8 h shift, Philadelphia $40 with no wage needed;
a same-day split counted in Seattle and not in Philadelphia), the overrides, and the hub's changes page for both presets.

## Schedule changes and fair-workweek pay (2026-11-16)

Seattle, Oregon, Chicago, New York City, Philadelphia, San Francisco, Los Angeles and others make covered employers post
schedules ahead (14 days in the three here) and pay "predictability pay" when they change a posted shift inside that window.
The cost is invisible on the schedule: it is in the change, so a manager needs a record of what changed, when, for whom
and at whose request. The builder's changes report (`--changes`, "Changes since you posted it") compares two rosters at
a moment you type. The hub is where the changes really happen, days apart, so it now keeps that record itself
(`notice.mjs`, no Node built-ins, the Node server and the Cloudflare Worker alike).

- **The log (always on):** publishing a week that is already posted logs what it changed for each person (same day,
  other hours: moved; otherwise cancelled or added, the same pairing as `scheduleChanges`); an approved trade or
  open-shift pick-up is logged as employee-asked; a call-out given to someone logs the caller's dropped shift as
  employee-asked and the added shift as not, because the manager picked the person. The first publish of a week is kept
  as its posting time. The manager can flip any entry between "Employee asked" and not. The last 1,500 changes are kept
  (Seattle asks for three years of records, so the page says to download the CSV with each payroll).
- **The rule sets (`FAIR_WORKWEEK=seattle|oregon|chicago|philadelphia|los-angeles|new-york-city|san-francisco|emeryville|berkeley|custom`;
  the later ones since 2026-11-16 later, see "Berkeley", "San Francisco and Emeryville", "Philadelphia and Los Angeles" and "New York City fast food" above):** read from the City of Seattle's Office of Labor
  Standards "Secure Scheduling" page and Oregon BOLI's "Predictive scheduling" page on 2026-11-16, and for Chicago from
  search summaries of the city's Fair Workweek notice and rules on chicago.gov and the ordinance's table as quoted by the
  National Law Review (the chicago.gov pages returned 403 or 404 here, so Chicago is the least checked of the three):
  - Seattle: an added shift, added hours or a moved shift inside 14 days owe 1 hour of pay; hours taken away owe half
    their pay; hours worked under 10 hours after the last shift pay time and a half.
  - Oregon: the same, except that 30 minutes or less of added work owes nothing.
  - Chicago: an add or move owes 1 hour (moves of 15 minutes or less owe nothing); hours taken away owe half their pay
    inside 24 hours of the shift and 1 hour of pay between 24 hours and 14 days; rest under 10 hours pays 1.25x.
  - `custom`, or any preset with overrides: `FWW_NOTICE_DAYS`, `FWW_ADD_HOURS`, `FWW_MIN_MOVE_MIN`, `FWW_MIN_EXTEND_MIN`,
    `FWW_CANCEL_WINDOW_HOURS`, `FWW_CANCEL_FRACTION`, `FWW_CANCEL_ELSE_HOURS`, `FWW_REST_HOURS`, `FWW_REST_MULT`.
- **`/admin/changes`** (linked from `/admin`): every change newest first with its notice (from the change to the earliest
  start it touches, in your `TIMEZONE`), the hours lost or gained, the premium at the person's wage from the staff list and
  the reason in words; shifts posted under the notice window; short rests in the current week, reaching back into last
  Sunday when last week is the one before; totals; `/admin/changes.csv` for payroll (names that start like a formula
  are quoted). A change made after the shift ended is a record correction and owes nothing; a change during the shift
  (sent home early) counts as hours taken away.
- **Not modelled:** who is covered (Seattle: 500+ employees worldwide; others differ), the exceptions for emergencies,
  offers to the whole team after an absence and standby lists, on-call shifts, the right to decline added hours, and the
  good-faith estimate at hire. The page says it is an estimate to check before payroll.
- **Tested** (`notice.test.mjs`, 9 tests): each preset's arithmetic on hand-made changes (Seattle half of 8 lost hours at
  $20 = $80; Chicago 1 hour at 66 hours' notice, half at 18; Oregon 30 minutes added free, 45 not), the pairing, the
  time-zone and overnight instants, late posting, a short rest across the week boundary, the CSV, and the hub end to end:
  a week published, published again after a staff change (four changes logged, posting time kept), a call-out covered,
  the page and CSV under Seattle, the manager's mark, and the page with no rule set. Not yet run against a real site's
  week of changes or checked by an employment lawyer.

The same check found a mistake in the sibling
[fair workweek schedule checker](../fair-workweek-schedule-checker/): its Seattle preset paid short rests at 1.25x; Seattle
pays time and a half, so the preset, its worked example ($137.50 to $148.00) and tests are corrected in the same change.

## A call-out offered to the whole team, and on-call shifts (2026-11-16)

The fair-workweek log above priced every cover the manager handed out, and said the two cases that change the bill most
were not modelled: the offer to the whole team after someone calls out, and on-call shifts. Both are now in the hub
(`notice.mjs`, `hub.mjs`).

- **Offer to the whole team.** Each call-out on `/admin` has an "Offer to the whole team" button. It posts the shift on
  the staff page and to the team webhook as a written offer that says what Seattle's 2024 model policy asks it to say:
  it goes to everyone at once, taking it is voluntary, and the employee may decline (`teamOfferText`). Staff press
  "I'll take it"; the manager sees who said yes on the cover buttons and gives the shift to one of them, under the same
  rule checks as before. That cover is logged with the cause "team offer", the caller's dropped shift as employee-asked
  and the taker's added shift marked as taken from the offer.
- **Priced per rule set** (`massOffer`, override with `FWW_MASS_OFFER=0|1`): Seattle and Oregon exempt the hours an
  employee accepts from such an offer after another employee's absence, for that employee's hours only, so the added
  shift owes nothing there. No matching exception turned up for Chicago, whose city FAQ says employer-asked cover after a
  call-off owes pay, so the Chicago preset still charges the hour and says the rule set has no team-offer exception.
  Giving the shift straight to someone, without the offer, is priced as before.
- **On-call shifts.** A shift whose label says "on-call" (or "on call", "oncall") is listed on `/admin` as waiting until
  the manager marks it "Called in" or "Not needed". Not needed is logged as hours taken away and priced by the rule set's
  cancellation terms: Seattle and Oregon pay half the hours not worked; Chicago's 2026 rules treat on-call cancellations
  like other cancelled hours (half inside 24 hours, 1 hour of pay before). One still waiting when it ends is listed on
  `/admin/changes` as never called in and counted as released at its start (half its hours in all three), with a row
  in the CSV. Marks for weeks that drop out of the history are pruned with the posting times.
- **Sources and their limits.** The primary pages (seattle.gov, oregon.gov, the Oregon statutes, chicago.gov) did not
  answer from this session, so the rules are from search summaries of Seattle OLS's 2023 Q&A, 2024 model policy and
  one-pager; ORS 653.455, OAR 839-026 and BOLI's page; and Chicago's May 2026 rules as summarised by law firms. Check
  them against the current text. Still not modelled: Seattle's in-person group communication for unexpected customer
  needs, Oregon's voluntary standby list, the emergency exceptions, and the right to decline.
- **Tested** (`notice.test.mjs`, 12 tests, 3 new): the exception in Seattle and Oregon and its absence in Chicago, the
  override, the offer's three statements; an on-call release at 28 hours ($60 Seattle, $20 Chicago at $20/h for 6 h),
  never called in in all three presets, the CSV row; and the hub end to end: a call-out offered, the webhook text, the
  staff page, a refused yes from the caller, a yes, the cover logged as "team offer" and shown exempt under Seattle, an
  on-call shift marked not needed, logged and priced, and a second mark refused. Not run against a real site's week.

## Oregon's voluntary standby list, from the statute's own text (2026-11-16)

The two sections above priced Oregon from search summaries, because oregon.gov and the Oregon statutes did not answer
from the session that wrote them. This session's request to the Oregon Legislature's published chapter 653
(oregonlegislature.gov/bills_laws/ors/ors653.html, ORS 653.412 to 653.485 as amended by 2024 c.20) did answer, so the
Oregon preset was checked against the statute itself. Reading it showed two pricing mistakes and one missing exception:

- **A start or end changed by 30 minutes or less owes nothing, hours lost included** (ORS 653.455(3)(a)). The preset
  charged half of the lost minutes, so a start moved 20 minutes later cost $2.50 at $15 an hour. It now owes nothing
  (`minEdgeMin: 30`, override `FWW_MIN_EDGE_MIN`). 31 minutes is priced as before, and widening both ends by 20 minutes
  adds 40 minutes of work, more than the 30 that (2)(a)(A) allows, so it still owes the hour. Seattle and Chicago keep
  their old arithmetic.
- **An additional shift owes the hour at any length** (ORS 653.455(2)(a)(C)). The 30-minute threshold is for "more than
  30 minutes of work" added *to* a shift. The code had let a separate shift of 30 minutes or less go free, and it did
  that in every preset. Now an added shift always owes `addHours`. The threshold still applies to time added to a shift.
- **The voluntary standby list** (ORS 653.432, exempt under 653.455(3)(j)). An employer may keep a list of employees
  who agreed in writing to be asked for extra hours after an unexpected absence or customer need. Hours someone on the
  list agrees to work owe no predictability pay. With `FAIR_WORKWEEK=oregon` (or `FWW_STANDBY=1` with any rule set) the
  hub has:
  - **a "Standby list (voluntary)" section on the staff page.** It shows the written notice with the four statements
    653.432(1)(a)-(d) require: the list is voluntary and how to leave it, how hours are offered and accepted, that
    nobody has to accept, and that accepted hours earn no predictability pay. Joining needs a ticked written agreement,
    and anyone can leave at any time (653.432(5)). The manager can also take someone off on request. Each join and
    removal goes into a dated record (`standbyHistory`, latest 500 kept).
  - **an "Ask the standby list (N)" button on each call-out.** It posts the hours on the staff page and to the team
    webhook (653.432(2) allows notice by text, email or another electronic format). Only the people who were asked
    can press "I'll take it". When the manager gives the shift to one of them, the change is logged as "standby list"
    and priced as exempt, with a reason that cites 653.432(4).
  - **the standby-first condition on the team offer.** Under 653.455(3)(k)(C), where an employer keeps a standby list,
    the exception for cover after an absence applies only after everyone on the list has been contacted. A team offer
    taken while listed people were never asked now records how many (`standbyOpen`). Oregon prices that shift and says
    why; Seattle is unchanged. The call-out block tells the manager to ask the list first.
- **Checked against the text, not yet in use.** `notice.test.mjs` (14 tests, 2 new and 1 corrected) covers the 20-,
  30- and 31-minute edges, the 40-minute widening, the 30-minute added shift, the standby exemption in Oregon and its
  absence in Seattle and Chicago, the standby-first pricing and the four statements. It also runs the hub end to end
  under Oregon: a join refused without the box ticked, a join, the ask, a refusal for someone not asked, the yes, the
  cover logged as exempt, a team offer before the list was asked priced at one hour, leaving, removal by the manager,
  and the section and routes absent under Seattle. Not modelled: the 653.432(6) anti-retaliation rule and the
  653.432(7) coercion penalty are printed as notes, not enforced. The rule texts were read, not checked by an
  employment lawyer, and no real Oregon site has used this.

## Free on Cloudflare: no server, no card (2026-11-15)

The team hub ran only where a disk and a process can live: Docker on your own box, Fly, or Render's starter plan
($7 a month with a disk; the free plan has none). For a ten-person café that is the whole price of the paid schedulers
it replaces. It now also runs on **Cloudflare's free Workers plan**, in the deployer's own account:

- **Deploy:** the [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) button copies this folder into your GitHub account and deploys it,
  asking for the secrets listed in `.dev.vars.example` (`ADMIN_KEY`, `TEAM_TOKEN`; optional webhooks). By hand:
  `npx wrangler deploy` in this folder, then `npx wrangler secret put ADMIN_KEY` and `... TEAM_TOKEN` (long random
  strings, e.g. `openssl rand -hex 16`). Open `https://team-schedule-hub.<you>.workers.dev/admin?key=<ADMIN_KEY>` and
  send staff `/team?t=<TEAM_TOKEN>`.
- **How:** `hub-worker.mjs` runs the same handler as `server.mjs` (moved to `hub.mjs`, which now uses no Node built-ins)
  and keeps the state in one SQLite-backed Durable Object (the kind the free plan offers): one instance answers one
  request at a time, so two staff sending a call-out in the same second cannot overwrite each other, which a KV store
  could (it is eventually consistent).
- **The roster is built in the manager's browser.** A free Worker gets about 10 ms of CPU per request, and one roster
  search takes hundreds (the sample week: 154 ms warm, ~300 ms cold, in Node). So on the Worker (and on the Node server
  with `BUILD_IN_BROWSER=1`) "Build and publish" imports `calc.mjs` into the admin page, builds there, and posts only who
  works which shift; the Worker checks it against every hard rule and prices it (`rosterFromOwner` in `calc.mjs`, no
  search). `wrangler.jsonc` serves `calc.mjs` and `bnp.mjs` as static files and `.assetsignore` keeps every other file
  in this folder out of the upload. Without JavaScript the Worker refuses to publish and says why.
- **Measured** (`node eval/hub-worker-cpu.mjs`, `eval/hub-worker-cpu.out.txt`; Node wall time, warm, median of 9): on
  the four templates every Worker request costs 0.1 to 1.3 ms (publish from the browser's roster 0.6-1.3 ms, the admin
  page with a call-out and a trade waiting 0.2-0.6 ms, the staff page 0.2-0.5 ms) against 11-154 ms for a build.
- **Checked on Cloudflare's own runtime locally** (wrangler 4.40.0 `wrangler dev`, workerd, 2026-11-15): `/calc.mjs` and
  `/bnp.mjs` served as `text/javascript`; `/hub.mjs`, `/README.md`, `/wrangler.jsonc` and `/index.html` 404 (so
  `.assetsignore`'s `!` lines work); 503-free with the secrets from `.dev.vars`, 401 on a wrong key;
  `hub-browser.check.mjs` against it in Chromium built the sample week in the page and published it ($3,690, the known
  best); two availability replies, then a restart of `wrangler dev`, and the week, both replies and a 10-event calendar
  feed were still there. **Not yet run on a live Cloudflare account**, and the Deploy button's secret prompt
  (from `.dev.vars.example`) is from Cloudflare's documentation as remembered, not tried.
- **Request checks now read the published week.** Cover candidates, trade checks and pick-up checks used to rebuild
  the roster from the *draft* lists on every admin page load. That was too slow for a Worker, and wrong in two cases a
  manager hits every week: after an approved trade, cover or pick-up, the rebuilt week no longer matched the published
  one, so a call-out on a traded shift read "not in the current roster"; and starting next week's draft with a typo
  turned every waiting request into "Staff or shifts no longer build". Publishing now saves the lists it was built from
  (`published.staffText`, `shiftsText`) and the checks use those with the published owners (`rosterCtx` in `hub.mjs`);
  a state saved before this falls back to the old rebuild. Both cases are tests in `server.test.mjs` that fail on the
  old code.
- Tests: `node --test hub-worker.test.mjs roster-from-owner.test.mjs server.test.mjs` (the Worker against a stand-in
  Durable Object: secrets, the browser-only publish, a refused rule-breaking roster, a restart keeping the week, cover
  candidates, the deploy config); browser: `hub-browser.check.mjs`.
- Cost to the deployer: nothing on the free plan as long as the team stays inside its daily request and Durable Object
  limits, which a small team's few hundred page loads a week does by a wide margin (Cloudflare's limits as remembered;
  check the current ones). Webhook alerts are best effort (a Worker may stop an unawaited fetch after replying).

## Model

- People: `name, wage, max hours, min hours, availability, roles: cook|server, prev: Sun 10pm` (`prev:` is when their last shift last week ended, so the rest rule holds across the week boundary; `Mon-Fri 9-17; Sat 10am-2pm; Sun off`; blank = any time; roles optional; `streak: 4` is days worked in a row up to last Sunday, so the days-in-a-row limit also holds across Monday; carry-over writes it).
- Time off this week: add an `off:` cell, e.g. `off: Wed; Fri 5pm-close`, to remove whole days or hours from a person's standing availability without rewriting it (`applyTimeOff` in `calc.mjs`).
- Dated time off: `off:` also takes dates, `off: 2026-11-04..2026-11-06; 2026-11-09 5pm-close`. A date applies only when it falls in the week you give as "Week starting", so one staff list holds a whole month of vacations and each week uses its own (`datedDays` in `calc.mjs`). Without a week start the page says the dated entry was not applied.
- Youth hours: add `age: 15` (or `age: 15 summer`) to a 14-15 year old's row and the search treats the US federal limits as hard rules: only 7am-7pm (9pm in summer), at most 3 h a day and 18 h a week in a school week (8 h and 40 h in summer). Any `age:` under 18 also marks the person `minor` for the never-alone check; under 14 is refused. Add `off:` for school hours. State and local rules can be stricter, so check yours (`parseStaff` in `calc.mjs`).
- Never alone: mark a person `minor` (or `supervised`) in their row and the page flags every stretch where only marked people are on shift, so a minor or trainee is never the only one in. A heads-up, not a search constraint: swap in an adult or pin one with `fixed:` (`unsupervisedStretches` in `calc.mjs`).
- Seniority: add `seniority: 3` (higher = more senior) to rows and the page lists every shift a more senior person could take from a junior one with all hard rules still holding, with the payroll change and whether the senior is under their minimum hours (`seniorityClaims` in `calc.mjs`, 2026-10-30). A report, not a search rule: it shows where a seniority-bidding policy or a union contract would ask for a different roster. Contract terms themselves are not modelled.
- Alone on shift: type a number of hours in "Warn when one person is alone for more than" and the page flags every stretch where exactly one person is on and nobody else, longer than that (`loneStretches` in `calc.mjs`). A heads-up, not a search constraint.
- Short shifts: type a number of hours in "Warn about shifts shorter than" and the page lists every assigned shift under it (`shortShifts` in `calc.mjs`). A heads-up, not a search constraint.
- Soft preference: add `avoid: Sat; Fri 5pm-close` to a person to keep those hours free when anyone else can cover them. Unlike `off:` the hours stay allowed, each hour inside costs half the person's wage in the search (`avoidValue`), and the page warns when someone still works inside their avoid window (`parseStaff`, `avoidMinutes` in `calc.mjs`).
- Soft wish: add `prefer: Sat; Fri 5pm-close` to give a person extra hours they want. Each hour inside earns a small bonus in the search (`preferValue`, a quarter of the wage), so it breaks ties toward them but never leaves a shift open or beats a real payroll saving.
- Daily overtime: set "Daily overtime after" (and optionally "Double time after") or pick a state preset (California 8/12, Alaska 8, Colorado 12). Hours over the daily line pay the overtime multiplier, hours over the double-time line pay 2x, and weekly overtime applies only to straight-time hours beyond the weekly line. A shift counts on the day it starts. The search prices this, so it splits long days across people when that is cheaper. Presets are a convenience, not legal advice: check your state's current rules (7th-consecutive-day premiums are flagged when someone works all seven days but not priced; Nevada's wage test is not modelled).
- Shifts: `day(s), start, end, people needed, label, role: cook` (the role is optional; a shift with a role goes only to people who list it). An end at or before the start runs overnight.
- One qualified person per shift: `role: keyholder x1` on a shift row of 3 people needs just one keyholder; the other two copies take anyone. Without `x1` every copy needs the role (`parseShifts` in `calc.mjs`).
- Pinned shifts: add `fixed: Ana` to a shift row to lock it to Ana (`fixed: Ana + Ben` pins copy 1 and copy 2; copies beyond the names stay open). Everyone else is planned around it; if Ana is not free for the whole shift it comes back unfilled with that reason, and a name not in the staff list raises a warning.
- Unpaid meal break: set "Unpaid meal break on shifts over (hours)" and the break length (default 30 min) and any shift longer than that loses the break from paid time in payroll, daily and weekly overtime (`paidMinutes` in `calc.mjs`). The shift still blocks the whole person-time, so availability, rest and hour caps are unchanged; breaks are not placed on the clock.
- Split-shift premium: enter a dollar amount per split day (California: one hour at minimum wage) and the gap that counts as a split (default over 1 hour). Each day a person's shifts have a longer gap adds the premium (with burden) to their pay, so the search splits the day across people or closes the gap when that is cheaper; people on split days are marked in the table (`splitDays` in `calc.mjs`). The state's exemptions (pay already well above minimum wage) are not modelled: enter the amount you actually owe.
- Pay differential: give hours (written like availability, e.g. `Sat-Sun; Mon-Fri 22-24; Tue-Sat 0-6`) and an extra dollars per hour and/or a percent of each person's wage. Every scheduled hour inside those windows adds the premium to payroll (with burden), and an overnight shift gets its after-midnight hours from the next day's window. A percent premium makes a high-wage person dearer on those hours, so the search shifts them to cheaper staff when it can; it never leaves a shift open for it. You enter the rate; no state or union rule is built in (`differentialMinutes` in `calc.mjs`).
- Tip pool: enter a tip pot and the page splits it in proportion to scheduled hours, in whole cents that add back to the pot exactly (`tipPool` in `calc.mjs`). A planning aid; who may share in a pool is the employer's to decide.
- Hard rules, never broken: availability covers the whole shift, no double-booking, minimum rest between shifts, max
  hours per week, max days in a row, and (optional) most hours in one day: a roster-wide setting, or `daily: 8` in a person's row for a minor or a short-day contract.
- Objective, in order: cover as many shift-hours as possible; then minimise real payroll (wage x (1 + extras), overtime
  above a threshold at a multiplier) plus soft penalties for hours under a person's minimum and for hours far from a fair
  share (balance slider).
- Search: greedy build (most constrained shifts first) then seeded simulated annealing with reassign and swap moves over
  several restarts. Deterministic. Tests check every roster against the hard rules and compare with an exhaustive search of
  all rosters on small problems.
- Reports: who is on each shift, shifts nobody could take and the reason, hours and pay per person, who the week depends on
  (rebuild without each person), and a comparison with filling shifts in listed order. CSV exports, and a `.ics` calendar file for the week (everyone, or one person to hand them their own shifts), and a ready-to-paste text message per person ("Hi Sam, your shifts this week: ..."), dated when you give the Monday.

- Collect availability from your team: "Collect your team's availability" makes a link to `availability.html`, a phone-friendly week grid each person fills in; it hands them one line to text or email back (`Ana | Mon-Fri 9-17; Sat off | max: 25 | off: Wed`). Paste the lines into the page and `mergeAvailabilityReplies` replaces each person's availability, keeping the wage, roles, `prev:` and your min hours, and only ever lowering max hours. Unknown names are added with no wage so the page asks for it. No server: the link holds only the business name, week and an optional name (`availabilityFromGrid`, `parseAvailabilityReply` in `calc.mjs`).

- Short days: set "Flag days shorter than (hours)" and the page lists anyone scheduled for less in a day (adjacent shifts count together), since a short day costs a commute for little pay and some cities owe reporting-time pay (`shortDays` in `scheduleFlags`).

- Check a trade: pick the two shifts two people want to exchange and the page says whether both weeks still pass every hard rule, the payroll change of the pair, and which rule stops it when it does not (`checkTrade` in `calc.mjs`).

- Hour-by-hour coverage: a headcount grid for each clock hour of the week, darker when busier, so hours with one person alone stand out (`coverageGrid` in `calc.mjs`).

- Labor %: add projected sales and a target labor percentage to see payroll as a share of sales and the dollars under or over target (`laborPercent` in `calc.mjs`).
- Payroll budget: type a weekly dollar budget and the summary says how far payroll sits under it, or how far over and roughly how many paid hours at the average hourly cost would close the gap (`budgetCheck` in `calc.mjs`). A guide; use "trim" options to see whose hours to cut.
- Sales per labor hour: with sales by day and a target sales per labor hour, a table shows the hours each day's sales call for against the hours scheduled, and which days run heavy or light (`salesPerLaborHour` in `calc.mjs`). A guide only; the builder fills the shifts you list.
- What-if: when shifts stay open, rebuilds with one extra person free at any time (average wage, 40 h) and reports the hours it would cover and the payroll it adds, plus the exact shifts that hire would work, as the availability to ask for in a job post (`hireTest.windows`).

- Carry over last week: choose last week's roster CSV and every person who worked gets a `prev:` cell with when their last shift ended (overnight closes written as `Sun 25:00`), so the rest rule holds across Monday (`carryOverStaff`).

- Fairness over the plan: "Plan several weeks" adds a table of each person's weekend, closing and opening shifts across all the weeks and warns when one person carries 2+ more per week than another (`planFairness` in `calc.mjs`). A report; the search balances through the tough-shift tally.

- Returning each week: people, shifts and settings are remembered in this browser's local storage only ("Forget saved data" removes them), and can be saved to or loaded from a `roster-setup.json` file to move between devices.

Guide pages, each with figures a test re-derives from the engine: [how to make an employee schedule](how-to-make-an-employee-schedule.html), [clopening](how-to-avoid-clopening.html), [rotating closes and weekends](how-to-rotate-closing-and-weekend-shifts-fairly.html), [14 and 15 year olds](scheduling-14-and-15-year-olds.html), [overtime](how-to-reduce-overtime-in-a-schedule.html), [labor cost by day](labor-cost-percentage-by-day.html), [hiring test](do-i-need-to-hire-another-employee.html) [covering a call-out](how-to-cover-a-shift-when-someone-calls-out.html) [time-off requests](how-to-handle-time-off-requests.html), [changing a posted schedule](schedule-change-after-posting.html) and [whose availability is worth widening](whose-availability-is-worth-widening.html).

## What you use today, and what this does differently

- **Paper, a whiteboard or a spreadsheet:** free and private, but you check availability, rest gaps and overtime by eye, and nothing tells you a shift is unfillable until Sunday night.
- **Subscription schedulers** (7shifts, When I Work, Homebase, Deputy and similar): staff apps, shift swaps, time clocks and payroll hand-off. They want accounts for you and your staff, and most price per user or per location. This tool does none of that. It solves one week at a time with no signup and no upload.
- **What this adds:** a solver that fills as many shifts as the rules allow, prices overtime and split shifts, names the shifts it cannot fill and why, and shows who the week depends on. Your staff list stays in your browser. If you need staff-facing apps, a time clock or multi-week publishing, a subscription product is the better fit.

## Reduced-cost fixing (2026-10-23)

At the best shift prices, a roster that makes person p hold shift i scores at least `bound - (p's best priced set) + (p's best priced set holding i)`. When that reaches the incumbent cutoff, the pair (p, i) is banned from the cost search (`reducedCostFixing: false` turns it off; benches take `NOFIX=1`). Measured with `node eval/scale-bench.mjs 3 30000`, three seeded weeks per size: 6 x 14 still 3/3 proven, nodes 34,809 -> 21,790 (-37%), 6 s -> 4 s. 8 x 18 and 8 x 22 unchanged in proofs (40,541 nodes both; 119,853 -> 116,781), because there the gap is cost-side and the prices are too loose to fix much. `eval/dual-bench.mjs` on 8 x 22: still 0/4 proven. A modest gain on small weeks, none yet where the proof breaks; tighter prices are the next lever.

## More subgradient rounds do not tighten the 8 x 22 root bound (negative result, 2026-10-23)

`priceScoreBound` runs 300 subgradient rounds by default. Raising that to 1,500 (temporary override, `node eval/dual-bench.mjs 4 8 22 1 1`, root bound only, four seeded weeks) moved the bounds by under 0.1%: 5,637,436 -> 5,640,704, 40,171 -> 40,283, 9,803,711 unchanged, 3,502,302 -> 3,502,569, with no extra week proven, at about 1.5x the time. So the gap left at the root is a duality gap of the shift-pricing relaxation, not slow convergence; a bundle method would converge to the same value. Only branching or a stronger relaxation (per-person set columns generated against the prices, or cuts on pairs of contested shifts) can close it. The default stays at 300.

## Where the proof breaks now, all six sizes (measured 2026-10-24)

`node eval/scale-bench.mjs 8 100000`, 8 seeded weeks per size, 100,000-node limit, 20 s per week, one run on the current code (pricing, ejection chains and reduced-cost fixing in). It finished all six sizes, including the 12 x 30 row the table below could not:

| people x shifts | proven | coverage proven, cost not | coverage open | nodes | time |
|---|---|---|---|---|---|
| 6 x 14 | 8 of 8 | 0 | 0 | 35,893 | 6 s |
| 8 x 18 | 4 of 8 | 3 | 1 (up to 1 h) | 681,089 | 61 s |
| 8 x 22 | 3 of 8 | 4 | 1 (up to 1 h) | 650,550 | 102 s |
| 10 x 22 | 0 of 8 | 5 | 3 (up to 5 h) | 1,166,235 | 129 s |
| 10 x 28 | 0 of 8 | 0 | 8 (up to 26 h) | 788,451 | 197 s |
| 12 x 30 | 0 of 8 | 1 | 7 (up to 27 h) | 770,370 | 188 s |

Against the 2026-10-22 table: 6 x 14 went from 6 to 8 of 8 proven and 8 x 22 from 2 to 3. Up to 10 x 22 the coverage floor is now mostly settled and what remains is the pay gap; at 10 x 28 and 12 x 30 the open-hours floor is still unresolved by up to 26 and 27 h, so that is where the next bound has to work (pair cuts on contested shifts). Same seeded generator as before, so the weeks are synthetic, not a real business's rosters.

## Where the exact proof breaks (measured 2026-10-22)

`node eval/scale-bench.mjs [cases] [exactNodes]` grows seeded random weeks (all-different people, 1-2 heads per shift, 100,000-node limit, 20 s) and counts how many are proven. 8 cases per size:

| people x shifts | proven | nodes visited |
|---|---|---|
| 6 x 14 | 6 of 8 | 432,354 |
| 8 x 18 | 4 of 8 | 727,906 |
| 8 x 22 | 2 of 8 | 915,149 |
| 10 x 22 | 0 of 8 | 1,211,132 |
| 10 x 28 | 0 of 8 | 1,193,955 |

(The 12 x 30 row did not finish inside the 10-minute run.) So the proof is reliable to about 5 people and 14 shifts and gone by 10 people; beyond that the annealed roster is the answer and the report says it is not proven. The weeks here are drawn in one simple style and the node limit is the default one: a higher limit proves more (the 3M-node note above), so read the table as where the default stops, not where proof is impossible. 

**Open hours or cost?** The bench now splits every unproven week (`node eval/scale-bench.mjs 4 30000`, 4 cases per size, 30,000-node limit, 2026-10-22, one run):

| people x shifts | proven | unproven, coverage proven | unproven, coverage not proven |
|---|---|---|---|
| 6 x 14 | 3 of 4 | 0 | 1 |
| 8 x 18 | 2 of 4 | 0 | 2 |
| 8 x 22 | 0 of 4 | 0 | 4 |
| 10 x 22 | 0 of 4 | 0 | 4 |
| 10 x 28 | 0 of 4 | 0 | 4 |
| 12 x 30 | 0 of 4 | 0 | 4 |

Every unproven week failed at the coverage step: the search could not show whether the open hours it left (1 to 60 h per size) were the fewest possible, so the pay-and-penalty gap is never reached. The cost bound is not what stops the proof here; the open-hours floor is. Small sample and a lower node limit than the table above, so read it as a direction, not a rate. Next: a tighter bound on the open-hours floor (the coverage pass at 8 or more people).

**Ejection chains, and a bound that overstated (2026-10-22).** The annealer moves one shift at a time, so an open shift that cannot simply be added (overlap, rest gap, weekly limit) stayed open unless two moves happened back to back. `ejectPass` now runs when shifts are open: an open shift goes to someone who gives up one of theirs for it, and that shift moves on to a third person or stays open if it is the shorter. `node eval/ejection-bench.mjs 8 8 22` (8 seeded weeks, 8 people x 22 shifts, 30,000-node limit): open hours left 413 before, 395 after, against a proven floor of about 350, so about 45 h of the gap remain. It never makes a roster worse (kept only if the total falls). It also exposed a bug in the exact search: when the coverage pass proved more open hours than the flow's own bound, the cost bound still charged the pay of the flow's largest cover and cut the true optimum (a 2-person, 6-shift week reported $7 above brute force as optimal). The pay terms are now used only when the open hours are the flow's own; a regression test holds it. Because the heuristic covers more, the call-out, 14-15, time-off and widening guide tables changed (they are re-derived by `page.test.mjs`). Not claimed: the default search is still a heuristic. On the sample week it covers 216 hours where `exact: true` finds 220.

**The coverage pass was being skipped, and its answer thrown away (2026-10-22).** The exact search runs a coverage-first pass (how few hours must stay open, ignoring pay) only `if` the root flow bound already said open hours were forced; on a week where the flow said "0 forced" but the annealer left 5 h open, the pass never ran, so the report said coverage was unproven. It now runs whenever the roster leaves more open than the root bound proves, and a pass that finds fewer open hours than the annealer becomes the new incumbent (before, its roster was dropped). The report also uses the pass's proven floor (`forcedOpenHours`, `coverageProven`) instead of only the root bound. Alongside, each person's weekly capacity in the flow is capped by the most hours they could hold with overlap, rest, daily cap and consecutive-day rules checked together (`heldMost`), not by the day caps and the weekly subset-sum separately. Measured with `node eval/ejection-bench.mjs 8 8 22` (8 seeded weeks, 30,000 nodes): open hours left 395 -> 387, proven floor about 350 -> 360, so the remaining gap is about 27 h rather than 45 h. On the 6 x 14 bench weeks, two that were reported "coverage not proven" now show the proven floor (57 h and 52 h, instead of 47 and 51). The proven/unproven count is unchanged on 6 x 14 (2 of 4, same cases as before); on the 7-person sample week the strict (`exactTolerance: 0`) run now also finishes. Not claimed: 8+ people are still mostly unproven (0 of 4 at 8 x 22, 10 x 22, 10 x 28, 12 x 30 at 30,000 nodes), and the bench's old "cost gap left" column is misleading when open hours remain, since it includes the 1-hour penalty.

**A tighter day edge did not move the floor (2026-10-23, negative result).** The flow caps each person-day edge by `bestDay` (the heaviest same-day set that fits together). I tried capping it with `heldMost` instead, which also checks rest across days, the daily cap and consecutive days against what the person already holds. `node eval/ejection-bench.mjs 8 8 22` gave the same numbers before and after: open 387 h, proven floor 360 h, same status per case (about 1.5 min either way). So the cross-day rest rules are not what loosens the 8-person bound; the person-week cap already carries them (`heldMost`, above). The slack is in the relaxation itself: the flow lets each person take their best set independently of what others take. Untried next steps: a Lagrangian price on shifts that several people compete for, or branching on the most contested shift first. Not claimed: that the 27 h gap is the bound's rather than the heuristic's; no exact optimum is known at this size.

**Branch order did not move the floor either (2026-10-23, negative result).** The exact search branches on the least-eligible shift first. `node eval/ejection-bench.mjs 8 8 22` (same 8 seeded weeks, 30,000 nodes) with two other orders, tried by a temporary switch that is not kept: longest shift first gave 394 h open and a proven floor of 356 h (worse on both); eligible-people-per-hour first gave 388 h and 360 h (the same floor, one hour worse). The baseline is 387 h open, floor 360 h. So the order of branching is not what holds the 8-person floor down; with the day-edge result above, the gain came instead from pricing contested shifts (next paragraph). Not claimed: that no order helps, only that these two do not on these weeks.

**Pricing contested shifts tightens the open-hours floor (2026-10-23).** The flow bound lets one shift be split between people and takes each person's best set independently of the others. `openFloorByPricing` (`calc.mjs`) puts a price on every shift instead: each person's real feasible sets are enumerated (overlap, rest, daily cap, consecutive days, weekly hours), and for any prices `lam >= 0`, `sum(lam) + sum over people of (best set's hours minus its prices)` is an upper bound on the hours that can be covered (weak duality); 200 subgradient steps tighten the prices. It runs once at the root of the exact search, rounds up to the shifts' hour grid, and feeds the coverage pass, which now skips itself when the roster already meets the floor. It gives up (returns `null`) when one person has over 60,000 feasible sets. Measured with `node eval/ejection-bench.mjs 8 8 22` (8 seeded weeks, 8 people x 22 shifts, 30,000 nodes, about 1 min): the proven floor went from 360 h to 383 h against 387 h left open by the roster, so the unresolved gap is 4 h rather than 27 h, and two more weeks are now shown to be covered as well as possible. `node eval/scale-bench.mjs 4 30000`: weeks with coverage proven but cost not proven, 8 x 22 from 0 to 2 of 4 and 10 x 22 from 0 to 1 of 4; the full-proof count did not move (cost is now the stopping point at 8 x 22). A test checks the floor never exceeds brute force on 40 tight random weeks. Not claimed: 10 x 28 and 12 x 30 still leave up to 14 h unresolved; one seeded generator, one run each.

**Pricing shifts on the whole score, not just open hours (2026-10-23).** The earlier pricing bound only counts hours that can be covered. `priceScoreBound` (`calc.mjs`) reuses the same enumerated feasible sets but prices shifts against the real objective: each shift is held by one person or stays open at `BIG` x its hours, so for any prices `lam`, `sum(lam) + sum over people of (best set's personScore minus its prices) + sum over shifts of min(0, BIG x hours - lam)` is a lower bound on the whole score (pay, overtime, balance, avoid/prefer, tough-shift terms included, exactly as `personScore` computes them). It starts from the open-hours prices scaled by `BIG`, takes 300 subgradient steps toward the incumbent, and the exact search uses it as a root bound (`scoreDual: false` turns it off). Measured with `node eval/dual-bench.mjs 4 8 22 30000 <1|0>` (4 seeded weeks of 8 people x 22 shifts, 30,000 nodes, one run each), root gap left against the roster, in score units where one open hour is 100,000:

| case | gap before | gap with the score bound |
|---|---|---|
| 0 | 301,043 | 65,965 |
| 1 | 399,942 | 362,275 |
| 2 | 28 | 28 |
| 3 | 101,044 | 100,326 |

Proven count stayed 0 of 4: the bound gets closer (case 0 from three open hours of slack to under one) but not to the tolerance. A test checks the bound never exceeds the brute-force optimum on 40 tight random weeks with balance and burden on. `node eval/ejection-bench.mjs 8 8 22` now reports a proven open-hours floor of 386 h against 387 h left open (was 383 h), because the root bound feeds it. Full venture suite: 188 pass, 0 fail. Not claimed: that it proves any more weeks yet; 4 cases, one generator, one run; case 1 is still dominated by a coverage gap of several hours that the sets bound does not see.

## Branching on the priced bound (2026-10-24)

The root price leaves a duality gap because the relaxation lets a contested shift be split between people. `branchDual` (`calc.mjs`) now runs after the root price in the exact search: it fixes the most contested shift (held by one of the people who could hold it, or left open), re-prices each piece with the same subgradient loop on the filtered feasible sets, and repeats on the lowest open bound until every piece reaches the cutoff or a limit is hit (`dualBranchNodes` 40, `dualBranchMs` 8000; `dualBranch: false` turns it off). The result is still a valid lower bound, so a proof that comes from it is a proof. `node eval/dual-bench.mjs 4 8 22 30000 1` (same four seeded weeks as above; `DBN`/`DBMS` set the limits), root-plus-branching gap left against the roster, score units where one open hour is 100,000:

| case | before | 40 nodes, 8 s | 300 nodes, 40 s |
|---|---|---|---|
| 0 | 65,965 | 768 | 253 |
| 1 | 362,275 | 287,592 | 227,970 |
| 2 | 28 | 15 | 15 |
| 3 | 100,326 | 100,117 | 100,112 |

Case 0 went from two-thirds of an open hour to $2.53 of pay. Still 0 of 4 proven: cases 2 and 3 barely move (case 3's gap is about one open hour that neither the roster nor the bound resolves), and case 1 is still a coverage gap of two hours. Costs 2 to 8 s per week at the default limits. A test checks the branched bound never passes the brute-force optimum on 40 tight random weeks and rises on at least one. One generator, one run each. (The clopening and call-out guide tables that failed on `main` here were re-derived from the engine on 2026-10-25.)

## How much pay is left once coverage is proven? (measured 2026-11-01)

`node eval/pay-gap-bench.mjs 8 22 12` (new): twelve seeded 8-person, 22-shift weeks, the same generator as `rolling-gap-bench.mjs`, default exact settings (100,000 nodes, 8 s). Coverage was proven (open hours equal the floor) on 11 of 12 weeks. On those 11 the roster's pay is within the bound by $0.00 to $15.69, median $4.15 and 0.7% of weekly pay at most (weeks cost $1,379 to $2,612); two are proven optimal outright, one more is within $0.04. The 12th week (open 86 h against a floor of 84 h) is a coverage gap, not a pay gap. So once coverage is proven, a tighter pay bound can recover at most about $16 a week at this size, while the unproven coverage weeks are worth whole open hours. One generator, one run, hard rules only; not a real payroll. That moves the next milestone to branch-and-price on the coverage gap. (2026-11-10, later: the pay gap is closed too, on all 12 weeks; see "A pay bound by column generation".)

**Shifts from hourly sales (2026-11-07).** `node cli.mjs --from-sales hourly.csv --splh 60 [--min-staff 2] [--min-shift 4] [--max-shift 8] [--open 8 --close 22]` (`demand.mjs`) averages each weekday-hour of a till or POS export (a date-time column and a sales column; weekday-name rows also read), sets heads needed to `max(min-staff, ceil(average / splh))` inside the hours with sales, and cuts each day's headcount curve layer by layer into shifts. A run shorter than `--min-shift` is stretched to it and the stretch is reported as extra hours. Shift lines go to stdout in the shifts-file format, so the output feeds the normal build. Hand-built sales only (`demand.test.mjs`: averaging, headcount, coverage of every hour by the cut, parse round trip, CLI); not a forecast model, no real POS export tried (wanted: one). 2026-11-07: `--skip-dates 2026-11-26,2026-12-25` leaves holiday or storm days out of the average, and `--half-life <weeks>` weights recent weeks more (a day's weight halves every that many weeks back from the newest date); hand-built sales only (`demand.test.mjs`). 2026-11-07: the page `shifts-from-sales.html` (paste or load a CSV; same engine; table by day, copy button; tested in `page-sales.test.mjs`, clicked in headless Chromium 2026-11-10 at 1280 and 390 px wide: sample, copy, bad and zero inputs, skip dates and half-life, no console errors, no sideways scroll; that run found that text with no readable sales left "Paste sales above." instead of an error, now fixed). 2026-11-08: fixed a bug found by probing the parser: an ISO date with a 12-hour clock (`2026-03-05 2:00 PM`) was read as 2 AM and `12:00 AM` as noon, putting demand in the wrong hours; now converted, 13 PM refused (`demand.test.mjs`). Next: a real POS export.

**Repeat builds remembered (2026-11-13).** `buildRoster` keeps its last 32 builds in the process; the same staff, shifts and options again returns a copy at once instead of re-running the proof (on the page: an unchanged week built twice). Inputs JSON would misread (Set, Map, function, Date) are built fresh; `memo: false` always builds fresh. The full venture suite went from 148.8 s to 131.7 s on 4 cores (421 to 367 CPU-seconds); splitting `calc.test.mjs` had first been tried and changed nothing, because the suite is CPU-bound (`docs/posts/2026-11-13-splitting-a-slow-test-file-did-nothing.md`). Test: `calc.test.mjs`, "a repeat build of the same input is remembered".

**Input checks from a red-team run (2026-11-13).** `--open`/`--close` are now whole hours from 0 to 24 with the opening first: `--open 17 --close 9` or `--close 25` used to return an empty plan with no word why, and now stop with an error (a day that runs past midnight cannot be planned as one day yet). An opening hour after the last sale, which is legal, plans nothing and now says so in the notes. Amounts with a Swiss apostrophe thousands mark (`CHF 1'234.50`, also `1’234.50`) used to be skipped as unreadable and are now read. Tested in `demand.test.mjs` with hand-built rows, as are five guards for faults the suite missed (a one-digit-month `--skip-dates`, a stray three-digit date number flipping a file to day-first, an unreadable quantity under `--standard`, the 20-date floor of the lunch-break rule, half-life auto with `--short-cost`).

**Messy sales exports (2026-11-09).** Probing `--from-sales` with made-up exports of the kinds POS tools write showed four failures, now fixed and unit-tested (made-up rows only, still no real export): `1.234,50` (decimal comma) was silently read as 1.2345, a thousand times too small and no warning, and is now 1234.50; `(12.50)` was an unreadable cell and is now a refund, skipped like any negative; month-name stamps (`"Mar 5, 2026 2 PM"`, `5 March 2026 14:00`) were unreadable; and an hour interval beside a weekday (`14:00-15:00`, `2 PM - 3 PM`) is read by its start. A dotted date (`05.03.2026`) is now day first; slashes stay month first. Also 2026-11-09: a separate Date column and Time column (`Date,Time,Net Sales`) used to read 0 rows and are now joined into one stamp. Later the same day: an Excel `sep=,` first line (which made the real header look like data, so every row was lost) is skipped, and a bracketed unit in a header (`Net Sales (USD)`, `Sales [GBP]`) no longer hides the column; both were found by probing and are unit-tested on made-up rows.

**Time zone suffixes (2026-11-10).** The stamp reader took a bare `P` or `A` after the hour as AM/PM, so `2026-03-05 02:00 PST` was read as 2 PM (sales in the wrong hour, no warning). The marker must now stand alone; `Thu, 05 Mar 2026 14:00:00`, `Thursday, March 5, 2026 2 PM` and `05-Mar-2026 14:00` now read too. Test in `demand.test.mjs` (21 pass). Made-up rows only.
**First real POS export, and a backtest (2026-11-11).** `--from-sales` had only seen made-up rows. The first real export it read is a Korean bakery's order file (Kaggle "Bakery Sales", user hosubjeong: 2,420 orders, 2019-07-11 to 2020-05-02 plus one stray June line, columns `datetime, day of week, total` in won, then one column per item). It parsed as it came, with no edits. It also showed three faults, now fixed (`demand.test.mjs`, made-up rows that copy each shape): (1) 233 trailing rows of empty cells were each reported as "could not read the date and hour", 233 lines of noise; empty rows are now ignored with one note. (2) The shop is shut on Tuesdays, but it sold on one Tuesday (Christmas Eve). A weekday was averaged over the dates it traded, so that one day staffed every Tuesday with 2 people 11:00-15:00. A weekday with sales on fewer than 1 in 4 of its dates in the file is now treated as closed, with a note. This applies only when the busiest weekday traded on at least half its dates, so short hand-made files are unaffected. (3) One 22:00 Wednesday order (1 of 39 Wednesdays) and one 23:00 Sunday order (1 of 42 Sundays) stretched the trading day, adding shifts to 23:00 and midnight. An edge hour with sales on fewer than 1 in 20 days no longer sets the opening or closing hour, and a note lists the hours left out. `--keep-rare` turns both rules off. At 30,000 won per labor hour the plan drops from 101 scheduled hours a week to 82. In the backtest below the cut is 71.7 to 65.0 person-hours a week, for 0.13 more short person-hours.

`--backtest` (CLI, and the "Test on my past weeks" button on `shifts-from-sales.html`) answers "should I weight recent weeks?" from the user's own file. Each full week after the first `--warmup` weeks (default 4) is planned only from the weeks before it, then compared hour by hour with the heads its real sales needed. Short is person-hours the sales needed and the plan lacked; over is staffed hours beyond that. Methods: the plain average (the default), `--half-life` 8, 4 and 2, the last 4 weeks, and last week alone. The output is the mean per week, and each method's paired difference from the default with a normal 95% interval over the tested weeks (weeks are treated as independent, which they are not quite). On the bakery (38 tested weeks; `eval/bakery-backtest.mjs`, output in `eval/bakery-backtest.out.txt`; the data is downloaded and checked by SHA-256, not committed, because its licence page could not be read from the session): `--half-life 4` beats the plain average at all six settings tried (15,000, 30,000 and 60,000 won per labor hour, minimum staff 1 or 2) by 0.3 to 2.6 person-hours a week, intervals below zero. At minimum staff 2 and 60,000 won, half-life 2 is narrowly best. "Last week only" is worse everywhere, by 5.1 to 13.9 person-hours a week. Last 4 weeks ties the default. Even the best method is short about 14 person-hours a week at 30,000 won against 64 scheduled: hour-to-hour sales noise is larger than any choice of average. Limits: one shop, headcount profiles before the cut into shifts, and short and over costed the same.

**Second real POS export: a French bakery's item lines (2026-11-11).** The Korean file has one row per order with a total. Many tills export one row per *item* instead. The second real file is that shape: a French bakery's sales (Kaggle "French bakery daily sales", Matthieu Gimbert; 234,005 lines, 2021-01-02 to 2022-09-30, columns `,date,time,ticket_number,article,Quantity,unit_price`, prices written `"0,90 €"`). It showed four faults, now fixed (`demand.test.mjs`, made-up rows in the same shape):

1. **No sales column.** It was refused outright ("No sales column found"). With no sales column but a quantity and a unit-price column, each row's sales are now quantity times unit price, and a note says so. The decimal-comma euro prices already read.
2. **1,294 refund lines** (negative quantities, 4,075.85 EUR against 562,717 EUR sold) would each have printed a "Skipped row" line. They are now one note with the count and total. They are still left out, so the plan follows what was rung up. Only 15 of them sit on the same ticket as the line they cancel, so most are later returns, not voids.
3. **A lunch closure.** The shop shuts about 13:30 to 16:00. Its 14:00 and 15:00 hours traded on 7-13% of dates, about 1 euro an hour on average. Its 12:00 and 16:00 hours traded on 70-100% of dates. The edge-hour rule only trims the ends of the day, so minimum staff filled the closure. A run of hours inside the day that trades on under 1 in 5 of the weekday's dates, between an hour before and an hour after that each trade on at least half, is now a break: nobody is scheduled. This needs 20 or more dates of that weekday, and it is off with `--open/--close` or `--keep-rare`. A shop that is quiet all day has no busy neighbours, so its slow hours stay staffed (tested). Shift cutting changed with it. A short run used to be stretched forward even into closed hours, so with the break rule alone two shift lines (11:00-15:00 and 12:00-16:00) still crossed the closure. It now stretches into open hours first. With both changes, 0 of the 9 shift lines span 14:00-16:00; with the rules off (`--keep-rare`), 3 of 14 do. On the Korean bakery the plan and backtest are unchanged (`eval/bakery-backtest.out.txt`). In a hand-made test, a 1-hour peak is no longer stretched an hour past closing.
4. **Size.** `Math.max(...rows)` over 232,711 rows overflowed the call stack ("Maximum call stack size exceeded") in both the plan and the backtest. These are now loops.

The backtest was also too slow on a file this size: 67 s per setting, and the page runs it on the main thread. Sales are now summed per date and hour before the weeks are replayed (232,711 rows become 5,566), with identical results to six decimals. It now takes about 3 s in the CLI and 3.3 s in the page (headless Chromium, real file).

Readings (`eval/french-bakery.mjs`, output `eval/french-bakery.out.txt`). The file is downloaded and checked by SHA-256, not committed, because its licence page could not be read from the session. At 40 EUR per labor hour the plan needs 203 person-hours a week and schedules 239; with the rules off (`--keep-rare`) it needs 220 and schedules 256. Over 87 tested weeks:

- **Recency wins here as well, by more.** `--half-life 2` beat the plain average at five of six settings (20, 40 and 80 EUR per labor hour, minimum staff 1 or 2), with intervals below zero. At 40 EUR and minimum 1, it cut short plus over from 73.2 to 61.8 person-hours a week (difference -11.4, 95% CI -18.3 to -4.6). On the Korean bakery, half-life 4 was best. Two shops is not a rule, but both say the default (equal weight for every earlier week) is not the best choice when the file covers more than a few months. The page's "Test on my past weeks" button tells each shop which works on its own file.
- **The break rule saves about 9-10 scheduled person-hours a week**, and short rises by 1.2-1.8 person-hours: the 7-13% of days that did sell something at 14:00-15:00. The backtest cannot score the saving itself. It counts minimum staff as needed in every hour the plan staffs, so a staffed closure never shows up as "over".

Limits: one shop per layout, and short and over are costed the same (see the short-vs-over weight below). Item lines are summed per hour, so the number of tickets (queue length) is not used. A US layout (Square or Toast item export) is still unseen as a real file; since 2026-11-12 their documented columns are handled (see "Square and Toast item exports" below).

**Short-vs-over cost weight (2026-11-11).** Every plan above staffs each hour for its *average* sales, and in both backtests "short" and "over" were costed the same. Most managers do not see them as the same: a short hour is a queue, a lost sale or a worn-out team, a spare hour is pay for someone with nothing to do. And an hour staffed for the average is short on roughly half its days. `--short-cost <r>` (CLI, and the "A short hour costs this many times a spare one" box on `shifts-from-sales.html`) says a short person-hour costs r spare ones. Each weekday-hour is then staffed with the smallest headcount that covered the r/(1+r) share of its past dates (`demand.mjs` `fractileHeads`): r = 1 is the median day, r = 3 three days in four, r = 0.5 one in three. This is the newsvendor critical fractile, the headcount that minimises r x short + over over those dates. `--half-life` weights the dates; minimum and maximum staff, the trading day, lunch breaks and closed weekdays work as before. Undated weekday-average rows have no spread, so those hours keep the average. With `--backtest`, the report scores each week as r x short + over and adds a fractile row for every weighting (every earlier week, half-life 8/4/2, last 4 weeks, last week), all compared with the plain average.

Readings on both real files (`eval/short-cost.mjs`, output `eval/short-cost.out.txt`; same downloads and SHA-256 as above; minimum staff 1; weighted cost in person-hours a week, paired 95% intervals over 38 and 87 tested weeks):

- **Korean bakery, 30,000 won per labor hour:** at r = 3 the average costs 54.1 a week (14.2 short, 11.6 over) and the fractile rule 47.4 (9.1 short, 20.1 over): -6.7 (-9.9 to -3.5). The fractile wins with the interval below zero at every r tried (1/3, 1, 2, 3, 5) at 15,000 and 30,000 won; at 60,000 won it wins at r = 1/3, 1 and 5, and is level at r = 2 and 3 (intervals reach zero).
- **French bakery, 40 EUR per labor hour:** with every earlier week equal, the fractile helps at r = 1/3, 2, 3 and 5 (-11.3, -3.7, -17.4, -61.5) and ties the average at r = 1. Recency matters more here: the fractile with `--half-life 2` is best at r = 1, 2 and 3 (r = 3: 164.7 to 121.4, -43.3, CI -66.7 to -20.0), and with `--half-life 4` at r = 5. The same pattern holds at 20 and 80 EUR.
- **The rule's share is the right one in hindsight.** Run at fixed shares 0.1 to 0.9 and scored at each r, the cheapest share was within one grid step of r/(1+r) on both files (Korean: 0.20/0.50/0.70/0.75/0.80 for r/(1+r) = 0.25/0.50/0.67/0.75/0.83; French: 0.30/0.50/0.70/0.80/0.90).

What it does not settle: r itself is the user's judgment (a lost sale's margin against an hour's pay), and the backtest takes it as given. Weeks are not independent, so the intervals are a little narrow. Two bakeries, one layout each. The page's backtest also returned a fault from before today: the method results dropped `halfLife`, so the "put N in the half-life box" hint never showed; fixed, with a test.

**The short-cost weight carried through the shift cut (2026-11-11).** Every backtest above scored the *headcount profile*, the heads wanted per hour, not the shifts cut from it. A run shorter than `--min-shift` (one extra person for the 12:00 hour) was always stretched to the shortest shift, and those stretch hours never showed in "over". Scoring the shifts themselves (`backtestSales` option `shifts`, now what the CLI `--backtest` and the page's "Test on my past weeks" button use) shows they were large: on the Korean bakery at 30,000 won, r = 3 and a 4-hour shortest shift, the fractile plan costs 47.4 a week as a profile and 59.3 once cut (over 20.1 to 42.7 person-hours a week).

So with `--short-cost` the cut now prices each short run (`demand.mjs` `cutShifts` with a cost, `shiftCost`). Adding a person at an hour where c - 1 are already staffed changes r x short + over by (1 - q) - r q in expectation, where q is the weighted share of past dates that needed c or more heads at that hour (minimum staff counts as needed in open hours, as in the backtest). For each run above minimum staff that is shorter than the shortest shift, the cut sums that over every window of `--min-shift` hours holding the run, takes the cheapest (preferring windows inside open hours on ties), and staffs it only if the sum is below zero; otherwise the run is left unstaffed and listed in a note ("Left unstaffed: ..."). For undated weekday-average rows the cut is unchanged. (Since the follow-up below, the cut is priced without `--short-cost` too, and a window whose sum is exactly zero is staffed; readings re-run, Korean values moved by at most 0.4.)

Readings on both real files (`eval/cost-cut.mjs`, output `eval/cost-cut.out.txt`; same downloads and SHA-256 as above; fractile rule with every earlier week equal, minimum staff 1, longest shift 8; paired 95% intervals over 38 and 87 tested weeks). The cost-aware cut beat the plain cut in every one of the 36 settings (3 splh x 3 r x shortest shift 4 or 6, both files), every interval below zero:

- **The stretch was large.** Korean bakery, 30,000 won, r = 3, shortest shift 4: profile 47.4 a week, plain cut 59.3 (over 20.1 to 42.7), cost cut 48.3 (9.8 short, 18.8 over, 76.5 scheduled against 104.7): -10.9 (-15.0 to -6.9). French bakery, 40 EUR, r = 3: profile 147.3, plain cut 171.2, cost cut 154.1: -17.1 (-19.7 to -14.5). With a 6-hour shortest shift the gaps double (Korean -25.7, French -34.1 at the same settings).
- **Across the grid** the cost cut saved 0.8 to 47.2 weighted person-hours a week on the Korean file and 7.6 to 85.8 on the French one against the plain cut; the largest savings are at a 6-hour shortest shift and low splh, where more runs are short.
- **The fractile still beats the average once both are cut.** Against the plain average cut the old way (what `--from-sales` gives without `--short-cost`), the fractile with the cost cut is cheaper in all 36 settings, every interval below zero (Korean 30,000 won, r = 3, shortest 4: 58.7 to 48.3, -10.4; French 40 EUR: 176.7 to 154.1, -22.6). Scoring the cut also moves the earlier readings: at r = 1/3 the average's cost roughly doubles once cut (Korean 30,000 won: 16.3 as a profile, 36.2 cut).
- **What it trades.** The cost cut runs a little shorter than the profile (Korean r = 3: 9.8 against 9.1 short person-hours a week) and far less over than the plain cut. The left-unstaffed runs are listed on every plan, so a manager can put one back by hand.

What it does not do: each short run is priced on its own, so two short runs an hour apart (Wed 11:00 and 13:00 for a third person on the Korean file) are never joined into one 4-hour shift that covers both, and a short run is never folded into a neighbouring shift by lengthening it. Both were tried next ("Joining short runs" below): no gain on held-out weeks. One weighting (every earlier week equal) was measured; the half-life rows run the same cut. Two bakeries, one layout each.

**The priced cut by default (2026-11-11, follow-up).** The cost-aware cut above only ran under `--short-cost`, so the plan most people get (the plain average, no flag) was still cut the old way, every short run stretched to a whole shift. Now the cut is priced whenever the file has dated rows: at the `--short-cost` weight when given, otherwise at r = 1 (a short hour and a spare hour weigh the same, the weight the plain backtest scores at). The heads per hour are unchanged; only the cut is. A window that exactly pays for itself is now staffed (it was dropped on a tie), so a file where every date needs the same heads cuts as before. `--plain-cut` (CLI; `costCut: false` in `demandShifts` and `backtestSales`) restores the stretch. Under `--short-cost` the backtest's average row is now cut at that weight too, so its rows compare like for like; `eval/cost-cut.mjs` keeps its "avg cut" column as the old plain cut.

Readings (`eval/default-cut.mjs`, output `eval/default-cut.out.txt`; same downloads and SHA-256; minimum staff 1, longest shift 8; paired 95% intervals over 38 and 87 weeks):

- **No flag, short + over:** the priced cut beat the plain cut in all 18 settings (3 splh x shortest shift 3, 4 or 6, both files), every interval below zero. At a 4-hour shortest shift it saved 10.1 to 37.2 person-hours a week on the Korean file (30,000 won: 41.8 to 23.8, -18.0, -22.5 to -13.5; 92.6 scheduled to 59.3) and 7.6 to 33.3 on the French one (40 EUR: 97.0 to 77.9, -19.2, -22.9 to -15.5). At 6 hours: 18.8 to 72.4 and 14.9 to 85.5.
- **The average row under `--short-cost`:** priced at r = 1/3 and 3, it beat its plain cut in all 12 settings, every interval below zero (-5.3 to -52.1 Korean, -8.9 to -60.6 French).
- **Recency adds a little on the French file:** the best priced row there is `--half-life 2` (or the last 4 weeks at a 6-hour shortest shift), 23 to 103 person-hours a week below the old default; on the Korean file the best row is within 0.6 of the priced plain average.
- **What it trades:** the priced default runs shorter. Korean 30,000 won, shortest 4: short 8.4 to 16.1 person-hours a week, over 33.4 to 7.8. Whoever finds a short hour worse than a spare one should give `--short-cost`; the left-unstaffed runs are listed on every plan.

**Joining short runs (2026-11-11, negative result; opt-in `--join`).** The priced cut decides each run shorter than `--min-shift` on its own, so two short runs a few hours apart are never staffed by one shift that covers both, and a short run is never folded into the shift next to it. `--join` (`join: true` in `demandShifts`, `backtestSales` and the `cutShifts` cost) chooses each headcount level whole instead (`joinLevel` in `demand.mjs`, a small dynamic programme over the level's runs): a block covers one or more consecutive runs and the gaps between them, at their exact span when that is at least the shortest shift or a shortest-shift window around them otherwise, priced hour by hour with the same expected-cost rule; a join never covers a shut hour (a lunch closure), and a block over the longest shift must split into pieces no shorter than the shortest. Runs of minimum staff keep the old forward-first stretch unless joined.

Readings (`eval/join-cut.mjs`, output `eval/join-cut.out.txt`; same downloads and SHA-256 as `eval/cost-cut.mjs`; 3 splh x shortest shift 4 or 6 x r 1/3, 1, 3, fractile and average rows, paired 95% intervals over the held-out weeks):

- **In sample it does what it should.** Priced on the whole file's own past dates, the joined cut's expected cost is never above the run-by-run cut's (French bakery, 20 EUR, shortest 6, r = 3: -742.9 to -745.3 weighted person-hours over the weekday rows; 6 of 7 weekday rows change). At r = 1/3 and 1, and on the Korean file at 15,000 won, no row changes at all: the fractile headcount leaves few short runs close enough to join.
- **On held-out weeks it does not pay.** Of 72 comparisons, joined was clearly cheaper in 1 (French 20 EUR, shortest 6, r = 1: -1.0, -1.9 to -0.2), clearly dearer in 16 (all French, +0.1 to +2.3 person-hours a week, at most 1.3% of the week's cost), and within noise in 55. Every Korean row's interval spans zero.
- **Why, as far as the data shows:** the gap hours a join pays for are hours whose past dates rarely needed the extra person, so the join leans on the thin end of the tail, which moves week to week. The old per-run cut's windows already covered a neighbouring run when it fell inside one.

So the default stays the per-run priced cut, and `--join` is there for a shop whose own backtest says otherwise (`--backtest --join`). The gap between the plan and the week is in the forecast, not the cut.


**Picking the half-life from your own weeks (2026-11-11; `--half-life auto`, now the `--from-sales` default).** The two backtests above disagreed on the best weighting (4 weeks on the Korean file, 2 on the French), and a default picked from the same files it is scored on flatters itself. `eval/halflife-default.mjs` (output `eval/halflife-default.out.txt`; same downloads and SHA-256) asked it out of sample, scored as the CLI and page score it (shifts cut, shortest 4, longest 8, short and over costed the same; 2 files x 3 sales-per-labor-hour x minimum staff 1 or 2 = 12 settings, paired 95% intervals over 38 and 87 weeks):

| Against the plain average | clearly better | tie | clearly worse | mean short + over |
|---|---|---|---|---|
| fixed half-life 8 | 5 | 7 | 0 | -2.9% |
| fixed half-life 4 | 5 | 7 | 0 | -4.7% |
| fixed half-life 2 | 6 | 4 | **2** | -6.7% |
| **chosen week by week from the weeks before it** | 6 | 6 | **0** | **-7.4%** |

- **Scored on cut shifts, the Korean shop gains nothing from recency.** All six Korean settings are ties for every weighting (the earlier "half-life 4 beats the average" reading scored headcount profiles, before the priced cut); half-life 2 is clearly worse there at 30,000 and 60,000 won with minimum staff 1 or 2 (+0.3).
- **The French shop gains a lot,** and half-life 2 is best at all six settings (-3.3 to -25.2 person-hours a week).
- **Cross-file:** the fixed half-life that did best on the Korean file (8) used on the French one is clearly better at 5 of 6 settings, mean -5.8%; the French winner (2) used on the Korean one is clearly better at none and clearly worse at 2, mean +1.7%. No fixed number is safe for both.
- **The choice from a shop's own past matched the best fixed number on the French file and stayed with the plain average on the Korean one** (34 of 38 weeks at 30,000 won, minimum 2), never clearly worse anywhere.

So `--from-sales` now defaults to `--half-life auto` (`demand.mjs` `pickHalfLife`): it backtests equal weights and half-lives 8, 4 and 2 on the file (at `--short-cost` when given, picking among the fractile plans) and keeps the one with the least short + over a week; a tie keeps equal weights, and under 4 testable weeks (8 full weeks of dated rows) it keeps equal weights and says so. The rule shipped is the one measured: the pick on all past weeks is what the week-by-week rule would use for the next week. `--half-life none` turns it off; a number fixes it. On the page, type `auto` in the half-life box (opt-in there: it would rerun the backtest as you type, so the pick is cached until the sales or a setting changes). Cost: about 8 s on the 14 MB French file in the CLI, under 1 s on the Korean one. Limits: two bakeries; the candidate set is four weightings, so a shop that needs a 1-week half-life is not offered one; weeks are not independent, so the intervals are a little narrow; tests (`halflife-auto.test.mjs`) use hand-built sales (steady stays equal, growing picks a half-life).


**Staffing to customers, not money: `--count tickets` (2026-11-11).** Every plan above set heads from money: sales per labor hour. If the work is serving people, the number of tickets an hour may be the better driver, and a baguette and a birthday cake take about the same time at the till. `--count tickets` (CLI; "Staff to: customers" on `shifts-from-sales.html`) counts each distinct ticket, order or receipt number once, at the hour of its first row, so `--splh` becomes tickets per labor hour. Ticket numbers that restart each day stay distinct per date. `--count rows` counts every row as one customer, for a file with one row per order and no number. A file with no sales column but a ticket or transaction column is now counted by ticket automatically, with a note; before, it was refused. Everything downstream (half-life auto, `--short-cost`, the priced cut, `--backtest`) runs on the counts unchanged. Tests: `count-tickets.test.mjs` (made-up rows in each real file's shape).

Which driver is right is not in a sales file: that needs a labour standard (minutes per ticket against minutes per euro). `eval/tickets-vs-sales.mjs` (output `eval/tickets-vs-sales.out.txt`; downloads checked by SHA-256, not committed) measures what the choice moves on the two real files that have both, with the ticket rate matched to the sales rate by each file's average ticket:

- **Korean bakery (one row per order, 21,164 won average):** the average ticket barely moves by hour (0.94x to 1.11x the file's), so the two plans are the same within noise at all three rates (paired differences -0.6 to +0.4 person-hours a week).
- **French bakery (136,451 tickets, 4.12 EUR average):** morning tickets are bigger (7:00 1.32x, 8:00 1.17x) and late-afternoon ones smaller (17:00 0.85x, 18:00 0.79x). Planned from tickets, the late afternoon gets more people and the early morning fewer. Scored week by week out of sample (87 weeks), each plan beats the other on its own measure: on the heads tickets needed, the ticket plan is 1.1 to 5.3 person-hours a week closer (intervals below zero at all three rates); on the heads sales needed, the sales plan is 0.3 to 4.8 closer. At 20 EUR (4.85 tickets) per labor hour the ticket plan also runs 341 hours a week against 317, because rounding up many small afternoon hours adds people; at 80 EUR both run 116.
- **The third real file, the "Bread Basket" bakery** (`BreadBasket_DMS.csv`, a widely mirrored Kaggle file described as an Edinburgh bakery's transactions; read from a public GitHub mirror, licence page not read from this session, so not committed; 2016-10-30 to 2017-04-09, columns `Date,Time,Transaction,Item`, no prices at all): read as it came, 9,531 tickets, 20 tested weeks. It could not be planned before today. At 5 tickets per labor hour and minimum staff 1, half-life 4 beats equal weights (-1.6 person-hours a week, CI -2.7 to -0.5) and half-life 8 does too (-0.8); "last week only" is clearly worse (+8.9). Half-life auto picks 4. At 10 and 20 tickets per labor hour the shop rarely needs more than the minimum, and every weighting ties.

So pick the driver by what your staff spend their time on: money when the work scales with what is made or carried (catering orders, a deli counter cutting to weight), tickets when it scales with people at the counter. On a shop whose ticket size is steady through the day, it does not matter. Limits: three bakeries; no labour standard to say which is right; the matched-rate comparison is only a comparison of where the hours go.

**A labour standard: minutes a ticket, a euro and an item (2026-11-12; `--standard`).** The two drivers above are the ends of one line. Paid workforce tools plan from a *labour standard*: the minutes each unit of work takes, summed. `--standard "1.5/ticket + 0.02/sale + 0.3/item"` (CLI; "Staff to: minutes of work" on `shifts-from-sales.html`) gives each row its minutes: a ticket's minutes once, at the hour of its first row, and minutes per unit of money and per item on every row (`readStandard` and `parseStandard` in `demand.mjs`). `--splh` is then minutes of work per labor hour, 60 by default (someone busy every minute; 45 leaves a quarter of each hour for cleaning and restocking). Any one of the three can be used alone; a missing column is named (a ticket number for minutes a ticket, a quantity for minutes an item). Refund lines are left out as before, and the notes give each driver's share of the work. Everything downstream (half-life auto, `--short-cost`, the priced cut, `--backtest`) runs on the minutes unchanged. Tests: `labour-standard.test.mjs` (made-up rows; a ticket-only standard equals `--count tickets` times its minutes), page wiring in `page-sales.test.mjs`, clicked in headless Chromium at 1280 and 390 px (bad standard shows the error, no console errors, no sideways scroll).

What a blend moves, on the French bakery (`eval/labour-standard.mjs`, output `eval/labour-standard.out.txt`; download checked by SHA-256, not committed). The total work is held at the money plan's 40 EUR per labor hour (1.5 min a euro) and the ticket share a of it swept:

- **The ends are the old plans, exactly.** a = 0 gives the money plan's shift lines at 40 EUR (179 h a week), a = 1 the ticket plan's at the matched 9.70 tickets per labor hour (208 h).
- **Between them the afternoon grows.** Hours from 14:00 go 24, 24, 28, 32, 44 as a goes 0, 0.25, 0.5, 0.75, 1; before 10:00 stays 60-62.
- **Tickets are the steadier driver here.** Backtested out of sample against each blend's own target (87 weeks, plain average, shifts cut, closure score), short + over falls from 83.7 to 77.4 person-hours a week, 49.0% to 40.0% of the hours scheduled, as a goes 0 to 1. A driver that moves less from week to week needs less padding for noise; a shop that cannot measure its standard and is torn between the two has that as a tie-breaker.
- **Items add little.** Moving half or all of the work to items (rest split between tickets and money) changes the hours by 13-14 a week and the off share by 0.5-1.3 points.

Limits: one shop; the minutes are swept, not measured (the right ones need a time study at the counter, and no file here has one); scoring each blend against its own target says how predictable the driver is, not which driver is right.

**Fixed work: minutes every trading hour, at opening and at closing (2026-11-12).** Some work does not grow with customers: wiping tables and restocking every hour, setting up in the morning, cleaning down at night. Paid workforce tools put it in the labour standard as fixed minutes, and so does this now: `--standard "1.5/ticket + 10/hour + 30/open + 45/close"` (same box on `shifts-from-sales.html`). A trading hour is a date-hour with at least one sale row; each gets the `/hour` minutes, the first one of each date the `/open` minutes and the last the `/close` minutes (a day that traded one hour gets both). Undated weekday rows are grouped by weekday. An hour the shop was open with no sale at all gets no fixed work (the minimum staff setting covers it), and closing work lands in the last trading hour, not after it. A standard can be fixed work alone. The notes give the fixed minutes and their share of the work. Tests: `labour-standard.test.mjs` (made-up rows: placement, the one-hour day, undated rows, a fixed-only standard, the CLI), page help in `page-sales.test.mjs`.

What it moves, on the French bakery (`eval/fixed-work.mjs`, output `eval/fixed-work.out.txt`; download checked by SHA-256, not committed). Variable work is 6 minutes a ticket (10 tickets per labor hour); the file has 600 trading days and 5,566 trading hours (9.3 a day):

- **Exact.** The fixed terms add exactly their minutes (7/hour + 11/open + 13/close added 53,362 minutes, as counted), and `0/hour` gives the tickets-only shift lines.
- **At the same total work, fixed minutes go to the quiet hours.** Moving a quarter of the work from tickets to 36.8 fixed minutes every trading hour schedules 202 hours a week instead of 184: the afternoon from 14:00 gains 20 (28 to 48) and before 10:00 loses 2, because in the afternoon the shop is quiet and a fixed load lifts a half-busy hour to a second person; 10:00-14:00 is unchanged at 98. Putting the same quarter at the ends instead (171 minutes each at open and close) leaves the total near 186 but triples the person-hours in the first hour of the day (7 to 21 a week).
- **A rate and a fixed term are not the same allowance.** Adding a quarter more work as a slower rate (`--splh 48`) and as fixed minutes every hour cost about the same (230 and 232 hours a week, same split by time of day), but the fixed version puts nearly twice the person-hours in each day's first and last hour (13 and 13 against 7 and 8): a rate scales the allowance with customers, so the quiet ends of the day get almost none of it.
- **The backtest cannot judge it.** Short + over out of sample falls from 41.7% of the scheduled hours (tickets only) to 33.9% with a quarter fixed every hour, but fixed work is as predictable as the trading hours, so that is the target getting easier, not the plan getting better. It is printed to show the size of the effect.

Limits: one shop; the fixed minutes are swept, not measured (a manager's own task list or a time study says what they are); an open hour with no sale is invisible to a sales file.

**Closing work after the last sale hour: `/after-close` and `/before-open` (2026-11-12 later).** `45/close` puts the cleaning down in the last trading hour, between the last customers. Many shops clean down with the doors shut instead: the closer stays on. `--standard "1.5/ticket + 20/before-open + 45/after-close"` (same box on the page; also `pre-open`, `after closing`, `post-close`) puts those minutes in the hour before the first trading hour and the hour after the last, on each date, so the opener comes in early and the closer's shift runs an hour past the last sale. Minimum staff is for serving customers, so it does not apply to an hour that only carries this work (one that sold something on under 1 in 5 of the weekday's dates): there the minutes alone set the heads, at least 1. The backtest scores those hours the same way. A day that trades from 0:00 or until midnight keeps the work in its first or last trading hour (the plan is one calendar day; the note counts them). Tests: `labour-standard.test.mjs` (made-up rows: spellings, placement, the midnight edge, the closer staying on, minimum staff 2 leaving one person to clean, the backtest finding no short or spare hour on a steady shop, the CLI), page help in `page-sales.test.mjs`.

What it moves on the French bakery (`eval/after-close.mjs`, output `eval/after-close.out.txt`; same SHA-256-checked download, not committed), 6 minutes a ticket, the same fixed minutes placed two ways:

- **Exact.** 11/before-open + 13/after-close added 14,400 minutes over 600 trading days, as counted.
- **One person closing: cleaning after close is cheaper.** At minimum staff 1, 45 minutes at close adds 20 scheduled hours a week to the tickets-only plan's 184; the same 45 minutes after close adds 7, one closer-hour a day. Inside the last trading hour the cleaning lifts that hour to a second person, who then takes a 4-hour shortest shift; after close it is one person staying an hour. With 30 minutes to set up as well: 206 (in hours) against 198 (doors shut).
- **Two people closing: cleaning in the last hour is free.** At minimum staff 2, 45 minutes at close adds nothing (218 either way): the two people already have that slack. After close adds 11 hours a week (one person staying on each day, and on Sundays the cut rearranges around a 14:00 that some Sundays trade and others clean). So the answer to "should we clean after closing?" turns on the slack in the last hour, and the plan shows it either way.
- **The backtest cannot rank the two.** Each plan is scored against its own minutes (39.6% against 40.5% short + over at minimum 1; 29.9% against 28.9% at minimum 2), so the numbers show that neither placement makes the plan miss more, not which is right.

Limits: one shop; the minutes are swept, not measured; an hour that sometimes trades and sometimes only cleans keeps minimum staff when it trades on 1 in 5 or more of its dates. (The "one whole hour" limit noted here at first is lifted below.)

**One person staying two hours, or two people locking up: `--shut-min` (2026-11-12, last).** Shut-door work used to go into the one hour after close, so `90/after-close` asked for 2 heads that hour. Nobody waits on a customer with the doors shut, so that work is now planned at 60 minutes a person, whatever `--splh` says, and the rest runs on into the next hour: 90 minutes after a 13:00 close is one person at 13:00 and 14:00, not two people at 13:00 (before-open work runs earlier the same way; past midnight the rest stays in 23:00). `--shut-min <n>` (page: "Staff with the doors shut") is the fewest people on in those hours: 1 by default, 2 if nobody may open or lock up alone. The crew of n then clears n x 60 minutes an hour, so with 2 the 90 minutes is two people for one hour. It is a rule, not a cost: the priced cut never drops a run that is at or under it, even with a cheap `--short-cost` (the first run of the eval caught it doing so: the second closer kept 8 of 14 shut hours a week). The backtest scores shut hours the same way, at 60 minutes a person and the shut-hour minimum. Same change: an hour counts as shut-door only when it carries before-open or after-close work. Before, any rarely traded hour inside the day was marked, so minimum staff 2 fell to 1 there with no such work in the standard (the French bakery's minimum-2 baseline moved from 34.5 to 34.4 short person-hours a week). Tests: `labour-standard.test.mjs` (the spill both ways, a crew of 2, exact minutes, the midnight edge, rate independence, the priced cut keeping two closers under a 4-hour shortest shift, the backtest, the CLI), page wiring in `page-sales.test.mjs`.

**Two closers on late Fridays only: `--shut-min` by weekday (2026-11-12, after that).** A lone-worker rule is often a late-night rule: one person may lock up on a quiet Tuesday, not at 23:00 on a Saturday. `--shut-min "1, Fri/Sat=2"` (page: the same "Staff with the doors shut" box) sets the shut-hour minimum per weekday: one closer Monday to Thursday and Sunday, two on Friday and Saturday. Entries are day names or ranges as in availability (`Fri=2`, `Fri-Sun=2`, `daily=2, Sun=1`; `Fri:2` and `Fri 2` read the same), days not named keep the default (1, or 0 with minimum staff 0), and a later entry wins for the same day. A plain number still means every day. Each weekday's minimum reaches every place the single number did: the crew that clears the shut-door work (two on Friday clear 90 minutes in one hour, one on Monday stays two hours), the headcount floor in those hours, the priced cut (a run at or under that day's floor is never dropped) and the backtest's score. On the French bakery's item lines (6 min a ticket, 30 before open, 45 after close, minimum staff 1, `eval/shut-min-weekday.mjs`, output in `eval/shut-min-weekday.out.txt`): one closer every day plans 198 person-hours a week; two every day 243 (+45); two on Friday and Saturday only 208 (+10), and two on its own two busiest days (Saturday and Sunday by ticket-minutes) 208 as well. The backtest moves with the hours (two every day: 36.4 short and 52.0 over a week against 44.5 and 30.6 for one; Friday/Saturday only: 41.8 and 38.1), because the second closer's 4-hour shortest shift also covers the last trading hours. The minutes are a sweep, not this bakery's own closing routine. Tests: `shut-min-weekday.test.mjs` (parsing and errors, the crew per weekday, Friday-only plan and priced cut, the backtest scoring each weekday at its own floor, the CLI), page wiring in `page-sales.test.mjs`.

What it moves on the French bakery (`eval/shut-crew.mjs`, output `eval/shut-crew.out.txt`; same SHA-256-checked download), 6 minutes a ticket, shifts of 4 to 8 hours, scheduled hours a week:

| after close | min 1, shut 1 | min 1, shut 2 | min 2, shut 1 | min 2, shut 2 |
|---|---|---|---|---|
| none | 184 | - | 218 | - |
| 45 min | 191 | 219 | 225 | 232 |
| 90 min | 202 (212 before this change) | 215 | 232 | 232 |
| 150 min | 213 | 229 | 239 | 246 |

- **Spreading saves hours where one person closes.** 90 minutes after close: 202 hours a week against 212 when it was two heads in one hour, because the second head took a 4-hour shortest shift and now nobody does.
- **A lone-worker rule is the dearest thing here when the shop otherwise runs on one.** Two people to lock up after 45 minutes of cleaning adds 28 hours a week (191 to 219): the second person cannot work a 1-hour shift, so they come in for 4. With 90 or 150 minutes the second person has more of their own to do, so it adds 13 and 16.
- **Where two are on anyway, it is nearly free.** At minimum staff 2 it adds 7 hours (45 min), 0 (90) and 7 (150).
- **At a 45-minute rate** the shut hours are no longer doubled by the rate: 60 minutes after close is one person, where `ceil(60/45)` made it two. The table at rate 45 is in the output file (239 hours a week tickets-only at minimum 1; 45 after close with two locking up, 273).
- **The backtest cannot say whether two closers are worth it.** Each plan is scored against its own rule, so `shut 2` looks less short (38.2 against 44.5 person-hours a week at 45 minutes, minimum 1) because it planned for the second person it then counts as needed. Whether the rule applies is a legal and safety question for the shop, not something a sales file can answer.

Limits: one shop; the minutes are swept; whole hours only (90 minutes is two hours of one person's shift, the last half-idle); the shut-hour minimum is the same every day (late Fridays only is not expressible yet).


**Scoring a staffed closure: `--score-closed` (2026-11-11).** Every backtest above counted minimum staff as needed in every hour the plan staffed. So a plan that kept someone in a locked shop through the French bakery's lunch closure was never "over" there, and the break rule's 9-10 person-hours a week of savings could not be scored: the backtest only saw the 1.2-1.8 extra short hours on the few days that sold something at 14:00. `--score-closed` (`scoreClosed: true` in `backtestSales`) counts minimum staff as needed only in an hour the shop normally trades (on 1 in 5 or more of that weekday's dates across the whole file) or one that sold something on that date. The plans still learn only from earlier weeks; the scorer's view of the trading day uses the whole file, and it is the same reference whatever rules the plan used, so `--keep-rare` and the default rules are scored against the same hours. Test: `score-closed.test.mjs` (a made-up shop in the French file's shape: the old score preferred the plan that staffs the closure, 7.0 against 7.8 person-hours off a week; the new one prefers the one that shuts it, 13.4 against 19.6).

Readings (`eval/closure-score.mjs`, output `eval/closure-score.out.txt`; the same three downloads, checked by SHA-256, not committed; the plain average, shifts cut, 6 settings per file):

- **French bakery (87 weeks).** Under the old score, turning the break and rare-hour rules off (`--keep-rare`) looked 1.0-1.9 person-hours a week *better*. Under the new score it is 6.4-15.1 worse at all six settings, intervals well above zero. The rules were right; the old score could not see it. The best weighting is unchanged (half-life 2).
- **Korean bakery (38 weeks).** Rules off: 0.1-1.9 worse under the old score, 6.9-14.1 worse under the new.
- **Bread Basket (20 weeks, tickets).** The new score exposed a fault in the planning rule, now fixed: an edge hour with sales on under 1 in 20 of a weekday's dates no longer stretches the day, but with 20 or fewer dates that test can never trim anything, and every tested week of this file has 21 or fewer. One stray 22:00 or 23:00 order kept every Saturday staffed until midnight. Now an edge hour that traded on only one date does not stretch the day either, once the weekday has 4 or more dates (`headcount` in `demand.mjs`). Scored with `--score-closed`, the plain plan's short + over fell from 55.8 to 44.0 person-hours a week (5 tickets per labor hour, minimum 1), 60.0 to 35.9 (minimum 2), 34.0 to 22.1 and 50.2 to 26.1 (10 tickets), and it schedules 14-27 fewer hours a week; on the Korean bakery 1.3-2.8 fewer person-hours off; on the French one within 0.1. Under the old score the same change reads 0.2-0.7 worse, as it must: that score counted every hour the plan staffed as needed.
- **What it still shows on Bread Basket:** "last 4 weeks only" now beats the plain average clearly at all six settings under the new score (the plan still staffs hours the shop stopped opening during the file: 18:00 traded on 12 of 30 November dates and 2 of 31 March ones). Half-life auto does not offer a 4-week window, so this is the next thing to test. On the Korean bakery the best weighting is unchanged at 5 of 6 settings.

`--score-closed` was opt-in until 2026-11-12, when it became the default (below). Earlier readings in this README and the committed `eval/*.out.txt` were taken before the one-date edge rule, so the Korean values can differ from a fresh run by up to about 4 scheduled hours a week; the French ones by under 0.5.

**A 4-week window in half-life auto (2026-11-11; `--last-weeks <n>`, and auto under `--score-closed`).** Bread Basket's "last 4 weeks only" win above was read in sample; adding a candidate to auto also lets it overfit more. `eval/window-auto.mjs` (output `eval/window-auto.out.txt`; the same three downloads, SHA-256 checked) asked it out of sample: at every tested week, auto uses the candidate with the least short + over over the weeks already tested (plain until 4 earlier weeks exist), with set A = equal weights and half-lives 8/4/2 (shipped), B = A plus last 4 weeks, C = B plus last week. 3 files x 3 rates x minimum staff 1 or 2 = 18 settings per score. The rule was written in the script before the first run: B replaces A if, under the default score, it is clearly worse in none and lower on average.

| auto set vs A (clearly better / tie / clearly worse, mean) | default score | `--score-closed` |
|---|---|---|
| B (adds last 4 weeks) | 0 / 18 / 0, +0.2% | **6 / 12 / 0, -16.3%** |
| C (adds last 4 weeks and last week) | 0 / 18 / 0, +0.2% | 6 / 12 / 0, -14.9% |

By file under `--score-closed`, B against A: Bread Basket -46.8% (5 tickets per labor hour, minimum 2: 36.1 to 19.4 person-hours off a week, CI -22.5 to -10.9), Korean -2.6%, French +0.4% (no setting clearly worse). Under the default score the window only matters on the French file (+0.6%), where it is never clearly worse but never helps.

So B failed its pre-registered rule under the default score and is **not** offered there: plain `--from-sales` is unchanged. Under `--score-closed` it is: `--from-sales ... --score-closed` now makes half-life auto backtest on that score and offer "the last 4 weeks only" (`pickHalfLife` in `demand.mjs`); last week alone (C) adds nothing and is not offered. `--last-weeks <n>` fixes a window by hand and turns auto off (the plan reads the dated rows of the n weeks before the week after the newest date, the rows the backtest's window method trains on; undated weekday rows are kept). Tests: `halflife-auto.test.mjs` (a made-up shop that moved its close from 17:00 to 15:00 after 3 of 20 weeks: under `--score-closed` auto picks the window and no shift runs past 15:00; the default score never offers it; `--score-closed` and `--last-weeks 4` give the same shifts). Limits: three bakeries, the window's win is mostly one (a shop whose hours shrank during the file); the scorer's view of which hours are normally shut uses the whole file, so on a file whose hours changed the window is partly scored against hindsight it does not use; weeks are not independent. The page does not offer `--score-closed` or the window yet.

**The fourth file agrees (2026-11-11; `eval/fourth-file.mjs`, output `eval/fourth-file.out.txt`).** Both items above waited on a fourth real file. It is UCI "Online Retail II" (Chen, 2019, CC BY 4.0): a UK online gift wholesaler's invoice lines, 2009-12-01 to 2011-12-09, 1,067,371 rows (UCI refused this session's connection; read from a GitHub LFS mirror whose SHA-256 is the pointer's oid; not committed). It is not a shop with a counter: staffing it means staffing order intake and dispatch. First it could not be read at all: `InvoiceDate` and `UnitPrice` matched no header, because `norm` did not split camelCase. Now it does (`InvoiceDate` is "invoice date", `UnitPrice` "unit price", `CustomerID` "customer id"), "invoice date" is a date-time synonym, and "invoice" / "invoice id" count as ticket columns. Test: `demand.test.mjs` (made-up rows in that export's shape). Read as quantity x price, 1,047,873 rows, 19,498 refund lines left out, Saturdays closed (traded on 1 of 105), 101 tested weeks.

The test was written in the script before the first run: the file agrees if, at all 6 settings (2,000, 4,000 and 8,000 GBP per labor hour x minimum staff 1 or 2), under `--score-closed` (1) turning the closure and rare-hour rules off is not clearly better and (2) auto B (with the last 4 weeks) is clearly worse than auto A in none. Result: **6 of 6 on both.**

- **(1) Rules off is worse under the new score at every setting,** +3.4 to +7.4 person-hours a week (intervals well above zero). Under the old score it reads -0.1 at 5 of 6, the same blind spot as the French file.
- **(2) Auto B beats auto A under the new score at every setting,** -5.0 to -14.5 person-hours a week, intervals all below zero; B takes the 4-week window in 93-97 of 101 weeks. Under the old score B and A pick identically (0.0 at all 6). "Last 4 weeks only" alone beats the plain average by 6.4 to 14.9.
- **Why the window wins here, as far as the file shows:** the new score charges staffing an hour that is normally shut, and four weeks forget edge hours that stopped trading faster than a half-life does. The other run's caveat applies with more force on a 101-week file: the scorer's view of which hours are normally shut uses the whole file, so part of the window's gain is scored against hindsight the plan does not use.

So by the pre-registered rule, `--score-closed` can become the `--backtest` and half-life-auto default and the window can be offered there; that switch is the next step (it moves many tests that pin the old score). Limits: one non-shop business; four files in all, two of them carrying most of the window's gain.

**The closure score is the default, and most of the window's gain is not hindsight (2026-11-12; `eval/hindsight-closure.mjs`, output `eval/hindsight-closure.out.txt`).** The step the fourth file cleared is taken: `--backtest` and half-life auto now score a staffed closure as over by default (`backtestSales` and `pickHalfLife` treat `scoreClosed` as on unless it is `false`), and auto offers "the last 4 weeks only" there. Plain `--from-sales` (auto is its default) can therefore plan from the last 4 weeks when they test best. `--score-open-hours` is the old score (and auto chooses among the four weightings only); `--score-closed` is kept as a name for the default. The page has both: a box under the half-life field, "In the tests, a person staffed while the shop is normally shut counts as spare", on by default, used by auto and by "Test on my past weeks", and the window auto picks now reaches the planned shifts there (before, the page passed only the half-life on). The eval scripts that measured the old score now pass `scoreClosed: false`, so their committed outputs still reproduce.

The open caveat above was that the scorer decides which hours are "normally shut" from the whole file, the tested week's future included, and the window is the method that follows a change in opening hours fastest. `backtestSales(..., { closedFrom: "past" })` builds the reference for each tested week from the dates before it only. On the same 18 settings as `eval/window-auto.mjs`, with a rule written in the script before the first run (the window stays in auto if, with the past-only reference, auto B is clearly worse than auto A in none and lower on average):

| auto B (adds last 4 weeks) vs A | clearly better / tie / clearly worse | mean | French | Korean | Bread Basket |
|---|---|---|---|---|---|
| whole-file reference (shipped) | 6 / 12 / 0 | -16.3% | +0.4% | -2.6% | -46.8% |
| past-only reference | 6 / 12 / 0 | **-12.5%** | +0.5% | -3.1% | -35.0% |

So the window stays: about 77% of its relative gain survives without hindsight. In person-hours the hindsight share is larger on Bread Basket, the file whose hours shrank: at 5 tickets per labor hour and minimum 2 the gain falls from 16.7 to 7.8 person-hours a week (CI -13.1 to -2.4), and at minimum 1 from 5.8 to 1.4 (now a tie). Part of that is the plain plan scoring better too (35.9 to 24.2 there), because a past-only reference still calls the old late hours "open" for a few weeks after the shop stopped opening them. The whole-file reference stays the default: when you run the backtest, the whole file is your past. Test: `score-closed.test.mjs` (the default equals `scoreClosed: true`; `--score-open-hours` turns it off) and `halflife-auto.test.mjs` (the made-up shop that moved its close to 15:00: plain `--from-sales` now gives the `--last-weeks 4` shifts). Limits as before: four files, the window's gain mostly one of them; weeks are not independent.

**Date order (2026-11-10).** `--from-sales` read `05/03/2026` as May 3 without a word. A slash or dash date over 12 in the first or second place now settles the order for the whole file; when none does, it reads month first and prints a note. Compact stamps (`20260305 1400`, `20260305T140000Z`) read too. Tests in `demand.test.mjs` (24 pass). Made-up rows only.
## Trade pages (2026-10-30)

[`daycare-staff-schedule.html`](daycare-staff-schedule.html) and
[`coffee-shop-staff-schedule.html`](coffee-shop-staff-schedule.html) show a
week for that trade; the coffee-shop page uses real CLI output, pinned by a test.

## Limits

Not modelled: predictive-scheduling and fair-workweek rules as built-in law (the changes report prices a rule you enter), breaks as a hard rule (unpaid meal breaks are deducted from paid time; suggested meal-break times, and from 2026-10-30 paid rest breaks of the length and spacing you enter via `placeRestBreaks`, are shown but not enforced by the search), minor-labor limits other than the federal 14-15 rules in `age:` (state rules, work permits), union rules (seniority is reported, not enforced), time-off across weeks. A
heuristic search by default; the exact check above proves optimality only on small weeks and reports when it could not. Verified against exhaustive search and invented data.
Known gaps from quality audit round 84 ([`2026-11-19-shift-roster-builder-r4.json`](../../portfolio/quality/audits/2026-11-19-shift-roster-builder-r4.json)): the planner's daily overtime puts every hour of an overnight shift on the day it starts (Sat 8pm-6am with daily overtime after 8 h shows 2 overtime hours; the timesheet's calendar-day split shows none), and a 14-15 year old in a school week is capped at 3 h on every day, weekends included, where 29 CFR 570.35(a) allows 8 h on a non-school day, so a 6 h Saturday shift is left open.
Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. FSL-1.1-MIT licensed.

**Split-shift and spread-of-hours premium, for scale (2026-10-29).** Give the page your local minimum wage and the notice prices one extra hour at that wage for every person-day with an unpaid gap over 1 hour or a first-to-last span over 10 hours (`splitShiftPay` in `calc.mjs`; `premiumHours`, `splitGap`, `spread` and a California-style wage `credit` are options). Tested on hand-built weeks only; which places owe it, for whom, is the employer's to check.

**Seventh-day premium, for scale.** When someone works all seven days, the notice adds what a seventh-consecutive-day premium would cost if you applied 1.5x for the first 8 hours of Sunday and 2x after (extra over straight time, burden included; `seventhDayPay` in `calc.mjs`, which takes your own multipliers). It assumes a Monday workweek start and is not priced by the search or a statement of what any state requires.

**Sick-call finder.** After a roster is built, pick any shift (or an open one) to see who could take it without changing anyone else's week, cheapest first with overtime flagged, and which rule blocks everyone else (`coverOptions` in `calc.mjs`).

**Schedule flags.** After a build, the page flags days over 8 hours, split shifts with a gap over an hour, and a week that starts inside 14 days of today when you give the Monday (`scheduleFlags` in `calc.mjs`). These are heads-ups for daily-overtime, split-shift, meal-break (a straight stretch over 5 hours, back-to-back shifts joined; breaks are not scheduled) and fair-workweek rules the search does not enforce. It also flags a straight stretch over 5 hours (back-to-back shifts joined) as a meal-break heads-up; breaks are not scheduled.

**Wall copy.** "Print a wall copy" prints only the week grid (names and shifts, titled with the Monday if you gave it), with no wages, payroll or notices, so it can be posted in the break room (`@media print` in `index.html`).

**Shift swaps.** The same panel also lists one-for-one trades for the chosen shift: another person takes it and hands back one of theirs, with both weeks still passing every hard rule and the payroll change of the pair, so a swap request can be answered even when nobody can take the shift outright (`swapOptions` in `calc.mjs`).

**Each day against sales.** Optionally give sales for Monday to Sunday and the report adds a per-day table of scheduled hours, base-wage payroll (plus extras) and labor share of that day's sales, with the highest-share day marked, so a slow Tuesday stacked with staff stands out (`dailyLabor` in `calc.mjs`). Overtime premiums are priced weekly and are not spread over days.

**Getting under budget.** When you give projected sales and a target labor %, and the roster is over it, the report lists the biggest single payroll savings from dropping one assignment, safe cuts first (another person still works that shift), flagging cuts that leave a shift empty or put someone under their minimum hours (`trimOptions` in `calc.mjs`). Savings are per cut and do not add up exactly, because overtime is priced across the week. It lists options; it does not re-run the roster.

**Spreading tough shifts.** Set "Spread weekend, closing and opening shifts" (0-100, default 0 = off) and the search penalises each person's squared count of those shifts, so a fixed number of them is shared out evenly; it never leaves a shift open to do so (`toughBalance`, `toughPenalty` in `calc.mjs`).

**Fairness across weeks.** Add `tough: 3` to a person's row (weekend, closing and opening shifts they worked recently) and, when the spread setting is above 0, each new tough shift costs more for them than for someone with a lighter history, so the closes rotate instead of landing on the same people every week. "Carry over last week" fills it in: last week's tough shifts plus half of the old tally, so older weeks fade (`toughCounts`, `carryOverStaff`, `toughPenalty` in `calc.mjs`).

**Who gets the tough shifts.** The report counts each person's weekend, closing (10pm or later, or past midnight) and opening (6am or earlier) shifts and says so when the spread is 3 or more, so one person is not quietly handed every close. A report; the search balances it only when you raise the spread setting above (`fairnessReport` in `calc.mjs`).

**Changes since you posted it.** Choose the roster CSV you posted, give the Monday and when you made the change, and the report lists every shift that was added, cancelled or moved, the notice each got, and the premium pay under a rule you enter yourself (notice window in hours, premium in hours of pay, names of employee-requested changes left out). Fair-workweek laws differ by city and change, so the tool ships no jurisdiction presets and states no legal requirement; it does the arithmetic on your numbers (`parseRosterCsv`, `scheduleChanges` in `calc.mjs`).

**Weekly-hours line.** Optionally give an hours line to watch (for example 30, where some employers owe health coverage or benefits) and the report lists who is at or over it and who is within 2 hours under, so a few hours can be moved on purpose. A list only: it does not enforce the line and states no legal requirement (`hoursThresholds` in `calc.mjs`).

**Meal-break times.** For every straight stretch over 5 hours the page suggests a 30-minute break that begins before the 5th hour and is staggered so the most other people stay on the clock, and says when nobody else would be on (`placeBreaks` in `calc.mjs`). A greedy planning aid, not enforced by the search.

**Out for several days.** Pick a person and the days they are out and every shift they hold on those days is handed to someone else, the fewest-options shift first and each to the cheapest person who can take it, with the roster updated between hand-overs so nobody is double-booked or pushed past a weekly, daily, rest or days-in-a-row rule. Nobody else's existing shifts move; a shift nobody can take stays open with the rule that blocks each candidate. A greedy plan, not a proof of the cheapest split (`absencePlan` in `calc.mjs`, built on the sick-call finder).

**Trade check on the CLI (2026-11-05).** `--swap "Tue 17:00,Sat 09:00"` runs `checkTrade` (the page's trade checker) from a terminal: the owners of the two shifts exchange them, and it says whether both weeks stay inside every hard rule, which rule stops each person if not, and the payroll change of the pair. Unit-tested on hand-built weeks (`cli.test.mjs`), not on a real team.

**Fewest-moves cover.** When nobody is free to take a called-out or open shift outright, `coverChain` (`calc.mjs`) searches chains of hand-overs, one person taking it and giving up a shift that a third takes, up to `maxMoves` shifts in all (default 3), re-checking every hard rule for each person touched. Fewest shifts moved first, then lowest pay change; exhaustive inside the limit, nothing claimed beyond it. Tested on hand-built weeks (`calc.test.mjs`); on the CLI since 2026-11-01 as `--cover "Tue 17:00"` (direct takers first, else the chains; `--max-moves n`), and on the page's cover finder since 2026-11-05 ("Or hand shifts over", shown only when nobody can take the shift outright; checked in Chromium on the hand-built week of the test above, plus a source test), not on a real team.

**Post for the open shifts.** "Write one post for the open shifts" makes a single message for the team chat listing every shift still open (dated when you give the Monday) and, from the sick-call finder, anyone who could take it without moving another shift; with nobody listed it invites anyone free to claim it. No pay figures (`openShiftPost` in `calc.mjs`).

**Does the spread setting work over a month? (measured 2026-10-22)** `node eval/fairness-bench.mjs`: 12 seeded crews of 6-8 people, 8 weeks each, 17 shifts a week including weekends, closes to 23:00 and 6:00 opens, everyone able to work any of them (so who gets the tough shifts is a pure choice). Largest minus smallest tough-shift total per crew, averaged: 13.2 at spread 0, 4.5 at 40, 3.2 at 100; standard deviation 4.7, 1.8, 1.2; crews the plan flags as unfair 4 of 12, 0, 0. Mean 8-week payroll $18,820, $18,888, $18,901 (+0.4% at 100), no open hours in any. So the setting does what it says and costs little on crews with equal availability; crews where only a few people can close have less room to even out, and this bench does not test that. Synthetic crews only.

**The same bench when only a third can close (measured 2026-10-29).** `node eval/fairness-bench.mjs 12 8 narrow`: same 12 seeded crews, but every third person can work any hour and the rest only 6:00-20:00, so only about a third of the crew can take the 14-23 close. Largest minus smallest tough-shift total, averaged: 15.3 at spread 0, 10.6 at 40, 9.6 at 100 (against 13.2, 4.5, 3.2 with open availability); crews the plan flags as unfair 8 of 12, 3, 3. Payroll $18,587, $18,616, $18,628 (+0.2%). Mean open hours 18.0 in every setting: the closes the day-only people cannot work are the same open hours whatever the spread. So the setting still helps (a third less spread) but cannot even out what availability forbids: the remaining spread is the closers carrying the closes, and the fix is wider availability (see the widening guide), not a higher setting. Synthetic crews, one availability pattern, one run (about 5 minutes).

**Plan several weeks.** "Plan weeks" builds up to 8 consecutive weeks from one setup. Each week starts from the one before: the rest gap and the running `tough:` tally carry over exactly as in "Carry over last week", people with no shift last week lose a stale `prev:`, and dated `off:` entries land only in the week they fall in. The table shows open shifts, overtime and payroll per week with a CSV for each (`planWeeks` in `calc.mjs`). Each week is solved on its own, not jointly, so it is a rolling plan rather than a proof of the cheapest month.

**Long pass when shifts stay open (2026-10-24).** If shifts are still open after the restarts, `buildRoster` now runs `options.longPass` (default on): four more restarts at five times the iterations, before the ejection passes. `eval/effort-bench.mjs` (seeded weeks, 5 per size, against a 60 x 40000 reference run): no change in open hours at 6x14, 8x18, 8x22 and 10x28 (the old default was already at or within 2 h of the reference on 4 of 5 sizes; 8x22 sat 2 h above it on one week, the long pass did not close that), +20 to +80 ms per week. On the earlier probe weeks (8 people x 22 shifts, seed 20261030) it cut one week from 9 to 5 open hours and left a week at 62 h that 4 restarts x 40000 iterations brought to 57 h, so the long pass is a small, not a reliable, gain; the next step is more iterations on the first pass only for weeks the flow bound says are coverable. Synthetic weeks only.

## Is the unproven 8 x 22 week short on search or on the bound? (2026-10-24)

`ONLY=3 node eval/case-bench.mjs N MS` reruns the four seeded 8 x 22 weeks of `scale-bench.mjs` (seed 20261022 + 8*100 + 22) with one chosen week and any budget. At the default 100,000 nodes / 20 s the four weeks are: 57 h open and coverage proven, 4 h proven, 98 h proven (the exact search improved the roster), and week 3 at 36 h open against a proven floor of 35 h. Giving week 3 twenty times the budget (2,000,000 nodes, 400 s limit, 6 m 41 s) leaves it exactly there: 36 open, floor 35, gap 100,013 score units against 100,117 before. So the extra hour is not a search-time problem: either one hour is uncoverable and the bound is loose by one hour, or a 35 h roster exists that annealing and the exact search both miss. Which one is still unknown; the six open shifts (Wed 7-14, Wed 14-21, Thu 7-11, Thu 10-14, Thu 12-20, Fri 14-20) are in `DUMP=1` output. More nodes will not settle it; a tighter bound (pair cuts on the contested Wednesday and Thursday shifts) or a different exact method will. One week, one run, synthetic crew.

**Independent ILP cross-check (2026-10-26).** `node eval/ilp-export.mjs P S 4 > w.json && python3 eval/ilp-check.py w.json` (needs `pip install scipy`) writes the seeded weeks of `scale-bench.mjs` out and solves the same hard rules (availability, one person per shift copy, no overlap, rest gap, weekly cap; no pay terms) as an integer program with HiGHS, to get the true least open hours. Every one of the 12 weeks (four each at 8x22, 10x28, 12x30) solved to optimality in under 1 s. Results: 8x22 weeks 57, 4, 98 and **35 h** (the engine's roster left 57, 4, 98 and 36: the "is the extra hour real?" question under the case-bench note is answered, a 35 h roster exists and annealing plus the exact search missed it); 10x28 weeks 110, 93, 57, 78 h against engine rosters of 111, 93, 59, 78 and engine floors of 110, 92, 57, 76; 12x30 weeks 92, 75, 47, 22 h against rosters 92, 75, 47, 24 and floors 92, 72, 46, 22. So the engine's floor is always valid (never above the optimum) but is below it on 7 of the 12 weeks, and the roster is 1 to 2 h above it on 5. The coverage pass's 20 s limit is not the issue: an LP relaxation with cuts plus branching settles these in well under a second. Synthetic weeks, hard rules only (the ILP says nothing about the cost terms, so a week with the same open hours can still differ in pay). Next lever: bring LP-based bounding and branching into the coverage pass.

**Coverage plateau pass (2026-10-31).** `coverPass` and `polishPay` in `calc.mjs`, run when shifts are still open after the ejection chains (turn off with `coverPass: false`). Pay only breaks ties in the earlier passes, so the roster can sit where no single chain frees the last hour without first undoing a cheap assignment. This pass counts open hours only: it walks the plateau (moves a covered shift to another person at no coverage cost), pulls open shifts in by ejection chains, and takes a worse step at a falling temperature; the better roster is then polished for pay with moves and swaps that never lose coverage. Measured against the ILP above on the same 12 seeded weeks: the engine's roster now equals the true least open hours on **all 12** (8x22: 57, 4, 98, 35; 10x28: 110, 93, 57, 78; 12x30: 92, 75, 47, 22), where before it was 1 to 2 h above on 6 (the 8x22 week 3 36 h, now 35 h). Cost: up to about 18 s a week at 8x22 when shifts stay open (it only runs then). The sample-cafe pages moved with it (the 14-15 year-old and widening tables, e.g. Cleo and Eli in a school week now leave 7 open, not 8; page tests updated). Still open: the proven floor is below the optimum on 7 of 12 weeks, so "coverage proven" is still not claimed on those; the pass finds the roster, it does not prove it. Synthetic weeks, hard rules for the ILP check.

**More plateau walks (2026-10-26).** The ILP check on all 8 seeded 10x28 weeks (`node eval/ilp-export.mjs 10 28 8`; the earlier tables used 4) showed two weeks where the engine's roster was above the optimum while its proven floor already equalled it: week 5 left 94 h open against 89, week 7 left 65 against 61. So the gap was in the search, not the proof. `coverPass` ran 3 times at `max(60000, 4000 x shifts)` steps; `coverPassRuns` and `coverPassScale` now set that (defaults 12 and 4). Result on the same weeks: week 5 reaches 89 (optimum), week 7 62 (optimum 61), and the other six weeks match the HiGHS optimum (110, 93, 57, 78, 99, 39 h). 30 runs at 4x and 12 runs at 8x both stay at 62 on week 7, so more of the same walk does not close the last hour; a different neighbourhood would. More branching on the floor does not help either: `coverBranchNodes` 400 and `coverBranchMs` 20000 left the same four 10x28 weeks without a coverage proof as the defaults. Cost: about 5-10 s more on a week that still has open shifts. One seeded set, hard rules only; the 142 tests in `calc.test.mjs` and `cli.test.mjs` pass. Next: the last hour on 10x28 week 7 the 12x30 weeks, then the pay bound.

**Three-person chain in the plateau walk, tried and dropped (2026-10-26).** `eval/cover-bench.mjs 10 28 8 6` prints open hours against the floor for 10x28 weeks 7 and 8. A fourth `coverPass` move (open shift to q, who gives up j to r, who gives up k to s or leaves it open) at 10%, 25% and 50% of steps left week 7 at 62 to 64 h (optimum 61, floor 61) and week 8 at 39; the share changes the random stream, so 62 is no better than the plain walk and 63 and 64 are worse. Longer random chains are not what closes the hour; the code was reverted. Next for it: an exact repair (fix the roster's other shifts and solve the open hours as a small matching/ILP), or the person-day clique cut.

**Branching on the open-hours price (2026-10-26).** The coverage floor from `openFloorByPricing` is the root price, and the root leaves an integrality gap. The same branch-and-bound as `branchDual` now runs on it (`coverBranch`, default on; `coverBranchNodes` 60, `coverBranchMs` 4000): every held set is worth 0 and an open shift costs its hours, so branching on the most contested shift (held by one of its candidates, or open) and re-pricing the pieces raises a valid lower bound on open hours, rounded up to the shifts' hour grid. `node eval/ilp-export.mjs P S 4` prints `engineOpen/engineFloor` per week (`NOCB=1` turns it off); against the HiGHS optima above, proven floor before -> after:

| size | optimum (h) | floor before | floor after |
|---|---|---|---|
| 8x22 | 57, 4, 98, 35 | 55, 4, 98, 35 | 57, 4, 98, 35 |
| 10x28 | 110, 93, 57, 78 | 110, 92, 57, 76 | 110, 93, 57, 77 |
| 12x30 | 92, 75, 47, 22 | 92, 72, 46, 22 | 92, 72, 47, 22 |

The floor is below the optimum on 2 of 12 weeks, down from 7 (10x28 week 3 by 1 h, 12x30 week 1 by 3 h). It is still a valid bound (never above the optimum on any of the 12); the 190 venture tests pass. One run, synthetic weeks, hard rules only. In that run 12x30 week 3 left 23 h open, not 22, with the tests running beside it: the plateau pass is time-limited, so its result moves with load. Next: a cut for the 12x30 week 1 gap, then the pay bound once coverage is proven.

**More branching does not close the last gaps (2026-10-26).** `CBN=600 CBMS=40000 node eval/ilp-export.mjs P S 4` (10x the nodes and 10x the time of the defaults) on 12x30 and 10x28: floors 92, 72, 47, 22 and 110, 93, 57, 77, exactly the defaults' (engine open hours 92, 75, 47, 23 and 110, 93, 57, 78; 12x30 week 3 again 1 h above the 22 h optimum under load). So the 12x30 week 1 gap (floor 72 against 75) and the 10x28 week 4 gap (77 against 78) are relaxation gaps that search time will not close; they need a stronger relaxation (person-day clique or LP cuts). Synthetic weeks, one run.

**Exact repair of the open hours (`coverRepair`, 2026-10-26).** The plateau walk could not close the last hour on 10x28 week 7 (62 h open, ILP optimum 61) because that needs several people to change at once. `coverRepair` in `calc.mjs` is a large-neighbourhood search: pick 3 people at random, release every shift they hold, and solve those shifts plus the open ones exactly for the fewest open hours with everyone else fixed (depth-first, longest shift first, pruned on open hours so far; 60 rounds, 6 s, `coverRepairPeople`, `coverRepairRounds`, `coverRepairMs`). It runs after the plateau pass when shifts are still open, and only when the exact check is on (`exact: true`, `--prove`) or `coverRepair: true`, because it changes the default rosters that the guide pages quote. Measured with `node eval/cover-bench.mjs` against the HiGHS optima above: 10x28 week 7 now 61 h (optimum), week 8 unchanged at 39 (week 5 not re-run); all four 12x30 weeks at their optima (92, 75, 47, 22), including week 4, which the plateau pass alone left at 23 to 24 h under load. On the sample café with the rest rule off, the default search leaves 16 hours open and `coverRepair: true` leaves 15, the proven least (test in `calc.test.mjs`). Synthetic weeks, hard rules only; the proven floor is unchanged, so this finds the roster, it does not prove it. **Node budget, 2026-10-27.** The search now ends on a node budget (`coverRepairNodes`, default 3,000,000, checked between rounds; `coverRepairMs` is only a 60 s safety stop), not a 6 s clock, so the same input gives the same roster on any machine (test in `calc.test.mjs`). Making it the default was tried and not kept: with it on, `calc.test.mjs` and `page.test.mjs` run 156 tests in 427 s with 9 failing, the seven guide pages' tables and the repair-off baseline (the sample café moves from 216 h for $3,622 to the 220 h the exact check finds), so the default stays off until those tables are re-derived and the run time is cut. Tried 2026-10-26 and dropped: pruning on hours no picked person can take (a forced-open bound) gave identical rosters and no speedup on the 12x30 weeks (`node eval/cover-bench.mjs 12 30 4`: 115 s against 114 s), so the cost is in the plateau pass and the exact check, not the repair tree. **Default-on measured, 2026-10-27, and kept off.** With `coverRepair` on by default the sample café goes from 19 open hours (216 of 235 covered) to 15 (220 covered), payroll $3,622 to $3,690, but open *shifts* rise from 3 to 5: the repair minimises open hours, so it prefers leaving two short shifts empty to one long one. The full suite took 547 s and 9 of 157 tests failed (the repair-off baseline test and the eight guide-page tables: clopening 2 to 5 open shifts, 14-15 year olds 3 to 5, time-off 3 to 5, labor cost $3,622 to $3,690). A manager reading "5 shifts open" where the old page said 3 is not clearly better served, so the default stays off. Next: an open-shift tiebreak (fewest open shifts at equal open hours, or a weighted objective) before any default change; then the 12x30 week 1 cut.

**Open-shift tiebreak in `coverRepair` (2026-10-28).** The repair's objective is now open hours plus a count term far below one minute, so at equal open hours it keeps the roster with fewer open shifts, and the caller accepts a repair that only lowers the shift count. Measured on the sample café with `coverRepair` on: still 15 open hours across 5 open shifts, against 19 hours across 3 with it off, so inside the 3-person neighbourhoods the fewer-hours roster really needs the five short shifts open; the tiebreak does not remove the trade-off, it only stops the repair choosing more open shifts than necessary. The default stays off. Next: a weighted objective (an open shift costs a fixed number of hours) chosen by the manager, then the 12x30 week 1 cut. **Weighted objective, `openShiftWeight` (2026-10-28).** An option now prices one open shift in hours (default 1e-6, the tiebreak above). The repair minimises open hours + weight x open shifts, and the caller accepts it only when that sum falls. Measured on the sample café with `coverRepair: true`: weight 0 gives 15 open hours over 5 shifts; weight 100 gives 19 hours over 3 (the same 3 shifts the repair-off roster leaves), so a manager who hates empty slots more than empty hours can say so (test in `calc.test.mjs`). **Page and CLI control (2026-10-27).** `--open-shift-hours <h>` (0 to 1000) on the CLI and an "If some shifts must stay open" select on the page (standard build, fewest hours open = weight 0, fewest shifts open = weight 100) now set `openShiftWeight`. Setting a weight turns `coverRepair` on (the library treats an explicit weight as a request for the repair), so the standard build and the guide pages' tables are unchanged. Sample cafe through the CLI path: weight 100 leaves 3 shifts open, weight 0 leaves 5 (`cli.test.mjs`); the page wiring is a source test (`page.test.mjs`), not run in a browser. The call-out guide page's table test fails on this container with or without this change (24 against 22 expected; it depends on the exact search's time limit), so it is a slow-machine fault to re-derive, not a regression here. Next: the 12x30 week 1 cut (clique cut).

**The clique cut will not close the 12x30 week 2 gap; no LP relaxation does (measured 2026-10-28).** `eval/relaxation-check.py` (HiGHS via scipy; hard rules only, same weeks as `ilp-check.py`: `node eval/ilp-export.mjs 12 30 2 > w.json && python3 eval/relaxation-check.py w.json 1`) solves four relaxations of the least-open-hours problem. On the week the engine leaves 75 h open with a floor of 72 (the ILP optimum is 75): pairwise-conflict LP 46.0; every maximal clique of each person's conflict graph 68.0 (below the engine's own flow floor, so a clique cut on the flow adds nothing); cliques plus 30 rounds of weekly-hours cover cuts 68.4; Dantzig-Wolfe over all 5,948 feasible shift sets of the 12 people 72.33, the strongest LP there is for these rules. Hours are whole here, so that proves at least 73, one above the floor, still two short of 75. On week 1 (floor and optimum 92) the cliques and the Dantzig-Wolfe LP both reach 92, so cuts matter only where the gap is. So the gap is integrality of the per-person schedules, not a missing cut. Synthetic weeks, one gap case. Next: branch-and-price (the Dantzig-Wolfe LP above as the bound at each node) or accept the 2 to 3 hour gap on 12x30 and take the joint multi-week solve; the tighter pay bound once coverage is proven stays after those.

**A joint multi-week solve cannot help coverage (measured 2026-11-01).** `planWeeks` solves each week on its own, so the open question was what that costs against solving weeks together. `node eval/rolling-gap-bench.mjs 10 28 4 4` plans 4 weeks for 4 seeded 10x28 sets (hard rules only) and compares each week's open hours with the same week solved fresh, without carry-over. Result over 16 weeks: rolling 1,040 h open, fresh 1,040 h, so carry-over of rest gaps, streaks and the tough tally cost 0 h; no week was worse than fresh. The proven floor is 1,004 h, so the whole 36 h gap (sets 0 and 2: 48 vs 41 h and 40 vs 38 h) is the search-versus-proof gap that branch-and-price targets, not a rolling-plan loss. A joint solve cannot beat the fresh floor, so for coverage it is dropped. It could still matter for the tough-shift tally and pay, which this does not test. Synthetic sets, one seed; the same shifts repeat every week, so a real month with changing demand is untested.

**Branch-and-price on the exact Dantzig-Wolfe LP (`bnp.mjs`, 2026-11-10).** The open-hours floor came from a Lagrangian price tuned by subgradient steps, plus branching on that price (`coverBranch`). Subgradient steps only approach the LP value, and the LP itself leaves an integrality gap, so two bench weeks stayed unproven: 12x30 week 1 (floor 72, optimum 75) and 10x28 week 4 (floor 77, optimum 78). `bnp.mjs` takes the same enumerated columns (every valid shift set per person, from `validList`, so every hard rule is in them). It solves the Dantzig-Wolfe LP exactly at each node with a small revised simplex (dense basis inverse, Dantzig pricing with a Bland fallback, big-M artificials for rows a branch empties) and branches on the most fractional "person p holds shift s" pair, best-first. A node is cut once its bound, rounded up to the hour grid, reaches the incumbent. The floor stays valid at any limit because it is the lowest open bound. It runs in `exactSearch` after the priced floor, only when shifts are still open (`coverLP`, default on; `coverLPNodes` 2000, `coverLPMs` 10000). When an integral LP turns up a roster with fewer open hours, that roster becomes the incumbent. Measured with `node eval/bnp-bench.mjs P S cases`, which hands it the HiGHS optimum as the incumbent:

| week | old floor | LP at root | proven floor | nodes | time |
|---|---|---|---|---|---|
| 12x30 week 1 | 72 | 72.33 | 75 (= optimum) | 467 | 8.8 s |
| 10x28 week 4 | 77 | 78.00 | 78 (= optimum) | 1 | 0.1 s |
| other 14 weeks (8x22 x4, 10x28 x6, 12x30 x3) | = optimum | = optimum | = optimum | 1 | under 0.5 s |

The root LP on 12x30 week 1 is 72.33, the same value HiGHS gives in `eval/relaxation-check.py`, which checks the simplex independently. Through `buildRoster` (`node eval/ilp-export.mjs`), the engine's proven floor now equals its open hours on all 16 bench weeks (8x22: 57, 4, 98, 35; 10x28: 110, 93, 57, 78, 89, 99, 61, 39; 12x30: 92, 75, 47, 22), so coverage is proven on every one. The exports took 68 s, 207 s and 108 s, with the test suite running alongside. On the sample café with `exactNodes: 50` an integral LP finds the 15-hour roster the anneal missed (19 h) and the week is proven, so the "gives up honestly" test now turns `coverLP` off. A first wiring kept the LP roster's score but lost the roster when the coverage pass reset the incumbent, and reported 19 h as optimal. The new test `branch-and-price hands its roster to the cost search` pins the fix. `bnp.test.mjs` checks the floor and roster against brute force on 40 small random weeks.

**Not closed:** weeks where a person has more than 60,000 valid sets skip pricing and branch-and-price alike. The rolling-gap bench's 10x28 set 0 is one (a person with 66,763 sets). There the old floor was 41 against 48 open. With `maxSets` raised to 3M, the 111,202 columns give a root LP of 47.00 and branch-and-price leaves the floor at 47 after 437 nodes in 90 s, so 47 against 48 is unproven either way. On the same bench, set 2 moved from floor 38 to 40 (= open). Next: pricing by a per-person longest-path subproblem instead of full enumeration (true column generation), so big weeks get the LP too. Synthetic weeks, hard rules only; pay is not part of this proof.

**Column generation, and branching on identical shifts (2026-11-10, later).** The enumerated branch-and-price above lists every valid shift set per person up front, so it was skipped whenever one person had over 60,000 sets. `columnGenerationOpen` (`bnp.mjs`) solves the same Dantzig-Wolfe LP without the list: each node solves the LP over the columns found so far, then a per-person pricing oracle (`makeSetPricer` in `calc.mjs`: depth-first over the shifts with a positive dual, best dual per hour first, cut by a fractional-knapsack bound on weekly hours, and by `validList`, which is safe because every hard rule is downward closed) returns that person's best set at the LP's shift prices; sets with negative reduced cost join the LP until none is left. Before that point the Lagrangian bound (sum of duals plus each person's most negative reduced cost) is already a valid floor, so a node can be cut or stopped early without losing validity. A first version branched on single (person, shift) pairs as before. On the rolling-gap bench's 10x28 set 0 it reached a root LP of 47.00 from 919 generated columns in milliseconds (the enumerated version needed 111,202 columns), but then sat at 47.00 for 100,001 nodes and 497 s without proving anything: shifts needing two people are two identical copies, and fixing "P3 holds copy A" lets the LP move P3 to copy B at no cost. HiGHS (`eval/ilp-check.py`) says the optimum is 48, proven in 0.1 s. Branching now acts on the class of identical copies (same day, times and eligible people): "P3 holds a copy of this shift" or "P3 holds none". A node whose LP is settled and whose class shares are all 0 or 1 is solved outright: each person's sets at that node hold the same classes, so giving each holder a different copy is a roster at the LP value. Measured with `node eval/cg-bench.mjs P S cases` (new; `ENUM=1` also runs the enumerated LP; `SEED=20261101` gives the rolling-gap sets):

| week | enumerated columns | CG columns | CG root LP | CG floor | optimum (HiGHS) | CG nodes | CG time | enumerated before |
|---|---|---|---|---|---|---|---|---|
| rolling-gap 10x28 set 0 (no incumbent given) | over 60,000 for one person (111,202 at a 3M cap) | 555 | 47.00 | 48, proven | 48 | 635 | 3.5 s | 47 after 437 nodes and 90 s, unproven |
| 12x30 week 1 | 5,948 | 157 | 72.33 | 75, proven | 75 | 5 | 0.07 s | 467 nodes, 8.8 s |
| the other 15 bench weeks (8x22 x4, 10x28 x8, 12x30 x3) | 1,987-62,512 in all | 20-159 | = optimum | = optimum | as above | 1 | 0.1 s or less | 1 node, under 0.5 s |
| rolling-gap sets 1-3 | 4,338-35,597 in all | 89-155 | = floor | proven | - | 5-15 | under 0.2 s | proven |

`exactSearch` now uses column generation for the open-hours branch-and-price on every week (`coverCG: false` brings the enumerated one back), including weeks over the 60,000-set cap, where before there was no LP at all. Through `buildRoster` with the rolling-gap bench settings, set 0 now reports 48 open with a proven floor of 48 in 18 s (before: floor 41, coverage unproven, 16.5 s); `node eval/ilp-export.mjs 12 30` gives floor = open on all four 12x30 weeks (92, 75, 47, 22). `node eval/rolling-gap-bench.mjs 10 28 4 4` (16 weeks): proven floor 1,040 h = open 1,040 h, so the 36 h search-versus-proof gap measured on 2026-11-01 is now 0 h on that bench. `bnp.test.mjs` checks the CG root LP, floor and roster against the enumerated LP and brute force on 60 small random weeks, and that the floor stays valid when the node limit, the oracle's node cap or the round cap stops it early. Not claimed: the oracle is exponential in the worst case (it is capped at 2M nodes per call and then reports itself inexact, which keeps the parent's bound); only seeded synthetic weeks, hard rules only, one machine; pay is not part of this proof.

**Bigger weeks: 20 to 60 people (2026-11-10, later).** `node eval/cg-scale-bench.mjs P S 3 60000` (new) runs the column generation on seeded weeks of 20x56, 30x84, 40x112 and 60x168 (people x shift lines, the 10x28 ratio; 75-245 shift copies), with no incumbent, and `WEEKS=w.json` dumps them for `eval/ilp-check.py`. Output: `eval/cg-scale-bench.out.txt`. Found and fixed on the way:

- *A crash.* The first 20-person week (82 copies) made `buildRoster` with `exact: true` throw `simplex pivot limit`: rounding left basic values near 1e-11, the ratio test took those steps as progress, Bland's rule never stayed on, and the 102-row LP cycled at its optimum past 400,000 pivots. `solveLP` now snaps basic values within 1e-9 to 0. A 40-person week then cycled a second way (big-M artificials basic, duals near 1e6, reduced costs of rounding size entering for 200,000 pivots): the entering tolerance is now 1e-11 x (1 + largest dual). Both LPs are fixtures in `eval/fixtures/` (`bnp.test.mjs`). A solver failure inside `columnGenerationOpen` now ends that node with its valid bound (`stats.lpFailures`) instead of throwing.
- *The floor was already the optimum.* On all 12 weeks HiGHS's least open hours equal the column-generation floor (20: 151, 78, 48; 30: 181, 142, 189; 40: 169, 146, 281; 60: 300, 308, 183). What failed was finding a roster at the bound.
- *Dive on ties, and a warm-started LP*, both on by default (`dive`, `warm`; `DIVE=0`/`WARM=0` in the bench): among nodes with the same bound on the open-hours grid the deepest goes first, and each pricing round starts the simplex from last round's basis (`solveLP(..., { warm })`, valid because a node's pool only grows at the end).

| people x lines | before (60 s) | after |
|---|---|---|
| 20x56 | crash on 1 of 3; with the LP fix 3 of 3 proven in 17-33 s | 3 of 3 proven, 0.9-2.6 s |
| 30x84 | 2 of 3 proven, 54-56 s | 3 of 3 proven, 8-19 s |
| 40x112 | 0 of 3 proven | 3 of 3 proven, 40-41 s |
| 60x168 | 0 of 3 | 0 of 3 (floor = optimum, no roster found in 60 s) |

The pricing oracle was never inexact: its largest call took 116,407 nodes against the 2M cap. The old benches keep their floors (8x22, 10x28, 12x30 all = optimum; rolling-gap set 0 proves 48 in 0.9 s, was 3.5 s; 12x30 week 1 now 37 nodes, 0.2 s, was 5 nodes). Not claimed: seeded synthetic weeks only, hard rules only, one machine. `buildRoster` with `exact: true` and no time limits on the 40-person weeks took 179-315 s end to end (its other passes, not this proof), and reported coverage proven on one of the two weeks it finished.

**A pay bound by column generation (2026-11-10, later).** Once coverage was proven, the exact search still left most weeks' pay unproven: its whole-score bound is a Lagrangian price tuned by subgradient steps, which stops short of the LP. `columnGenerationOpen` (`bnp.mjs`) now takes costed columns (`openCost` per shift, a `cost` per set from the oracle, `unit: 0` and a `tolerance`), and `scoreBoundByColumnGeneration` (`calc.mjs`) uses it on the whole score: one column per person and valid set, costed at that person's pay and penalties, open shifts at 100,000 per hour. Its oracle, `makeScorePricer`, finds each person's set with the largest shift prices minus score. Score is not a sum over shifts (overtime tiers, the squared fairness term, the hours shortfall, split-shift days), so the depth-first search bounds a branch with floors that each hold for any set that adds shifts: pay without the split premium, plus each added shift's straight-time pay times the lowest multiplier; the avoid, prefer and least extra tough-shift terms; the shortfall and fairness terms at their least over every total still reachable (both convex); the split premium at 0. The added shifts then enter as a fractional knapsack on the weekly hours left. `buildRoster` runs it before the exact search (`scoreCG: false` turns it off). When it proves the roster to within the tolerance the exact search is skipped. Otherwise its bound joins the exact search's, and any cheaper roster it finds is checked with `ownerValid` and kept.

`node eval/score-cg-bench.mjs 8 22 12` (new; output `eval/score-cg-bench.out.txt`, and `eval/score-cg-bench.off.txt` with `SCORECG=0`) uses the weeks of `pay-gap-bench.mjs`:

| | exact search alone (8 s a week) | with column generation |
|---|---|---|
| weeks proven best to within $0.50 | 3 of 12 | 12 of 12 |
| total unproven gap | $5,906.47 | $0.00 |
| cheaper final roster | - | weeks 1, 3 and 4: $14.88, $9.34 and $16.49 a week cheaper |
| time for the bound | 8 s, then stops | 4-198 ms a week (11 proven at the root, 1 in 139 nodes) |

On week 10 the root LP sits 2 open hours below the roster and branching closes it; on the rest the root LP is at the roster or within cents. Bigger weeks (`node eval/score-cg-scale-bench.mjs P S`, new; the incumbent is the anneal with no exact step; output `eval/score-cg-scale-bench.out.txt`): 12x34 3 of 3 proven in 0.03-0.5 s; 20x56 3 of 3 proven in 2-6 s, each on a roster $20-$52 cheaper than the anneal; 30x84 1 of 2 proven in 26 s (on a roster with 2 fewer open hours than the anneal), the other unproven after 120 s with $16.73 left; 40x112 0 of 2 in 120 s (one bound still an open hour below the roster, the other $206 below at the same open hours). The oracle was never inexact. Checks (`calc.test.mjs`): on random tight weeks with every score term in rotation (weekly, daily and double-time overtime, burden, unpaid meals, split premium, differential, tough history, avoid and prefer), the bound never passes brute force, and with no incumbent the search returns the brute-force optimum; the sample week, which the exact search alone leaves bounded at 50 nodes, is proven. Not claimed: seeded synthetic weeks only, one machine, and the numbers are the engine's own score, not a real payroll.

**Branded staff schedule pack, dark (2026-11-02).** `staffpack.mjs` builds the week on the shop's letterhead (logo, accent colour, wall grid, open shifts, one page per person, notes page; no pay). It sits behind the licence-key check (`licence.mjs`) and stays hidden until `CHECKOUT_URL` in `checkout.mjs` is set. Tested for escaping, the logo and colour allow-lists, no pay figures and the dark default (`staffpack.test.mjs`); not run in a browser print dialog or against a live checkout. The roster and every other download stay free.

**Staff-line limits (2026-11-03).** `parseStaff` refuses max or min hours over 168 and wages over $10,000 with a reason; before, `1e9` max hours was accepted and a one-shift week took 53 s to solve. Test in `calc.test.mjs`. Found by probing hostile staff lines; invented files only. A 3,000-line shifts file (50 people per shift) also ran over a minute.

**Shifts-file limit enforced before solving (2026-11-03).** `parseShifts` stops expanding a file once it passes four times the 400-shift cap, and returns no slots (with the error) whenever the week is over the cap, so no caller can hand the solver an oversized week. The 3,000-line, 50-per-shift file now parses in milliseconds and reports the limit (test in `calc.test.mjs`). Invented input only.

**A root dive finds the roster the LP already promises (2026-11-11).** On the 60-person weeks the column-generation floor equalled the HiGHS optimum, but the tree visited 13-31 nodes in 60 s and never reached a roster at it, and the 30- and 40-person pay weeks stopped the same way (bound right, no roster at it). `columnGenerationOpen` (`bnp.mjs`) now runs a dive after the root LP (`rootDive`, on by default; `ROOTDIVE=0` in the benches): pin every person whose LP column is at 1, plus the heaviest fractional columns of other people that share no shift copy with each other or with a pin, re-price everyone else, and repeat until the LP is integral (a roster) or the pinned problem cannot beat the best roster. A wide dive (`ceil(P/7)` fractional pins a step) runs first and a narrow one (one a step) only if no roster meets the root bound yet; on 40-person week 1 the wide dive took 7 steps but stopped above the bound, and the narrow one then reached it. A pinned node's bound holds only inside the pins, so the dive only supplies rosters; it never raises the floor, and a failed dive leaves the tree search as before. Open hours, `node eval/cg-scale-bench.mjs P S 3 60000` (output appended to `eval/cg-scale-bench.out.txt`; the 30 and 60 rows ran next to another bench on a 4-core machine):

| people x lines | before (60 s) | with the dive |
|---|---|---|
| 20x56 | 3 of 3 proven, 0.9-2.6 s | 3 of 3 proven, 0.4-2.1 s |
| 30x84 | 3 of 3 proven, 8-19 s | 3 of 3 proven, 1.4-1.9 s |
| 40x112 | 3 of 3 proven, 40-41 s | 3 of 3 proven, 3.3-7.4 s |
| 60x168 | 0 of 3 (floor = optimum, no roster) | 3 of 3 proven at the HiGHS optimum (300, 308, 183 h), 18-27 s |

The same run with `ROOTDIVE=0` still ends 0 of 3 at 60 people. Every roster found equals the HiGHS optimum because it meets the proven floor. The pay bound runs the same search (`scoreBoundByColumnGeneration`), so `node eval/score-cg-scale-bench.mjs P S 2 120000` (appended to `eval/score-cg-scale-bench.out.txt`) moved too: 30x84 1 of 2 proven to within $0.50 (26 s; the other $16.73 open after 120 s) to 2 of 2 in 3.8-15 s; 40x112 0 of 2 (one week an open hour above its bound, the other $206.28) to 2 of 2 in 19-43 s, on a roster with one more hour covered than the anneal on week 0. The 12-week `score-cg-bench.mjs` is unchanged (12 of 12, $0.00 total gap). Width 1 alone, width 3 and width 6 were also tried on the 40-person weeks: width 1 proves all three in 4.6-6.6 s, widths 3 and 6 are faster on two weeks (2.9-4.5 s) but miss the bound on the third and the tree then takes 28-30 s, hence wide then narrow. Test (`bnp.test.mjs`): on 40 small random weeks every dive width, and a dive with a node limit of 1, gives a valid roster whose open hours are what it reports, never below brute force, with the same floor as no dive. Not claimed: seeded synthetic weeks only, hard rules only for the open-hours rows, one machine, and no backtracking in the dive, so a week where both dives miss falls back to the tree as before.

**Backtracking in the dive, and the first 60- and 80-person readings (2026-11-11, later).** The narrow dive used to stop at its first dead end (the pinned problem infeasible, or unable to beat the best roster). It now backtracks (`diveBacktrack`, default the number of people; `0` turns it off): after a dead end it returns to the step before and pins that step's next fractional candidate instead, one retry per extra pinned LP, until a roster meets the root bound, the retries run out or half the time limit is spent (so the tree keeps its share). A roster found above the root bound does not stop it; it only tightens the cut. The wide dive and the first narrow path are unchanged, so every week the old dive solved is solved the same way. Measured with the tree off (`nodeLimit` 1) to see the dive alone, `eval/dive-backtrack-bench.mjs` (output in `eval/dive-backtrack-bench.out.txt`):

| weeks | missed by the dives without retries | dive reaches the optimum with retries (10 / 30 / 100) |
|---|---|---|
| 200 seeded 10x28 | 8 | 3 / 3 / 5 |
| 120 seeded 14x40 | 3 | 1 / 1 / 1 |
| 30 seeded 20x56 | 0 | - |

The full proof (dives then tree) finishes on every one of those weeks either way; the tree is fast at this size, and total time moved by noise (7.2 s for the 8 weeks without retries, 6.8-9.9 s with). Pay bound, `eval/score-dive-backtrack-bench.mjs 10 28 60`: 5 of 60 weeks open after the dive without retries, retries narrow 2 (one from $34.88 to $4.74) and prove none. Untried until now, `node eval/score-cg-scale-bench.mjs 60 168 2 300000` (no retries): week 1 proven to within $0.50 at the root in 17 s, week 0 $8.53 open after 300 s; with retries week 0 ends $2.68 open after 308 s, still not proven. Open hours at 80 people (`node eval/cg-scale-bench.mjs 80 224 3 120000`): no week proven; the root column generation does not settle in 120 s on any of the three (23-62 rounds, 85-111 s of the 120-131 s inside the per-person pricing oracle, oracle calls up to 578,000 nodes), so two weeks never reach the dive and the third's dive finds 335 against a floor of 331. At 80 people the bottleneck is pricing, not search. Test (`bnp.test.mjs`): on 60 small random weeks with retry budgets 1, 3 and 50, dive-only rosters are valid, never below brute force, never worse than the dive without retries, with the same floor. Not claimed: seeded synthetic weeks only, a shared 4-core machine, and the gain is small: most dive misses are weeks whose optimum lies above the root bound, where only the tree can prove it.

**Same search, two to three times faster; 80-person weeks proven (2026-11-11, later).** A profile of one 60-person week (19.4 s) put the time in three places: `insertSorted` 5.6 s (a full comparator sort on every list the pricing oracle tried), the simplex `refactor` 5.1 s and the pivot loop 4.6 s. Four changes, each of which leaves every number the same: `insertSorted` binary-inserts into a list already in start order (an unordered list still gets the full sort); `refactor` and the pivot update run only over the pivot row's nonzero entries (subtracting f x 0 changes nothing); a pivot re-sums only the basic values of the rows it changed; and `validList` tracks days in a bit mask and per-day minutes in a reused array instead of a Set, a Map and a sort (the original is kept as `validListSlow`). Node, column, round and dive-step counts are identical to the old code on the 40- and 60-person bench weeks (at 80 people the old code runs out of time first), so the search reaches the same rosters, only sooner. Tests: `bnp.test.mjs` holds `solveLP` to the old dense solver (`eval/solve-lp-dense.mjs`) bit for bit on both captured LPs, cold and warm (pivots, basis, x and y); `calc.test.mjs` holds the two `validList`s to the same answer on 90,000 random lists, ordered and not. Open hours, `node eval/cg-scale-bench.mjs P S 3 T` (rows appended to `eval/cg-scale-bench.out.txt`; three benches at a time on a 4-core machine, so the times are pessimistic):

| people x lines | before | after |
|---|---|---|
| 40x112 | 3 of 3 proven, 2.8-6.3 s | 3 of 3, 1.3-3.4 s |
| 60x168 | 3 of 3, 15.1-22.7 s | 3 of 3, 9.2-11.7 s (week 0 alone: 7.0 s, was 19.4 s) |
| 80x224 (120 s) | week 0: root LP not settled after 133 s, no roster | 3 of 3 proven: 257, 331, 281 h in 77-100 s |
| 100x280 (180 s) | not run | week 0: root LP not settled (36 rounds, 128 s of pricing, up to 1.4 million oracle nodes a call); week 1: 347 h found over a floor of 344, unproven |

HiGHS (`eval/ilp-check.py`, scipy 1.18.1, 300 s limit) on the same 80-person weeks: week 0 optimal at 257 in 7.9 s; weeks 1 and 2 stopped at the time limit with rosters of 338 and 283 h over bounds of 331 and 281, the values the engine proves. On the two 100-person weeks HiGHS stopped at 361 over 358 and 358 over 344. The pay-proof bench (`eval/score-cg-bench.mjs`) still proves 12 of 12 weeks to within $0.50; week 10's tree is one node longer than the stored output, and the old code gives that same row today, so the change predates this work. Tried and dropped: reusing the last round's basis inverse instead of refactoring at the start of each round. It is faster per solve, but rounding differs, so the LP lands on other optimal vertices; two of three 60-person weeks then missed in the wide dive and took 25-31 s instead of 15-23 s. Shift weeks are capped at 400 copies (`MAX_SLOTS`): 120x336 makes 490 and is refused, and 100x280 makes 400, 400 and 407. So 80-100 people is the largest week the product takes, and at 100 the pricing oracle, not the LP, is the wall. Found on the way: `cg-scale-bench.mjs` read `ps.error` where `parseShifts` returns `errors`, so an over-cap week printed an empty row; it now prints the refusal. After merging the dive backtracking above, the 80-person weeks give the same three rows (same nodes and columns, proven in 79-102 s beside the full test suite); the backtracking run's 80-person reading, 0 of 3 with the root LP unsettled at 120 s, is the before. Not claimed: seeded synthetic weeks, hard rules only, one machine.

**A chain bound in the pricing oracle (2026-11-11, later; measured first on the code before the speed-ups above, then merged with them).** On the 80-person weeks (`node eval/cg-scale-bench.mjs 80 224 3 120000`; 304-326 shift copies, near the 400-copy cap), the code before the speed-ups never finished its root LP in 120 s: 108 of the 121 s went to the pricing oracle (`makeSetPricer`), whose largest single call searched 577,737 nodes, so the dive never started and the floor stayed at a partial Lagrangian 161 and 331 hours. The oracle's only bound was a fractional knapsack on the weekly hours, which ignores the rest rule: every two shifts in a valid set are at least `minRestHours` apart (10 h by default), so a set is a chain of intervals [start, end + rest) that do not overlap. The oracle now also takes the Lagrangian of the hours cap at the knapsack's own critical price lam: `lam x room left + best chain of the shifts still allowed, each worth max(0, w - lam x minutes)`, a weighted interval scheduling in O(n) per node. It is a valid upper bound for any lam >= 0 and never above the knapsack's LP value at that lam, so the search takes the smaller of the two; shifts too close to one already in the set count as 0. `chainBound: false` (bench: `CHAIN=0`) turns it off.

| week | chain bound off | chain bound on |
|---|---|---|
| 60x168 (same session, both runs beside other benches) | 3 of 3 proven, 22-31 s; pricing 12-16 s; largest oracle call 39k-116k nodes | 3 of 3 proven, 12-22 s; pricing 3-4 s; largest call 3.7k-6.3k nodes |
| 80x224 | 0 of 2 run: root LP unfinished at 120 s (floor 161 and 331 h, no roster) | 1 of 3 proven (281 h, 96 s); 2 of 3 rosters 5 and 4 h above the root bound (262 vs 257, 335 vs 331) |

The 60-person search took the same path with it on or off (same nodes, columns, rounds and floors); only the oracle got faster, and the LP is now most of the time. A 120-person week of 336 lines is 490 shift copies, over the 400 the tool takes, so `parseShifts` refuses it; the bench used to print that as a row of zeros marked proven, and now prints the refusal. Test (`chain-bound.test.mjs`): on 60 random small weeks under rest rules of 0, 8, 10 and 12 hours and with or without an 8-hour daily cap, with random prices, held shifts and banned shifts, the oracle's best value equals brute force over every valid set with the bound on and off, never searches more nodes with it on, and column generation proves the same floor either way. Not claimed: seeded synthetic weeks, hard rules only, one 4-core machine with benches running side by side, so the times are pessimistic; whether 262 and 335 are optimal is unchecked (no HiGHS run at 80 people). The pay oracle (`makeScorePricer`) still uses the knapsack alone. Re-run after merging the dive backtracking above (both on): the same three rows, 1 of 3 proven; on week 0 the backtracking spent 3 retries and found nothing below 262.

With the speed-ups above merged in as well (all on; the table above is without them), `eval/cg-scale-bench.out.txt`, last block:

| week | speed-ups alone (section above) | speed-ups + chain bound |
|---|---|---|
| 60x168 (on and `CHAIN=0` side by side) | 3 of 3, 6.2-11.2 s; pricing 1.9-2.2 s; largest call 39k-116k nodes | 3 of 3, 5.0-10.5 s; pricing 0.8-1.2 s; largest call 3.7k-6.3k nodes |
| 80x224 (120 s) | 3 of 3 proven in 77-100 s | 3 of 3 proven (257, 331, 281 h) in 42-86 s |
| 100x280 (180 s) | week 0: root LP not settled (up to 1.4 million oracle nodes a call); week 1: 347 over 344 | week 0: root settles at 358, roster 359 (1 h open); week 1: 347 over 344, as before; largest call 47k-89k nodes |

At 100 people (400 copies, the cap) neither week is proven in 180 s, but week 0 now has a root bound one hour from its roster, and HiGHS's 300 s run on the same week stopped at 361 over 358. The tree, not pricing, is the limit there now.

**The chain bound in the pay oracle, and a faster pay oracle (2026-11-11, later still).** The pay bound (`scoreBoundByColumnGeneration`) prices columns with `makeScorePricer`, whose depth-first search had only a fractional knapsack on the weekly hours. It now takes the same rest-rule chain bound as `makeSetPricer` (shared as `chainBounder`, on each shift's value `u = w - least added cost`), plus three exact changes: the sibling cut `makeSetPricer` already had (once the bound for the rest of the loop is at or below the best set, stop), the bound's reachable-minutes sum read from a suffix array instead of summed per node, and `fixedLB` worked out once per node. `payParts` (straight, overtime and double-time hours, called by every pay figure in the tool) now sums per-day hours in a reused array in the Map's own first-seen day order, so every score is the same bit for bit; the 169 tests of `calc`, `bnp` and `chain-bound` and the whole suite pass, and every bench below printed the same annealed scores, columns and bounds as before. Readings (`node eval/score-cg-scale-bench.mjs P S cases ms`, which now prints pricing time and the largest oracle call; `CHAIN=0` turns the bound off, `CASE=k` runs one week), one 4-core machine, other benches running alongside:

| week | before | chain bound only | chain bound + exact cuts |
|---|---|---|---|
| 40x112 week 0 (proven) | 5.7 s, pricing 3.5 s, largest call 98k nodes | 5.4 s, 3.2 s, 87k | 3.4 s, 1.4 s, 64k |
| 40x112 week 1 (proven) | 11.2 s, pricing 8.8 s, 79k | 11.4 s, 9.0 s, 60k | 8.5 s, 6.3 s, 56k |
| 60x168 week 0 (300 s) | $1.22 open, 160 nodes, pricing 195 s, 651k | $1.22, 160, 193 s, 660k | $1.22, 172 nodes, 181 s, 640k |

What it says: **the chain bound barely matters for pay** (largest call down 11-24% on 40 people, time flat; the pay oracle's looseness is the overtime, fairness and shortfall terms, not the rest rule), so it stays for the node count but is not where the time went. The exact cuts took pricing down 28-60% on the 40-person weeks. **The 60-person pay week is still $1.22 open:** its bound equals the root LP after 160-172 nodes, so the tree never raises it, and a faster oracle buys a few more nodes, not a proof. Closing it needs a stronger bound in the tree (cuts on the score LP, or branching that moves the LP), not more pricing speed. The earlier README figure for this week ($2.68 open, 55 nodes) was measured before the "same search" speed-ups; on today's code the incumbent the dive finds is $1.22 above the bound. Tests: `chain-bound.test.mjs` scores every valid set of 3-5 person weeks through the pay oracle itself (48 weeks across rest, daily-cap, overtime, daily overtime, fairness and split-shift settings, with held and banned shifts) and checks the oracle reaches the brute-force best with the bound on and off, never searching more nodes with it on; and that the whole-score bound is the same either way.

**Time budget on big weeks (2026-11-04).** A legal-size week (60 people, 392 shifts, every shift needing 7) ran past 110 s with no output: after the annealer, the ejection chains, 12 plateau walks and the proof each take their turn. `buildRoster` now takes `timeBudgetMs` (default 20 s when a week has more than 150 shifts, off below that, `0` turns it off): once spent, the remaining improvement passes are skipped, the best roster so far is kept and the result carries `budgetHit: true`. The same week through the CLI now ends in 21.7 s with 300 of 392 shifts covered (the 60 people's five shifts each; capacity, not search, is the limit). Weeks of 150 shifts or fewer, including the sample café and the guide pages, run exactly as before. One invented week, one machine; the budget is wall-clock, so a slower machine stops earlier in the passes and may leave more hours open. Test in `calc.test.mjs`.

**More POS header names (2026-11-10).** Probing `--from-sales` with made-up Toast-, Clover- and Square-style headers found two exports that read 0 rows: `Opened,Net Price` and `Order Date,Order Total` ("No sales column found"). The sales column now also matches net price, order total, check total, net total, gross total, payment amount, transaction amount and subtotal, and the time column order date, sale date, transaction time and date, paid at, closed, check closed and payment time. Unit-tested on made-up rows; still no real export.

**Square and Toast item exports (2026-11-12).** Run through `--from-sales` with their full header rows (written from memory of the vendors' help pages; squareup.com and doc.toasttab.com refused this host, so not checked against the live pages or a real file), both US layouts already read a date and hour and a sales column, but each gave a wrong number without a word:

1. **Square used gross, not net.** Square's item export carries `Gross Sales`, `Discounts` and `Net Sales`, in that order, and the first matching column won, so a $10 latte sold at $8 counted as $10. A net column (`Net Sales`, `Net Amount`, `Net Price`, `Net Total`, ...) or a plain `Sales` column now wins over a gross one wherever it sits. Files with one sales column read as before.
2. **Toast counted voided lines.** Toast's item selection export has a `Void?` column, true on a line rung in and then voided, with its price still positive. Those lines were summed as sales and, under `--count tickets`, an order whose only line was voided counted as a customer. A void column (`Void?`, `Voided`, `Is Void`, ...) set to true, yes, 1 or voided now drops the line, with one note: "N voided lines (X in all) left out".
3. **A refund written positive.** An event or status column (`Event Type`, `Transaction Type`, `Order Status`, `Status`, ...) reading refund, return, void, cancelled or deleted drops the row as a refund even when its amount is not negative. A `Status` of Completed is a sale.

Tests: `pos-exports.test.mjs` (made-up rows under both header rows, and a two-week made-up Toast file through the CLI). The four real files have no void, event or second sales column (headers above), so their readings cannot move; `eval/bakery-backtest.mjs` on the Korean file printed byte-for-byte the same before and after the change. Its committed `eval/bakery-backtest.out.txt`, which predated the 2026-11-11 priced cut, is regenerated in the same change. Still wanted: a real Square or Toast export, private details removed.

**Real Square and Toast exports (2026-11-13).** The first real files of both layouts, found in public GitHub repositories (code search on Square's `Price Point Name`/`Gross Sales`/`Net Sales` header and Toast's `Menu Item`/`Net Price`/`Order Id`): Square item-sales exports from a print shop (29 lines), a Highland-wear shop (50 lines, one day) and a market-day shop whose 11 weeks (2026-05-22 to 2026-08-08, 3,881 lines) come as 17 date-range files; and a restaurant's Toast `ItemSelectionDetails` (847 lines, one day). Fake samples (a repo's `fake_data/`, a "sample" file with `TX1001`-style ids) were left out. They have no licence we could check, so they are not committed: `eval/real-pos-exports.mjs` downloads each, checks its SHA-256 and prints what `--from-sales` reads (`eval/real-pos-exports.out.txt`; customer and staff columns are never printed).

What the 2026-11-12 work got right: the Toast header written from memory matched the real one column for column, and Square's real header has the remembered columns plus six more (GTIN, Fulfillment Note, Channel, Token, Card Brand, PAN Suffix; Commission and Employee in newer files). Net sales, refunds by Event Type (5 rows across the Square files) and Toast's `Void?` (11 lines, $107.40) were all read as intended, so the sales totals were already right: $2,785.67 on the Highland-wear day (net of 2 refunds), $10,687.58 on the Toast day (net of voids). Three faults, now fixed (`pasted-exports.test.mjs`, made-up rows in the real shapes):

1. **A description over several lines.** Square puts an item's description in `Notes`, quoted and often over several lines. Rows were split at every line break, so the Highland-wear file printed 14 "Skipped row ... could not read the date and hour" lines, each a fragment of a description. A quoted line break no longer ends the row (`csvLines` in `import-staff.mjs`, used by the sales reader and both scheduler importers); a quote left open at the end of the file falls back to one row per line, so a stray inch mark cannot swallow the rest. The sales were not wrong here only because Square's Net Sales column comes before Notes.
2. **Several files pasted together.** Square exports one date range at a time, so 11 weeks came as 17 files. Pasted together, each later header row printed a skipped row (16 lines), and Square added Commission and Employee part-way, so 10 of the files have a different header: had a later file's columns moved past the sales column, its rows would have been read from the wrong cell without a word. A later header row now starts a new file, its columns are matched to the first header's by name, and a row that repeats a row of an earlier file in every column they share (overlapping date ranges) is counted once, with a note. Repeats inside one file stay: two identical lines can be two sales. These files did not in fact overlap (Square's range end is exclusive; every line has its own Token), and the check found no repeat, as it should. The page's file box now takes several files at once.
3. **A 25-entry note.** On the one-day Highland-wear file, "Left unstaffed" listed `Sat 16:00-17:00 (person 4)` through `(person 28)`, 25 entries. The same hour is now one entry: `Sat 16:00-17:00 (people 4-28)`.
**A reading.** On the market-day shop, which traded Saturdays throughout, a Thursday and Friday once and Tuesdays and Wednesdays from mid-June, the backtest (7 tested weeks, library defaults) found the last 4 weeks better than the plain average by 7.9 person-hours a week at $60 per labor hour (95% CI 3.1 to 12.6) and 8.6 at $120 (5.2 to 11.9), and half-life auto on the CLI picks it. Under the old score (`--score-open-hours`) nothing beat the plain average, so the gain is hours staffed on days the shop no longer opened. Half-lives 8, 4 and 2 were level with the average.

Not claimed: four shops, three of them one to three days, so only one backtest; one Toast file; no file had two locations in it (a multi-location export would still be planned as one shop). Still wanted: a published-schedule export from a scheduler (7shifts, When I Work, Homebase, Deputy), which `import-shifts.mjs` reads by remembered column names only.

## The exact check end to end on 40-person weeks (2026-11-12)

`buildRoster` with `exact: true` now returns `timings`, the milliseconds each stage took (anneal, eject, coverPass, coverRepair, scoreCG, exactSearch, critical, hireTest), and `node eval/end-to-end.mjs P S cases` prints them for the cg-scale-bench weeks with no time budget (readings in `eval/end-to-end.out.txt`; one 4-core machine, other benches alongside on some rows). On two 40-person weeks the old order spent its time in two places that the proof made redundant: the coverage plateau walk (`coverPass`, about 10 s a week) and the branch-and-bound tree in `exactSearch` (38 s on week 1, against its 8 s limit, because it reads the clock every 1,024 nodes and each node builds a flow over all 148 shifts). The tree proved nothing; week 1 ended "bounded", $31.96 open. The whole-score column generation needed only a little more than its 8 s to prove that week.

Two changes, both only above 60 shift copies (`EXACT_TREE_SLOTS`) with the exact check on:

- **The tree is skipped** once column generation has run (its bound is the one reported, `optimality.treeSkipped`), and column generation gets 4 x `exactMs` (32 s by default) instead of `exactMs`. `exactTree: true` gives the old behaviour.
- **The cover passes wait.** Column generation runs straight after the anneal and the ejection chains; the plateau walk and the exact repair run only if it does not prove the roster, and the bound it reached still stands. `deferCover: false` gives the old order. On weeks with a time budget (above 150 copies, 20 s by default) column generation then gets at most half of what is left, so the passes keep time to work: without that cap a 60-person week spent 33 s in column generation and finished 11 open hours worse.

| week | before | after |
|---|---|---|
| 20 x 56, three weeks (75-82 copies) | 4.9-6.3 s, all proven | 0.95-1.1 s, same rosters, all proven |
| 30 x 84, three weeks (121-122 copies) | 9.3-12.9 s, all proven (tree skip already on) | 1.3-5.2 s, same rosters, all proven |
| 40 x 112 week 0 (149 copies) | 15.2 s, proven | 5.7 s, same roster |
| 40 x 112 week 1 (148) | 56.6 s, **not proven** ($31.96), pay $12,537 | 9.2 s, proven, pay $12,480 |
| 40 x 112 week 2 (162) | 24.6 s (tree skip on), proven | 11.7 s, same roster |
| 60 x 168 week 0, 20 s budget (245) | 20.5 s, no proof run (the budget went on the walk), 300 h open | 21.1 s, 300 h open, floor 275 h reported |
| 60 x 168 week 1, 20 s budget (238) | 23.9 s, no proof run, 308 h open | 8.5 s, 308 h open, proven, $7 cheaper |

The README's earlier "179-315 s end to end" for these weeks was measured before the root dive and the faster pay oracle; on today's code the old order took 15-57 s. Test: `end-to-end.test.mjs` (a 20-person, 76-copy week proven with the tree skipped and the walk never run, the same open hours as the old order and no higher score). Not claimed: seeded synthetic weeks only, one machine; the 60-person week 0 is still not proven (root LP 275.2 h against 300 h held), which is the "close the 60- and 100-person gaps" item, not this one.

## The exact check on by default, every size (2026-11-12)

Until now the exact check ran by itself only on weeks of up to 14 shift copies; everything bigger got the quick search (anneal, ejection chains, plateau walk) unless the manager ticked "Always" or passed `--prove`. Now that column generation proves 20-40 person weeks in seconds, `node eval/auto-exact.mjs P S cases` builds the cg-scale-bench weeks twice, once with the old default and once with `exact: true`, and `node eval/auto-exact.mjs templates` does the same for the page's four built-in templates (readings in `eval/auto-exact.out.txt`; one 4-core cloud machine, runs one at a time).

| weeks | copies | exact on: score | open hours | proven | time, old default -> exact on |
|---|---|---|---|---|---|
| 4 templates (café, salon, retail, clinic) | 16-32 | better on the café, same on 3 | café 19 h -> 15 h | 4 of 4 | 0.02-2.7 s, within 0.07 s |
| 23 random, 6-15 people | 18-55 | better on 10, same on 13 | 1 h fewer on 2 | 23 of 23 | -0.3 to +1.0 s each (sum 45 s -> 50 s) |
| 10 random, 15-40 people | 62-149 | better on all 10 | 1-5 h fewer on 7 | 10 of 10 | 3.0-8.7 s faster each (sum 78 s -> 30 s) |
| 3 random, 40-60 people (20 s budget) | 162-245 | better on 1, same on 2 | same | 1 of 3 | 16.5 -> 21.1 s, 20.9 -> 21.4 s, 21.6 -> 9.3 s |

Never worse on any of the 40, better on 22, fewer open hours on 10, proven on 38. Every one of these weeks has over 14 copies, so the old default is `exact: false` on all of them (the templates were rerun after the change with `MODES=off,exact`). The built-in café sample (the page's example button and `--example`) now leaves 15 hours open instead of 19 and says it is proven, in the same 2.6 s. So `exact: "auto"` (the default for the page, the CLI and the self-hosted server) now runs the check on every week the parser accepts (`EXACT_AUTO_SLOTS` = the 400-copy cap), and under "auto" the exact cover repair runs too, as it did under `exact: true`, so the default and "on" give the same roster (checked on the templates and the 8 x 22 weeks). The page's selector is now On / Off; `--no-prove` and `exact: false` turn it off.

Not claimed: seeded synthetic weeks and the built-in templates only, one machine; below 60 copies the check costs up to a second more and the page ran it on the main thread, so a slow phone waited longer (moved to a Web Worker later the same day, below). Two unproven weeks above 150 copies stop on the 20 s budget either way (the 40 x 112 week 2 took 4.6 s longer with the check on, the bound it reaches is reported). Where a time limit stops the search, the roster can depend on machine speed, as it already could above 150 copies. Test: `calc.test.mjs` ("exact search runs by itself on every week").

## The page builds in a Web Worker (2026-11-12)

With the exact check on by default at every size, the page's build ran column generation and branch-and-price on the browser's main thread. The page froze until it finished: no scrolling, no typing, no way to stop it. The build now runs in a module worker (`roster-worker.mjs`, which only calls `buildRoster` from `calc.mjs`), and a **Stop** button next to "Build the roster" ends it. The worker returns the roster, the staff and the shifts in one message, so structured clone keeps the references between them; the page then uses those copies with the roster. If the browser cannot start a module worker (an old browser, a page opened from `file://`, or the worker file missing from an offline cache), the page builds on the main thread as before.

Same run, a bug fix: the main build never read the "Check against an exact search" select (only the multi-week planner did), so **Off** did nothing. It now passes `exact: false`.

Measured in headless Chromium on the café sample (32 shifts, exact check on, `build-worker.check.mjs`; needs a server and Playwright, see the file header):

| build | time to the report | longest gap between frames |
|---|---|---|
| main thread (Worker removed) | 1.9 s | 1,850 ms |
| worker | 1.9 s | 50 ms |
| main thread, CPU slowed 4x (DevTools throttling) | 6.0 s | 5,767 ms |

Both builds give the same summary, grid, notices and who-is-critical text. Stop ends a build mid-run and the next build works. With **Off** the report carries no "Checked against an exact search" line. `page-worker.test.mjs` checks, on the sample and the four templates, that the worker's roster equals a direct call, and that every report the page draws (cover, swaps, hand-over chains, trades, absences, cuts, flags, breaks, fairness, CSV, .ics, messages, open-shift post) is the same from the cloned roster as from the original.

Not claimed: one desktop machine and one sample week; DevTools' 4x throttle is a stand-in for a phone and does not slow the worker thread, so there is no throttled worker time in the table. The multi-week planner moved to the worker later the same day (below).

## The multi-week planner plans in the worker too (2026-11-12)

"Plan several weeks in a row" built every week on the main thread, one exact check (4 s budget) per week, so a four-week plan froze the page for the whole run. It now posts `{ kind: "plan", staffText, shiftsText, options }` to the same `roster-worker.mjs`, which calls `planWeeks` from `calc.mjs` and posts `{ progress: { done, of } }` after each week, so the page shows "Week 2 of 4 planned…". The planner has its own **Stop** (it does not share the build's, so a roster build and a plan can run side by side). The plan travels back in one message; the table, CSV buttons and the "who gets the hard shifts" fairness table are drawn from that copy. Without a module worker it plans on the main thread as before. `planWeeks` gained an `onWeek(done, of)` callback for this and nothing else; the weeks it builds are unchanged.

Measured in headless Chromium, café sample, four weeks, exact check on (`build-worker.check.mjs`):

| planner | time to the table | longest gap between frames |
|---|---|---|
| main thread (Worker removed) | 7.2 s | 6,233 ms |
| worker | 6.4 s | 17 ms |

Same table text from both. Stop ends a plan mid-run ("Stopped…", no table) and the next plan works. `page-worker.test.mjs` checks that the worker's plan equals a direct `planWeeks` call (timings aside), that it posts exactly one progress message per week, that `planFairness` reads the same from the structured-clone copy, and that the page's click handler no longer calls `planWeeks` itself.

Not claimed: one machine, one sample, four weeks. The per-week exact budget stays 4 s, so plans are the same as before; a longer budget proved no more weeks when measured later the same day (below).

## The planner stops rebuilding the same week (2026-11-12)

Two questions about "Plan several weeks in a row" (and `--weeks` on the CLI), both measured with `node eval/plan-budget.mjs` (readings in `eval/plan-budget.out.txt`; one 4-core cloud machine).

**Does a longer exact budget than the page's 4 s prove more planned weeks? No, not on any week measured.** The page passes `exactMs: 4000` to each week (the builder's default is 8000; weeks above 60 shift copies give column generation 4 x that). The four templates planned 4 weeks, and two seeded 30 x 84 and two 40 x 112 weeks planned 4 weeks, at 4, 8 and 16 s:

| plans | weeks | proven at 4 s / 8 s / 16 s | open hours, pay |
|---|---|---|---|
| 4 templates x 4 weeks | 16 | 16 / 16 / 16 | identical at every budget |
| 30 x 84, 2 cases x 4 weeks (121-122 copies) | 8 | 8 / 8 / 8 | identical (1,292 h, $81,544) |
| 40 x 112, 2 cases x 4 weeks (148-149 copies) | 8 | 8 / 8 / 8 | identical (1,260 h, $98,544) |

Every week finished well inside 4 s of exact search (the slowest took 9.6 s end to end, most of it outside the exact stage), so the budget was never what stopped it. The page keeps 4 s.

**Why every planned week looked the same.** In those plans week 1, week 2 and every later week came out the same roster, and the planner built each one from scratch. The reason: what carries from one week to the next is each person's last shift end (`prev:`), their run of days (`streak:`) and the rolling tough-shift tally (`tough:`). The first two settle after week 2 when the shifts repeat; the tally keeps changing (it fades by half each week), but it only enters the search when the spread setting (`toughBalance`) is above 0, which is not the default. So from week 3 on, the default plan asked the same question again.

`planWeeks` now keeps each week it built under its parsed staff (with the tally left out when the spread setting is 0) and hands a later week with the same staff that roster, marked `sameAs: <week>`; the page shows "same rota as week 2" in that row. Anything that changes the week, a dated day off, a different carried-over rest gap or the tally with spread on, makes it a rebuild. `reuse: false` rebuilds every week.

| plan (exact check on, 4 s per week) | before | after |
|---|---|---|
| café, 4 weeks | 6.8 s | 3.3 s |
| 4 templates, 4 weeks each | 8.4 s | 4.1 s |
| 4 templates, 8 weeks each | not run | 4.1 s (32 weeks, all proven) |
| 40 x 112 case 0, 4 weeks | 20.0 s | 9.0 s |
| 40 x 112 case 1, 4 weeks | 35.6 s | 16.7 s |

Same rosters, open hours and pay in every row. `plan-reuse.test.mjs` checks, on all four templates over 6 weeks and on the café sample with the exact check on over 4, that the reused plan's CSV, pay, open hours and score equal a plan that rebuilds every week; that a day off dated in week 3 makes week 3 a rebuild; and that with the spread setting at 60 no week is reused.

Not claimed: seeded synthetic weeks and the built-in templates, with no dated time off, which is the case where weeks repeat; a real team with leave spread through the month repeats less. The 30 x 84 and 40 x 112 budget runs ran two at a time on 4 cores. Below their time budgets the exact stages are deterministic, so a rebuild gives the same roster; on a week that hits a time limit a rebuild could in principle land on a different roster of the same proven bound, and reuse returns the first.

## The guide pages re-derived with the exact check on (2026-11-12)

The 14 guide and trade pages quoted the quick search (`exact: false`), with a note that the builder's default had since moved to the exact check, so a reader who tried the same week in the builder saw different numbers (the café: 15 hours open, not 19). Every table is now re-derived from the default build, and the tests that pin those figures (`page.test.mjs`, `page-limits`, `page-posted`, `page-timeoff`, `page-widening`, `page-callout*`) run the default and, for the café tables and the rotation plan, assert that each roster is proven (`optimality.status` "optimal" or "improved"). `eval/callout-cover-study.mjs` and `eval/callout-churn-bench.mjs` take `exact` (default "auto"; `EXACT=off` on the command line for the old figures).

What the proof changed in what the pages say, not only in the digits:

| page | quick search said | proven roster says |
|---|---|---|
| clopening | 8-12 h rest gap leaves one more shift open; 14 h covers more than 12 h | up to 10 h costs nothing (220 h, $3,690 either way); 12 and 14 h both cost 2 h |
| days in a row | 5 days costs a shift; 4 days covers more than 6 | 6, 5 and 4 days all cost nothing; 3 days costs 16 h |
| time off | the second weekend request costs a shift | the first two are free; the third costs 8 h |
| rotation (6 identical staff, 8 weeks) | spread setting narrows the tough-shift gap 3 to 2 | setting 10 makes it 0 (36 each), same $28,200 |
| widening | freeing Eli or lifting Ben or Fay closes one shift | each closes two (+6 h); Cleo still the big one (232 h) |
| call-out | rebuilds cover 24 of 29 call-outs; a spare part-timer doesn't help | 15 of 27; with the spare 20 of 32 |
| posted schedule | rebuild leaves the caller's shift open in 3 of 5 cases, moving 4-10 others | rebuild covers every case but moves 3-15 others |
| overtime, labor cost, template, 14-15, coffee | | new figures; worst labour day Tue 37.8% becomes Mon 36.5%; coffee $2,066 to $2,060 |

Restaurant, retail, salon, daycare and the hiring test were already the same under both. The five open shifts on the proven café week are the weekday 11:00-14:00 lunches (everyone free then is at their weekly limit), so the pages now say which shifts and why.

Not claimed: the call-out and posted-schedule studies' individual rebuilds are not each asserted proven (about 60 builds); the 8-week rotation and the café rows are. The exact check runs under a time budget above 60 copies; every week here is 16-32 shifts and proves in 0.3-2.6 s on one cloud machine, so the figures should not depend on machine speed, but a much slower machine could in principle stop early. The guide page tests now take longer (the `page*.test.mjs` files took 89 s together on one 4-core cloud machine, all 50 passing).

## Open hours come in whole shifts (2026-11-12)

The guide-page section above left one thing unchecked: the call-out and posted-schedule studies' individual rebuilds were not each asserted proven. They now report the exact check's status on every rebuild (`eval/callout-cover-study.mjs` and `eval/callout-churn-bench.mjs` print it), and an independent ILP checks the call-out weeks' open hours (`eval/callout-ilp-export.mjs` dumps the 59 weeks with their hard rules; `eval/callout-ilp-check.py` solves each with HiGHS through scipy: availability with the day off, one person per shift copy, the 10 h rest gap, weekly and daily caps and at most 6 days in a row; no pay terms).

| study | rebuilds | proven (optimal or improved) | open hours against the ILP |
|---|---|---|---|
| posted schedule (`page-posted.test.mjs`) | posted week + 4 | 5 of 5 | (not run; all proven) |
| call-out, sample café (`page-callout.test.mjs`) | 27 | 27 of 27 | equal on 27 |
| call-out, with a spare part-timer | 32 | **30 of 32** before, see below | equal on 32 |

The two unproven weeks were Cleo off Saturday and Eli off Saturday with the spare part-timer: 3 h open (one weekday lunch), and the ILP proves 3 h is least in 0.1 s. The engine's floor stopped at 2 h, took 39-41 s, and called the week "bounded" with a $99,976 gap, which is one open hour at the 100,000-per-hour coverage weight. The roster was right; the proof was not.

The reason is arithmetic, not search. Open hours are a sum of whole shifts: a shift is held or it is open. The café's shifts are 3, 8 and 10 hours long, so no set of open shifts adds up to 2 h, and a floor of 2 h means at least 3 h. The engine already rounded its floor up to the shared hour grid (whole hours here), which cannot see that. Now `openSumLift` (calc.mjs) rounds every open-hours floor in `exactSearch` up to the least subset sum of the week's shift lengths at or above it: the priced floor, the branch on that price, the branch-and-price floor, and every node bound of the coverage tree and the score tree. A small subset-sum table (quarter-hour units, up to one shift past the incumbent's open hours) makes each lift one lookup. Lengths off the quarter-hour grid leave the floor as it was. `openSums: false` turns it off.

| week (spare part-timer) | before | after |
|---|---|---|
| Cleo off Sat | 41.2 s, floor 2 h, coverage not proven, gap $99,976 | 28.0 s, floor 3 h, **coverage proven**, gap $647 (0.21%) |
| Eli off Sat | 38.6 s, floor 2 h, coverage not proven, gap $99,977 | 27.3 s, floor 3 h, **coverage proven**, gap $549 (0.18%) |

Both still end "bounded" on the whole score: the pay part of the bound is $549-647 short. The whole-score column generation does not see the lifted floor (its master LP lets 3/8 of an 8 h shift stand in for the open lunch), so it reports 204,094 against the exact search's 303,423. Feeding it the floor needs a knapsack row (sum of open hours at least the floor) in `bnp.mjs`, whose simplex assumes 0/1 columns and right-hand sides of 1; that is the next step here. (Done the same day: next section.) Same rosters, open hours and pay on every one of the 59 weeks before and after (`eval/callout-ilp-check.before.txt`, `eval/callout-ilp-check.out.txt`), and the full venture suite passes unchanged.

Tests: `open-sums.test.mjs` (the lift against a brute-force subset sum on 200 random length sets, never below the floor it is given; the Cleo week proven on coverage with the lift and not without it), `page-callout.test.mjs` (all 27 sample rebuilds proven) and `page-posted.test.mjs` (the posted week and its four rebuilds proven). Not claimed: the spare-part-timer rebuilds are not asserted proven in their test, since two stay bounded on pay; one cloud machine; the lift only bites where the floor falls between two reachable sums, which needs open hours made of few, uneven shifts (a lunch cover, a short close); the 20-60 person benches were not re-measured with it, and with many shifts of 4-12 h most whole hours are reachable sums, so it should matter less there.

## The open-hours row in the score LP (2026-11-12)

The section above left two call-out weeks (spare part-timer, Cleo or Eli off Saturday) proven on coverage, 3 h open, but "bounded" on pay, $549-647 short, after 38-41 s. The whole-score column generation's master LP let 3/8 of an 8 h shift stand in for the 3 h lunch that must stay open, so its bound sat one open hour (100,000) below the roster.

**What changed.** `columnGenerationOpen` (bnp.mjs) takes `openFloor` F, a floor on open hours already proven for every roster, and adds the knapsack row "open shift hours >= F" to every node's master LP. The simplex assumed 0/1 columns and right-hand sides of 1; `solveLP` now takes `vals`, per-column coefficients, and the row is scaled to a right-hand side of 1 (len[s] / F on each open-shift column, a surplus column at -1). The surplus starts basic, since with every shift open the row's left side is total hours / F >= 1; an artificial there would start negative, and the first version did exactly that and returned a bound of 0. The row touches only open-shift columns, so the pricing oracles are unchanged, and since it holds for every roster every bound stays valid.

In `buildRoster`, when the first whole-score column generation does not prove the roster, the exact search computes its open-hours floor (priced, branched, lifted to whole-shift sums) and then calls back with it before its own score tree. If 100,000 x that floor is above the first pass's bound, column generation runs again with the row; when its bound reaches the best roster, the tree is skipped and the roster is proven. `optimality.openRow` reports the floor, the root LP, the bound and the time. `openRow: false` turns it off.

| week (spare part-timer, default options) | before | after |
|---|---|---|
| Cleo off Sat | 27.4 s, bounded, lower bound 303,423, gap $647 | 19.6 s, **proven** ("improved"); row's root LP 304,070.57 against 304,070.6, 1 node, 0.15 s |
| Eli off Sat | 27.3 s, bounded, gap $549 | 19.6 s, **proven**; root LP 304,005.02, 1 node, 0.19 s |

("Before" is the code with the lift and no row: Cleo measured in this run with `openRow: false`, Eli as the section above reported it; both were 38-41 s before the lift.) The call-out study (`node eval/callout-cover-study.mjs`, `eval/callout-cover-study.out.txt`): the sample's 27 rebuilds 27 of 27 proven as before, the spare part-timer's 32 rebuilds now **32 of 32** (was 30 of 32), with the same covered counts (15 of 27, 20 of 32) and the same moves.

Re-measured where the row could fire: weeks of up to 60 copies, where the exact search runs. The 6-15 person benches (15 weeks) and the four templates give the same rosters and scores as `eval/auto-exact.out.txt` (`eval/auto-exact-open-row.out.txt`); the first column generation already proves every one, so the row never ran. The 20-60 person benches are above 60 copies, where the exact search is skipped and no proven floor exists to feed the row; they are unchanged by construction and were not re-run.

Tests: `open-row.test.mjs` (a hand LP whose answer is known at three floors; on 399 seeded three-person weeks with 3, 8 and 10 h shifts and 8-16 h caps, the brute-force least open hours as the row never lifts the root LP or the floor above the brute-force best score and never lowers the root LP; it raised the root LP on the weeks where whole shifts matter, and a full search with the row reaches the brute-force best there), `open-sums.test.mjs` (the Cleo week now proven, through the row). Same run, a test fix: `keep-shifts.test.mjs` read `b.bound` from the score column generation, which returns `floor`, so its "bound stays below the brute-force best" check never ran; it reads `floor` now and passes.

Not claimed: two weeks changed, both from the call-out study; on every other week measured the row did not run. The first, row-less column generation still spends its full 8 s on those weeks before the floor is known, and the exact search's floor stages take about 9.7 s more; feeding the floor earlier would cut that. Above 60 copies there is no proven floor yet to feed. One cloud machine.

## Keep people on their usual shifts (2026-11-12)

The planner (and the plan reuse above) asked how often weeks repeat once dated leave spreads through a month. Measured with `node eval/steady-plan.mjs 5 4` (readings in `eval/steady-plan.out.txt`), the answer was "rarely", and that exposed a worse problem. When a week has someone off, the rebuild finds a roster as good as any on paper, but it moves people who were not off. On the café sample with Ana off on Tuesday and Ben on Friday of week 3, the proven rebuild changed 15 person-shifts going into week 3, among them a swap of Dev's and Gus's weekend opens that no time off required. It changed 15 more going back.

**What changed.** `buildRoster` takes `keep` (person name to the shifts they had, each `slotKey`: day, start, end, role) and `keepValue`. Each hour someone works one of their keep shifts earns `keepValue` x their wage in the score, the same way a `prefer:` hour does. It runs through `preferBonus`, so the annealer, the exhaustive search's suffix bound, the pricing oracles and column generation all see it. The bonus is a fraction of a wage and an open hour costs `BIG`, so a proven roster never leaves an hour open to keep someone in place. An unproven one is checked: if a build without the bonus leaves fewer hours open, that build is returned (`keepChecked`). With the exact check off, one sample plan had left 5 more hours open with the bonus. `planWeeks` with `keepValue > 0` first builds the usual week (the staff text with dated days off left out, bonus off), then builds every planned week with that week as `keep`.

Anchoring on the week before was tried first and dropped. It carried week 3's reshuffle into week 4 (5 of its 16 changes were week 4 not going back). `keepFromCsv` reads a roster CSV (role-free keys) for one-week builds. On the CLI that is `--keep-shifts 0.1` with `--weeks` or `--last-week`. On the page it is "Keep people on their usual shifts", default **Yes (0.1)**, applied to "Plan several weeks" and to a build after "Carry over last week". The CLI and `planWeeks` default to 0, so the guide pages and every existing figure are unchanged.

Five invented teams (café sample, café, salon, retail and clinic templates), 4 weeks, leave scattered at random on each person-day at the rate shown, 5 draws, page settings, exact check on (100 weeks per row):

| days off | keepValue | changes week to week | forced | off the usual rota | open h | pay |
|---|---|---|---|---|---|---|
| 0 | 0 / 0.05 / 0.1 / 0.25 | 0 | 0 | 0 | 700 | $287,840 (all the same) |
| 2% | 0 | 617 | 25 | 496 | 785 | $286,537 |
| 2% | 0.1 | 170 | 26 | 119 | 785 | $286,423 |
| 4% | 0 | 1,022 | 67 | 1,000 | 952 | $283,733 |
| 4% | 0.1 | 378 | 64 | 298 | 952 | $283,542 |
| 8% | 0 | 1,226 | 106 | 1,265 | 1,147 | $280,042 |
| 8% | 0.1 | 536 | 107 | 439 | 1,147 | $279,496 |

"Changes" counts person-shift pairs that differ from the week before (adds plus drops). "Forced" counts the drops whose holder is off that day. "Off the usual" counts, over all weeks, the pairs that differ from the usual week. Changes fell 56-72% and distance from the usual week fell 65-76%. Open hours were the same in all 15 leave-rate x setting comparisons, all 1,600 planned weeks were proven, and pay moved under 0.2%, always down. 0.05 and 0.25 land within a few percent of 0.1 (see the out file), so the page's two levels are 0.1 and 0.25. Cost: a plan took 20-42% longer, mostly the extra build of the usual week (reuse is the same or higher with the bonus: 18 against 15 weeks reused at 2%). With no time off, plans and reuse are unchanged (`keep-shifts.test.mjs`).

With the exact check off (`EXACT=off`), the same sweep was started but stopped unfinished in this run to free the machine for the test suite, so there is no reading for the quick search. The unproven-roster check above exists because of that case.

Tests (`keep-shifts.test.mjs`): on 24 seeded tiny weeks with random keep maps and keepValue 0.1/0.25/1, the exact search returns the brute-force best score over every owner array, and the column-generation score bound stays below it. keepValue 0 or no map gives the same roster as before. On the four templates, keeping a rough roster never opens more hours than the proven build. `keepFromCsv` matches `keepFrom`. The café plan above is pinned with the guide page's figures (`keep-a-consistent-schedule-when-someone-is-off.html`). The CLI path is covered as well.

Not claimed: the leave rates are swept, not read from real leave records (UCI's absenteeism dataset and BLS absence tables were not reachable from this host). The teams are invented. "Changes" counts pairs and does not weight a moved close against a moved lunch. Whether staff notice, or managers prefer the steadier plan, is unmeasured.

## The open-hours row from the first pass (2026-11-12)

The section "The open-hours row in the score LP" proved the last two call-out weeks (spare part-timer, Cleo or Eli off Saturday), but only after the first, row-less whole-score column generation ran out its 8 s and the exact search spent about 10 s more on its floor stages; the floor that finally closed them was 3 h. That floor is cheap to find another way. The coverage-only column generation (open hours, no pay; the same `columnGenerationOpen` with `makeSetPricer`) has a root LP of 1.5 h on those weeks in under 0.05 s. Open hours are sums of whole shifts of 3, 8 and 10 h, so `openSumLift` lifts 1.5 h to 3 h, and the first whole-score pass now gets that as its open-hours row (`earlyOpenFloor` in calc.mjs). It is passed only when the lift raises the floor above the root LP, so on weeks where whole shifts say nothing new, nothing changes. `optimality.earlyFloor` reports `{ floor, rootLP, ms }`; `earlyFloor: false` turns it off.

`node eval/early-floor.mjs` builds every call-out rebuild of both studies (the café sample and the sample with a spare part-timer, posted weeks included) and the four templates twice, early floor off and on, default options (`eval/early-floor.out.txt`, one 4-core cloud machine, another bench running alongside):

| weeks | early floor fired | score, open hours, status | time, off -> on |
|---|---|---|---|
| Cleo off Sat, spare part-timer | yes: LP 1.50 h -> 3 h | same (304,070.57, 3 h, proven) | 19.4 s -> 1.7 s |
| Eli off Sat, spare part-timer | yes: LP 1.50 h -> 3 h | same (304,005.02, 3 h, proven) | 19.1 s -> 1.7 s |
| the other 63 (59 rebuilds and posted weeks, 4 templates) | no | same rosters | -0.13 to +0.14 s each (run-to-run noise on a shared machine; the root LP itself is tens of ms) |
| all 65 | 2 | 65 of 65 proven both ways | 88.7 s -> 54.5 s |

On the two weeks that fired, the roster differs from the old one but has the same score to the cent (a tie between proven rosters); the call-out study's counts (`node eval/callout-cover-study.mjs`: 15 of 27 and 20 of 32 covered, 2-15 and 9-21 other shifts moved, every rebuild proven) are unchanged.

**Above 60 copies it is off by default.** The flagship's next-step list asked to feed the row on weeks above 60 copies, where the exact search (the only source of the floor so far) is skipped, and suggested a coverage-only column generation for it. Measured on the cg-scale-bench weeks (`node eval/early-floor.mjs bench P S cases` with `earlyFloor: true`, and a probe of the root alone): on all eight 30-60 person weeks (121-245 copies) the coverage root LP came out in whole hours (181, 142, 189, 169, 146, 281, 212 and 302 h), so the lift adds nothing, and the root cost 0.3-2.2 s. With shifts of 4-9 hours almost every whole hour is a reachable sum, as the lift's own section predicted. So `earlyFloor` runs by default only up to 60 copies (`EXACT_TREE_SLOTS`); `earlyFloor: true` runs it at any size. On the 60 x 168 week 0 the 2 s root reached only 212 h against the score LP's 275.2 h, so the coverage LP is not what will close that gap either.

Tests: `open-row.test.mjs` (on the 368 seeded three-person weeks with open hours, the early floor never exceeds the brute-force least open hours, and it fires, with a lift, on 4 of them), `open-sums.test.mjs` (the Cleo week proven in the first pass with the early floor, and by the late row with `earlyFloor: false`, at the same score). Not claimed: one cloud machine; two weeks changed, both from the call-out study; weeks above 60 copies are unchanged by default.

## Reissue a posted week without reshuffling it (2026-11-12)

The planner's "keep people on their usual shifts" (above) keeps a multi-week plan steady. The same problem shows up inside one posted week: someone calls out, the manager adds `off: Thu` and builds again, and the rebuild treats the posted roster as if it did not exist. Two things go wrong. It can move shifts that were already worked (Monday and Tuesday, when the call-out comes in Tuesday evening), and it has no reason to prefer a roster that leaves everyone else where they were, so it reshuffles people who did nothing. Where a short-notice rule applies, each of those moves can owe a premium.

**What changed.**
- `pinStarted(slots, postedCsv, changedAt)` (calc.mjs) pins every shift that started before the change to whoever held it in the posted CSV (`fixed:`), matched on day, start and end, one copy per row; a started shift that was open stays open (pinned to `STARTED_OPEN`, a name no one has, with no "not in the staff list" warning). Later shifts are untouched.
- `keepShift` is the keep bonus counted per shift instead of per hour: each kept shift earns `keepShift` x the person's wage, whatever its length. That is the shape of a per-change premium, which is charged per shift, not per hour. It goes through `slotBonus`, so the annealer, the exact search, every bound and the pricing oracles see it, and like `keepValue` it is far below an open hour, so a proven roster never leaves a shift open to keep someone in place (the `keepChecked` guard covers unproven ones). `keepValue` and `keepShift` can be combined.
- CLI: `--changes posted.csv` now builds this way by default: `--keep-posted 1` (hours of pay per kept posted shift; `0` rebuilds freely) and, with `--week-start` and `--changed-at`, shifts that started before the change held as posted. The report's first line says which was done.
- Page: with a roster loaded in "Changes since you posted it", the next build does the same ("When you build again, keep the posted shifts", default Yes).

**Measured** with `node eval/reissue-posted.mjs` (`eval/reissue-posted.sample.txt`, `eval/reissue-posted.spare.txt`): every person who works Wednesday to Sunday on the posted week, on the sample café (19 call-outs) and the café with a spare part-timer (22), each calling out for that day with the change made at 5pm the evening before; started shifts pinned in every rebuild; changes priced by `scheduleChanges` at a 336 h window and 1 hour of pay each, the caller's own changes exempt. Default options, exact check on.

| 41 call-outs | open h | late changes to others | premium | payroll | proven |
|---|---|---|---|---|---|
| patch (cheapest person who fits, nobody else moves) | 606 | 0 | $0 | (approximate) | - |
| free rebuild | 431 | 190 | $3,190 | $153,339 | 41 / 41 |
| keepValue 0.1 (per hour, the planner's) | 431 | 92 | $1,591 | $153,355 | 41 / 41 |
| **keepShift 1** (the new default for a posted week) | 431 | **91** | **$1,572** | $153,371 | 41 / 41 |
| keepShift 2 | 431 | 91 | $1,572 | $153,371 | 41 / 41 |
| keepShift 20 | 431 | 94 | $1,620 | $153,374 | 41 / 41 |

Keeping the posted shifts halved the late changes to other people (190 to 91) and the premium ($3,190 to $1,572) at the same open hours on all 41, for $32 more payroll in total (0.02%). The patch moves no one else, but it rarely finds anyone who can take the shift outright on this café, so it leaves 175 more hours open. Time: 7.9 s for the 41 free rebuilds, 10.7 s with keepShift 1, on one 4-core cloud machine.

The guide page [changing a posted schedule](schedule-change-after-posting.html) has the four Wednesday call-outs (free rebuild 4-8 changes to others, kept 2-4; `page-reissue.test.mjs` re-derives the table). Its older table, from `eval/callout-churn-bench.mjs`, did not pin the started shifts, so its rebuilds were free to move Monday and Tuesday shifts that had already been worked; the counts differ (Dev 15 there, 7 pinned; Gus 3 there, 6 pinned, since the pinned week leaves fewer ways to cover), and the page says why.

Tests (`reissue-posted.test.mjs`): with `keepShift` (0.5, 1, 2, some with `keepValue` too) the exact search returns the brute-force best score on 24 seeded tiny weeks and the column-generation score bound stays below it, and the bonus changes the best score on most of them; `keepShift: 0` builds the same roster as no keep; `pinStarted` holds every started shift and a rebuild returns each one as posted; on three café call-outs the kept rebuild owes less premium at the same open hours; the CLI's `--changes` keeps by default and `--keep-posted 0` does not. The page path was checked in headless Chromium (the café with Dev off Thursday: 6 changes kept against 10 free, no console errors), not in a committed test.

Not claimed: the teams and the premium rule are invented; whether a premium applies, and to what, is the operator's to enter (no ordinance is preset or checked). The bonus scores kept shifts, not changes, so a move between two times on one day (one change to `scheduleChanges`) loses two kept shifts in the score; keepShift 20 on the spare-part-timer café made 3 more changes than keepShift 1 for that reason. Whether 91 is the least number of changes at these open hours: answered in the next section (it is the least once the caller's own changes count; 88 is the floor when they are all free). A real posted schedule and a real call-out log are wanted.

### Is 91 the least? A change-count ILP (2026-11-12)

`eval/reissue-ilp-export.mjs` dumps the same 41 reissues (the two cafés, the started shifts pinned, the caller's day off) with the engine's rebuilds, and `eval/reissue-ilp-check.py` solves each one independently with HiGHS (scipy) in two stages: the least open hours under the hard rules alone (availability, one person per shift copy, the rest gap, weekly and daily caps, days in a row: the rule set `eval/callout-ilp-check.py` already matched the engine on 59 weeks), then, at exactly that many open hours, the fewest changes, counted the way `scheduleChanges` counts them: per person, a posted shift kept at the same start and end is no change, and on each day the leftover posted and new shifts pair off as moves, so a day costs max(unkept posted shifts, unmatched new shifts). Each engine roster is also scored by that count and checked against those rules: the counts equal `scheduleChanges` on all 123 rosters (41 weeks x 3 variants) and none breaks a rule. The engine's open hours equal the ILP's least on all 41.

| 41 call-outs, at the least open hours (431 h) | changes counted as the study counts (caller exempt) | the caller's changes counted too |
|---|---|---|
| least possible (ILP) | **88** | **153** |
| free rebuild | 190 (above the least on 33 weeks) | 269 (33) |
| **keepShift 1** (the default) | 91 (above on 3) | **153 (above on 0)** |
| keepShift 20 | 94 (above on 5) | 156 (2) |

Outputs: `eval/reissue-ilp-check.out.txt` and `eval/reissue-ilp-check.all.txt` (`--all`). Under a rule that charges every change after posting, the caller's own included, the default reissue is the least on every one of the 41 weeks. The study's count exempts every change to the caller, and on three weeks (Gus off Wednesday on the sample café, Gus and Hal off Thursday with the spare) the ILP uses that: it moves the caller's other shifts, which costs nothing under that count, to save one change to someone else (sample Gus Wednesday: Ben moves within Friday and gives up Thursday, and Gus takes Thursday and Friday late, 3 changes to others against the engine's 4, both 6 counted over everyone). The engine's keep bonus counts the caller's posted shifts like anyone's, so it does not do that. Whether a rule excuses unrequested changes to the caller's other shifts is the operator's to decide (no ordinance was read here); counting them is the stricter reading, and under it the default is already the least, so "88" is a floor under the study's own simplification rather than a target, and the keep bonus was left as it is. keepShift 20 ends one change above the least on two weeks even with everyone counted: the bonus counts kept shifts, not changes (not diagnosed further). A same-day bonus (a share of keepShift for a shift on a day the person was posted on, which makes the bonus fall by one keepShift per change for anyone with at most one shift a day) was tried and changed none of the 41 rosters, so it was not kept. Time: the export about 40 s, the ILP under 0.2 s a week.

Not claimed: two invented cafés and 41 call-outs; the hard rules are the ILP's own transcription (cross-checked, not proven equal to the engine on every input); the second stage has no pay or fairness terms, so a least-change roster can cost more.


## The reissue on the templates and 20-60 person weeks, and a kept start (2026-11-12)

The posted-week reissue above was measured on two invented cafés. `node eval/reissue-scale.mjs templates` runs the same study on the page's four built-in templates (every person posted Wednesday to Sunday calling out that day, change at 5pm the evening before, started shifts pinned, 336 h window, 1 hour of pay per change, the caller exempt), and `node eval/reissue-scale.mjs P S 2 4` on two seeded weeks of each size from `eval/auto-exact.mjs` (Mon-Fri weeks, so call-outs Wednesday to Friday, every k-th posted person so 4 a day: 24 call-outs a size). Default options, exact check on, one 4-core cloud machine with up to two benches running at once.

**What the first run found.** On the templates and the 20-30 person weeks the kept reissue cut changes to other people by 55-90% at the same open hours. On the 40 and 60 person weeks it still cut them, but less than it should have: four Wednesday reissues on the second 40 x 112 week stopped on the time limit unproven and kept rosters with 37-39 changes against 7-8 on their neighbours, and on 60 x 168 three reissues made more changes than a free rebuild. The cause: the annealer builds every roster from scratch, so on a big week its start is far from the posted one, and when the exact stages run out of time nothing pulls the roster back.

**What changed.** With a keep map (`keep` with `keepValue` or `keepShift`, so the planner's keep-usual-shifts as well as a posted week's reissue), the builder also starts from the kept roster itself (`keptStart` in calc.mjs): in start order each shift goes to someone who held it when the hard rules allow, every shift still open goes to whoever adds the least score, then the pay polish runs from there, and the better of that and the annealer's roster goes on to every later stage. `keptStart: false` turns it off.

| call-outs (changes to other people) | free rebuild | keepShift 1, before | keepShift 1, kept start | open hours |
|---|---|---|---|---|
| 4 templates (56) | 162 | 73 | 73 | same in all columns |
| 20 x 56, 2 weeks (24) | 253 | 26 | 26 | same |
| 30 x 84, 2 weeks (24) | 507 | 50 | 50 | same |
| 40 x 112, 2 weeks (24) | 603 | 124 | **40** | same |
| 60 x 168, 2 weeks (24) | 1,623 | 973 (3 above the free rebuild) | **76** (none above) | same |

Outputs: `eval/reissue-scale.*.txt` (after) and `eval/reissue-scale.*.before.txt`. Below 40 people every kept reissue was already proven, so the kept start changes nothing there (same rosters on the templates and the 20-30 person weeks). On the 40 x 112 Wednesday reissues above it took the four unproven ones from 91 changes to 7, still unproven (the exact search runs out of time either way) but with the same open hours and $136 less pay. On 60 x 168 changes fell from 973 to 76 and payroll from $458,342 to $457,472, below the free rebuild's $457,562. Premiums follow changes: on 40 x 112, $2,050 before and $745 after against $9,565 for a free rebuild; on 60 x 168, $14,642 before and $1,208 after against $24,615. Time is unchanged (the kept start is one pay polish; the exact stages' time limits dominate on these weeks). With the kept start, keepShift 1 made fewer changes than keepValue 0.1 at 40 and 60 people (40 vs 44, 76 vs 129).

Tests (`reissue-posted.test.mjs`): on the salon and retail templates the kept reissue never opens more hours and never makes more changes than a free rebuild, with fewer changes in total; on the seeded 20-person week, a keep map of a posted roster with nothing changed gives the posted roster back with the kept start (0 changes) and moves 3 shifts without it.

Not claimed: seeded synthetic weeks and invented templates; 4 call-outs a day sampled on the seeded weeks, not every one; the unproven big-week reissues depend on machine speed. The kept start also runs in the planner's keep-usual-shifts (`--keep-shifts`); its tests pass unchanged, but the sweep in "Keep people on their usual shifts" was not re-run. Half the 60-person reissues and a sixth of the 40-person ones are still unproven; whether their remaining changes are needed is answered in the next section.


## Are the big-week reissues' changes needed? The change-count ILP at 20-60 people, and an eject move (2026-11-12)

The change-count ILP above (`eval/reissue-ilp-check.py`) was run on the two cafés only, and half the 60-person reissues are unproven. `eval/reissue-ilp-export.mjs` now also takes `templates` and `P S [cases] [cap]` (the same call-outs as `eval/reissue-scale.mjs`, whose seeded-week generator it imports), and the ILP check takes `--limit=` and `--dump=`. A new `eval/reissue-ilp-score.mjs` scores the ILP's least-change roster under the engine's own objective (every copy pinned to its owner, same options), which says why the engine kept more changes than the least: if the ILP's roster scores worse, the engine traded a change for pay or another term on purpose; if it scores better, the engine's search missed it.

**What the first pass found.** At 40 x 112 the default reissue was at the least changes on 20 of 24 call-outs (40 changes to others against 33). At 60 x 168 it was at the least on 21 of 24, but 76 against 24, and 49 of the excess came from one call-out: P0 off Thursday on the first 60-person week made 51 changes where 2 suffice, and stopped unproven. On the one 40-person miss checked by score (P10 off Wednesday, unproven), the ILP's 1-change roster also scored 35 points better than the engine's 5-change one, so the search had missed it.

**Why.** The ILP's single change there is P0 moving up from a 6-11 copy to the caller's 6-14 shift on the same day, which leaves the shorter shift open: 3 fewer open hours for one change. The kept start could not make that move. It gives an open shift only to someone who can take it on top of what they hold, and the pay polish after it never touches an open shift, so the kept start began 3 hours short and the later stages closed the gap with a chain of moves through other people.

**What changed.** The kept start (`keptStart` in calc.mjs) ends with eject moves: for each shift still open, longest first, someone eligible takes it by giving up one shift of theirs that clashes (never a started, pinned one), and the shift they gave up goes to whoever takes it at the least score or stays open, when that lowers the score. Open hours dominate the score, so a longer shift for a shorter one is taken. Up to three passes. `keptEject: false` turns it off.

| call-outs (changes to other people, caller exempt) | least (ILP) | free rebuild | keepShift 1, before | keepShift 1, with eject | weeks above the least, after |
|---|---|---|---|---|---|
| 4 templates (56) | 63 | 162 | 73 | 73 | 7 |
| 20 x 56, 2 weeks (24) | 23 | 253 | 26 | 26 | 3 |
| 30 x 84, 2 weeks (24) | 46 | 507 | 50 | 50 | 3 |
| 40 x 112, 2 weeks (24) | 33 | 603 | 40 | **37** | 4 |
| 60 x 168, 2 weeks (24) | 24 | 1,623 | 76 | **26** | 2 |

With the caller's own changes counted too (`--all`): templates 133 least against 148, 20 x 56 49 against 53, 30 x 84 74 against 80, 40 x 112 57 against 64 (67 before), 60 x 168 55 against 57 (107 before). Unlike the cafés, where counting the caller closed the whole gap, these gaps stay, so the default is not the least-change roster everywhere. The score check says why on every one: on all 19 call-outs still above the least after the change (7 + 3 + 3 + 4 + 2), the ILP's least-change roster scores worse under the engine's own objective, by 0.64 to 109 score points (dollars of pay plus the soft terms; `eval/reissue-ilp-score.*.txt`). keepShift 1 is one hour of the person's wage per kept shift, and on those weeks one more change buys more than that in pay, fairness or preference terms; for example on the salon template with Orla off Wednesday the least-change roster pays $46 less but scores 53 worse once the engine's other terms (fairness, preferences, hour targets) are added. A user who wants fewer changes at any price raises `--keep-posted`; that is a setting, not a search miss. No search miss is left on these 152 call-outs.

Every engine roster's change count equals the ILP's count, none breaks an ILP rule, and every one is at the ILP's least open hours. Payroll on 60 x 168 fell from $457,472 to $457,398 (below the free rebuild's $457,562); on 40 x 112 it moved by $1. The templates and 20-30 person weeks give the same payroll as before to the dollar, and the cafés the same 91 changes (153 with the caller counted), so the eject move did not touch those reissues. At 40 x 112, 18 of the 24 reissues now finish on the start roster (status optimal, against 10 before). Time is unchanged (360 s for the 24 kept 60 x 168 reissues before and after); the ILP takes under 3 s a call-out at 60 x 168 except four Wednesdays on the second week (17-83 s).

Outputs: `eval/reissue-ilp-check.<set>.txt` and `.all.txt` (after), `eval/reissue-ilp-check.40x112.before*.txt` and `60x168.before*.txt`, and `eval/reissue-ilp-score.<set>.txt`. Test (`reissue-posted.test.mjs`): on a three-shift week where the caller's 6-14 can only be covered by moving Ana up from 6-11, the kept start leaves 8 hours open without the eject move and 5 with it, Ana on 6-14.

Not claimed: seeded weeks and invented templates; 4 call-outs a day sampled on the seeded weeks; the ILP's hard rules are its own transcription, cross-checked against every engine roster, not proven equal to the engine on every input; the unproven reissues depend on machine speed (on the cafés keepShift 20 made 95 changes this run against 94 in the section above). An eject move gives up one clashing shift; a person who must give up two to take an open one is not tried. The planner's keep-usual-shifts runs the kept start too; its tests pass, but its sweep was not re-run.


## Giving up two clashing shifts, and the keep-usual-shifts sweep with the kept start (2026-11-13)

Two open items from the section above, both answered here, both with no change to any measured roster.

**The two-shift eject.** The kept start's eject move gives up one clashing shift. A person can block an open shift with two: Ana holds Tuesday's 15-23 close and Wednesday 9-17, and the caller's Wednesday 6-14 clashes with both (7 hours' rest after the close; an overlap with 9-17). Dropping either one alone makes no room, so the one-shift move never fires and the kept start leaves 8 hours open. `ejectOpen` (calc.mjs) now also tries, for each eligible person, giving up every shift that clashes with the open one when there are two or more and none has started; the dropped shifts go, longest first, to whoever takes each at the least score given the earlier ones, or stay open, and the move is made when it lowers the score. `keptEject2: false` turns it off. Test (`reissue-posted.test.mjs`): on that three-shift week the kept start leaves 6-14 open without the move, and with it Ana takes 6-14 and Bo takes her two shifts, nothing open.

**What it changed on the benches: nothing.** With a counter in a scratch copy of calc.mjs (not committed), on every reissue set this README measures, the two-shift move found a person whose clashing shifts could all be given up 2-40 times per set and was never worth making (`eval/eject2-probe.txt`):

| set (call-outs) | two-shift move possible | made | one-shift eject made |
|---|---|---|---|
| 4 templates (56) | 6 | 0 | 10 |
| 20 x 56 (24) | 4 | 0 | 5 |
| 30 x 84 (24) | 6 | 0 | 9 |
| 40 x 112 (24) | 2 | 0 | 16 |
| both cafés, every keep variant (41 each) | 40 | 0 | 36 |

Run on and off (`OPTS='{"keptEject2":false}' node eval/reissue-scale.mjs 40 112 2 4`, and 60 168), every call-out's open hours, changes, premium and pay are the same: 37 changes to others at 40 x 112 and 26 at 60 x 168, as in the section above, and the same time (118 s and 362 s for the 24 reissues either way). The reason is arithmetic: the two shifts given up are usually longer together than the one taken, so the move only pays when both find a new holder, and the kept start has already handed every shift someone could take to them. The move stays on because it costs no measurable time and covers the week in the test, which the later stages would otherwise have to repair with a chain of moves on a big week. That leaves the open list for these reissues as it was: every reissue above the least change count is a score trade, not a search miss.

**The keep-usual-shifts sweep with the kept start.** The planner's keep-usual-shifts has run the kept start (and now both eject moves) since the kept start landed, but its sweep was not re-run. `RATES=0,0.02,0.04,0.08 KEEP=0.05,0.1,0.25 node eval/steady-plan.mjs 5 4` (`eval/steady-plan.kept-start.txt`) gives the same weeks reused, weeks proven, open hours, pay, changes week to week, forced changes and distance from the usual rota as `eval/steady-plan.out.txt` on every one of the 80 rows (5 teams and the total x 4 leave rates x 4 settings): all 1,600 planned weeks are proven, so the optimum was already found and the kept start only gives the search a nearer starting point. Only the timings differ. On this machine a plan with keepValue 0.1 took 30 s against 40 s with no keep at 2% leave and 37 s against 36 s at 8%, where the first sweep had the keep plans 20-42% slower; that reading spans two machines and a week of other speed work (the suite fell from 158 s to 134 s on 2026-11-12), so the kept start's own share of it is not separated.

Not claimed: invented teams and seeded weeks, as above; the counts come from an uncommitted scratch counter; 60 x 168 was compared on and off but not counted. The unproven 60-person reissues still depend on machine speed.

## Two real schedule exports (2026-11-13)

Until today `--import-shifts` (and the page's schedule-export box) had read only invented rows under headers written from memory. GitHub code search on header rows found two real exports in other people's public repositories, and the importer refused both: "No start and end time columns found". Both files carry staff personal data (names; one also birth dates, emails and phones), so they are not committed or linked; `eval/real-schedule-exports.mjs` takes local copies, checks their SHA-256 and prints only counts, times and position names (`eval/real-schedule-exports.out.txt`).

- **A, a retail store's week from a workforce-management tool** (197 rows, Sunday to Saturday): each row pairs one person's day in the first-published schedule (`Initial Shift Date`, `Initial Shift Start Time`, ..., `Initial Shift Work Role`) with the same in the final one (`Final Shift ...`, `Final Shift Worker Role`).
- **B, a Deputy timesheet export** (500 rows, 94 columns, 5 weeks, 42 sites of a security firm): the worked shift (`Timesheet Start Time`) beside the rostered one (`Schedule Date`, `Schedule Start Time`), the position in `Area Name` (a nearly empty `Position` column also exists), `Is Leave` and `Discarded` flags, and dates written day first with no leading zero (`8/05/2026`).

What changed in `import-shifts.mjs`:

- **Header families.** A header's first word can name the version of the shift: schedule/rostered/planned, final/published, plain, initial/original, timesheet/actual/worked. The importer reads them as families and uses one family for every row, in that order of preference (the planned shift, then the final, then the first draft, then the worked times). A row with nothing in the chosen family (a shift that exists only in the other version) is left out and counted. `{ use }` (CLI `--use`) picks another family; the result lists `families`.
- **The busier column wins.** With two role columns (Deputy's `Position` and `Area Name`) the more filled one is read; a plain date column (Deputy's `Start Date`, an employee's hire date) is not taken for the shift date when the family has its own.
- **Dates settled by the whole file.** A row like `8/05/2026` was read as 5 August (US order unless the first part is above 12). `dateOrder` now looks at every date in the column: one `13/05` makes the file day first. `2026/01/18` is read too.
- **Dates no row settles (red team, later on 2026-11-13).** A day-first week in the first twelve days of a month (`01/12/2026` to `07/12/2026`) has no part above 12, so it was still read month first: January 12 to July 12, seven "weeks", Monday and Saturday gone, and no note. `readDateOrder` now reads such a file in the order that keeps its dates closer together (a published schedule covers a week or a few) and says so in a note; when that settles nothing either (one date, `05/08/2026`), it reads month first and the note says the order was a guess. Unit-tested on made-up rows (`import-shifts.test.mjs`); the two real files above are settled by value (`13/05`) and are unaffected, not re-run here (they are kept out of the tree).
- **Leave and discarded rows** are dropped and counted, not imported as shifts.
- **Locations.** A `Location`/`Location Name`/`Site`/`Store` column is listed with row counts; `{ location }` (CLI `--location`, a picker on the page) keeps one site. With several and none picked, the note says they were planned as one.
- **Weeks start at the file's first date,** so a Sunday-to-Saturday week is one week, not two (the busiest-week count per weekday is unchanged by this).

What the files say (`eval/real-schedule-exports.out.txt`):

| | A, default (Final) | A, `--use initial` | B, default (Schedule) | B, `--use timesheet` |
|---|---|---|---|---|
| rows read | 120 | 160 | 401 | 450 |
| shift lines / shifts | 64 / 120 | 102 / 160 | 163 / 187 | 231 / 255 |
| hours in the busiest week per line | 1,062 | 1,246 | 1,296 | 1,726 |
| left out | 77 with no final shift | 37 with no first one | 41 leave, 9 discarded, 49 unrostered | 41 leave, 9 discarded |

Every imported text parses with no errors. For B with one site picked (the busiest, 65 rows), 21 lines: the same three short patrol runs (0:45-1:45, 7:30-8:00, 19:00-20:00) every day.

Two findings about real posted weeks, for the reissue work above:

- **Store A rewrote its week.** Of 160 first-published shifts, 3 (2%) reached the final week as published; 80 (50%) kept the person but moved the times (mostly 10:30-19:30 to 10:00-19:00, half an hour earlier), 19 of those also changed position, and 77 (48%) had no final shift on their row, 35 of them first-draft shifts with nobody on them. 37 of the 120 final shifts (31%) were not in the first draft. Hours fell from 1,246 to 1,062 (15%). The first draft looks generated and the final edited by a manager; whichever it is, "keep the posted week" is not what this store did between draft and final, so the reissue's change count is the right number to show a manager, not a promise of zero.
- **Deputy firm B worked its roster.** Of 401 rostered shifts with a timesheet, 93% started exactly on time and 96% within 15 minutes; 95% ended exactly on time; worked span hours were 0.1% under rostered. 11% of work rows (49 of 450) had no rostered shift at all, and 8% of non-discarded rows were leave (11 unpaid leave, 8 accident leave, 6 annual, 5 sick, 5 statutory days). So in this firm the roster is close to the work done, and the miss is unrostered extra shifts, not drift in times.

Tests (`import-shifts.test.mjs`) copy the two real header rows with invented data rows: Final read and Initial on request, a removed and an added shift, a Sunday-to-Saturday week counted as one; leave, discarded and unrostered rows dropped, `8/05/2026` read as a Friday, a location picked, a missing location reported; the busier role column and the hire date. `page.test.mjs` checks the pickers.

Not claimed: two files, one week of one store and five weeks of one firm; neither is 7shifts, When I Work or Homebase; what a family word means is read from these files' own columns, not from either vendor's documentation; store A's draft-to-final churn may be the tool's auto-draft, not a manager's posted week.

## Reading 7shifts directly (2026-11-13)

7shifts was the one scheduler named in "What you use today" that the importer had never read: no public CSV export turned up under any header row tried. Its API is documented, so the shifts can come from there instead. `import-7shifts.mjs` reads 7shifts' own API responses (v2) and hands them to the same counting as `--import-shifts`; the field names, time format and envelope come from 7shifts' published API definition (version 2023-05-01) and were checked against a recorded live response whose values had been scrubbed (`eval/7shifts-api-format-2026-11-13.md`).

- **Page:** the schedule-export box now takes several files. Choose the saved JSON of the shifts, roles and locations endpoints together; the location picker works as for CSV exports. Nothing is fetched by the page.
- **CLI:** `node cli.mjs --import-7shifts shifts.json --import-7shifts roles.json --import-7shifts locations.json` (a file may hold several responses, one per line). Or fetch with your own token: `SEVENSHIFTS_ACCESS_TOKEN=... node cli.mjs --fetch-7shifts --from 2026-11-02 --to 2026-11-29 [--save week.json]`; `SEVENSHIFTS_COMPANY_ID` when the token reaches several companies. The token goes only to api.7shifts.com as a bearer header and is never printed or saved. `--tz`, `--location`, `--no-drafts`.

What it does with 7shifts' fields:

- **Times are UTC in the API.** They are turned into the location's wall clock with its `timezone` (or `--tz`), so a 7am shift is 7:00 in November and in July even though the UTC hour moves. With no zone given the hours are read in UTC and the note says they will be off.
- **Open shifts count.** A shift with nobody on it (`open`, or no `user_id`) is a shift the manager needed, which a CSV of who worked would never show.
- **"Until close" shifts** (`close: true`, whose `end` the API says is not used) end at the location's closing time for that weekday when the locations response is given; otherwise at the row's own end, with a note.
- **Deleted shifts** (`deleted`, `soft_deleted`, `*_deleted`) are left out; unpublished drafts are read as planned unless `--no-drafts`; sick and no-show shifts were still scheduled, so they count. A repeated shift id (overlapping pages) counts once. A shift that ends before it starts or a day or more later is skipped with its id.
- The fetch asks for a day either side of the range in UTC and keeps the shifts whose local start date is inside it.

Checked: 11 tests on invented rows in the documented shape (`import-7shifts.test.mjs`: wall clock across EST and EDT, an overnight shift across UTC midnight, open, deleted and draft shifts, closing time from the location, two locations by name or id, pages and repeated ids, the fetch's cursor loop and bearer header against a stub, the CLI), and a headless-Chromium upload of three JSON files on the page. The recorded live response (296 shifts, two pages) is read page by page and every shift is refused, because the recorder randomised the times decades apart; before the length guard it came through as 294 nonsense shifts over 110 weeks.

Not claimed: no real 7shifts account or real company's shifts was used; the field meanings are 7shifts' own words, not observed behaviour; the page cannot fetch (a browser call would need 7shifts to allow it, unchecked); When I Work and Homebase are still unread.

## A whole week of call-outs at a real roster's rates (2026-11-13)

The reissue studies above change a posted week once: one call-out, priced against the first posted roster. A real week has several, and each reissue becomes the roster the next one changes. The Deputy timesheet file in "Two real schedule exports" gives the rates for one firm over five weeks: 41 of 491 rostered rows were leave (8.4%), of which 5 were sick leave (1.0%, the only kind that is clearly short notice), and 49 of 450 work rows had no rostered shift (10.9%, extra shifts added after the roster was made).

`node eval/real-rate-week.mjs` (`eval/real-rate-week.out.txt`) plays 40 seeded weeks of each of five teams (the sample café, the café with a spare part-timer, and the salon, retail and clinic templates) at four settings: call-outs at 1.0% (sick only) or 8.4% (all leave) per person-day worked, and extra shifts at 0 or 10.9% per posted shift copy, Tuesday to Sunday. One random draw per person-day and per shift copy is shared by both policies; a call-out applies only if that person works that day in the roster being changed, so a rebuild that moved someone off Thursday has no Thursday call-out from them. Every event for a day is announced at 5pm the evening before and handled by one reissue: callers get `off:` that day, extra copies join the shift list, every started shift is pinned (`pinStarted`), and the week is rebuilt either freely or with the current roster kept (`keepShift 1`, the product's default for a posted week). Each reissue is priced against the roster it replaces (336 h window, 1 hour of the person's wage per change, that day's callers exempt). Default options, exact check on.

| 200 weeks per row (5 teams x 40) | changes to others: free / kept | people told | premiums: free / kept | final open hours: free / kept | payroll: free / kept |
|---|---|---|---|---|---|
| sick only (1.0%), no extras | 174 / **69** (-60%) | 104 / 37 | $3,175 / $1,239 | 351 / 354 | $182,867 / $182,503 |
| sick only, extras 10.9% | 1,597 / **547** (-66%) | 907 / 344 | $29,195 / $10,099 | 2,814 / 2,809 | $560,012 / $560,104 |
| all leave (8.4%), no extras | 1,276 / **557** (-56%) | 663 / 309 | $23,019 / $9,922 | 1,657 / 1,637 | $546,306 / $546,294 |
| all leave, extras 10.9% | 2,260 / **826** (-63%) | 1,206 / 498 | $41,043 / $14,958 | 3,734 / 3,753 | $568,629 / $568,109 |

Every one of the 2,376 reissues was proven. Over the 631 disrupted weeks the kept reissues made fewer changes to others on 471, the same on 159 and more on 1 (the café at 8.4%, no extras). Net churn, the changes between the first posted roster and the last with every caller exempt, fell by about half (1,161 to 575 at the busiest setting): a free rebuild also moves people back and forth across a week.

At the extra-shift rate the firm showed, a free rebuild tells about 6 people a week of a change on these teams (1,206 over 200 weeks) and the kept reissue about 2.5; on a rule that charges an hour's pay per change, that is $205 against $75 a week.

**Open hours go both ways.** Each reissue is proven at the least open hours for the week it is given, but the weeks differ by the time the next event arrives, because each policy pinned different started shifts. Final open hours were higher under the kept reissue on 29 weeks and lower on 31 (all four settings), a net of +19 h out of 3,734 at the busiest setting (0.5%) and -20 h at 8.4% with no extras. One week worked through (spare café, sick-only rate, Ben off Tuesday then Ana off Thursday): Ana's Thursday call-out alone leaves 3 hours open under both policies; the free rebuild's 14 changes on Tuesday happened to leave someone rested and free for Thursday, the kept reissue's 3 did not. Neither policy can see Thursday coming, and on these teams the luck evens out. A reissue that reserved slack for later call-outs (a lookahead at these rates) is the open question it raises; it was not tried.

Tests (`real-rate-week.test.mjs`): the draw is deterministic and covers Tuesday to Sunday; a quiet week changes nothing; a call-out from someone not working that day is not a reissue; an extra copy is covered or left open; on the salon template one Wednesday call-out under the kept reissue makes no more changes than a free rebuild at the same open hours. Time: 5.7-129 s per setting on one 4-core cloud machine, with the venture's test suite running beside it for part of the run.

Not claimed: the rates come from one security firm's five weeks, applied to invented teams; call-outs are independent per person-day (real sickness clusters); sick leave rows may not all be short notice, and the 8.4% includes leave a manager knew of in advance; an extra shift is modelled as one more copy of a posted shift, the same times, announced the evening before, where the real unrostered rows had their own times and notice is unknown; the premium rule is invented. The cheapest-taker patch from "Reissue a posted week" is not played here.

## Which of the tied best rosters holds up to a call-out? (2026-11-13)

"A whole week of call-outs" (above) left open whether a schedule could keep slack for later call-outs. A first try handed future shifts to other people whenever that left someone free behind them, at a price per change. It moved nothing: on the sample café nearly every shift Tuesday to Sunday had nobody free to take it single-handed, so there was no slack to make. The slack is in a choice the search already makes blindly. Several rosters often tie at the best score: seeds 1-6 gave 6 distinct rosters on the café, retail and clinic templates and 5 on the salon (3 once rows are compared as a schedule, "How many rosters really tie?" below), every one with the same score and the same payroll. The search hands back whichever it meets first.

`calloutExposure(staff, slots, roster)` scores a roster by playing every person-day worked Tuesday to Sunday as one call-out, handled the way the product handles a reissue: announced 5pm the evening before, started shifts pinned (`pinStarted`), the rest rebuilt with the roster kept (`keepShift 1`). The open hours each adds, summed, are the exposure; times a per-person-day call-out rate it is, to first order, the open hours a week of call-outs costs. `steadyRoster` (CLI `--steady`, `--json` carries `steady`) builds seeds 1-6, keeps the rosters at the best score and posts the least exposed. Score, payroll and the manager's settings do not move by construction. The cost is time: one rebuild per person-day per tied roster (café 34 s, retail 10 s, clinic 15 s, salon 3 s on one cloud core).

Exposure by seed on the templates: café 92 / 100 / 100 / 116 / 132 / 140 h; retail 24 / 24 / 24 / 30 / 30 / 30; clinic 30 / 30 / 30 / 30 / 45 / 45; salon 56 on all five (three distinct rosters); the spare-part-timer café has one best roster. Seed 1 is already the least exposed on every template, so nothing changes there; on someone's own week it need not be.

**Does exposure predict real loss?** `node eval/steady-for-callouts.mjs` (`eval/steady-for-callouts.out.txt`) posts each tied roster and plays the 40 seeded weeks of "A whole week of call-outs" against it, same draws, kept reissues, at the four rate settings (call-outs 1.0% or 8.4% per person-day, extra copies 0 or 10.9%). Open hours the week's events add (final open hours minus posted), 40 weeks per cell:

| team, setting | least exposed | average tie | most exposed | changes to others: least / average / most |
|---|---|---|---|---|
| café, 1.0% | **32** | 42.7 | 56 | 20 / 17 / 5 |
| café, 1.0% + extras | 815 | 807 | 805 | 25 / 22 / 20 |
| café, 8.4% | **291** | 318.8 | 356 | 116 / 100 / 65 |
| café, 8.4% + extras | **1,051** | 1,073.8 | 1,099 | 131 / 96 / 47 |
| retail, 1.0% | 10 | 10 | 10 | 18 / 16.5 / 15 |
| retail, 1.0% + extras | **196** | 211.5 | 227 | 174 / 147 / 119 |
| retail, 8.4% | **54** | 56 | 58 | 86 / 86 / 86 |
| retail, 8.4% + extras | **282** | 296.5 | 311 | 212 / 202 / 193 |
| clinic, 1.0% | **20** | 21.7 | 25 | 6 / 5 / 3 |
| clinic, 1.0% + extras | **155** | 170 | 200 | 59 / 47 / 23 |
| clinic, 8.4% | **85** | 90 | 100 | 52 / 40 / 17 |
| clinic, 8.4% + extras | **313** | 324.7 | 348 | 72 / 58 / 31 |
| total | **3,304** | 3,423 | 3,595 | 970 / 837 / 624 |

The least-exposed roster added fewer open hours than the average tie on 10 of the 12 cells, the same on 1 and more on 1 (the café with extra shifts, where the extra copies swamp the call-outs). In total it cut added open hours by 3.5% against a random pick among the ties and 8.1% against the worst one. The first-order forecast holds on the café at the sick-only rate: exposure 92 x 0.01 x 40 weeks predicts 37 h, played 32; exposure 140 predicts 56, played 56. The salon is a control: five tied rosters (three distinct), equal exposure, identical results in every cell.

**The trade is changes.** The steadier roster leaves people free where a call-out lands, and the kept reissue then uses them, so it tells more people of a change: 970 changes to others in total against 837 for the average tie (+16%) and 624 for the most exposed. At 1 hour of pay per change that is the manager's call, which is why `--steady` is opt-in and the report says which call-outs would still leave hours open.

**How much any lookahead could win.** The hindsight floor in the same run builds each week from scratch knowing every call-out and extra copy at the start; the seed-1 kept policy's final roster is one such roster, so no once-a-day policy facing those call-outs can end below it. On the café at 8.4% the kept reissue added 291 h against a floor of 182 h, so up to 109 h was avoidable with foresight, and the steady pick recovers about 28 h of that against the average tie. On the clinic at 8.4% the floor equals the kept policy (85 h): nothing was there to win. On the salon the floor equals every policy in every cell.

Tests (`steady.test.mjs`): a one-person week loses every call-out's shift; a free second person makes exposure 0; on the café seeds 3 and 1 tie and the steady pick takes seed 1 (exposure 92 against 140) at the same score and payroll; a week with one best roster comes back unchanged; the CLI prints the call-out check and `--json` carries it.

Not claimed: one call-out at a time (exposure is first order; two call-outs on one day interact); ties only come from varying the search seed, so a week whose best rosters the six seeds never meet is not searched for more; invented teams with rates from one firm's file; the seeds-1-6 choice is arbitrary. Not tried: exposure as a term inside the search (a slack price against payroll), which would trade score for steadiness instead of choosing among ties.

**A quicker call-out check, and on the page (2026-11-13 later).** The check rebuilt the week once per person-day per tied roster: 30 s on the café, too slow to offer on the page. Three changes cut it without changing what it posts:

- **Outright cover.** When the person has one shift that day and someone else can take it with every hard rule holding (`coverOptions`, the "who can take it" list on the page), that roster leaves exactly the open hours it had, so the case adds 0 with no rebuild.
- **Hand-over chain.** Failing that, a chain of up to 3 hand-overs (`coverChain`) where everyone outside the chain keeps their shifts proves the same. Shifts already started are pinned, and pinned shifts are only eligible for their holder, so no chain moves one.
- **Pruning.** Tied rosters are checked in seed order; a later one stops as soon as its sum reaches the best so far (it cannot win, ties go to the earlier seed) and is reported as "at least" that. Its cases run in order of what the same person-day cost on the rosters already checked, so a loser hits the bound early.

Checked case by case against rebuilding every case on the five teams x six seeds (`eval/steady-speed.out.txt`): every one of the 570 cases gives the same added hours. The short cuts fire on retail (9-12 of 17 cases) and the clinic (3-5 of 12), never on the café or the spare-part-timer café, where nobody can take a called-out shift without a bigger reshuffle. `node eval/steady-speed.mjs`, the whole `--steady` pick:

| team | first version | now | rebuilds | same roster posted |
|---|---|---|---|---|
| café | 30.1 s | 20.5 s | 138 to 101 | yes |
| spare | 6.6 s | 6.3 s | 27 to 27 | yes (one best roster) |
| salon | 3.3 s | 3.2 s | 80 to 50 | yes |
| retail | 11.5 s | 8.7 s | 102 to 28 | yes |
| clinic | 15.2 s | 6.8 s | 72 to 37 | yes |
| total | 66.7 s | 45.5 s | 419 to 243 | |

What is left was put down here to the six builds themselves; measured later the same day it is not ("How many rosters really tie?" below): on the café the six builds take about 6 s of 17.6 s, the 101 call-out rebuilds the rest. `eval/steady-for-callouts.mjs` passes `prune: false` so its every-tie readings stay as they were.

On the page, "When several rosters tie at the best score" now offers "Post the one a call-out hurts least". It runs in the build worker with progress ("roster 2 of 6, call-out 14 of 23") and the Stop button, and the call-out check's two lines lead the notices. Like the CLI it applies to a fresh week, not a reissue of a posted one, which already keeps the posted roster. Tests: `steady.test.mjs` (retail case by case with both short cuts firing; stopAt; the pruned pick equals the full one on café seeds 1-3; the worker runs the check and posts progress; the page has the setting and shows the text).

Not claimed: the timings are one machine; a phone will be slower (the café's 20 s could be a minute). The chain search is capped at 3 hand-overs, so a case that needs more falls back to a rebuild, which is correct, only slower.


## How many rosters really tie? And the call-out check at every reissue (2026-11-13 later)

`--steady` posts the least-exposed of the rosters that tie at the best score, on a fresh week. Two questions were left: does it help to make the same pick at every reissue of a posted week, and was the "fewer builds" speed-up worth chasing (the paragraph above put the café's time down to its six builds)?

**A counting bug first.** `steadyRoster` dropped duplicate ties by comparing `rosterCsv` text. That lists shift copies in the order the search placed them, so when two identical copies of one shift (two Tuesday 3pm-9pm closes) are held by Ruth and Sam in one build and by Sam and Ruth in another, the files differ and the schedule does not. The new `rosterKey` sorts the rows, and `steadyRoster` now counts each schedule once. `node eval/distinct-ties.mjs` (`eval/distinct-ties.out.txt`), seeds 1-6:

| team | seeds at the best score | distinct by file order (before) | distinct as schedules (now) | exposures | `--steady` now |
|---|---|---|---|---|---|
| café | 6 | 6 | 6 | 92, 100, 140, 116, 132, 100 | 17.6 s, 101 rebuilds |
| spare | 6 | 1 | 1 | 54 | 5.6 s |
| salon | 6 | 5 | **3** | 56, 56, 56 | 1.8 s, 30 rebuilds (was 50) |
| retail | 6 | 6 | 6 | 24, 30, 30, 24, 24, 30 | 8.2 s |
| clinic | 6 | 6 | 6 | 30, 30, 45, 30, 45, 30 | 6.0 s |

So on a fresh post only the salon was over-counted: the page said "5 rosters tie" where 3 do. At a reissue it was worse: in the first probe on the retail template, every reissue "tie" checked (8 of 8, 2 to 6 rosters each) was the same schedule printed in a different order. The pick itself never changed (a duplicate has the same exposure, and ties go to the earlier seed), so the posted rosters and every reading above stand. Only the tie counts and some wasted rebuilds were wrong.

**Where the time goes.** With the exact check on, one café build takes 0.9-1.2 s, so six builds are about 6 s of the 17.6 s. The 101 call-out rebuilds are the rest. Building seeds 2-6 without the exact check is not a safe cut: on the café every such build lands on a worse score (1,903,693 against the proven 1,503,759) and would drop out of the ties. Any speed-up has to come from the call-out cases, not the builds.

**The pick at every reissue.** `node eval/steady-reissue.mjs` (`eval/steady-reissue.out.txt`) plays the same 40 seeded weeks per setting as "A whole week of call-outs" on the café, the spare-part-timer café, retail and the clinic. There are three policies on the same draws: the seed-1 roster posted with seed-1 kept reissues (the default); the least-exposed roster posted with seed-1 kept reissues (`--steady` today); and the least-exposed roster posted, with every reissue Monday to Friday also run through `steadyRoster` (current roster kept, exposure counted from the next day on).

| 16 cells (4 teams x 4 rate settings) | disrupted weeks | reissues | reissues with distinct ties | rosters changed by the pick | open hours added | changes to others | time |
|---|---|---|---|---|---|---|---|
| default / `--steady` posted | 510 | 983 | - | - | 5,033 | 1,835 | 192 s |
| `--steady` at every reissue | 510 | 983 | 170 | **0** | 5,033 | 1,835 | 2,696 s (14x) |

Every one of the 510 weeks came out the same, hour for hour and change for change. (The first two policies are also identical here, because seed 1 is already the least-exposed posted roster on all four templates, as "Which of the tied best rosters holds up" found.) Real ties do occur at reissues, 170 of 983, mostly with extra shifts on retail (70) and the spare café (71). Seed 1 was never beaten: in each one its exposure was the lowest or tied. On retail at the sick-only rate with extra copies, 26 of 40 such ties differ only in which person holds the copy labelled "extra" and which holds the same hours labelled "close". `rosterKey` keeps labels, because a label is a line a manager wrote and may mean something. Why the real ties never differ is plain once you see it: with the posted roster kept at an hour's pay per shift, a reissue's choices are confined to the day being patched, and the call-outs still to come land on shifts every tie holds the same way.

So `--steady` stays a fresh-week setting (CLI and page), now on evidence rather than by assumption. The open question it leaves is the one "A whole week of call-outs" raised: a reissue that leaves slack for later call-outs has to give up score (an extra kept shift, a change, some payroll), not choose among ties.

Tests (`steady.test.mjs`): two identical copies swapped between two people give one `rosterKey`, a real swap gives two; on the salon template the six seeds give three schedules and `steadyRoster` compares three.

Not claimed: four invented teams with rates from one firm's file (as above); seeds 1-6 are the only ties searched; a reissue on someone's own week may have ties that differ further ahead; the timings come from four runs side by side on one 4-core machine.

## Call-out rebuilds, column generation first (2026-11-13 later)

"How many rosters really tie?" put the `--steady` pick's time in its call-out rebuilds (on the café, 101 rebuilds took about 11 s of 17.6 s), not its six builds. Profiling the 23 rebuilds of one café roster (`timings` on each result) found half their time, 2.2 s of 4.4 s, in one stage: the coverage plateau walk (`coverPass`). On six of the 23 cases the search came out of its first passes at 19 or 20 open hours where 15 is the least. The walk then ran all twelve of its runs to their full 512,000 steps, and none found the 15, because the way down goes through people the call-out did not touch. The cover repair, or the whole-score column generation after it, found the 15-hour roster in 10-50 ms and proved it best.

Big weeks already run column generation before the walk (`deferCover`) and the walk only when it proves nothing. `calloutExposure` now asks for that order on every rebuild (`deferCover: true`; `buildRoster` takes it at any size, `false` still turns it off). A fresh build and a posted reissue keep the old order.

**Checked case by case.** `node eval/callout-rebuild-order.mjs` (`eval/callout-rebuild-order.out.txt`) rebuilds every call-out case both ways on the five teams of "A whole week of call-outs" x seeds 1-6: 570 cases, 0 with different open hours, the only thing the check reads. On 33 cases the rebuild lands on a different roster at the same score; none of them is posted.

| team | 570 case rebuilds, old order | column generation first |
|---|---|---|
| café | 21.6 s | 9.9 s |
| spare-part-timer café | 29.5 s | 12.0 s |
| salon | 4.6 s | 4.6 s |
| retail | 11.1 s | 2.2 s |
| clinic | 4.2 s | 2.8 s |
| total | 70.9 s | 31.5 s (2.3x) |

The whole `--steady` pick (six builds, pruned check), same file:

| team | old order | now | rebuilds | same roster posted, same exposure |
|---|---|---|---|---|
| café | 21.0 s | 14.4 s | 101 | yes (92 h) |
| spare | 5.9 s | 2.8 s | 27 | yes (54 h) |
| salon | 2.3 s | 2.2 s | 30 | yes (56 h) |
| retail | 10.0 s | 1.5 s | 28 | yes (24 h) |
| clinic | 1.9 s | 1.6 s | 37 | yes (30 h) |

On the page this is the "Post the one a call-out hurts least" setting: retail's wait falls from ten seconds to under two. What is left on the café is now the six builds (about 6 s) and rebuilds that take the walk's full route because column generation does not prove them. Tests: `steady.test.mjs` unchanged and passing (its pruned-equals-full and case-by-case checks run through the new order).

Not claimed: one machine, timings from runs one at a time; the equivalence is measured on these five teams, not proven: where column generation proves nothing the walk still runs after it, so such a rebuild now costs one column-generation pass more than before. Not done: the same order for posted reissues and fresh builds. Those post the roster, and the 33 same-score differences above would show as a different posted week, so it needs its own check of what managers see.

## Posted reissues, column generation first (2026-11-13 later)

The section above moved the call-out check's rebuilds to column generation first and left posted reissues on the old order, because a reissue is posted: a different roster at the same score is a different week on the wall. `node eval/reissue-order.mjs` (`eval/reissue-order.out.txt`) makes that check. Same 570 cases (the five teams of "A whole week of call-outs" x seeds 1-6, every person-day worked Tue-Sun calling out at 5pm the evening before, started shifts pinned, the posted roster kept with keepShift 1, the CLI's `--changes` default). Each reissue is built both ways and priced against the posted week by `scheduleChanges` (336 h window, 1 hour of pay per change, the caller exempt), as `eval/reissue-posted.mjs` does.

| 570 posted reissues | old order | column generation first |
|---|---|---|
| proven best | 570 | 570 |
| open hours, score | - | same on all 570 |
| changes to other people | 1,069 | 1,069 (same on every case) |
| premiums | $19,163 | $19,163 |
| payroll | $1,731,325 | $1,731,325 |
| time | 72.2 s | **32.5 s** (2.2x) |

Per team: café 21.7 s to 10.2 s, spare-part-timer café 30.2 s to 12.6 s, retail 11.6 s to 2.4 s, salon and clinic about the same. **What managers would see:** on 33 reissues (15 café, 18 spare, none on the salon, retail or clinic) the roster differs. Every one of the 33 has the same score to 1e-6, the same open hours, the same number of changes to other people, the same premium and the same payroll; both are proven best, so they are ties the search can return either way, as "How many rosters really tie?" found for fresh weeks. Neither order is better on any count the tool reports, and for a given input each order is deterministic.

**What changed.** `buildRoster` now takes column generation first whenever `keepShift` > 0 (a posted week's reissue: CLI `--changes`, and the page's "Changes since you posted it"), as it already did on big weeks and in the call-out check; `deferCover: false` keeps the old order. Test (`reissue-posted.test.mjs`): on the café, seed 1, Fay off Wednesday (one of the 33), the default reissue equals the explicit column-generation-first one, differs from the old order's roster, and ties it on score and open hours, both proven.

**Fresh builds, measured, not changed.** The same script builds each of the 30 team-seed weeks both ways: same score on all 30, all proven, 8.6 s to 2.7 s, a different roster on 6. Fresh builds keep the old order for now: the guide pages and their tests quote specific fresh rosters (who works which shift), and `--steady` already picks among ties by call-out exposure, so switching would rewrite posted examples for a speed gain on weeks that already take under a second each on average. A run that wants it should re-derive the guide pages with it on. (Done the same day: "Fresh builds, column generation first" below.)

Not claimed: five invented teams on one machine, runs one after another; the equivalence is measured on these 570 cases, not proven; where column generation proves nothing the walk still runs after it.

## Reading When I Work directly (2026-11-13)

When I Work was the next scheduler named in "What you use today" with no reader: no public CSV export of its schedule has turned up, and the staff importer's When I Work columns are from memory. Its API is documented in a public OpenAPI file, so the shifts can come from there, as for 7shifts. `import-wheniwork.mjs` reads When I Work's own API responses (v2: `GET /2/shifts`, `/2/positions`, `/2/locations`) and hands them to the same counting as `--import-shifts`. Every field it uses is in `eval/wheniwork-api-format-2026-11-13.md`, read from When I Work's published definition (OpenAPI 3.1.0, `apidocs.wheniwork.com/external/monolith/docs-master.json`, SHA-256 recorded there).

- **Page:** the schedule-export box tells When I Work JSON from 7shifts JSON by its fields (`start_time` and a `shifts` list against 7shifts' `{ object, data }`), so the same box takes either. Choose the saved shifts, positions and locations responses together; the location picker works as before. Nothing is fetched by the page.
- **CLI:** `node cli.mjs --import-wheniwork shifts.json --import-wheniwork positions.json --import-wheniwork locations.json` (one file may hold several responses, one per line). Or fetch with your own token: `WHENIWORK_TOKEN=... node cli.mjs --fetch-wheniwork --from 2026-11-02 --to 2026-11-29 [--save week.json]`; `WHENIWORK_USER_ID` sets the `W-UserId` header When I Work asks for when one login reaches several workplaces. The token comes from When I Work's own login call with your developer key (their docs, "Authentication"); it goes only to api.wheniwork.com as a bearer header and is never printed or saved. `--location`, `--no-drafts`.

What it does with When I Work's fields, and where it differs from the 7shifts reader:

- **Times carry their own offset.** `start_time` is an RFC 2822 date with the offset written in (`Mon, 08 May 2023 08:30:00 -0600`, the definition's example), so the digits are the clock where the shift happened. No time zone is needed, and a 7am shift reads 7:00 in July (-0500) and November (-0600). The length is taken from the instants, so a night shift across the autumn clock change (23:00 -0500 to 06:00 -0600) is 8 hours, not 7. When a file mixes offsets the note says so.
- **Open shifts count.** `user_id: 0` ("Set to `0` for an Open Shift") or `is_open` is a shift the manager needed with nobody on it. The fetch asks for `include_open` and `include_allopen` so they are in the response.
- **Unpublished shifts** (`published: false`) are read as planned unless `--no-drafts`; the fetch asks for `unpublished=true`, which the definition says needs supervisor rights.
- **Deleted shifts.** With `deleted=true` the response lists the ids deleted in the window (`deleted_ids`); those are left out. A repeated id (two saved files of one week) counts once. A shift that ends at or before its start, or a day or more later, is skipped with its id.
- **Repeating series** (`repeating_shifts`, `shiftchains`) are not expanded: the fetch does not ask for them, and a saved response that has them gets a note. The dated `shifts` list is what is counted.
- There is no cursor in the definition's List Shifts call, so the fetch asks once for the range plus a day either side and keeps shifts whose local start date is inside it. A 403 is reported as "no permission, or a rate limit", because the definition says When I Work answers 403 for both.

Checked: 11 tests on invented rows in the documented shape (`import-wheniwork.test.mjs`: winter and summer offsets, an overnight shift and one across the clock change, open, deleted and unpublished shifts, two locations picked by name or id, damaged rows, repeats, the time reader on the definition's own examples including its single-digit `9:30:00`, telling the two vendors' JSON apart and each reader refusing the other's, the fetch's parameters and headers against a stub, the CLI). A headless-Chromium upload of three JSON files on the page filled the shifts box (`Mon, 7:00, 15:00, 2, , server` with the open shift counted), listed both locations, and kept one when picked, with no page errors.

Not claimed: no When I Work account, recorded response or real company's shifts was used, unlike the 7shifts reader, which was checked against a scrubbed recorded response; the field meanings are When I Work's own words, not observed behaviour; whether `/2/shifts` also returns positions and locations beside the shifts was not assumed (the definition lists only shifts, repeating shifts and chains), so they are fetched separately; the page cannot fetch; Homebase is still unread (its API docs answered 401 without an account).

## Reading Square's schedule directly (2026-11-16)

Square was the next scheduler with no reader. Many of the cafes and shops this tool is for already run their tills on
Square, whose sales exports `--from-sales` reads, and Square's team plans include a scheduler; an owner moving the week
here had no way to bring the shifts across except by retyping them. Square publishes its whole API definition on GitHub,
including the Labor API's scheduled shifts, so the shifts can come from there, as for 7shifts and When I Work.
`import-square.mjs` reads Square's own responses (`POST /v2/labor/scheduled-shifts/search`, `GET /v2/team-members/jobs`,
`GET /v2/locations`) and hands them to the same counting as `--import-shifts`. Every field it uses, with the
definition's SHA-256, is in `eval/square-scheduled-shifts-format-2026-11-16.md`.

- **Page:** the schedule-export box tells Square JSON (`scheduled_shifts`, `draft_shift_details`) from When I Work's and
  7shifts', Square first, so the same box takes any of the three. Choose the saved shifts, jobs and locations responses
  together; the location picker works as before. Nothing is fetched by the page.
- **CLI:** `node cli.mjs --import-square shifts.json --import-square jobs.json --import-square locations.json` (one file
  may hold several responses, one per line). Or fetch with your own access token:
  `SQUARE_ACCESS_TOKEN=... node cli.mjs --fetch-square --from 2026-11-02 --to 2026-11-29 [--save week.json]`. The token
  needs TIMECARDS_READ, EMPLOYEES_READ and MERCHANT_PROFILE_READ (the definition's permission for each call); it goes only
  to connect.squareup.com as a bearer header and is never printed or saved. `SQUARE_VERSION` overrides the
  `Square-Version` header (default `2026-09-16`, the definition's). `--location` (name or Square id), `--no-drafts`,
  `--square-latest`.

What it does with Square's fields, and where it differs from the other readers:

- **Two versions of each shift.** A scheduled shift carries its latest draft (always) and its published details (once
  posted). By default the published version is read, because that is the schedule staff were shown; a shift never
  published is read from its draft as planned, unless `--no-drafts`. `--square-latest` reads every shift's latest draft
  instead, for a manager who has edited next week in Square and not posted it. Published shifts with edits waiting are
  counted in a note either way.
- **Deletes.** A draft marked `is_deleted` with no published version is left out. One marked `is_deleted` over a published
  shift is still on the posted schedule (Square deletes it when the manager publishes), so it is counted with a note,
  and `--square-latest` leaves it out.
- **Unassigned shifts count.** No `team_member_id` is a shift nobody is on, still needed.
- **Times carry the location's offset** (`2026-11-02T07:00:00-06:00`), so the digits are the shop's clock and lengths come
  from the instants (a night across the clock change is 8 hours, not 7). A time written in UTC is moved to the shift's
  `timezone` or its location's; with neither it is read as UTC and the note says so.
- **Paging.** The search returns at most 50 shifts a page with a `cursor`; the fetch follows it, and the jobs list too.
  It asks by workday (`match_scheduled_shifts_by: INTERSECTION`, shifts starting on those dates in the location's own
  zone), so no padding day is needed; the saved result is still trimmed to the dates asked for.
- **Errors.** A saved response with Square's `errors` list instead of shifts is reported with Square's own detail; the
  fetch names the error code and, on a 403, the permission the search needs.

Checked: 10 tests on invented rows in the documented shape (`import-square.test.mjs`: names from jobs and locations,
winter and summer offsets and the clock change, published against draft and `--square-latest`, a pending delete,
never-published and deleted drafts, unassigned shifts, two locations by name and by id, UTC times moved or flagged, damaged
rows and repeats, an error response, telling Square JSON from When I Work's, the fetch's body, paging and headers against a
stub, the CLI). A headless-Chromium upload of three JSON files on the page filled the shifts box and listed both locations
(see the PR).

Not claimed: no Square account, recorded response or real business's shifts was used; the field meanings are Square's own
words, not observed behaviour; the scheduled-shifts and jobs endpoints are marked BETA in the definition and may change;
team members' wages (`/v2/labor/team-member-wages`, `/v2/team-members/search`) are not read yet, so staff still come in
by CSV or by hand; Deputy's API docs were not reachable from the session, so Deputy was then read only from its CSV
export (its API is read since 2026-11-17, next section).

## Deputy staff and wages (2026-11-19)

`--import-deputy-staff` reads saved answers from Deputy's resource API for the team, the staff half of `--import-deputy`:
`POST /api/v1/resource/Employee/QUERY` (people and their main location), `EmployeeAgreement/QUERY` (each person's
`BaseRate`, the location it pays at and its start and end dates), `EmployeeWorkplace/QUERY` (one row per extra location,
naming the agreement that pays there) and `Company/QUERY` (location names). Files can come in any order, several per
flag or as the NDJSON `--save` writes. `--fetch-deputy-staff` fetches the same four lists from `DEPUTY_INSTALL` with
`DEPUTY_TOKEN` (four paged queries, not one per person; the token goes only to the `*.deputy.com` host). The page's
"convert a staff export" box takes the saved JSON and tells it from 7shifts' by Deputy's `EmployeeId` / `FirstName`.

- **Rates.** A person's own wage is their latest-starting agreement in force on `--wages-as-of` (default today) with a
  base rate. At each location, the agreement that location's workplace row names first, else an agreement paying at
  that location; where it differs from the own wage, a `wage at <location>:` cell is written, so the build prices each
  shift at that person's rate there (the same cells the 7shifts and CSV readers write).
- **Sites.** Main location first, then the workplace rows in Deputy's sort order, as a `sites:` cell when the team spans
  more than one location; `--location <name|id>` plans one location at each person's rate there.
- **Left out or flagged.** Inactive and already-terminated people are left out; an agreement with a salary pay rule and
  no base rate gives wage 0 with a note; ended, future and inactive agreements are not used (a later
  `--wages-as-of` applies the future ones). Max hours is 40 and availability `any`; Deputy's areas a person may work
  are an association on OperationalUnit, not a field of these rows, so no `role:` cell is written.

Checked: `import-deputy-staff.test.mjs` (9 tests: one and two locations, workplace agreements, `--location` by name and
id, agreements in force by date, inactive, terminated, salaried and agreement-less people, repeated names and files,
NDJSON, an error answer, telling the JSON from rosters and 7shifts, the fetch's host, header, resources and paging
against a stub; every output line parses with `parseStaff`). The CLI on three invented files gave
`Ana Silva, 24, 40, 0, any, sites: Harbour St | Airport, wage at Airport: 27.25`, and a build of three site-tagged
shifts from it gave the two Airport shifts to the $22 colleague rather than Ana at $27.25 there (payroll $544). A
headless-Chromium upload of the same files on the page filled the staff box with the same lines, no page errors.
Field names come from the MIT communityds/deputy-api-wrapper models (Deputy's reference did not answer from the
session; `eval/deputy-staff-format-2026-11-19.md`); no Deputy account, token or real response was used.

## Deputy time off: unavailability and approved leave (2026-11-19, later)

With `--week-start <Monday>` (and `--weeks <n>` for more than one), `--import-deputy-staff` also reads Deputy's
`EmployeeAvailability/QUERY` and `Leave/QUERY` answers and writes what falls in those weeks as a dated `off:` cell on
each person's line, which the build subtracts from their availability:

```
Ana Silva, 24, 40, 0, any, off: 2026-11-18 9-13:30
Ben Ng, 22, 40, 0, any, off: 2026-11-20; 2026-11-21
```

`--fetch-deputy-staff --week-start <Monday>` adds the two queries (six instead of four): unavailability blocks starting
from two days before the first Monday to a day after the last Sunday by Unix time, and leave whose dates touch the weeks.
On the page, pick the week first, then choose the saved JSON in the staff-import box.

- **What an EmployeeAvailability row is.** Deputy's own guide, "Setting an Employees Unavailability"
  (developer.deputy.com, updated 2025-11-10, which answered from this session), documents it: a block the person
  *cannot* work, `StartTime` to `EndTime` in Unix seconds with `StartTimeLocalized`/`EndTimeLocalized` on the location's
  clock, `Type` 0 one-off or 1 recurring, and a recurring pattern expanded into one row per occurrence up to
  `MaxDateRecurringGenerated`. So a weekly lecture arrives as one row per week and is read like a one-off; when the
  generated rows stop before the planned weeks end, a note says so.
- **Clock.** The localized time first, else the Unix time at the offset of the row's `Date`, else `--tz <zone>`, else
  UTC with a note (the same order as the roster reader). A block over midnight is split into its two days; overlapping
  blocks merge; a day covered end to end is written as the bare date.
- **Leave.** Deputy's "Leave" page lists `Status` 0 awaiting approval, 1 approved, 2 declined, 3 cancelled, 4 date only
  approved, 5 pay approved. 1, 4 and 5 block whole days from `DateStart` to `DateEnd`; awaiting requests are counted in
  a note, not applied; a part-day request (`AllDay` false) blocks the whole day, with a note, because the hours are not
  read.
- **Without a week** the rows are counted and not applied, with a note: a dated entry means nothing until the week is
  known. The roster reader (`--import-deputy`) no longer mistakes an unavailability row for a roster (both carry
  `StartTime` and `EndTime`; the unavailability row has `Type` and `Schedule` and no `OperationalUnit`), so one folder of
  saved answers can feed both.

Checked: `import-deputy-staff.test.mjs` (6 more tests, 15 in all: blocks split at midnight and applied by `parseStaff`
with `--week-start`, recurring and next-week blocks, approved, awaiting, declined and part-day leave, overlap merging,
no week, a non-Monday week, `--weeks 2`, Unix-only blocks at the `Date` offset, a named zone and UTC, unavailability rows
ignored by the roster reader, the fetch's two extra queries against a stub). The CLI on invented files wrote the two
lines above, and a build of one 9-5 shift a day from them kept Ana off Wednesday and Ben off Friday and Saturday (7 of
7 covered). Field shapes are from Deputy's documented sample response; no Deputy account, token or real response was
used (`eval/deputy-time-off-format-2026-11-19.md`).

## Reading Deputy directly (2026-11-17)

`--import-deputy rosters.json` reads saved answers from Deputy's resource API (`POST /api/v1/resource/Roster/QUERY`, plus
`resource/OperationalUnit/QUERY` and `resource/Company/QUERY` for area and location names; repeat the flag for more files)
and prints shift-requirement lines, like the 7shifts, When I Work and Square readers. `--fetch-deputy --from 2026-11-02
--to 2026-11-08` fetches the same from your own install: `DEPUTY_INSTALL=yourco.na.deputy.com` and `DEPUTY_TOKEN` (a
permanent token or an OAuth access token; it is sent only to a `*.deputy.com` host, as `Authorization: OAuth`, 500 rows
a page). The page's schedule box takes the saved JSON too and tells it from the other vendors' JSON by Deputy's
capitalised `StartTime`.

- **Roles and sites.** A roster's area (`OperationalUnitName`) is its role, as the CSV reader already takes Deputy's
  `Area Name`; the area's company is the location (`--location` by name or company id).
- **Times.** `StartTimeLocalized` is read on the site's own clock. A roster with only Unix times is read in `--tz`
  when given, else at the offset of its own `Date`, else in UTC with a note.
- **Open and draft shifts.** `Open` or `Employee: 0` counts as needed; unpublished rosters count unless `--no-drafts`.

Deputy's own API reference gave no answer from the session, so the field names and request shape come from two
open-source clients: an MIT PHP wrapper's schema, models and mock responses, and Google's Apache-2.0 Python client
(`eval/deputy-api-format-2026-11-17.md`; no code copied). The wrapper's mock roster reads the same from its localized
times and from its Unix times plus `Date` (09:00 to 11:00 at +10:30). Tests: `import-deputy.test.mjs` (10). Not
claimed: no Deputy account, token or real response was used; `Mealbreak`, leave and wages are not read.

## Several shops in one sales export (2026-11-13)

`--from-sales` planned every row of a sales file as one shop. Square's item-sales export and Toast's ItemSelectionDetails both carry a `Location` column (all four real files in `eval/real-pos-exports.mjs` do), so an owner with two or three sites who exports them together got one blended week. The flagship's open list named it: "a real multi-location Square or Toast export (planned as one shop today)".

- **Reader:** `readSales` finds a `Location`/`Store`/`Site`/`Branch`/`Outlet`/`Restaurant`/`Venue`/`Shop` column, lists the sites with row counts (`locations`, busiest first, before any filter) and, given `{ location }` (case and punctuation ignored), keeps that site's rows. It applies to sales, ticket and row counting, the labour standard, the backtest and the half-life pick. With several sites and none picked, a note says they were planned as one shop. An unknown name reads nothing and lists the names in the file.
- **CLI:** `--location <name>` with `--from-sales` plans one site; `--each-location` prints one plan per site, each under a `# Location: name` comment line (the shifts parser skips `#` lines), with stderr notes prefixed `[name]`. Both work with `--backtest`.
- **Page:** `shifts-from-sales.html` shows a Location picker when the file names two or more sites ("All N locations as one shop", or one site); the backtest button uses it too. Usage event `sales_locations`.
- **Shifted rows.** One real Square file (the Highland-wear shop's day) writes O'Toole as `O&#039,Toole`: the HTML entity's `;` became a comma, so every later column moves one place right and that row's Location cell reads `Payment` (its Event Type). Read naively, the file had two locations, the shop (49 rows) and "Payment" (1 row). Cell counts don't show it: the row has 30 cells like every other row, because its trailing empty cell is gone. So a row whose Location value is rarer than another site's, with a cell up to three places either side that exactly matches that busier site's name, is moved to that site, with a note. On the real file: 1 location, 50 rows, 1 shifted row noted (`eval/real-pos-exports.out.txt`). The row's other columns are still read where the header puts them (its net sales happen to equal its gross, so the amount is right here); fixing a shifted row's sales cell is not attempted.

What planning the sites together costs, on a made-up fortnight (`eval/two-site-demo.mjs`, `.out.txt`; Main St trades 7-15 daily at $130 an hour, Harbour 11-19 Fri-Sun at $50, $60 per labor hour): as one shop the plan schedules 180 person-hours a week; Main St alone needs 168 and Harbour alone 24, so 192. Pooled, Harbour's weekend sales fill Main St's spare third person (130 + 50 = 180 is still three heads), and the plan puts nobody where Harbour actually is: 12 person-hours a week short (6%), plus shifts that can't be worked because one person can't be at two sites.

Checked: 10 tests (`locations.test.mjs`) on the real Square and Toast header rows with made-up rows: the list and note, picking by name with case and punctuation ignored, an unknown site, separate hours per site (Harbour has no Monday and no 7am), the backtest and labour standard filtered, Toast's leading Location column, one site with no note, the shifted row, no location column, and the CLI's `--location`, `--each-location` and the clash between them; `page-sales.test.mjs` checks the picker's wiring, and a headless-Chromium run of the two-site fortnight on the page listed both sites, gave Harbour alone `Fri/Sat/Sun, 11:00, 19:00, 1`, kept the pick, and raised no page errors. The four real files read as before, plus their location counts (diff in the PR).

Not claimed: no real export with two or more sites has been read (all four real files are one shop each); sites are planned separately, with no shared staff between them (the roster builder still takes one staff list per run); location names are matched exactly after normalising, so "Main St" and "Main Street" are two sites.

## The 60-person week's 300 open hours are the least (2026-11-13)

The flagship's next list carried "the 60x168 end-to-end week 0 (root LP 275.2 h vs 300 h held)" as a gap to close, alongside the 100-person ones. It was not an integrality gap. HiGHS (`eval/ilp-check.py` on the same week, dumped without a build by `NOBUILD=1 node eval/ilp-export.mjs 60 168 2`) proved 300 h optimal in 4.9 s at its first node: after presolve merged the 131,000 pairwise "these two shifts break the rest rule" rows into cliques, its root bound was already 300. The 275.2 h was the whole-score column generation's root, not converged after 34 s of pricing. The Dantzig-Wolfe LP the engine solves is at least as strong as HiGHS's root, so given enough rounds it would have got there; it does not in the time a page has.

**What landed:** `cliqueOpenFloor` (calc.mjs) solves the compact LP directly with the engine's own simplex (`bnp.mjs solveLP`): x[p,s] and open[s]; one row per shift copy (held once or open); per person, the weekly hour cap and each daily cap as knapsack rows; and per person, one row per maximal clique of the intervals [start, end + rest gap), so at most one of the shifts that pairwise clash. Those intervals form an interval graph, so the clique rows describe exactly the shift sets a person can hold when hours are ignored, which is what makes this LP tight where the pairwise one is not. The floor taken is a dual bound (sum of row duals plus each column's negative reduced cost, every variable lying in [0, 1]), so it holds whatever rounding the simplex leaves, then lifted to the next sum of whole shift lengths (`openSumLift`, off with `openSums: false`). Every rule it leaves out (days in a row, keep sets, pay) only lowers it.

| week (eval/clique-floor.out.txt) | clique LP | engine before |
|---|---|---|
| 60 x 168 week 0 (245 copies) | **300 h in 1.3 s** | 300 h held, floor 275 h, unproven |
| 60 x 168 week 1 (238) | 308 h in 1.1 s | 308 h, proven by column generation |
| 80 x 224, three weeks (304-326) | 257, 331, 281 h in 4.5-6.3 s | the same, proven in 42-86 s |
| 100 x 280, two weeks (400) | 358 and 344 h in 13-15 s | 359 and 347 h held over the same roots |

**In `buildRoster`** (exact check on; `cliqueFloor: false` turns it off): on weeks up to 60 copies it runs before the cover passes (milliseconds); on bigger weeks it runs after the whole-score column generation and only if that did not prove the roster, so it never takes time from a pay proof, and under a time budget only when the time left covers its expected cost (1.6 s x (copies / 245)^4.5, fitted to the table). It raises the open-hours floor (`forcedOpenHours`, `coverageProven`), lets the coverage walk stop at it, and, when no `prefer:` window or kept shift gives a bonus, bounds the score by 100,000 x the floor. `optimality.cliqueFloor` reports it.

| 60 x 168, `eval/end-to-end.mjs` | before | after |
|---|---|---|
| week 0, 20 s budget | 21.1 s, coverage **not proven**, score gap $2.5 M | 15.7 s, coverage **proven** at 300 h, gap $20,010 (the week's pay and penalties: only the pay part is open now) |
| week 0, no budget | 59.3 s, not proven | 38.7 s, coverage proven |
| week 1, 20 s budget | 8.5 s, proven | 10.5 s, proven, same roster (the clique LP is not run) |

Tried and dropped: giving the floor to the whole-score column generation as its open-hours row (`openFloor`). On week 0 its root then reached only 212 h in the budget, and on week 1 it lost the pay proof the LP made without the row. HiGHS on the clique model (rather than pairwise rows) for the 100-person weeks: 300 s each, rosters of 368 and 367 h over the same 358 and 344 h bounds, worse than the engine's 359 and 347. So the 100-person gaps are in the search and the tree, not the bound, as the next list said.

Tests: `clique-floor.test.mjs` (on 240 seeded three-person weeks with rest gaps of 0-12 h, daily caps and last week's late finishes, the floor is never above the brute-force least open hours and meets it on 174 of the 223 weeks that must leave hours open; the 60 x 168 week 0 gives 300; the build reports it and `cliqueFloor: false` turns it off). The full suite passes. Not claimed: seeded synthetic weeks and one cloud machine (the 80- and 100-person timings ran beside other benches); the pay half of week 0 is still unproven ($20,010 is a loose bound that counts all pay as open, not a measured gap); the clique LP is not run on 100-person weeks under the default budget.

## Paying for call-out slack: exposure priced inside the build (2026-11-13)

`--steady` ("Which of the tied best rosters holds up to a call-out?" above) chooses among rosters that already tie at the
best score, so it gives up nothing — and on four of the five test teams seed 1 was already the least exposed, so it changed
nothing either. The question it left, in its own closing line: what could a manager buy by giving something up? This is
that term.

**The quantity.** `calloutExposure` rebuilds the week once per person-day, about 20 s on the café: far too slow to sit
inside a search. `coverRisk(ctx, owner)` asks the quickest of its questions instead. For every person-day worked from
Tuesday on: if that person called out, could someone else take each of their shifts that day with every hard rule holding
and nobody else moved? If not, the day is at risk and its hours are counted. The hand-over chains and the rebuilds that
exposure also tries are left out, so **risk hours are an upper bound on what one call-out opens, not a forecast** — on
retail the posted roster's 54 risk hours sit over a measured exposure of 0.

**The price.** `--cover-price <$>` (page: "Pay for call-out slack", per hour at risk) hill-climbs the roster on
`score + price x risk hours`, one hand-over or one swap at a time, after the search and any proof. Open hours cost
$100,000 an hour inside the score, so no sane price trades coverage away; what it trades is pay and fairness. When it
moves anything, the report says what it paid and `optimalityText` stops claiming the proof the traded roster breaks.

The sweep, `node eval/cover-price.mjs` (`eval/cover-price.out.txt`), prices $0 to $200 an hour at risk:

| team | risk hours (of person-days) | moves | score paid | payroll | exposure before → after |
|---|---|---|---|---|---|
| café | 188 h, 23 of 23 | none at any price (335 candidates) | — | $3,690 | 92 → 92 |
| spare part-timer | 200 h, 27 of 27 | 1, at $25 and up | $18.34 | $3,885 → $3,900 | 54 → 54 |
| salon | 56 h, 10 of 16 | none (79 candidates) | — | $2,054 | 56 → 56 |
| retail | 81 h, 11 of 17 → **54 h, 9 of 17** | 1, at $1 and up | **$5.82** | $2,250 → **$2,247** | **24 → 0** |
| clinic | 57 h, 9 of 12 | none (38 candidates) | — | $2,708 | 30 → 30 |

The price binds where you would expect: the spare café's move costs $18.34 of score and clears 3 risk hours, so it fires
at $25 an hour at risk and not at $5. On the café every person-day is at risk and no single hand-over or swap changes
that, which is the same wall "A whole week of call-outs" hit.

**Does the trade pay in a real week?** The rosters the price posted were played through the same seeded weeks as
`eval/steady-for-callouts.mjs` (call-outs per person-day worked at the Deputy file's 1.0% sick-only and 8.4% all-leave
rates, 5pm notice, started shifts pinned, kept reissues, 20 seeds, no extra copies):

| team, rate | disrupted weeks | open hours added, default → priced | changes to others | premiums |
|---|---|---|---|---|
| retail, 1.0% | 6 | **6 → 0** | 12 → 10 | $202 → $170 |
| retail, 8.4% | 17 | **30 → 18** | 29 → 31 | $481 → $527 |
| spare, 1.0% | 6 | 6 → 6 | 12 → 12 | $193 → $190 |
| spare, 8.4% | 20 | 138 → 135 | 147 → 160 | $2,438 → $2,639 |

On retail one shift changing hands, for $5.82 of score and $3 *less* payroll, removed every open hour a week of sick
call-outs left (6 → 0) and cut the all-leave week's by 40%, with fewer changes and lower premiums at the sick rate. The
spare café's move bought nothing measurable: 3 fewer risk hours, the same exposure, $15 more payroll and more changes —
the honest reading is that the surrogate over-counts, so a move can clear risk hours that no call-out would have opened.
That is the trade a manager is being offered, and why the price is theirs to set and off by default.

**Cost.** The pass is milliseconds where the check it stands in for is seconds: 0-11 ms on the five templates (335
candidate moves on the café), 22-158 ms on seeded 20- and 40-person weeks (81-149 copies) and 1.06 s on the 60-person
week 0 (245 copies). It is capped at 250 copies (`coverPriceSlots`), runs on a fresh week only (the CLI and the page both
skip it when a posted roster is loaded, so it never pays to move a shift someone has already been told about), and the
roster is unchanged when no move pays for itself.

Tests (`cover-price.test.mjs`): one person alone puts every day they work at risk for its hours; a free second person
takes the risk to 0 and `calloutExposure` agrees; both shifts of a two-shift person-day are counted; on retail the price
buys a hand-over that costs score and never coverage, and the slow measurement confirms what it bought; a price of $0.01
changes nothing; a price of $1,000,000 leaves no extra shift open; the option is off by default; `optimalityText` says a
roster was traded rather than claiming the broken proof; the CLI flag and `--json`; the page's setting, its wiring and the
usage event. A headless-Chromium run of the page (`cover-price.check.mjs`) built the retail template with the setting off
and at $100 an hour at risk: the notice appeared only with it on, the roster changed, and no page errors.

Not claimed: invented teams with rates from one firm's file (as above); 20 seeded weeks per cell, no extra shift copies;
one move at a time, so a trade that needs two shifts to move together is not found; risk counts a person-day's shifts
one by one, so it does not check that one person could take all of them; the surrogate's looseness is measured on five
teams only.

## Counting call-out risk with hand-over chains (2026-11-13 later)

"Paying for call-out slack" (above) priced risk hours with a check that asked one question per shift: could someone else
take it outright, nobody else moved? Its own closing lines named two gaps: it counted a person-day's shifts one by one (one
stand-in could be counted for two shifts they could not both work), and it over-counted badly: retail's posted roster
showed 54 risk hours over a measured exposure of 0. `coverRisk` now hands out all of the day's shifts at once, and lets a
stand-in who is full pass one of their own shifts (on the call-out day or later; earlier ones have been worked) to a third
person, who may pass one on: up to `chain` passes per shift, 2 by default, `--cover-chain 0` for the first check.

**Does it pick out the days that really open?** `node eval/cover-risk-joint.mjs` (`eval/cover-risk-joint.out.txt`)
compares each setting with `calloutExposure` person-day by person-day on the five templates and three seeded 20-person
weeks: 202 person-days, of which 48 really open hours when that person calls out.

| check | person-days flagged | of them really open | missed | hours flagged |
|---|---|---|---|---|
| each shift on its own (before) | 91 | 52.7% | 0 | 670 |
| all shifts at once | 91 | 52.7% | 0 | 670 |
| + one pass | 75 | 64.0% | 0 | 549 |
| **+ two passes (default)** | **72** | **66.7%** | 0 | **532** |
| + three passes | 72 | 66.7% | 0 | 532 |

The joint check changed nothing here: no template or seeded week gives anyone two shifts on one day. It is a correctness
fix that the tests pin (`cover-price.test.mjs`: Bo, capped at 4 h a week, could take either of Ana's two Tuesday shifts but
not both; the old check called that day safe). The chains do the work: retail's 81 h on 11 days fall to 45 h on 5, of which
4 days really open; the seeded weeks' 88 flagged hours were all false and fall to 0. The café's 23 flagged days still sit
over 11 that open: there the rebuild finds cover by moving many shifts, which no short chain sees. Risk stays an upper
bound (no day exposure finds open was missed by any setting).

**Does the price still buy the same trades?** The template sweep (`node eval/cover-price.mjs`, `eval/cover-price.out.txt`)
on the new check: retail's one hand-over now takes risk from 45 h to **0 h**, matching its measured exposure (24 h to 0;
the old check called the same roster 54 h), at the same $5.82 of score and with the same seeded-week results. The spare
café now makes 2 moves (200 to 194 risk hours by the new count) for the same $18.34; over 20 seeded weeks at the sick-only
rate it made fewer changes to others (12 to 10) and lower premiums ($193 to $157); at the all-leave rate it added 130 open
hours instead of 138, with more changes (147 to 152) and premiums ($2,438 to $2,493). Its exposure is 54 h either way. Café, salon and clinic: still no move pays at any price.

**What the old check bought on bigger weeks.** `node eval/cover-chain-cost.mjs` (`eval/cover-chain-cost.out.txt`) runs the
priced pass ($100 an hour at risk) on seeded 20-, 40- and 60-person weeks, each built once with the defaults, every setting
starting from the same roster, and asks the strictest count (two passes, no budget) about the roster each posts:

| week | one-shift check: moves, score paid, strict risk before → after | two passes (default): moves | pass time, old / default / two passes uncapped |
|---|---|---|---|
| 20 x 56 week 2 | 1, $3.66, 189 → 189 h | 0 | 22 ms / 45 ms / 59 ms |
| 40 x 112 week 0 | 1, $3.13, 435 → 435 h | 0 | 104 ms / 685 ms / 5.6 s |
| 40 x 112 week 1 | 6, $4.93, 440 → 440 h | 0 | 153 ms / 1.2 s / 14.0 s |
| 40 x 112 week 2 | 5, $3.74, 160 → 160 h | 0 | 109 ms / 99 ms / 233 ms |
| 60 x 168 week 0 | 8, $10.38, 292 → 292 h | 0 | 1.1 s / 3.5 s / 14.4 s |

All 21 trades the old check made on these weeks, $25.84 of score in all, cleared risk the two-pass count does not see.
The old check flagged 846 h on the 60-person week where two passes find 292: it was charging a manager for slack the team
already had.

**Cost, and the budget.** On a day nobody can cover, the two-pass search reads 38-39 of 40 people's lists, and the pass
re-runs it for every candidate move, so uncapped it took 5.6-14.4 s on the 40-60 person weeks. A memo keyed on the lists
each search read was tried and dropped: the failing searches read nearly everyone, so nothing was reused and it ran
slower. What shipped is a budget, `coverBudget` (500 checks per person-day): a search past it counts the day at risk, which
only ever adds risk, so the count stays an upper bound. A capped search can also "clear" risk merely by finishing under
budget after a move (4 such trades, $0.90, on the 60-person week), so every move that passes the capped screen is
confirmed by the same check without the budget before it is kept, and the reported risk hours are the unbudgeted count.
On the templates the budget never binds (the capped and uncapped counts agree on all 202 person-days).

Not claimed: five invented templates and seven seeded weeks; exposure is itself a model (5pm notice, kept rebuild), not a
real week; the café's gap between flagged and open days is left; moving two shifts together is still not tried; the
60-person pass is 3x slower than the old check's (3.5 s against 1.1 s), within the 250-copy cap.

## Moving two shifts together (2026-11-13 later)

Both sections above closed on the same gap: the priced pass (`--cover-price`) only ever moved the at-risk person's own
shift, one hand-over or one swap at a time. Once the risk check learned hand-over chains, that left nothing to try on a day
it still flags: everyone who could stand in is blocked by their own week (an hours cap, a rest gap, a clash), and a chain
cannot help because the shift blocking them was worked before the call-out, or nobody can take it outright.

So the pass now also moves **a stand-in's** shifts. For every person q eligible for a risky shift i, every shift j on q's
week (any day: a move made now is not limited to shifts not yet worked, as a chain is), and every r eligible for j:

- **relief**: j goes to r, so q has room to stand in; the at-risk person keeps i;
- **trade**: j goes to r and one of r's shifts k goes to q, two shifts changing hands at once;
- **relay**: i goes to q and j to r.

Each candidate is screened first (it must leave some day now at risk coverable, chains included, on a day q or r could
stand in on: a few chain searches, not a whole risk count), then goes through the same priced test as the single moves,
and is kept only if it **cuts risk hours** as well as paying for itself. That last rule came from the first run: on the
spare-part-timer café a relief that left risk at 194 h and saved $5 of score was taken, and the posted week's measured
exposure rose from 54 h to 66 h. On by default up to 200 shift copies; `--no-cover-pairs` (`coverPairs: false`) turns it
off, `coverPairsSlots` moves the cap.

`node eval/cover-pairs.mjs` (`eval/cover-pairs.out.txt`) runs the pass with and without them from the same roster ($25 and
$100 an hour at risk gave the same moves everywhere):

| week | single moves only | with two-shift moves | pass time, off / on |
|---|---|---|---|
| café, salon, clinic templates | none | none | +0-4 candidates |
| spare-part-timer café | 2 moves, 200 → 194 h, +$18.34 | the same roster | 156 ms |
| retail | 1 move, 45 → 0 h, +$5.82 | the same roster | 22 ms |
| 20 x 56 week 0, week 1 | none | none | 106 / 173 ms, 309 / 497 ms |
| **20 x 56 week 2** | none (189 h) | **4 moves (2 single, 1 relief, 1 trade): 189 → 107 h, +$35.27** | 64 / 280 ms |
| 40 x 112 week 0 | none (435 h) | 1 trade: 435 → 427 h, +$4.47 | 0.9 / 2.7 s |
| 40 x 112 week 1, week 2 | none | none | 1.4 / 2.9 s, 0.3 / 0.4 s |
| 60 x 168 week 0 (over the cap) | none | none | 3.9 / 13.9 s |

The two single moves on the 20-person week come after the relief and trade: freeing one stand-in made hand-overs pay that
did not before.

**Does it show in the slow measurement?** `node eval/cover-pairs-exposure.mjs` (`eval/cover-pairs-exposure.out.txt`) runs
`calloutExposure` (every person-day Tuesday to Sunday as a 5pm-before call-out and a kept rebuild) on the rosters each
setting posts:

| week | default | single moves only | with two-shift moves |
|---|---|---|---|
| **20 x 56 week 2** | 113 h | 113 h | **68 h** (open 48 h either way) |
| 40 x 112 week 0 | 328 h | 328 h | 322 h (open 169 h either way) |

On the 20-person week four moves, $35.27 of score, took the open hours one call-out could leave, summed over all 56
person-days, from 113 to 68: 40% less. The single moves found nothing there at any price. On the 40-person week the one trade, $4.47, took 6 h off 328.

Tests (`cover-price.test.mjs`): a three-person week where only a relief helps (Bo, capped at 4 h, holds Monday, which no
chain can pass on by Tuesday; Cy takes Monday) clears Ana's Tuesday, and `calloutExposure` agrees (4 h to 0); $5 an hour
buys nothing there; the spare café posts the single-move roster (the cut-risk rule); on the seeded 20-person week the
pairs clear risk the single moves cannot, with no shift opened and the reported risk equal to the unbudgeted count; the CLI
flag.

Not claimed: invented teams and seeded weeks; exposure is a model (5pm notice, kept rebuild), not a real week; moves of
three or more shifts are not tried; the café's 23 flagged days over 11 that open are untouched (4 candidates passed the
screen there and none paid: the café is short-staffed, 15 h open, so there is little room to free); the pass is 2-3x slower with the pairs on
the 40-person weeks and they stay off above 200 copies, where the one week measured found nothing for 10 s more.

## Fresh builds, column generation first (2026-11-13 later)

"Posted reissues, column generation first" measured fresh builds both ways and left them on the old order because the guide pages quote fresh rosters. This run re-derived the pages and moved the default: `buildRoster` now runs the whole-score column generation before the coverage plateau walk on **every** build with the exact check on (`deferCover: false` keeps the old order). Above 60 shift copies, in the call-out check and on posted reissues it already did.

**Checked first, on more weeks.** `node eval/fresh-order.mjs` (`eval/fresh-order.out.txt`) builds each week both ways: the five teams of "A whole week of call-outs" x seeds 1-12, and seeded 8-18 person weeks (the cg-scale-bench generator) at or under 60 copies, the sizes where the order changes.

| 80 fresh builds | old order | column generation first |
|---|---|---|
| proven best | 80 | 80 |
| score, open hours | - | same on all 80 |
| a different roster (a tie) | - | 16 (all 12 café seeds, 4 seeded weeks) |
| time | 36.4 s | **10.4 s** (3.5x) |

The sample café, the week the page opens on: about 1.3 s to 0.25 s a build. No build was more than 50 ms slower.

**What a manager sees.** The café posts another tied roster: same $3,690, same 15 open hours (the weekday lunches), different people on the opens and closes. Column generation lands on that one roster whatever the seed, where the old order's seeds land on several. The ties are not equally robust: summed over every Tuesday-Sunday call-out (`calloutExposure`), the new roster leaves 100 h open; the old order's seed 1 left 92 h, and across seeds 1-12 the old order's rosters averaged 110 h (92-140). So the plain build is steadier than the old order's average and less steady than its seed 1.

**`--steady` kept its choice.** Because every seed now gives the same café roster, varying the seed alone would leave the call-out check nothing to choose between. `steadyRoster` now takes the plain build's roster first, then builds its seeds in the old order (`deferCover: false`), whose seeds land on different ties; a caller who sets `deferCover` gets every seed in that order. The café's steady pick is the same 92 h roster as before (seed 1, walk first); the result names each candidate's `order` and index (`chosen`, `chosenOrder`). One build more than before: 16 s on the café against 14.4 s.

**The planner stays on the old order.** `planWeeks` carries each week's last shifts into the next week's rest gaps and streaks, so which tie a week posts changes what the next can do. `node eval/plan-order.mjs` (`eval/plan-order.out.txt`) plans four weeks both ways on the five teams x 12 drawn time-off patterns, plus the guide page's plan:

| 61 four-week plans | old order | column generation first |
|---|---|---|
| open hours, plain | 1,086 | 1,089 (worse on 1, better on 0) |
| open hours, keep usual shifts 0.1 | 1,084 | 1,086 (worse on 1, better on 0) |
| time, all four plan kinds | 76.2 s | 27.1 s |

The one plain plan that got worse is the guide page's (Ana off Tue 1 Dec, Ben off Fri 4 Dec): week 3 had 20 open hours, not 17. Two of 122 is thin evidence, but nothing went the other way, so `planWeeks` sets `deferCover: false` unless its caller sets it, and every plan figure is as before. Next on it: pick among a week's tied rosters by what they leave the next week, which would let the planner take the speed as well (done the same day: "The planner picks a week's tie by what it leaves the next", below).

**The pages, re-derived.** Tests pin each figure to the engine (`page*.test.mjs`, `staffpack.test.mjs`). What changed:

| page | before | now |
|---|---|---|
| call-out | a rebuild moves 2-15 shifts | 7-17 (still 15 of 27 covered) |
| posted schedule, rebuild | 3-15 others' shifts; Dev moved four people | 9-13; each moved three |
| posted schedule, keep posted shifts | Ana 4 to 2 changes, all 15 h open | Ana's Wednesday cannot be covered once Monday and Tuesday are held: 23 h open in both columns, the kept reissue changes nothing else |
| same, 41 call-outs | 190 to 91 changes, $3,190 to $1,572, ILP least 88 (153 with the caller) | 204 to 96, $3,439 to $1,674, ILP least 94 (158), `eval/reissue-ilp-check.out.txt` |
| 14-day notice | Fay's premium nearly triples from 10 days to 3 | Ana's nearly doubles; Gus owes four fifths at 10 days |
| labour cost by day | Tue 34.8%, Sun 15.3% | Tue 33.8%, Sun 16.0% (Monday still worst, 36.5%) |
| template, sample staff pack | old grid | the new roster |

Clopening, days in a row, time off, rotation, widening, overtime, 14-15 year olds, coffee, restaurant, retail, salon, daycare and the hiring test came out the same. The CLI's `--changes` test case moved from Dev off Thursday (now a tie at $89 kept or free: keeping posted shifts never costs more, but need not save) to Fay ($89 against $118). The whole test suite went from 160 s to 137 s on one 4-core machine.

Not claimed: invented teams and seeded weeks on one machine, runs one after another; the equivalence is measured, not proven: where column generation proves nothing the walk still runs after it; call-out exposure is a model (5pm notice, kept rebuild).

## The planner picks a week's tie by what it leaves the next (2026-11-13 later)

"Fresh builds, column generation first" left `planWeeks` on the old order (plateau walk first) because the tie column generation posts can leave the next week less room: 2 of 122 four-week plans ended 2-3 open hours worse. This run moves the plain planner to column generation first and adds three things around it, so it takes the speed without losing an hour, and it turned out steadier too.

**1. Look one week ahead, only when it can matter.** After choosing week k, the planner builds week k+1 from it and from a relaxation: the same staff with the carried-over rest gaps and day streaks left out, which can only allow more. If the two leave the same open hours and score, no other choice for week k can leave week k+1 better, and nothing more is built. If week k+1 falls short of its relaxation, week k is built again in the old order (`tieSeeds`, default the caller's seed), and among the rosters with week k's open hours the one whose two weeks together leave the fewest open hours, then the least summed score, is posted (`tiePick` on that week). A roster a few points worse this week is taken if it leaves next week a shift fewer open, never one that opens an hour this week. With steady ties off, this alone fixes the guide page's plan: week 2's first tie left week 3 20 h open against a relaxation of 17, and the old order's tie of the same score left 17.

**2. Steady ties.** Column generation lands on one tie per week, but a carried-over rest gap can move it to another tie of the same score, so a plan with nothing changing reshuffled people: the sample café cycled through three tied rosters (`steadyTies: false` shows it). Now the planner tries the rosters of earlier weeks with no dated day off, newest first. If one is still allowed and scores the same, the week is built again with a 0.01 per-shift bonus for that roster's shifts, starting from it, and posted if its score without the bonus ties (`rosterScoreUnder` scores a roster under the new week's staff; `steadied` names the week). If the newest leave-free roster is not allowed whole (someone is off), the week is still built toward it once, and posted if it ties ("closer to week 2"). Weeks with someone off are never copied: copying one carried its reshuffle into the following weeks (measured first: distance from the usual rota up 6-44% on the leave sweep). The planner marks such weeks `leave`.

**3. A fallback for what one week cannot see.** When a week's look-ahead still leaves the next week short of its relaxation, the shortfall can come from a choice two weeks back. Then the whole plan is also built in the old order and whichever leaves fewer open hours is returned (the new one on a tie; `lookahead.fellBack`).

**"Keep people on their usual shifts" stayed on the old order** (unless `deferCover` is set; moved to column generation first on 2026-11-14, next section). Measured with column generation first and the look-ahead, it was 1.7x faster at the same open hours (after the fallback), but moved 3% more shifts week to week on the drawn plans and 4-20% more on the leave sweep, and steadiness is that setting's whole point. The page defaults to it, so the page's plans are unchanged; the CLI's `--weeks` without `--keep-shifts` and `planWeeks` with no keep get the new planner.

**Measured** with `node eval/plan-lookahead.mjs` (`eval/plan-lookahead.out.txt`): the plans of `eval/plan-order.mjs` (five invented teams x 12 drawn time-off patterns of one or two days off, plus the guide page's plan), memo off so no kind reuses another's builds, one 4-core machine:

| 61 four-week plans, no keep | old order | column generation first, alone | now |
|---|---|---|---|
| open hours | 1,086 | 1,089 (worse on 1) | **1,086** (worse on 0, better on 0) |
| person-shift changes week to week | 1,587 | 1,793 | **465** (-71%) |
| payroll | $713,903 | $713,846 | $713,903 |
| time | 53.5 s | 16.4 s | 30.9 s (1.7x faster than old) |

70 weeks posted an earlier week's roster or one built toward it; 1 of 171 looked-ahead weeks rebuilt in the old order; 1 plan also ran the fallback and kept the new plan. Keep plans: identical to before on all 61.

With scattered leave, `RATES=0,0.02,0.04,0.08 KEEP=0.1 node eval/steady-plan.mjs 5 4` (`eval/steady-plan.steady-ties.txt`; `ORDER=walk` gives the old planner, `eval/steady-plan.walk-order.txt`; "off usual" now measures against the planner's own first week with no leave, since a fresh build is a different tie since fresh builds moved to column generation first). 100 planned weeks per row, all proven in both:

| days off | no keep, old order: changes / off usual / time | no keep, now | keep 0.1 (old order in both) |
|---|---|---|---|
| 2% | 617 / 496 / 26.4 s | **367** / 476 / 12.5 s | 170 / 119 |
| 4% | 1,022 / 1,000 / 36.3 s | 980 / 1,098 / 14.0 s | 378 / 298 |
| 8% | 1,226 / 1,265 / 27.6 s | 1,218 / 1,271 / 15.2 s | 536 / 439 |

Open hours and pay are identical between the two planners in every row. So: about 2x faster everywhere; far steadier when time off is sparse (the drawn plans, and 2% of person-days); about the same when most weeks have someone off, where at 4% the distance from the usual rota rose 10%. Keep usual shifts still roughly halves the changes. The guide page's month table quotes the new plain rows.

**What a manager sees.** On the guide page's café plan (Ana off Tue 1 Dec, Ben off Fri 4 Dec) the plain plan now changes 5 person-shifts going into week 3 and 5 coming back (15 and 15 before), the five the day off needs: Ben's Friday close goes unfilled, Ben takes Gus's Wednesday close, Gus takes the Wednesday and Thursday lunches. Keep usual shifts still changes 11 there (its usual week differs). Same 62 open hours and $14,722. `keep-a-consistent-schedule-when-someone-is-off.html` says so.

**The cost of steadiness.** On the rotation guide's six identical staff with the spread setting off, the plan used to vary by accident and the gap between the most and fewest tough shifts over eight weeks was 3 (37 to 34). Now it posts the same rota every week, so the same three people get the closes: 40 against 32, a gap of 8. A spread of 10 still evens it to 36 each at the same $28,200. That is the honest reading of "spread off", and `how-to-rotate-closing-and-weekend-shifts-fairly.html` says so; `steadyTies: false` gives the old variation.

The page's plan table marks a steadied week ("same as week 1 (a tie)") and a look-ahead pick. Options: `lookahead: false`, `steadyTies: false`, `tieSeeds: [...]`; `deferCover: false` is the old planner with neither. Tests: `plan-lookahead.test.mjs` (the guide plan by each path, the sample plan's one rota against the cycling one at the same scores, the old order untouched, `rosterScoreUnder`, the page wiring); `keep-shifts.test.mjs` and `page-limits.test.mjs` pin the re-derived pages.

Not claimed: invented teams with drawn or swept time off, one machine; the relaxation proves week k+1 cannot do better only when that build is proven (an unproven week makes the check a heuristic); the look-ahead is one week, with the whole-plan fallback behind it, not a plan-wide optimum; with steady ties the copies of one shift can swap names in the CSV (same people, same shifts); whether managers prefer the steadier plan is unmeasured.

## Keep usual shifts, column generation first (2026-11-14)

The section above left "Keep people on their usual shifts" (the page's default) on the old order: with column generation first it moved 4-20% more shifts week to week on the leave sweep. This run found why and moved it over.

**Two ideas that changed nothing.** (1) Steady ties in keep mode (post an earlier week's roster when it ties under the usual-rota bonus): it never fired, and the sweep's figures were identical to the digit. In keep mode the weeks with no one off already post the usual rota, and the rebuild toward an earlier week is the same build as the week's own. (2) A per-shift tie-break on the usual rota (`keepShift` 0.01 next to `keepValue` 0.1, `KEEPSHIFT=0.01` in `eval/steady-plan.mjs`), aimed at the churn count, which counts shifts, not wage-hours: also identical on both orders. 0.01 x wage is under the exact search's 0.5 tolerance, so the proof stops before it can choose.

**The cause: the anchor.** In keep mode the planner first builds the usual week (no dated days off, bonus off) and anchors every week to it. With column generation first, that build lands on a different tie of the usual week, and the weeks with someone off strayed further from it. Building only the anchor in the old order (plateau walk first) and every week column generation first gives back the old planner's plans exactly.

**What changed.** `planWeeks` with `keepValue > 0` no longer forces `deferCover: false`; the anchor build does instead (unless the caller sets `deferCover`). So keep plans get column generation first, the one-week look-ahead and the whole-plan fallback.

**Measured.** `RATES=0,0.02,0.04,0.08 KEEP=0.1 node eval/steady-plan.mjs 5 4` (`eval/steady-plan.keep-cg.txt`; the old planner is `eval/steady-plan.steady-ties.txt`), five invented teams, 100 planned weeks per row, all proven:

| days off | keep 0.1, old planner: changes / off usual / time | now | anchor column generation first too (tried) |
|---|---|---|---|
| 2% | 170 / 119 / 14.2 s | **170 / 119 / 9.4 s** | 204 / 139 / 7.8 s |
| 4% | 378 / 298 / 21.5 s | **378 / 298 / 11.8 s** | 404 / 322 / 10.0 s |
| 8% | 536 / 439 / 19.9 s | **536 / 439 / 14.7 s** | 560 / 453 / 14.2 s |

Open hours and pay are identical to the old planner in every row (the tried variant also matched open hours, but paid slightly less and moved more). On the 61 drawn four-week plans (`node eval/plan-lookahead.mjs`, `eval/plan-lookahead.out.txt`) the keep plans are unchanged (1,084 open hours, $713,982, 394 changes) and take 28.8 s against 37.6 s. So the page's default plan is 1.3-1.8x faster with nothing else moved. On the guide page's café plan the four weeks are the same rosters (`plan-lookahead.test.mjs`, "keep usual shifts").

Not claimed: invented teams with swept or drawn time off, one 4-core machine; times include the usual-week build. Whether a manager notices or prefers the steadier plan is still unmeasured.

## Staff shared between sites (2026-11-14)

Until today a business with two shops planned each one separately (`--each-location` gave one plan per site, and the builder took one staff list per run), so a person who works at both had to be split by hand and the weekly hour limit could not hold across the two plans.

**What changed.** A shift row takes `site: Harbour` and a person's row takes `sites: Main | Harbour` (`site:`, `location:`, `shop:` and `store:` read the same; no cell means the person can work anywhere). One build then plans every site from one staff list: the weekly and daily hour limits, the rest rule, days in a row and no double-booking hold across the sites, and a person is offered only shifts at sites their row lists. Names match with case and punctuation ignored (`Main St.` = `main st`). The rest is carried through:

- The report gains a **By site** table (`siteSplit` in `calc.mjs`): shifts, hours, covered and open hours, payroll and headcount per site, and who works at more than one site with their hours at each. Overtime is earned on the week, not at one shop, so each person's pay is shared between sites by their hours there; the per-site payroll adds back to the roster's total. The CLI prints the same table under the roster (`siteSplitText`) and `--json` gains `sites` and a `site` on each assignment.
- An open shift at a site nobody lists says `nobody listed works at "Harbour"`.
- The roster CSV gains a `site` column only when some shift names a site, so one-shop files stay byte-identical. Reissues hold a started shift for whoever had it **at that site** (`pinStarted`), and last week's shifts earn the keep bonus only at their own site (`slotKey` adds the site); a file with no site column matches any site, as before.
- `--from-sales --each-location` now tags every shift line with `site: <name>`, so its whole output pastes into one build: forecast each shop from the till export, list everyone once with their `sites:`, build.
- The page reads the same cells and shows the By site table under the roster.

**Measured** (`node eval/shared-staff-sites.mjs`, `eval/shared-staff-sites.out.txt`): 40 seeded, made-up weeks, a seven-day "Main" (two openers and two closers a day, 224 h) and a smaller "Harbour" (one person Mon-Thu, two Fri-Sun, 11-7, 80 h), 7 and 3 people with 1-3 random days off, 24-40 h caps and $15-22 wages. Same engine, same seeds; f is the share of each site's people allowed at both:

| plan | open hours (40 weeks) | payroll | weeks with fewer open hours than separate |
|---|---|---|---|
| each site separately | 1,040 | $204,560 | |
| one build, f = 0 | 1,040 | $204,568 | 0 (and 0 with more) |
| one build, f = 0.25 | 728 (-30%) | $210,184 | 22 of 40 |
| one build, f = 0.5 | 608 (-42%) | $212,424 | 29 of 40 |
| one build, everyone at both | 464 (-55%) | $215,144 | 34 of 40 |

With f = 0 the joint build equals the separate builds in open hours on every seed (the script stops if not), which checks that the site rule keeps two staff lists apart; the $8 payroll difference is the fairness term, which now spreads over one team. Pooling never left more hours open. Payroll rises because more hours are covered, not because the hours cost more. The script also checks every roster: nobody is placed at a site their row does not list. Checked in `sites.test.mjs` (8 tests: parsing, the site rule and a cross-site hour cap, the open-shift reason, the split adding back to payroll, the CSV column, the site-aware reissue pin and keep, and the CLI from a two-site Square-header sales file to one joint roster), and a headless-Chromium run of a two-site week on the page showed the table with no page errors.

Not claimed: invented teams and shops; no real multi-site business's staff list has been read. No travel time between sites is modelled: the rest rule (10 h by default) already keeps any two shifts of one person apart, so it matters only when rest is set below the trip; with rest set to 0 a person could close one shop at 3pm and open the other at 3pm. The "people a week work at both" count in the eval includes tied rosters where a cross-site shift buys nothing. Sites are not yet priced differently (a per-site wage or a travel allowance).

## Travel time between sites (2026-11-14)

The shared-staff build above kept people apart only by the rest rule. With the default 10 h rest that is enough. But a restaurant that allows split shifts lowers the rest rule, and then one person could finish lunch at one shop at 2:30 and start at the other at 3:00, a trip the roster never checked.

**What changed.** `--travel 30` (page: "Travel between sites") says every pair of named sites is 30 minutes apart; `--travel "30; Main to Airport 60"` sets one pair (either direction), and durations read `45`, `45 min` or `1.5h`. A person's two shifts at different named sites then need max(rest, travel) between the end of one and the start of the other. Shifts with no site, or at the same site, are unaffected. The rule sits in the hard-rule check every path uses (`validList`, its fast merge `validWith` and `validListSlow`, so the search, the exact check's column pricing, call-out covers and reissues all hold it). The exact bounds still use the rest rule alone; a tighter rule only shrinks what is feasible, so they remain valid bounds, just looser. When no trip is longer than the rest rule nothing is built and every result is byte-identical to before. An open shift says `1 would have no time to travel from another site`, and the cover finder names the same reason. A travel pair naming no site in the week, or a trip already inside the rest rule, comes back as a warning.

**Measured** (`node eval/travel-between-sites.mjs 12 7`, `eval/travel-between-sites.out.txt`, and `... 12 8`, `eval/travel-between-sites-8.out.txt`): 12 seeded, made-up weeks of a split-shift restaurant pair, rest 0, daily cap 10 h, everyone allowed at both shops. Main runs lunch 11-3 (2 people), an afternoon 3-5 (1) and dinner 5-10 (2); Harbour lunch 11:30-2:30 (1) and dinner 5:30-9:30 (1, 2 Fri-Sun). The tightest possible hop is 30 minutes.

| team | travel rule | open hours (12 weeks) | payroll | person-days at both shops | of those, under 45 min apart |
|---|---|---|---|---|---|
| 7 people | off (as before today) | 12 | $44,133 | 109 | 52 |
| 7 people | 45 min | 24 | $43,887 | 101 | 0 |
| 8 people | off | 0 | $44,043 | 102 | 34 |
| 8 people | 45 min | 0 | $44,034 | 75 | 0 |

So without the rule, half the 7-person weeks' cross-shop days (52 of 109) and a third of the 8-person weeks' (34 of 102) asked someone to be at the other shop 30 minutes after leaving the first. If the trip takes 45 minutes, each of those is a late start the manager finds out about on the day. With the rule on, no roster has a hop under the trip (the script stops if one does). On the 8-person team the rule cost nothing: the same hours are covered by sending different people across. On the short-staffed 7-person team it left 12 more hours open over 12 weeks, in 5 of the 12 weeks, which is the honest price of the trip: those hours were only "covered" by a hop nobody could make. A 30-minute rule changed nothing here because every hop in this layout is at least 30 minutes; 60 minutes gave the same result as 45 because no hop falls between 45 and 60. Builds took 16-17 s with the rule off and 17-22 s with it on (the exact check works harder when the rule bites). Checked in `travel.test.mjs` (6 tests: parsing, the three hard-rule checks agreeing at 0/20/30/31 minutes, a build and its open-shift reason, the cover finder's reason, the warnings, and the CLI flag), the venture's full suite, and a headless-Chromium run of the page (the open shift's reason names the travel rule; no page errors).

Not claimed: invented shops, times and teams; no real two-site business's trip times or rosters. One number per pair of sites, the same in both directions and at every hour. The trip from last week's final shift (`prev:`) is not checked against a site, because that cell gives a time but not a site. Paying the trip landed next (below).

## Paying the trip between sites (2026-11-14)

The travel rule above keeps a person's shifts at two shops far enough apart to make the trip. It did not pay for the trip. In the US, travel from one job site to another during the workday is hours worked (29 CFR 785.38), so a person who does lunch at Main and dinner at Harbour is owed the drive, at their wage, and it counts toward overtime. Until today the builder priced that day as if the drive were free, so it happily sent people across when someone else could have stayed put.

**What changed.** `--pay-travel` (page: "Pay travel between sites") pays the `--travel` minutes of each same-day trip between two named sites as hours worked: they are added to that day's paid hours, so they reach daily and weekly overtime like any other hour. `--travel-allowance 4.50` (page: "Travel allowance per trip") adds a flat amount per trip, for mileage or a fare, outside overtime and the payroll burden. A trip is two consecutive shifts the same day at different named sites; a shift with no site in between is skipped, since its location is unknown. Both are priced inside the search, the exact check and the call-out cover finder (`siteTrips` and `payParts` in `calc.mjs`), so the roster avoids a trip when someone else can take the shift for less. The exact search's floors leave travel out, which keeps them below the true pay and so still valid. The report adds one line, "Trips between sites: 4 (Ana 2, Ben 2), 3 h paid travel, adding $52 to payroll, overtime included", `--json` gains `travelPaid` and each person `trips`, `travelHours` and `travelCost`, and the By site table's payroll includes it. Both off (the default) leaves every result byte-identical. Paid travel with no `--travel` minutes, or with fewer than two sites, comes back as a warning.

**Measured** (`node eval/paid-travel.mjs 12 8`, `eval/paid-travel.out.txt`, and `... 12 7`, `eval/paid-travel-7.out.txt`): the same 12 made-up split-shift weeks as the travel rule above, with a 45-minute trip and the travel rule on in every build. "Unpriced" is the roster built as before today, then costed with its trips paid (each shift pinned to its person and rebuilt with `--pay-travel`, so the same code prices both; the script stops if the pinned roster differs). "Priced" is built with `--pay-travel`.

| team | roster | open hours (12 weeks) | trips | paid travel | true payroll |
|---|---|---|---|---|---|
| 8 people | unpriced (as before today) | 0 | 75 | 56.25 h | $45,070.50 |
| 8 people | priced (`--pay-travel`) | 0 | 4 | 3 h | $44,087.75 |
| 7 people | unpriced | 24 | 101 | 75.75 h | $45,293.75 |
| 7 people | priced | 24 | 7 | 5.25 h | $44,028.25 |

So a roster built without pricing the trip sent someone across town 6 to 8 times a week, and those trips added $983 (8 people) and $1,266 (7 people) over 12 weeks, about 2.2% and 2.8% of payroll, that the builder's own total did not show (it said $44,034 and $43,887). Priced, the search found other people for those shifts in all 24 weeks: 4 and 7 trips were left, every week cost less than the unpriced roster once its trips were paid, and no week left an hour more open (the script stops if one does). The priced payroll is within $54 and $141 of the unpriced roster's unpaid figure, so most of the travel bill was avoidable, not the price of coverage. Builds took the same time (16.6 vs 16.7 s, 21.1 vs 21.3 s). Checked in `travel-pay.test.mjs` (6 tests: the trip's pay and its daily overtime, the allowance outside burden, what counts as a trip, the search avoiding a trip it can avoid, the By site split adding back and the cover finder's price, the warnings, and the CLI's report line and `--json`), and the venture's full suite.

Not claimed: invented shops, wages and trip times; no real multi-site payroll has been read. The rule pays every same-day hop, including across a long split-shift break when someone could have gone home between (whether that time is paid depends on the facts and the place; it is a planning aid, not legal advice). One trip time per pair of sites, the same both ways; first-trip-of-the-day travel from home is commuting and is not counted. Travel hours count toward pay and overtime, not toward a person's weekly or daily hour limit. Per-site wages (a dearer airport shop) are the next item.

## Wages by site (2026-11-14)

The shared-staff build priced every hour at the person's own wage, wherever it was worked. Real multi-site businesses often pay more at one shop: a shop inside a city with its own minimum wage, an airport premium, a hard-to-staff location. In Washington, for example, the 2026 state minimum is $17.13 and Seattle's is $21.30 ([Washington L&I, local minimum wage rates](https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates), read 2026-11-14), so a person paid $18 who works a shift in Seattle is owed $21.30 for it. A builder that does not know that both misreports the payroll and sends the wrong people to the dearer shop.

**What changed.** `--site-wage "City min 21.30"` (page: "Wages by site") sets a site's pay: `+2` is two dollars an hour above the person's own wage, `+10%` a percentage, `min 21.30` a floor, and parts combine (`Mall +1 min 20`); a minus sign makes a cheaper site. Sites not listed pay the person's own wage. A week at several rates pays overtime on the weighted average of the week's straight-time pay (the regular rate, 29 CFR 778.115): every hour at its own rate, plus half that average for each overtime hour (and the double-time share likewise). Paid travel between sites stays at the person's own wage. The rate is priced inside the search, the exact check and the call-out cover finder (`wagePay` and `siteRateTable` in `calc.mjs`). The exact check's floors use each shift's rate, and for whole lists a person's least rate, which keeps them below the true pay; the column-generation pricer's per-shift floor subtracts the most a cheaper shift can lower the overtime premium on hours already in the list (h x (highest rate - this rate) x the premium share), since with mixed rates adding a cheap shift lowers the regular rate. The report adds a line such as "Wages by site: Airport (+$2/h) 20 h, +$40. Payroll above everyone's own wage: $44, overtime on the week's average rate included." (the 50-hour week in the tests: the $4 beyond the $40 is the higher regular rate on 10 overtime hours), `--json` gains `siteWage`, each assignment carries its `rate`, the By site table shares each person's pay by what their hours earn at each site (not by hours), and the day-by-day labour view uses the site rate. No rule, or a rule naming no site in the week, or a floor no wage is under, leaves every result byte-identical; the last two come back as warnings.

**Measured** (`node eval/site-wages.mjs`, `eval/site-wages.out.txt`): 40 seeded, made-up weeks of a seven-day "City" shop (two openers and two closers a day, 224 h) inside a $21.30 city and a "Suburb" shop (80 h) at the state floor; 7 + 3 people, base wages $17.13-$23.13. "Unpriced" is the roster built as before today, then costed with the city floor (each shift pinned to its person and rebuilt with `--site-wage`, so the same code prices both; the script stops if the pinned roster differs). "Priced" is built with `--site-wage "City min 21.30"`. f is the share of each shop's people allowed at both.

| f | roster | open hours (40 weeks) | builder's own total | true payroll | city hours by people under the floor |
|---|---|---|---|---|---|
| 0.5 | unpriced (as before today) | 608 | $231,501.76 | $243,907.52 | 6,528 |
| 0.5 | priced | 608 | | $242,330.56 | 6,240 |
| 1 | unpriced | 464 | $234,472.48 | $247,932.80 | 6,896 |
| 1 | priced | 464 | | $242,401.60 | 5,936 |

So a builder that knew only each person's own wage understated the week's payroll by about 5.4% ($12,406 and $13,460 over 40 weeks), which is what a manager would discover on the first payroll run. Pricing the floor lets the search send the people whose pay rises least to the city shop: with everyone allowed at both, it saved $5,531 over 40 weeks (2.2% of payroll), cheaper in all 40 weeks; with half the team at both it saved $1,577 (0.65%), cheaper in 35 weeks, the same in 4 and $6.64 dearer in one (seed 33: the score also weighs fairness, and the priced search found a more even split that cost slightly more). No week left an hour more open (the script stops if one does). Builds took 22 s for the 160. Checked in `site-wage.test.mjs` (8 tests: parsing; the weighted-average overtime on a 50-hour week at two rates, $1,034 against $990 at one wage; the search sending the cheaper person to the floor site with the exact check off, auto and on; the By site split adding back by earnings and the day view; the cover finder pricing a cover at the site rate; byte-identical results and warnings when nothing changes; a brute force over every assignment of six tiny random weeks never beating a roster the exact check proved; and the CLI), and the venture's full suite.

Not claimed: invented shops, teams and base wages (only the two minimum wages are real); no real multi-site payroll has been read. One rule per site, applying to everyone there; a person's own negotiated rate at one site (a `wage at Airport:` cell) is the next item. Shift differentials (`--diff-*`) and the split premium are still on the person's own wage and are not folded into the regular rate. Tipped-wage credits, which some states allow and Washington does not, are not modelled. This is a planning aid, not legal or payroll advice: which minimum applies to whom, and how a regular rate is computed for a given pay plan, depend on the facts and the place.

## A person's own rate at a site (2026-11-14)

Wages by site (above) set one rule per shop for everyone. Real pay is often personal on top of that: someone who moved from the airport shop kept their airport rate, someone gets a dollar more downtown for parking, a supervisor is paid a set rate at the flagship. Until today the builder could not see any of it, so it understated payroll and sent the wrong person to the shop where they cost more.

**What changed.** A staff row takes `wage at Airport: 24` (that person's hourly rate there), `wage at Airport: +2` or `+10%` (relative to their own wage) or `-1` (a cheaper rate); `rate at`, `pay at` and `wage @` read the same, and a person can have one per site. The person's rate **replaces** the site rule's dollar and percentage parts for them, since a rate agreed with one person is usually all-in, but **never the site's floor**: with `--site-wage "City min 21.30"`, a `wage at City: 19` is still paid $21.30 (`personSiteRate` in `calc.mjs`). The rates go into the same per-shift rate table as the site rules, so the search, the exact check's floors and column pricing, the call-out cover finder, overtime on the week's weighted-average rate, the By site split and the day view all price them with no further change; no `--site-wage` is needed for them to apply. The "Wages by site" report line names who is on an own rate at each site ("Airport (own rate: Ana) 20 h, +$40"), and `--json`'s `siteWage.sites` gains `ownRates`. A cell naming a site no shift is at comes back as a warning; a cell for a site the person's `sites:` cell excludes comes back as a note. Rows with no such cell leave every result byte-identical.

**Measured** (`node eval/own-site-wages.mjs`, `eval/own-site-wages.out.txt`): the same 40 made-up two-shop weeks as "Wages by site" (a City shop inside a $21.30 city, a Suburb shop at the $17.13 state floor, 7 + 3 people, everyone allowed at both), the city floor priced in every build, and a share g of each team given its own +$1 to +$4 at the City shop. "Rule only" is the best the builder could do before today (the floor priced, the personal premiums unknown), then costed with the premiums (every shift pinned and rebuilt, so the same code prices both; the script stops if the pinned roster differs). "Own rates" is built with the cells.

| g | roster | open hours (40 weeks) | builder's own total | true payroll | City hours at someone's own premium |
|---|---|---|---|---|---|
| 0.3 | rule only | 456 | $242,883.68 | $247,748.00 | 2,664 |
| 0.3 | own rates | 456 | | $246,577.28 | 1,880 |
| 0.6 | rule only | 456 | $242,883.68 | $252,081.36 | 5,136 |
| 0.6 | own rates | 456 | | $250,467.52 | 4,432 |

So with three in ten people on a personal City premium the rule-only roster understated payroll by $4,864 over 40 weeks (2.0%), and with six in ten by $9,198 (3.8%). Pricing the cells moved City hours to people without a premium (2,664 to 1,880 hours at g = 0.3) and saved $1,171 (0.47%) and $1,614 (0.64%): cheaper in 32 and 38 of the 40 weeks, the same in the rest, dearer in none, and no week left an hour more open (the script stops if one does). The 80 builds took 16 s. Checked in `own-site-wage.test.mjs` (8 tests: parsing and that the cell is not read as availability; the floor kept and the premium replaced; own rates with no site rule in the search with the exact check off, auto and on, and in the report and By site split; a personal rate weighed against the rule's premium for others; the cover finder pricing a cover at the person's rate; warnings, the note and byte-identical results; a brute force over every assignment of six tiny random weeks with mixed own rates never beating a roster the exact check proved; and the CLI with no `--site-wage`), plus `site-wage.test.mjs`, `sites.test.mjs` and the venture's full suite.

Not claimed: invented teams, premiums and base wages (only the two minimum wages are real); no real multi-site payroll or staff export with per-location rates has been read. The importers write these cells since 2026-11-14 (next section), except When I Work. Shift differentials and the split premium still use the person's own wage. A planning aid, not legal or payroll advice.

## Per-location pay from an export (2026-11-14)

A person's own rate at a site (above) had to be typed, one `wage at Airport:` cell at a time. A manager switching from another scheduler has those rates already, in the old tool or the payroll export, so the importers now write the cells.

**What changed.**

- **Staff CSVs** (`--import-staff`, the page's "convert a staff export" box) read a person's rate at each location in either of the two layouts exports use. *Long*: one row per person per location, with a Location / Site / Store / Shop / Branch column beside the rate; a person's later rows add a location and its rate instead of being skipped as "listed twice". *Wide*: one row per person with a column per location: "Wage at Airport", "Rate @ Main", "Pay rate - Harbour", "Rate (Airport)", "Airport rate" or "Airport hourly rate" (absolute rates, or `+2` / `+10%`). Columns naming a kind of pay rather than a place ("Overtime rate", "Base rate", "Sunday rate", "Commission rate") are not read as sites (`siteRateColumn`). The locations become a `sites:` cell; a location that pays someone other than their own wage gets a `wage at <site>:` cell. A person's own wage (used for shifts with no site, and for paid travel) is the rate on most of their rows, ties to the lowest. Site names lose `| / & + : , ;` (they would split the cell), which the builder's site matching ignores anyway, so `Main & 5th` still meets `site: Main & 5th`. A file with no location or rate-by-location column imports byte-identically to before.
- **7shifts** (`--import-7shifts-staff <json>`, repeatable, or `--fetch-7shifts-staff` with `SEVENSHIFTS_ACCESS_TOKEN`; the page's same box takes the saved JSON files together): users, roles, locations, and each user's `/assignments` and `/wages`, field names from 7shifts' API definition 2023-05-01 (see `eval/7shifts-api-format-2026-11-13.md` for the source). 7shifts pays by role and every role belongs to one location, so a person's rate at a location is what their roles there pay; their own wage is their role-less default wage, else the users row's `hourly_wage`, else their most common role rate. Several roles at one location at different rates cannot all be one cell (the builder keeps one rate per person per site): the highest is written, so the plan does not understate payroll, and the notes count them. Roles go into `role:`, `max_weekly_hours` into the max column, deactivated users and managers not set to appear as employees are left out, weekly-salary people come in at wage 0 with a note. `--wages-as-of 2026-12-07` applies upcoming wages in force by the week being planned. `--location Airport` plans one location: each wage is then the person's rate there and no site cells are written. Neither per-user response names its user, so the fetch adds `user_id` to each one it saves (`--save`); a saved response without it is reported, not guessed.
- When I Work is not covered: its API definition host refused this session (403 through the proxy), so its per-position pay fields were not read.

**Measured** (`node eval/import-own-rates.mjs`, `eval/import-own-rates.out.txt`): the same 40 made-up two-shop weeks and personal City premiums as "A person's own rate at a site" (g = 0.3 and 0.6, the city floor priced), with the team written three ways: typed by hand with `wage at City: +k`, as a long staff CSV (one row per person per location) and as 7shifts users, roles, locations, assignments and wages. Availability, which the importers leave as "any", was pasted back onto each imported row.

| g | payroll over 40 weeks: hand | long CSV import | 7shifts import | cells written (CSV / 7shifts) | identical rosters |
|---|---|---|---|---|---|
| 0.3 | $246,577.28 | $246,577.28 | $246,577.28 | 123 / 123 | 40 of 40, both |
| 0.6 | $250,467.52 | $250,467.52 | $250,467.52 | 236 / 236 | 40 of 40, both |

So both imports reproduce the typed cells exactly: the same rate on every shift for every person (the script prices the hand roster with each imported team and stops on any difference), the same rosters and the same open hours (456 h). The $1,171 and $1,614 savings that section measured are now reachable from an export with no typing. Checked in `import-site-wages.test.mjs` (10 tests: the wide-column reader against kinds of pay; long CSVs with the own wage chosen by most rows and names with punctuation; wide absolute, relative, blank and bad cells; a plain file byte-identical to before; 7shifts users to roles, sites and cells with a split-rate location, a salaried person, a deactivated user and a manager left out; upcoming wages and one-location planning; untagged and missing responses; the fetch paging and tagging with a stub; and the CLI from both imports to a build that prices the imported rate), plus `import-staff.test.mjs`, `import-7shifts.test.mjs` and the venture's full suite.

Not claimed: invented teams and exports in the shape of the API definition and of common CSV layouts; no real 7shifts account, wages response or multi-location payroll export has been read. Whether 7shifts' `/wages` answers a manager-level token, and how real companies spread one person's role rates within a location, are open. Salaried people at wage 0 attract hours in the search (the note says so). A planning aid, not legal or payroll advice.


## The caller can take a later shift (2026-11-14)

The priced pass (`--cover-price`) counts a person-day "at risk" when, if that person called out, nobody else could take
their shifts that day, even through up to two hand-over passes ("Counting call-out risk with hand-over chains" above). On
the sample café that count flagged 23 person-days where the slow measurement (`calloutExposure`: a 5pm-before call-out and a
kept rebuild) found 11 that really open. The sections above put the gap down to rebuilds that "move many shifts".

**What the rebuilds actually did.** `node eval/cover-risk-gap.mjs` rebuilds each flagged café day and lists what moved. Most
of the moves are two copies of the same shift trading holders (noise); with those netted out, the rebuilds that covered a
day were mostly one move the cheap check had ruled out: **the caller takes a stand-in's later shift.** Dev calls out on
Saturday; Gus, at his hours cap, takes Dev's Saturday and hands Gus's Sunday to Dev. The rebuild has always been allowed to
do that (it empties the caller's call-out day and nothing else), but the check's chains never gave the caller a shift.

**The change.** `coverRisk` now takes the caller's call-out-day shifts off their list for the search and lets a chain hand
the caller a shift on any later day (`callerTakes`, on by default; `coverCallerTakes: false` in the options gives the old
count). The count stays an upper bound: it only finds cover the rebuild could also find.

**Does it pick out the days that open?** `node eval/cover-risk-joint.mjs` (`eval/cover-risk-joint.out.txt`), the same 202
person-days (five templates, three seeded 20-person weeks), of which 49 really open on today's rosters (the café's posted
roster has changed since that section was measured: 12 of its 23 days open now, exposure 100 h):

| check | person-days flagged | of them really open | missed | hours flagged |
|---|---|---|---|---|
| two passes, caller never takes a shift (before) | 72 | 68.1% | 0 | 532 |
| **two passes, caller may take a later shift (default)** | **66** | **74.2%** | 0 | **486** |
| three passes, caller may take a later shift | 62 | 79.0% | 0 | 454 |

Per team, the default count now flags exactly the days that open on retail (4 of 4, was 5) and the clinic (6 of 6, was 7);
the café falls from 23 to 20 flagged (12 open) and the spare-part-timer café from 27 to 26 (17 open); the salon is
unchanged. The café's remaining 8 false flags need three or more net moves. Three passes would catch 3 more on the café, but
on the 60-person week the pass at three passes took 389 s against 14 s at two (`eval/cover-chain-cost.out.txt`), so the
default stays at two; `--cover-chain 3` is there for small teams.

**What the price buys now** (`node eval/cover-price.mjs`, `eval/cover-price.out.txt`, $25 to $400 an hour at risk, the
same at every price):

| team | risk hours before → after | moves, score paid | exposure before → after |
|---|---|---|---|
| café | 164 → 108 h (13 of 23 days) | **3, $0.00** (none before at any price) | **100 → 92 h** |
| spare-part-timer café | 192 → 167 h | 2, $18.34 (the same roster as before) | 54 → 54 h |
| retail | 36 → 0 h | 1, $5.82 (the same) | 24 → 0 h |
| salon, clinic | 56 h, 38 h | none | 56 h, 30 h |

On the café the stricter count makes three hand-overs that cost nothing (ties at the same score) and cut the single
call-out exposure by 8 h. **Played through whole weeks of call-outs it is a trade, not a win** (corrected 2026-11-14: at 200 seeds the priced café roster wins at both rates; see "A second call-out in the same week") (the same seeded weeks as the
sections above, 20 seeds, kept reissues):

| café, rate | open hours added, default → priced | changes to others | premiums |
|---|---|---|---|
| 1.0% sick-only (6 disrupted weeks) | 8 → **16** | 24 → **8** | $425 → **$149** |
| 8.4% all-leave (20 disrupted weeks) | 155 → **188** | 77 → **63** | $1,392 → **$1,116** |

Fewer people are moved and less premium is paid, but more hours end up open: one call-out at a time the priced roster is
less exposed, while a week with several call-outs lands worse. The café is short-staffed (15 h open before anyone calls
out), so cover found for one call-out is often the same slack the next one needed. Exposure scores call-outs one at a time,
and this is where that model and a real week part. The price stays off by default, and the result is the manager's call.

**Cost.** On seeded 40- and 60-person weeks the pass found the same moves with and without the change, in the same time
(`CHAINS=2n,2 node eval/cover-chain-cost.mjs`, `eval/cover-caller-takes-ab.out.txt`: 2.1 vs 2.2 s, 2.1 vs 2.3 s,
0.39 vs 0.37 s, 14.1 vs 13.6 s). On the templates the build with the pass takes about what it did (café 1.7 s at
the first price, 318 candidate moves against 335). The 60-person pass at 14 s does not match the 3.5 s quoted in "Counting call-out
risk" above; the A/B shows it is not this change, and it was not chased in this run.

Tests (`cover-price.test.mjs`): Ana calls out Tuesday, Bo (4 h a week) holds Wednesday: he takes Tuesday and hands
Wednesday to Ana, so the day is safe; the old count called it at risk; the reverse roster (Bo's shift already worked) stays
at risk; the roster is left as found; and on whichever roster the build posts, the risky days are exactly those
`calloutExposure` finds open.

Not claimed: invented teams and seeded weeks; exposure is a model (one call-out at a time, 5pm notice, kept rebuild), and
on the café the whole-week play disagrees with it. Next: price the risk of a second call-out in the same week, which is
what the café's played weeks say the one-at-a-time count leaves out.

## A second call-out in the same week (2026-11-14)

The section above ended on a puzzle: on the café, the roster `--cover-price` posts is less exposed to any one call-out
(100 → 92 h), yet in 20 seeded weeks of call-outs it lost more hours (155 → 188 at 8.4%). The guess was that cover found
for one call-out uses up the slack a second one needs. This run built a check for that, measured it, and found the puzzle
was mostly too few weeks.

**The check.** `coverPairRisk` (in `calc.mjs`) takes every pair of person-days that are each safe alone (coverRisk does
not flag either) and asks whether both callers' shifts can be covered *at once*, with the same rules as the single
check: each caller off only on their own day, free to take a stand-in's later shift; up to two hand-over passes per shift;
500 checks per pair, and a pair past that counts as clashing. Pairs on the same day count too (two people off sick
together). A clashing pair is charged the shorter caller's hours.

**Does it find the pairs that really open?** `node eval/cover-pair-exposure.mjs` (`eval/cover-pair-exposure.out.txt`)
plays every pair of safe person-days the way the product handles them: the earlier call-out at 5pm the day before, a kept
reissue, then the later one on the reissued roster. Over the five templates' default and priced rosters, 337 pairs:

| | pairs | flagged | really open | precision | recall |
|---|---|---|---|---|---|
| all five templates, both rosters | 337 | 186 | 118 | 58.1% | 91.5% (10 missed) |

The misses are pairs the joint search can cover only by knowing both call-outs in advance. In play, the first reissue
picks its cover without knowing the second call-out, and the slack it spends is gone by the time the second one comes.

**A yardstick with no draw in it.** The played weeks draw call-outs per person-day *worked in each roster*, so two
rosters face different call-outs and 20 weeks is a small sample. `ALL=1` plays **every** pair of worked person-days, risky
ones included, and sums the hours each pair adds (`eval/cover-pair-exposure-all.out.txt`):

| team | default | `--cover-price 25` | + `--second-callout-price 1` | + 5 | + 25 |
|---|---|---|---|---|---|
| café | 2,218 h | **2,023 h** | 2,023 h (same roster) | 2,023 h | 2,218 h |
| spare-part-timer café | 1,775 h | 1,751 h | **1,367 h** | 1,721 h | 1,775 h |
| retail | 342 h | 210 h | 210 h (same roster) | **195 h** | 450 h |
| salon, clinic | 872 h, 394 h | the same | the same | the same | the same |

**The café's played weeks again, at 200 seeds** (`eval/cover-price-200-cafe.out.txt`):

| café | open hours added, default → priced | changes to others | premiums |
|---|---|---|---|
| 1.0% sick-only (69 disrupted weeks) | 262 → **208** | 94 → **66** | $1,687 → **$1,212** |
| 8.4% all-leave (198 disrupted weeks) | 1,824 → **1,727** | 709 → **595** | $12,587 → **$10,577** |

With ten times the weeks, the priced café roster loses fewer hours at both rates, as the pair yardstick said. The reversal
at 20 seeds was sampling noise. **The section above was wrong to call it "a trade, not a win" on the café.**

**`--second-callout-price <$>`** (`coverPairPrice`; the page's "Also pay for a second call-out in the same week") adds the
clashing-pair hours to the priced pass's objective. A move must then pay for the pair hours it adds, or it can earn its
keep by clearing them. Played over 200 seeded weeks (`eval/cover-price-200-*.out.txt`):

| team, rate | default | `--cover-price 25` | + `--second-callout-price` |
|---|---|---|---|
| spare café, 1.0% | 108 h, 118 changes, $2,018 | 119 h, 117, $1,909 | **$1: 73 h, 84, $1,316** |
| spare café, 8.4% | 1,205 h, 1,252 changes, $20,766 | 1,192 h, 1,275, $20,776 | **$1: 1,148 h, 821, $13,005** |
| retail, 1.0% | 66 h | 18 h | $5: 18 h |
| retail, 8.4% | 354 h | 249 h | $5: 261 h |

On the spare-part-timer café, $1 an hour bought 10 moves for $30.01 of score ($22 of payroll). In played weeks it cut the
open hours call-outs added by 5-35%, the people moved by 29-36% and the premiums paid by 31-37% against the priced roster.
`--cover-price` alone had bought almost nothing there. On retail, $5 was a wash in play (the pair yardstick had it 7%
better) and $25 made things worse (450 h against 342 h unpriced): it trades single-call-out risk for pair hours.

**Cost** (`node eval/cover-pair-cost.mjs`, `eval/cover-pair-cost.out.txt`): the pair walk takes 0-56 ms per roster on
seeded 20- and 40-person weeks, but the pass runs it on every candidate that passes the single-risk test. On the 20-person
week 2 the pass went from 0.4 s to 4.3 s and took 6 moves instead of 4. Clashing-pair hours fell from 3,119 to 1,127, and
the score was $9.42 *lower* (better) than the priced roster's. On the 40-person week 0 (149 copies) the pass went from
3.1 s to 43.6 s for 29 moves, clashing-pair hours 123 → 16, at $11.69 of score. Weeks 1 and 2 took 2.7 → 4.8 s and 0.7 → 13.9 s. On week 2, clashing-pair hours went 2,854 → 4, but
all 521 of the priced roster's clashing pairs were budget-capped, not proven to clash. So the price runs only up to 120 shift
copies by default (`coverPairPriceSlots` moves the cap). Above that it is skipped, and the slack line says so.

**Defaults.** The second-call-out price stays off. $1 was never worse on the five templates and was the big win on the
spare café. But it changed only one template's roster in play, and the evidence is invented teams. A manager who already
uses the slack price and sees one spare person covering everyone is who it is for.

Tests (`cover-pair-risk.test.mjs`): Ana (Tue) and Bo (Wed) with Cy able to stand in for either but capped at 8 h. Each
day is safe alone, the pair clashes for 8 h, and the played week opens 8 h. With Cy at 16 h nothing clashes or opens.
Risky days are left to the single count. A caller off Tuesday may take Wednesday's shift for the second call-out
(`callerTakes: false` makes it clash). The CLI flag, the slack line's wording, and the page's select and usage event.

Not claimed: invented teams and seeded weeks; exposure and play are the product's model (5pm notice, kept rebuild), not a
real week; three or more call-outs are only in the played weeks, not the check; on the bigger rosters many clashing pairs are
"capped", meaning the budget ran out (49% on the priced café, 72-100% on the spare café and the seeded weeks), so the
pair hours there are an upper bound. The pair price may be buying moves that clear only capped pairs. Next: a budget or an order that
leaves fewer pairs capped; the 40- and 60-person weeks' played result with the pair price; whether $1 suits a real
manager's week.

## A pay floor for big weeks (2026-11-14)

On the 60 x 168 week 0 of `eval/end-to-end.mjs`, the clique LP proved the 300 open hours least (README "The 60-person week's
300 open hours are the least"), but the whole-score column generation's root did not converge in the budget, so the only score
bound left was 100,000 x 300: every dollar of the $19,119 pay bill counted as open, and the page reported a **$20,010 gap**.

**What landed:** `cliqueScoreFloor` (calc.mjs) solves the same compact clique LP with costs. Open shifts cost 100,000 per hour,
as in the score. Each column "person p holds shift s" costs a linear floor on what that shift adds to p's score: paid hours at
p's rate there (site rates included) plus differential hours, times the burden and `min(1, otMult, dtMult)`; the hours in p's
`avoid:` window; the linear part of the tough-shift penalty (`n^2 + 2 x before x n >= (1 + 2 x before) x n` for whole n); minus
the `prefer:` and keep bonuses, which are linear and exact. Overtime premiums, split premiums and trip pay only add, so they
are left out. Fairness and shortfall depend on a person's weekly hours alone and are convex in them, so each person gets one
column per hour level (every quarter hour up to their cap, plus their minimum) with a convexity row and a row tying the levels
to the hours held, both written with a right-hand side of 1 as the engine's simplex needs. Each level costs the penalty there
minus c x D^2 / 4 (c the fairness weight, D the widest step), which keeps the interpolated line under the parabola. The value
taken is the dual bound, as for the open-hours floor, so simplex rounding cannot lift it above the LP.

In `buildRoster` it runs only when the clique LP ran and nothing proved the roster; under a time budget only when the time
left covers about 4 s x (copies / 245)^4.5. It raises the score's lower bound and marks the roster proven if it comes within the
tolerance. `optimality.scoreFloor` reports it; `scoreFloor: false` turns it off.

| 60 x 168 week 0 (`eval/score-floor.out.txt`) | before | after |
|---|---|---|
| 20 s budget | 15.7 s, coverage proven, gap **$20,010** | 19.1 s, coverage proven, gap **$30.11** |
| no budget | 38.7 s, gap $20,010 | 41.1 s, gap $30.11 |
| week 1, 20 s budget (proven by column generation) | 8.5-10.5 s in earlier runs, proven | 8.5 s, proven, same roster (the LP is not run) |

The LP alone, beside the open-hours LP, on the bench weeks (one cloud machine): 60 x 168 week 0, 4.0 s, 30,019,980.21; week 1,
1.7 s, 30,819,981.32, which is $0.43 under the 30,819,981.75 column generation proves in 6-7 s, so inside the default $0.50
tolerance; the three 80 x 224 weeks, 7-13 s. So $30.11 of a $19,119 bill (0.16%) is what is still open on week 0, against
the whole bill before.

Tests: `score-floor.test.mjs` checks the floor never exceeds the brute-force best score on 160 seeded three-person weeks
across rest gaps, daily caps, last week's finishes, minimum hours, fairness weights 0-100, tough-shift balance, avoid and
prefer windows, burden, weekly and daily overtime (including an overtime multiplier under 1), meal breaks, differentials and
split premiums (within $0.50 on 38, median gap $12; the largest gaps are open hours the LP leaves fractional), that it is never
under 100,000 x the open-hours LP when no bonus applies, and the two 60 x 168 values above. Not claimed: seeded synthetic
weeks, one machine; site wages and paid trips are covered by the argument, not by the brute-force test; the remaining $30.11
on week 0 is not split between the LP's looseness and a better roster the search misses. Next: run it before column generation
on 60-copy-plus weeks, where on week 1 it would prove the roster in 1.7 s instead of 6-7 s, if the incumbent is already within
the tolerance; branch on its fractional columns to close the $30.

## Re-solving one day at a time (2026-11-14)

After the pay floor landed, the 60 x 168 week 0 of `eval/end-to-end.mjs` was left $30.11 above its bound, and the README asked
whether that was the LP's looseness or a cheaper roster the search missed. **It was the search.** `eval/score-floor-milp.mjs`
dumps the priced clique model and `eval/score-floor-milp.py` solves it as an integer program with HiGHS (scipy 1.18.1): its
optimum, 30,019,980.99, is only $0.78 above the LP, so branching on the LP could close at most that. HiGHS's roster is valid under
every rule of the engine (`eval/score-floor-milp-check.mjs`) and scores 30,019,981.35: $28.97 less than the posted roster and $0.36
above the integer program's bound, so it is proven best to within the default $0.50 tolerance (`eval/score-floor-milp.out.txt`).
The two rosters differ on 166 of 245 shift copies: mostly equal shifts traded between people, with a few hours moved from
$18-20 staff to $10-16 staff through several swaps at once, which the single moves and swaps of the pay polish cannot make.

**What landed:** `dayReassign` (calc.mjs). Every person's shifts on other days stay put and one day is re-solved exactly. When
each person holds at most one shift that day, the score splits into one term per (person, shift), the person's score with that
shift less their score without it, plus 100,000 per hour for a shift left open, so the cheapest way to staff the day is an
assignment problem; `assignRows` solves it (the Hungarian method). Days are swept until a sweep changes nothing. In `buildRoster`
it runs only when the exact check left the roster unproven (`dayLNS`): exact sweeps, then kicks, each re-solving one random day
with costs jittered by a third of the average wage and then sweeping exactly again, keeping a roster only when it scores less.
It gets 2 s of its own (`dayLNSMs`), past the time budget when that is spent; `dayLNS: false` turns it off and
`optimality.dayLNS` reports what it did.

| 60 x 168 week 0, 20 s budget (`eval/day-lns.out.txt`) | score above the pay floor | total time |
|---|---|---|
| off (as before) | $30.11 | 18.5 s |
| 0.5 s | $10.46 (31 kicks) | 19.2 s |
| 2 s, the default | **$7.04** (124 kicks) | 21.1 s |
| 5 s | $7.04 (366 kicks) | 22.7 s |

On the bigger bench weeks, where coverage is not proven in the budget, the pass also covers more (`eval/day-lns-big.out.txt`,
measured with the test suite running beside it, so the earlier passes' budget-cut results can differ run to run): the three
80 x 224 weeks leave 260, 333 and 288 open hours instead of 261, 336 and 293; the two 100 x 280 weeks 385 and 354 instead of 388
and 354 (the second $42 cheaper). Week 1 of 60 x 168, proven by column generation, does not run it.

Tried and dropped: rounding the priced LP's own solution (take person-shifts by LP value, fill what is left greedily, polish).
210 of its 308 nonzero person-shifts are fractional, and the rounded roster left 30-43 more hours open than the posted one; the
day sweeps from it reached $17.92 above the floor on week 0, worse than from the posted roster.

Tests: `day-lns.test.mjs` (assignRows matches brute force on 400 small cost matrices with forbidden cells; on 120 seeded
three-person weeks across rest gaps, daily caps, last week's finishes, minimum hours, fairness, avoid and prefer windows and
overtime, dayReassign keeps every rule, never raises the score, and leaves no day that brute force over that day's staffing can
do better; a week the exact check proves does not run the pass). The full suite passes. Not claimed: seeded synthetic weeks and
one cloud machine; $7.04 is still open on week 0 against a roster HiGHS shows exists $0.36 above the floor; a person holding two
shifts on one day sits that day out of the re-solve.

## Past the day sweeps: the gap is one big trade (2026-11-14)

The day sweeps took the 60 x 168 week 0 to $7.04 above the pay floor, against a roster HiGHS found $0.36 above its own
integer bound (README "Re-solving one day at a time"). The section asked whether two-day or person-pair moves would close the
rest. **They do not, and the reason is the shape of the gap.** `eval/beyond-day-sweeps.mjs` takes the roster posted with the
day sweeps off, runs the sweeps, and then tries three wider moves (none shipped; the engine is unchanged apart from two
exports and the clique model's start basis, which the script reads):

| 60 x 168 week 0 (`eval/beyond-day-sweeps.out.txt`) | above the pay floor | time |
|---|---|---|
| posted, day sweeps off | $30.11 | |
| one round of day sweeps | $15.51 | 46 ms |
| + person-pair sweeps (two people's shifts pooled, every split tried) in turn with day sweeps | $14.83 | 57 ms |
| + cyclic exchanges across days, up to 2 arcs, open as a holder (Thompson and Orlin's improvement graph) | $15.51 | 0.4 s |
| cyclic exchanges up to 3 arcs (probe run) | no move found | 17.8 s |
| LP dive on the priced clique model, then day sweeps | **$4.24** (the dive itself left 317 open hours, not 300) | 25.5 s |
| the shipped dayLNS (sweeps and 124 kicks, 2 s) | $7.04 | 2 s |
| HiGHS's roster (`eval/highs-owner-60x168-week0.json`) | $1.14 | 92 s in HiGHS |

Putting the pair sweeps inside the shipped dayLNS loop instead of nothing gave $7.74, $7.45 and $6.83 at 0.5, 2 and 5 s
(single runs, against $7.04 for the shipped 2 s), which is noise, so they were not kept.

**Why:** the script lines the day-swept roster up with HiGHS's (identical copies matched to the same holder where they can be)
and splits the difference into connected trades, copies joined when they share a person. 137 copies differ. 8 of them form two
small trades that change nothing (ties). The other **129 copies form one trade through 52 of the 60 people, on all five days,
covering or opening 10 copies along the way, worth $14.37**. No piece of it improves the score alone. A move that reaches it has
to change most of the week at once, which is what an integer program does and no neighbourhood of a few people or days does.

**The dive** (solve the priced LP, fix every copy at 1, fix the largest fractional pair, solve again from the last basis; only
costs change, so the basis stays feasible and each re-solve takes tens of pivots) held the LP at its first value for the first
37 solves, then hit pairs the LP allowed fractionally but the rules refuse together. With one level of backtracking it finished
on week 0 with 17 more open hours, which the day sweeps then refilled to $4.24, the best of anything tried here; on week 1
(already proven by column generation, $0.43) it left 119 more open hours and the sweeps refilled only 96 of them. A
depth-first branch-and-bound on the same dive (cut a branch once the LP rises $1, $5 or $30 above its first value) found no
roster in 400 solves (about 100 s). So the dive's fixes are only good while the LP stays flat, and the useful next step is
branching, not a better neighbourhood.

Not claimed: one generated week each, single runs on one cloud machine; the probe code lives in the eval script, not in the
engine. Next: column generation on the whole score started from the posted roster's columns and the priced clique LP's duals
(the 60 x 168 week 0 root did not converge in the budget, README "A pay floor for big weeks"), or a branch-and-bound that
branches on a person's hours rather than single pairs.

## Steering the day sweeps with the pay floor's LP (2026-11-14)

The gap left on the 60 x 168 week 0 was one trade through 52 people on all five days, which no move of a few people or days
reaches, while an LP dive toward the pay floor's solution got within $4.24 of the floor (README "Past the day sweeps"). That LP
is already solved by the time the day sweeps run, so its solution is free to use. **What landed:** before its kicks, `dayLNS`
now sweeps every day with each person-shift's cost lowered by lam x the average wage x that pair's value in the pay floor's LP,
for lam = 8, 4, 2, 1, 0.5, 0.25, 0.12; after each lam it sweeps again on the true score and keeps the roster only if it scores
less. The kicks then run as before on what is left of the 2 s. It needs the pay floor (`cliqueScoreFloor`, which now also
returns its person-shift values); `dayGuide: false` turns it off, `dayGuideWeights` sets the lams, `optimality.dayLNS.guide`
lists each lam's result.

The generated weeks are short-staffed on purpose, so most hours open are forced; the bound column shows how many open hours the
clique LP proves unavoidable. "Rest" is the score past the open hours (pay and penalties).

| 60 x 168 (`eval/day-guide.out.txt`) | open hours (bound) | guide off: open, rest | guide on (default lams): open, rest |
|---|---|---|---|
| week 0 (the bench week) | 300 (300.2) | 300, $19,987.25 ($7.04 above the bound) | 300, **$19,983.67 ($3.46)** |
| seed 3 week 1 | 270 (270.2) | 270, $22,182.02 ($11.45 above) | 270, **$22,174.85 ($4.28)** |
| seed 4 week 1 | 255 (255.2) | 255, $21,004.41 ($16.33 above) | 255, **$20,995.29 ($7.21)** |
| seed 2 week 1 | 175.2 | 176, $20,906.77 | 176, **$20,895.31** |
| seed 3 week 0 | 212.2 | 217, $21,808.25 | 217, **$21,775.02** |
| seed 1 week 0 | 205.2 | 210 | **208** |
| seed 1 week 1 | 217.2 | 232 | **227** |
| seed 4 week 0 | 208.2 | 216 | **214** |

Seeds 1-4 were run with `cliqueFloor: true, scoreFloor: true` beside the 20 s budget: under the default gating those LPs do not
fit the budget on these weeks, so the guide does not run there (the bench week is the one where it runs by default). Total time
was within a second of the unguided run on each week. Two weeks were proven before the pass and are unchanged. On the weeks
with open hours the open-hours row is what moved: the biased sweeps fill shifts the plain sweeps cannot reach, because covering
them takes several people's weeks to shift at once, which is what the LP's values point to.

Tried and dropped: kicking one day at a time toward the LP (each kick's day re-solved with the LP pull, in half or all of the
kicks, pull 1x or 3x the average wage) gave $8.82-11.41 on week 0, worse than the $7.04 with no pull: the next exact sweep undoes a
one-day pull. Starting each lam from the last biased roster instead of the best one gave $3.39 against $3.46, which is noise.

Tests: `day-lns.test.mjs` adds that `dayReassign` keeps every rule under 60 random guides on seeded three-person weeks (the
guide only shifts costs), and that `buildRoster`'s guided pass never ends above where it started, on seeded eight-person weeks
with the proof cut short so the pass runs. Not claimed: single runs on one cloud machine, nine generated weeks, and the LP forced
on for eight of them; the HiGHS roster on week 0 is still $2.32 below what the engine posts. Next: run the pay floor (or the
cheaper open-hours clique LP's solution as the guide) by default on 60-copy-plus weeks when the time budget allows, now that
it fills open hours as well as proving them; the guide from the posted roster's column generation.

## A guide when the pay floor is skipped (2026-11-14)

The LP-guided day sweeps (README "Steering the day sweeps with the pay floor's LP") filled open hours that no one-day move
reaches, but they ran only when the priced clique LP ran, and under the default 20 s budget its gate (about 4 s x (copies /
245)^4.5 of time left) skips it on many 60-person weeks. The cheaper open-hours clique LP (about 1 s there) usually still runs, and
its solution also says which person should hold which shift to cover the most hours. **What landed:** when the pay floor did not
run, `dayLNS` takes its guide from the open-hours LP's person-shift values instead (`cliqueOpenFloor` now returns them).
Everything else is as before: the same lams, each biased sweep followed by exact sweeps on the true score, a roster kept only if
it scores less, inside the pass's own 2 s. `dayGuideOpen: false` turns this off; `optimality.dayLNS.guideFrom` says which LP
guided the pass (`scoreFloor`, `cliqueFloor` or null).

| 60 x 168, default 20 s budget (`eval/guide-open.out.txt`) | LPs that ran | before: open h, rest | now: open h, rest |
|---|---|---|---|
| seed 1 week 0 | open-hours only | 210, $20,171.13 | **208**, $20,197.93 |
| seed 4 week 0 | open-hours only | 215, $21,564.21 | **214**, $21,571.18 |
| seed 3 week 0 | priced before, open-hours only now (time gate) | 217, $21,775.02 (priced guide) | 217, $21,801.69 |
| seed 3 week 1 | as above | 270, $22,174.85 (priced guide) | 270, $22,178.50 |
| six other weeks | both, or proven before the pass | same | same |

The rest goes up where open hours go down because two more shifts are staffed and paid; one open hour costs 100,000 in the
score. On seed 3, where the time gate let the priced LP run in one configuration and not the other, the open-hours guide lands
between no guide (`eval/day-guide.out.txt`: $21,808.25 and $22,182.02) and the priced guide. Total time was within a second on
every week.

Tests: `day-lns.test.mjs` adds that with the pay floor off the open-hours LP guides the pass on seeded eight-person weeks, the
pass never ends above where it started, and `dayGuideOpen: false` leaves it unguided. Not claimed: single runs on one cloud
machine, ten generated weeks. Next: fit the priced LP's time gate to more weeks (it skipped on seed 3 in one run of two), or
start the priced LP from the open-hours LP's basis so it fits the budget more often.

## The pay floor from the open-hours LP's basis (2026-11-14)

The pay floor (`cliqueScoreFloor`, README "A pay floor for big weeks") solved its LP from the slack basis, every shift open, even
though the open-hours clique LP has just been solved on the same rows. **What landed:** `warmBasis` (calc.mjs) carries the
open-hours LP's optimal basis into the priced LP. The two LPs share the x columns in the same order and every row (matched by a
row name, since the priced LP numbers its rows differently); the priced LP adds, per person, a convexity row and an hours link,
and the hour-level columns. The start basis is the open-hours basis renumbered, plus for each person the two hour levels around
the hours that person holds in the open-hours optimum. Ordered (old rows, new rows) that basis is block lower triangular, so it
is nonsingular, and it is primal feasible (the old rows keep the open-hours optimum; the two levels take the convex weights of
the hours). If the basis does not map or the solve fails from it, the LP is solved cold as before. The value used is still the
dual bound, so it holds whatever basis the simplex starts from. `scoreFloorWarm: false` starts it cold; `optimality.scoreFloor.warm`
says whether the warm start took.

| priced LP (`eval/warm-score-floor.out.txt`) | cold: pivots | warm: pivots | same bound |
|---|---|---|---|
| 60 x 168 week 0 | 3,655 | 2,281 | yes |
| 60 x 168 week 1 | 1,860 | **107** | yes |
| 80 x 224 week 0 | 6,711 | 4,017 | yes |
| 80 x 224 week 1 | 3,896 | **232** | yes |
| 80 x 224 week 2 | 5,337 | **353** | yes |
| 60 seeded 4-12 person weeks (test) | 6,887 in all | 3,374 in all, fewer on every week | yes |

In time (measured beside another benchmark, so contended): 1.4 s to 0.16 s on 60 x 168 week 1, 6.6 to 0.7 s and 10.1 to 1.0 s on
80 x 224 weeks 1 and 2; weeks 0 save a quarter to a third (4.2 to 2.9 s, 11.7 to 8.5 s). On the two week-0s the priced optimum
sits far from the open-hours one, so the simplex still walks most of the way. A tie-break that charges the open-hours LP a
millionth of the pay (so its optimum lands nearer the priced one) was tried and dropped: it cut the warm pivots on week 0 from
2,281 to 1,574-1,928, but its bound for pure open hours fell from 300 to 294-299.9, which costs the open-hours proof.

**The gate.** Under a time budget the pay floor ran only when the time left covered about 4 s x (copies / 245)^4.5, sized for a
cold solve. A week the gate would skip now tries the warm solve anyway, with the simplex stopped at the budget's end (`solveLP`'s
new `deadline`, checked every 64 pivots; a stopped solve is skipped as before and never falls back cold). `scoreFloorTry: false`
keeps the old skip; `optimality.scoreFloorTried` says whether a try ran and finished. On ten 60 x 168 weeks at the default 20 s
budget (`eval/score-floor-try.out.txt`, single runs) the try ran past the gate on three weeks and finished each time in 1.9-2.4 s:
on seed 1 week 0 the open hours stayed 208 and the rest fell $20,197.93 to $20,176.95; on seed 3 week 0 it was the same roster;
on seed 4 week 0 it posted 215 open hours where the run guided by the open-hours LP posted 214 (single runs; the day sweeps' kicks are time-bound). In a rerun, the same two weeks' gate
decisions flipped with machine load (seed 1 tried and ran out of time; seed 4 passed the gate outright), so the effect is
timing-bound and small either way: where coverage is not proven the gap is open hours, not pay.

Tests: `warm-score-floor.test.mjs` (on 60 seeded weeks across daily caps, last week's finishes, avoid and prefer windows, tough
shifts, minimum hours, fairness, burden, overtime and differentials the warm start always takes and reaches the cold LP value
and dual bound to 1e-6; a basis from another week is refused and the LP is solved cold; `buildRoster` reports the warm start and
`scoreFloorWarm: false` turns it off, with the same bound). Not claimed: five generated big weeks and single runs on one machine;
the time gate itself is unchanged and still sized for the cold solve. Next: a gate sized for the warm solve, which needs more
week-0-like weeks to see how often the open-hours optimum is far from the priced one; carry the priced LP's basis into the
dayLNS guide's re-solves.

## Room for the clique LP on the biggest weeks (2026-11-14)

On a big week with the exact check on, the whole-score column generation runs first and gets half of the time left. On the
100 x 280 weeks (400 copies, the largest the product takes) that half is about 9 s; it proved nothing there and left a root bound
near 294 open hours, while the open-hours clique LP, which bounds 358 and 344 h on the same weeks (README "The 60-person week's
300 open hours are the least"), was then skipped by its own time gate, so the day sweeps ran with no LP guide either. **What
landed:** `scoreCGBudgetMs` (calc.mjs) gives column generation half of what is left as before, unless that would leave the clique
LP less than its expected cost (1.6 s x (copies / 245)^4.5, now `cliqueCostMs`); then it gets what leaves the clique LP that cost
plus 1 s, never under 1 s. At the default 20 s budget that changes weeks of about 355 copies and up. `cliqueRoom: false` keeps the
plain half.

| default 20 s budget (`eval/clique-room.out.txt`, single runs) | before: open h, score gap | now: open h, score gap |
|---|---|---|
| 100 x 280 week 0 (400 copies) | 386, $9.2 M | **376**, $1.8 M |
| 100 x 280 week 1 (400) | 353, $6.5 M | **351**, $0.7 M |
| 90 x 252 week 0 (348; rule does not apply) | 354 | 355 |
| 90 x 252 week 1 (352; rule does not apply) | 229 | 226 |
| 90 x 252 week 2 (363) | 376, $0.6 M | 376, $0.23 M |

The 90-person rows the rule does not touch moved by noise (the cover passes and the day sweeps' kicks are time-bound). On week 1
of 90 x 252 column generation overran its share by about 2 s and the clique LP's gate then skipped it in the run with the change,
which is why that row has no tighter gap. The 100 x 280 seeds 2 and 3 make 407 copies and are refused (`MAX_SLOTS`), so two
weeks is all the generator gives at that size. With no budget the engine holds 359 and 347 h on the two 100-person weeks, so the
budgeted gap is now 17 and 4 h, not 27 and 6.

Tests: `clique-room.test.mjs` (the half is kept wherever the clique LP still fits after it, 245-326 copies at 17 s left; on 400
copies the clique LP gets its expected cost plus 1 s; the share is never under 1 s or over the half for 0-60 s left at 100-400
copies; `cliqueRoom: false` and `cliqueFloor: false` keep the half). Not claimed: two 400-copy weeks and three 90-person weeks,
generated, single runs on one cloud machine; the clique LP's cost fit is still the one from eval/clique-floor.out.txt, and it runs
about 10 s at 400 copies here against the fit's 14.6 s. Next: column generation's overrun past its share, and the rest of the
100-person gap (376 against 359 with no budget).

## Column generation keeps to its share (2026-11-14)

On big weeks under a time budget the whole-score column generation gets a share of the time (half of what is left, or less to make
room for the clique LP, README "Room for the clique LP on the biggest weeks"). It checked that limit only between rounds, and one
round on a 300-400 copy week is an LP solve of up to 1.5 s plus 80-100 pricing calls, so it ran **0.6-1.2 s past its share** on
8 of the 9 bench weeks it did not prove (60 to 100 people) (`eval/cg-overrun.out.txt`). On the 90 x 252 week 1 that overrun alone pushed the clique
LP out of its own time gate, and on a loaded run of the 100 x 280 week 0 (the share was 1 s, the run took 1.7 s) it did the same.

**What landed:** in `columnGenerationOpen` (bnp.mjs) the LP solves now take the limit as `solveLP`'s deadline, and the pricing loop
checks it before each call. A round stopped part-way is inexact, so its Lagrangian value is never taken as a bound (the bound stays
at the last complete round's) and the columns it found stay in the pool; a stopped LP ends the node with the bound it had, as a
pivot limit does. `scoreCGHardStop: false` keeps the old check. `optimality.scoreCG` now also reports `shareMs`, `lpMs`, `maxLpMs`,
`pricingMs`, `maxPricingMs`, `rounds`, `pricingCalls` and `stoppedMidRound`, which is how the overrun was found.

| default 20 s budget (`eval/cg-overrun.out.txt`, single runs, one machine) | before: past the share | now: past the share | open hours before / now |
|---|---|---|---|
| 80 x 224 weeks 0-2 (304-326 copies) | 1.25, 1.02, 1.15 s | 0.00, 0.05, 0.07 s | 260 / 260, 332 / 332, 286 / 286 |
| 90 x 252 weeks 0-2 (348-363 copies) | 0.02, 0.78, 0.56 s | 0.01, 0.01, 0.04 s | 355 / 355, 226 / 231, 374 / 377 |
| 100 x 280 weeks 0-1 (400 copies) | 0.71, 0.63 s | 0.05, 0.05 s | 386 / 376, 347 / 351 |
| 60 x 168 weeks 0-1 (238-245 copies) | 0.65 s; week 1 proven in 7.6 s, inside its share | 0.01 s; same | 300 / 300 (gap $6.68 both), 308 / 308 |

Where the time freed went: on the 80-person weeks to the cover passes (coverPass 4.9 to 6.2 s and 3.6 to 5.5 s, same open hours); on the 90 x 252
week 1 the clique LP now runs, so the proof gap fell from $9.8 M to $1.2 M, but the cover passes got 3.5 s instead of 8.1 s and
the roster left **231 open hours instead of 226**. On the 100 x 280 week 0 the old run's overrun skipped the clique LP (386 h); the
new run kept it (376 h), the same as README "Room for the clique LP". Week 1 went the other way, 347 to 351.

**What this says.** The overrun was a bug (a budget that is not kept is not a budget), and it is fixed. The open hours it moved are
not a win either way: they follow which of the clique LP and the cover passes got the seconds. On 350-400 copy weeks the clique LP
takes 5-11 s and buys a far tighter bound, while the cover passes turn the same seconds into filled shifts, and in these runs
neither wins every week. That is the next question: a rule for when the clique LP's bound is worth the cover passes' time (for
example, run it only when its guide is used by the day sweeps, or cap the cover passes' share from below).

Tests: `cg-hardstop.test.mjs` (on a 60 x 168 week given a 300 ms share column generation stops within 500 ms of it (0.01 s past it here) and inside a
round; with the hard stop off it never stops inside a round; on seeded eight-person weeks a column generation stopped at 0 or 5 ms
never reports a bound, or leaves buildRoster a lower bound, above the proven best). Not claimed: generated weeks only, single runs
on one cloud machine; the open-hours moves above are within the run-to-run noise these big weeks show (README "Room for the
clique LP": 90-person rows moved 1-3 h with no change at all).

## Fewer capped pairs: the second-call-out price checks its moves (2026-11-15)

The second-call-out check (`coverPairRisk`, README "A second call-out in the same week") gives each pair of call-outs 500
search steps and counts a pair it gives up on as clashing. The section above ended on the worry that this lets
`--second-callout-price` buy moves that clear only given-up pairs. **Measured** (`node eval/cover-pair-capped.mjs`, and
`node eval/cover-pair-budgets.mjs`, a budget sweep over 22 bench rosters: the five templates and six seeded 20- and 40-person weeks, each default and priced):

| roster | given up at 500 | pair hours at 500 | pair hours, walk run to the end | full walk time |
|---|---|---|---|---|
| 20 x 56 week 2, priced | 485 of 780 pairs | 3,119 h | **1,696 h** (262 of the 485 were coverable) | 231-242 ms |
| 40 x 112 week 0, default | 308 | 1,832 h | **327 h** | 184 ms |
| 40 x 112 week 0, priced | 13 | 123 h | 51 h | 9 ms |
| 40 x 112 week 2, default | 24 | 131 h | **0 h** | 34 ms |
| templates | 0-22 | the same as the full walk | | 0-6 ms |

At 1,000,000 steps a pair no pair of the 22 rosters was given up on, and the whole walk took at most 231-242 ms (two runs). So the budgeted
count overstated pair hours by up to 5.6 times on the big weeks, and the slack line printed that count.

**What landed.** The priced pass now treats pair hours as it already treated single-call-out risk: the budgeted walk screens a
move, and a move is kept only if a walk at 200,000 steps a pair (`coverPairConfirmBudget`) agrees it pays. The pair hours the
slack line reports are that walk's; `coverSlack.pairHoursScreen` keeps the budgeted count and `pairConfirmed` says which one was
used. `coverPairConfirm: false` keeps the old behaviour.

`node eval/pair-confirm.mjs` (`eval/pair-confirm.out.txt`), $25 an hour at risk and $1 a pair hour, pair cap lifted, single runs.
Pair hours are those of the posted roster, counted by the walk run to the end:

| week | screen only: moves, score added, pair hours | confirmed: moves, score added, pair hours | pass time |
|---|---|---|---|
| 40 x 112 week 0 | 29 moves, +$11.69, 8 h | **11 moves, +$5.69, 8 h** | 33.9 s → 40.3 s |
| 40 x 112 week 1 | 3 moves, +$0.61, 0 h | **0 moves, +$0, 0 h** | 3.5 s → 8.2 s |
| 40 x 112 week 2 | 8 moves, 0 h | **0 moves, 0 h**, the same score | 1.6 s → 4.5 s |
| 20 x 56 week 2 | 6 moves, 688 h | **4 moves, 688 h**, the same score | 2.8 s → 3.2 s |
| spare café, retail, café | the same rosters | the same rosters | +0-25 ms |

On the 40-person week 0, 18 of the 29 moves bought nothing a full count can see and cost $6.00 of score; on week 1 all three
did, and on week 2 all eight. The confirmed pass ends at the same pair hours with fewer people moved. What the slack line said changed most: on the
40-person week 0 it reported 1,832 → 16 pair hours, where the walk run to the end counts 327 → 8.

**Tried and dropped:** handing out the most constrained shift first in the pair search (fewest people who could take it
outright). It capped about as many pairs at 500 steps (466 against 485 on the 20-person week, 343 against 308 on the 40-person
week 0), and because a hand-over chain may pass on a shift the other caller's stand-in has just taken, the order changes which
covers the search can reach: run to the end it called 8-50 more hours clashing than the fixed order on 3 of 22 rosters. The fixed
order stays.

Tests (`pair-confirm.test.mjs`): on the seeded 20-person week the budgeted walk gives up on more than 100 pairs, agrees with
the full walk on every verdict it reaches, and more than 50 of its given-up pairs are coverable; `--second-callout-price`
reports the full walk's pair hours, the screen's count is never below it, and the confirmed pass takes no more moves.

Not claimed: invented teams and seeded weeks; 200,000 steps is set from 22 rosters, and a pair past it still counts as
clashing; the confirm makes the pass slower on big weeks (8.2 s against 3.5 s on the 40-person week 1), which is why the pair
price still runs only up to 120 shift copies by default. Next: the 40- and 60-person weeks' played result with the pair price; a
cheaper confirm (only the pairs a move touches) so the pair price can run past 120 copies.

## Only the walks a move can pass (2026-11-15 later)

"Fewer capped pairs" left the second-call-out price (`--second-callout-price`) capped at 120 shift copies because its pair
walks were slow on bigger weeks: each candidate move that passes the single-risk test runs a 500-step walk over every pair of
safe person-days, then a 200,000-step confirming walk. It named the fix to try first: confirm only the pairs a move touches.
**That was tried and dropped** (below). What landed instead are two exact cuts that end a walk once the move it is testing
cannot pay:

1. **A walk stops at the hours that would reject the move.** A move is kept only if score + risk price + pair price falls.
   Before a candidate's pair walk, everything but the pair term is known, so the walk is told how many clashing hours would
   already reject it (`coverPairRisk(..., { stopAt })`) and returns as soon as it counts that many. A walk that finishes is the
   same walk as before.
2. **Last roster's clashes first.** Each pair's verdict is its own (the search puts every list back), so the order changes only
   how soon a walk reaches its limit. The pass keeps the clashing pairs of the roster it last took, one list per budget, and
   walks those first (`first`): a move that leaves them clashing is cut off after a few searches instead of after most of the
   walk. Without this the cut saved only 12-15%, because the few clashing pairs were scattered through about 1,000.

Plus one check the screen had and the confirm did not: if even zero clashing pairs would not pay for the move, the confirming
walk is skipped. `coverPairStop: false` turns all three off. `coverSlack` now reports `pairWalks`, `pairStops`, `pairSkips` and
`pairsSearched`.

`node eval/pair-stop.mjs` (`eval/pair-stop.out.txt`) builds each week's plain roster once and runs the priced pass from it
($25 an hour at risk, $1 a pair hour, confirm on) with the cuts off and on. Running the pass on one fixed roster matters here:
the 40-person week 2's build is time-gated, and two `buildRoster` calls with different options started the pass from different
rosters (scores 28,112,519.55 and 28,112,521.01), which first looked like the cuts changing the result.

| week (copies) | no pair price | pair price, cuts off | pair price, cuts on | pairs searched, off → on | same roster |
|---|---|---|---|---|---|
| spare café, retail, café (20-32) | 64, 2, 9 ms | 446, 15, 56 ms | 480, 17, 60 ms | 8,862 → 6,775 (spare) | yes |
| 20 x 56 weeks 0-1 (76, 82) | 143, 343 ms | 126, 344 ms | 132, 360 ms | 306, 6 (no move to test) | yes |
| 20 x 56 week 2 (75; 4 moves) | 196 ms | 2.7 s | **1.65 s** | 118,227 → 36,864 | yes |
| 40 x 112 week 0 (149; 11 moves) | 2.0 s | 32.3 s | **16.1 s** | 1,156,395 → 283,507 | yes |
| 40 x 112 week 1 (148) | 1.8 s | 6.8 s | **2.6 s** | 484,380 → 25,262 | yes |
| 40 x 112 week 2 (162) | 249 ms | 293 ms | 302 ms | 7,832 both | yes |
| 60 x 168 week 0 (245; `eval/pair-stop-60.out.txt`) | 1.7 s | 89.7 s | **46.8 s** | 4,229,868 → 1,818,194 | yes |

The cuts cost nothing where no move is tested (up to 10% on the millisecond weeks, within run-to-run noise) and halve or better
the pass where moves are tested and refused. On an earlier run of the same eval the 40 x 112 week 2 started from another,
time-gated roster that tested 124 moves: 5.3 s → 1.3 s. **The 120-copy cap stays.** On the 40-person weeks the pair price is now
1.4-8x the pass without it instead of 3.7-16x, and on the 60-person week it is still 28x (46.8 s against 1.7 s), too slow to
switch on by default inside a 20 s build. The run on the 80 x 224 weeks was stopped unfinished.

**Tried and dropped: reusing verdicts the move cannot change.** A pair's search is deterministic, and its only inputs are the
starting lists of the people it looks at (the two callers and each stand-in it tries). So a pair whose search never looked at
anyone the move changed would end on the same verdict, and its verdict can be copied from the last roster taken. That is exact,
and it was built and checked (same rosters on all nine weeks above). It copied only 4-17% of pairs: a pair's search tries every
person eligible for the callers' shifts, so on these weeks it looks at most of the team, and a move changes two to four people.
The bookkeeping (a set of people per pair, a map per walk) cost more than the walks it saved: the 40 x 112 week 1 took 8.1 s with
it against 7.0 s without. Starting the confirm from the 500-step screen's settled verdicts (a verdict reached within 500 steps
is final) was exact as well and also lost (7.8 s), for the same reason: the cheap pairs it skips were never the cost.

Tests (`pair-stop.test.mjs`): `stopAt` stops at the first count that reaches it and never above the full count; walking known
clashes first reaches the limit within three pairs and leaves the full count, pair count and clashing set unchanged; on the
seeded 20-person week the pass with the cuts posts the same roster, score, moves and pair hours as without, cutting off more than
100 walks and searching under half the pairs; `coverPairStop: false` turns them off.

Not claimed: invented teams and seeded weeks, single runs on one 4-core cloud machine; the cuts make the pass cheaper only where
moves get tested and refused, and a move that is taken still pays for two full walks; what a manager gains from the pair price
on these bigger weeks is not measured here.

## The pair price in played weeks, 20 to 40 people (2026-11-15 later)

"A second call-out in the same week" played `--second-callout-price` only on the five templates (the spare café: a big win;
retail: a wash), and every section since left "the 40- and 60-person weeks' played result with the pair price" open. **Measured**
with `node eval/pair-played-big.mjs` (`eval/pair-played-big.out.txt`). For each seeded week the plain roster is built once,
then the priced pass runs from that one roster twice: $25 an hour at risk (`--cover-price 25`), and the same plus $1 a clashing
pair hour (`--second-callout-price 1`; the 120-copy cap does not apply, since the eval calls the pass directly). The three
rosters are played through the same seeded weeks of call-outs as the template study (5pm notice, started shifts pinned, kept
reissues), 200 seeds on the 20-person weeks and 100 on the 30- and 40-person weeks, at the real file's rates (1.0% sick-only,
8.4% all leave). Each cell is open hours the week's call-outs added, changes to others, premiums owed; "pair vs cover" counts
the disrupted weeks where the pair roster added fewer or more open hours than the cover-price one (two-sided sign test).

| week (copies), rate | plain | `--cover-price 25` | + `--second-callout-price 1` | pair vs cover: fewer / more weeks |
|---|---|---|---|---|
| 20 x 56 week 2 (75), 1.0% | 304 h, 328, $5,715 | 230 h, 373, $6,460 | **216 h, 310, $5,510** | 7 / 2 (p 0.18) |
| 20 x 56 week 2, 8.4% | 2,838 h, 1,828, $31,245 | 2,697 h, 1,986, $33,677 | **2,610 h, 1,918, $32,631** | 63 / 34 (p 0.004) |
| 20 x 56 week 5 (78), 1.0% | 572 h, 128, $2,188 | the same (no move) | 572 h, **116, $2,069** | 0 / 0 |
| 20 x 56 week 5, 8.4% | 4,245 h, 1,127, $18,526 | the same (no move) | **4,168 h, 1,086, $18,071** | 20 / 2 (p 0.0001) |
| 30 x 84 week 0 (121), 1.0% | 201 h, 198, $3,380 | 197 h, 177, $3,073 | **176 h**, 183, $3,177 | 5 / 0 (p 0.06) |
| 30 x 84 week 0, 8.4% | 2,490 h, 1,754, $28,530 | 2,505 h, **1,740, $28,257** | **2,404 h**, 1,748, $28,381 | 45 / 21 (p 0.004) |
| 40 x 112 week 0 (149), 1.0% | 392 h, 134, $2,409 | 396 h, 133, $2,399 | 396 h, **117, $2,144** | 0 / 0 |
| 40 x 112 week 0, 8.4% | 2,796 h, 1,207, $20,476 | **2,751 h**, 1,166, $19,853 | 2,765 h, 1,159, $19,781 | 5 / 7 (p 0.77) |

What the passes paid: on the 20-person week 2, cover $35.27 of score (+$35 payroll), pair $25.85 (+$26); week 5, pair one
move for $4.62 (+$15 payroll); 30 x 84 week 0, cover four moves for $6.66, pair six for $8.84, payroll unchanged; 40 x 112
week 0, cover one move for $4.47, pair eleven for $10.15, both $6 less payroll than plain. On eight of the twelve seeded
weeks finished (20 x 56 weeks 0, 1, 3, 4, 6, 7; 40 x 112 weeks 1 and 2) neither pass moved anyone, so there was nothing to
play.

**What this says.** On every week where the pair price moved the roster it was never worse than the cover price alone beyond
noise. On the 20- and 30-person weeks it cut the open hours call-outs added by 2-11% against the cover-price roster wherever
the two differed (2-29% against plain), and three of the six comparisons are well outside noise (the sign tests at p 0.004 or
less, all at 8.4%, where there are enough disrupted weeks to tell). Changes to others and premiums mostly fell too, but not
always: on the 30-person week at 8.4% the cover roster moved 8 fewer people and owed $124 less. On the 40-person week the open hours were a
wash (14 h more over 100 weeks, 5 weeks better and 7 worse), but the call-out reissues moved fewer people and owed less: 12%
fewer changes and 11% less premium at 1.0%, under 1% at 8.4%. That matches the pair yardstick: the 40-person week's pair
hours were already small (51 h on the cover roster, 8 on the pair one), so there was little left to buy.

**Why the default stays off and the cap stays.** The 30 x 84 week has 121 copies, one over the 120-copy cap, and its build with
the pair price took **241 s** here (the 40 x 112 week 0's took 22.7 s; the cost depends on how many candidate moves reach the
pair walk, not on size alone). A price that helps on these weeks is no use if the page hangs. The evidence for the opt-in
grows (fewer open hours added on three of four played weeks, fewer people moved on the fourth, none worse), so the page's note
on the option now says so; a default needs the pass's worst case bounded first.

Not claimed: invented teams and seeded weeks, single runs on one 4-core cloud machine; only four of twelve weeks were moved
by either pass, so this is four rosters, not a population; the 60-person week was not played (its pair pass alone took 46.8 s
and each reissue up to 20 s, about 10 hours for 100 seeds here); the 30 x 84 weeks 1-5 were stopped unfinished. Next: a time
cap on the pair pass itself (stop at the build's budget and keep the moves made), so the price can run past 120 copies without
a 241 s worst case.

## A time cap on the pair price (2026-11-15 later)

"The pair price in played weeks" ended on one next step: put a time cap on the pair pass itself, stopping at a limit and
keeping the moves made, so `--second-callout-price` can run past 120 shift copies without a 241 s worst case. **The cap
landed; the 120-copy limit stays**, because on the weeks measured the pass finds most of its gain late.

**What landed.** `coverSlackPass(..., { pairMs })` (build option `coverPairMs`, CLI `--second-callout-seconds`, default
**10 s**). Each move the pass takes lowers score + price x risk hours + pair price x pair hours, and is confirmed by the full
walks before it is taken. So a pass stopped between moves posts a roster that is exactly the uncapped pass after its first k
moves, never worse than where it started. The clock starts with the pass. Once the limit passes, no new move is tried, a
pair walk under way stops (`coverPairRisk(..., { deadline })`, checked every 16 pairs) and its move is refused, and
`coverSlack.pairTimedOut` is set. The slack line then says the search stopped at its limit and kept its moves. If the
starting roster's own pair count does not finish in time (8.5 s of it on the 30-person week below), there is no whole count
to price against. In that case the pass posts the starting roster with `pairHours` null and `pairStartTimedOut` true, and the
line says second call-outs were not priced. With no pair price there is no cap and nothing changes.

`node eval/pair-timecap.mjs` (`eval/pair-timecap.out.txt`) builds each seeded week's plain roster once and runs the uncapped
pass from it ($25 an hour at risk, $1 a pair hour, cuts and confirm on), recording when each move lands. That gives the curve
a cap would cut. Then it runs the pass at 2, 5 and 10 s caps and checks each capped roster is a prefix of the uncapped one
(it was, on all twelve runs). "Gain kept" is the share of the uncapped pass's drop in its own objective.

| week (copies) | uncapped pass | moves land at | kept at 2 / 5 / 10 s |
|---|---|---|---|
| 20 x 56 week 2 (75) | 4 moves, 2.0 s | 0.39, 0.73, 0.99, 1.53 s | 100% / 100% / 100% |
| 30 x 84 week 0 (121) | 6 moves, **302 s** | 80, 129, 149, 241, 246, 282 s | 0% / 0% / 0% |
| 40 x 112 week 0 (149) | 11 moves, 20.4 s | 0.5 s (21%), then 2.6-11.3 s, 7 more by 18.7 s | 21% / 22% / 22% |
| 60 x 168 week 0 (245) | **0 moves, 88 s** | none | nothing to keep |

The cap holds. Those capped runs started the clock after the starting walks, which is how the hole above was found: the
30-person week's 10 s cap ran 19.0 s. With the shipped clock, which counts the starting walks (`CAPS_ONLY=1`,
`eval/pair-timecap-caps.out.txt`), all nine capped runs ended 0.0-0.2 s past their limit. The 30-person week at 2 and 5 s
was left unpriced, its starting count unfinished. At 10 s the count finished and no move landed. The 40-person week kept 1,
2 and 2 moves ($107.45, $113.67 and $113.67 of the $508.85 gain).

**What this says.** On the two small weeks the cap costs nothing: 20-person weeks finish in 2-3 s, and the five templates
in milliseconds. On the 60-person week it saves 78 s of a search that moves nobody. But where a big week does gain, the gain
comes late: on the 40-person week moves 4-11 (78% of the gain) land between 11 and 19 s, and the 30-person week's first move
comes at 80 s, after about 105 pair walks over 89,910 pairs (about 1 ms a pair; 89 of the walks were cut off as unable to
pay). A 10 s cap above 120 copies would mostly spend 10 s to keep a fifth of the gain or none. So the price still switches
off above 120 copies (`coverPairPriceSlots`). The cap is a worst-case bound for the weeks under it, and any week can be given
more time: `--second-callout-seconds 300` (or `Infinity`) reproduces the uncapped pass.

Tests (`pair-timecap.test.mjs`; the clock is moved by hand, so they do not depend on the machine's speed): with no limit hit
the capped pass is the uncapped pass; a stop right after the second move posts exactly the uncapped pass's roster and pair
hours after two moves, between the start and the end in the objective; a clock spent before the starting count finishes posts
the starting roster unpriced; `buildRoster` passes `coverPairMs` through and the slack line says which case happened.

Not claimed: invented teams and seeded weeks, single runs on one 4-core cloud machine, so the times (and what a given cap
keeps) depend on the machine. A capped result is therefore not reproducible across machines the way an uncapped one is;
`pairTimedOut` marks it. Next: make the pass find its gain sooner. On the 40-person week 0 the best moves came last and the
first 80 s of the 30-person week went to moves that were refused, so trying first the candidates whose screen clears the
most pair hours would let a short cap keep more of the gain.

## The pair price's best moves first, and where its time goes (2026-11-15 later)

"A time cap on the pair price" ended on one next step: make the pass find its gain sooner, by trying first the candidates
whose cheap tests leave the most room. **That landed as an opt-in (`coverPairRank`, CLI `--second-callout-rank`) and stays
off, because it did not help on the measured weeks.** Two things were measured along the way that the next attempt should
start from.

**What landed.** The pass is first-improvement: it takes the first candidate that pays, and with a pair price each
candidate's pair walks are the cost. With the rank on, a round first runs every candidate through the cheap tests (score and
the budgeted single risk), sets it aside with the room those leave for clashing pairs, then walks them largest room first and
takes the first that pays. Every move is confirmed by the same walks, so the pass is never worse than its start. It walks a
different path, so its end can differ.

`node eval/pair-rank.mjs` (`eval/pair-rank.out.txt`), $25 an hour at risk and $1 a pair hour, uncapped, from each week's plain
roster:

| week (copies) | rank off: moves, time, gain | rank on: moves, time, gain | gain kept at 10 / 20 s, off → on |
|---|---|---|---|
| 20 x 56 week 2 (75) | 4 moves, 1.5 s, $1,315.15 | 1 move, 0.7 s, **$1,120.98** | 100% / 100% → 85% / 85% |
| 40 x 112 week 0 (149) | 11 moves, **16.0 s**, $508.85 | 12 moves, 28.3 s, $508.85 | 40% / 100% → 14% / 41% |
| 30 x 84 week 0 (121) | 6 moves, 202 s, $1,629.16 | 6 moves, **160 s**, $1,629.16 | 0% → 0% (first move 57 s → 42 s) |

On the 20-person week the largest-room first move led to a local optimum that keeps 85% of the gain. On the 40-person week the
same end cost 2.8 times the candidates (48,374 against 17,344), because every candidate of every round is now screened, and
the gain arrived later. On the 30-person week it was 21% faster to the same end, but its first move still came at 42 s. The
30-person runs overlapped other jobs on the machine for part of their time, so those times are rough. Room is also not the
gain: on the 20-person week the move with the most room was not the move that lowered the objective most, because the room is
measured before the pair hours come off it.

**Where the pass's time goes.** A CPU profile of the uncapped pass on the 40 x 112 week 0 (15.7 s): 11.2 s of it is
`validWith`'s own time, called from the pair walks' cover searches (`coverGroupsJoint`, 9.8 s) and the single-risk checks
(`coverDayJoint`, 5.1 s). By kind of check:

| check | calls | time |
|---|---|---|
| 500-step pair walks cut off (move refused) | 1,379 | **5.9 s** |
| budgeted single-risk screens (`coverRisk`) | 1,514 | 2.8 s |
| 200,000-step confirming walks cut off | 83 | 1.9 s |
| unbudgeted single-risk checks | 116 | 1.9 s |
| 500-step pair walks run to the end | 117 | 1.3 s |
| 200,000-step confirming walks run to the end | 12 | 1.0 s |

So the biggest cost is the screen refusing moves, and each refusal costs about 4.3 ms. The starting roster carries 314
clashing pairs at 500 steps (308 of them given up on at the budget), the walk must count nearly all of their hours before it
reaches the hours that would reject a move, and each given-up pair costs its full 500 steps. A cheaper screen for those pairs
is the next thing to try. `validWith` itself is already tight (typed arrays, no allocation, lists of a few shifts), so the
saving has to come from fewer calls, not cheaper ones.

**Tried and dropped: skipping the joint search when two covers do not meet.** If one call-out's own cover and the other's
change no one in common, the callers included, then both covers applied together are valid, because every rule is checked one
person at a time. Such a pair needs no joint search. That is exact, and it was built. It applied to 0 of 435 pairs on the
20-person week 2, 0 of 703 on the 40-person week 0 and 85 of 1,035 on the 40-person week 1 (where no move is tested): the
depth-first search hands every cover to the same first eligible person with slack, so almost every two covers meet. It also
saves only pairs that are cheap to search already. The cost is in the clashing pairs, whose search must fail every branch.

Tests (`pair-rank.test.mjs`): the ranked pass takes only moves that lower the objective, ends below its start, and confirms its
pair hours; with no pair price it is the unranked pass; and `buildRoster` passes `coverPairRank` through.

Not claimed: invented teams and seeded weeks, single runs on one 4-core cloud machine; three weeks are three rosters, not a
population. Next: a cheaper screen for the pairs the last roster gave up on (they set the screen's cost on the big weeks).

## Remembered pair searches: exact, and almost never usable (2026-11-15 later)

"The pair price's best moves first" ended on one next step: a cheaper screen for the pairs the last roster gave up on, since
on the big weeks their 500-step searches are where the pass's time goes. Two screens were built and measured. Neither pays,
and the reason is one number worth knowing before the next attempt.

**What landed (opt-in, `coverPairMemo: true`).** `coverPairRisk` takes a `memo` (`pairMemo()`) that carries pair verdicts
from one walk to the next. A pair's search is a fixed depth-first walk over the two callers' shifts, the people eligible for
each and their lists, so it reads nothing but those lists and `ctx`. `coverGroupsJoint` now marks every person whose list it
reads (the callers, and everyone it considers for a shift), and the memo keeps that set with each person's list (interned to
an integer) beside every given-up or failed verdict. A later walk reuses the verdict only when all of those lists are
unchanged, in which case the search would retrace itself step for step. So the memo is exact: with it on, the pass takes the
same moves to the same roster and searches the same pairs.

**Why it rarely applies.** A search that fails, or runs out of its 500 steps, has tried nearly everyone:

| week (people) | given-up pairs on the plain roster | lists read by a given-up search, average | failed pairs, lists read |
|---|---|---|---|
| 20 x 56 week 2 (20) | 53 | 19.2 | 4, 17.8 |
| 40 x 112 week 0 (40) | 308 | **39.8** | 6, 32.0 |

A candidate move changes two people's lists, and nearly every remembered search read both. `node eval/pair-memo.mjs`
(`eval/pair-memo.out.txt`, $25 an hour at risk and $1 a pair hour, uncapped, from each week's plain roster):

| week (copies) | memo off: moves, time | memo on: moves, time | memo hits / lookups | same roster, moves, pairs searched |
|---|---|---|---|---|
| 20 x 56 week 2 (75) | 4 moves, 2.28 s | 4 moves, 2.34 s | 1,075 / 36,864 (2.9%) | yes |
| 40 x 112 week 0 (149) | 11 moves, 22.4 s | 11 moves, **27.5 s** | 212 / 283,507 (0.07%) | yes |
| 40 x 112 week 1 (148) | 0 moves, 4.04 s | 0 moves, 3.88 s | 7 / 25,262 | yes |

On the 40-person week 0 the bookkeeping (interning each person's list per walk, a key per pair) cost more than the 212 saved
searches, 23% slower; elsewhere it is within noise. So it stays off.

**Tried and dropped: carrying given-up verdicts as they are.** A looser screen reused a given-up verdict whenever the same
two person-days came up again, whatever else had changed, relying on the 200,000-step confirming walk to keep the pass
honest. On the 20-person week 2 it ran in 0.21 s instead of 2.03 s and made **0 moves instead of 4**, ending at objective
$4,811,477.36 instead of $4,810,162.21. The moves that pay on that week are the ones that free a given-up pair, and a screen
that never searches those pairs again cannot see a move do it. It was not kept.

**Tried: handing the shifts out in another order.** The cost is not repeated work that could be cached. A given-up search
spends its 500 steps visiting almost everyone, mostly on pairs a longer search covers (262 of 485 on the 20-person week 2,
`eval/cover-pair-capped.mjs`), so the natural next try was the search order inside `coverGroupsJoint`. `coverPairRisk`'s
`handOut` option (measurement only) hands out first the shift with the fewest eligible people (`"fewest"`) or the fewest
people who could take it now (`"takers"`). `node eval/pair-order.mjs` (`eval/pair-order.out.txt`), each week's plain roster:

| week, order | 500 checks: clashing (given up), pair hours | 200,000 checks: clashing (given up), pair hours |
|---|---|---|
| 20 x 56 week 2, usual (A's day, then B's) | 57 (53), 321 h | 29 (0), 179 h |
| 20 x 56 week 2, fewest eligible first | **41 (27)**, 237 h | 31 (0), **187 h** |
| 20 x 56 week 2, fewest takers first | 71 (63), 391 h | 31 (0), 187 h |
| 40 x 112 week 0, usual | 314 (308), 1,832 h | 44 (0), 327 h |
| 40 x 112 week 0, fewest eligible first | 332 (326), 1,941 h | 45 (0), 313 h |
| 40 x 112 week 0, fewest takers first | 345 (337), 2,019 h | 50 (0), 355 h |

No order gives up on fewer pairs on both weeks, so none was made the default. The second column is the finding to carry
forward: **the confirmed count depends on the order**: with no pair given up, 179 or 187 pair hours on the 20-person week and 313
to 355 on the 40-person week. A complete search
should not care about order. This one most likely does because a hand-over chain may pass on a shift handed out earlier in the same
search, and the passes are counted per shift in the order they are made. So "at most two passes per shift" defines a
different set of covers for each order. Next: decide what the pair check should mean, so its exact answer is the same in any
order (for example, chains that pass on only the stand-ins' own shifts, or one budget of passes for the whole pair), then
make that search fast. Until then, the confirmed pair hours are exact for the usual order only.

Tests (`pair-memo.test.mjs`, 4): on two seeded weeks and two budgets, over a chain of random hand-overs, every walk with the
memo equals the walk without it, verdicts included, and the memo is used; the pass and `buildRoster` give the same roster,
moves, pair hours and pairs searched with it on and off; the `handOut` orders walk the same pairs. Not claimed: seeded weeks, single runs on one 4-core cloud machine.

## An order-free pair check (2026-11-15 later)

"Remembered pair searches" ended on a problem with the second-call-out check (`coverPairRisk`, behind `--second-callout-price`): its
exact answer depended on the order its search handed out the shifts. With no pair given up, the seeded 20-person week 2 had
179 or 187 clashing pair hours and the 40-person week 0 had 313 to 355, depending only on that order. So the confirmed count
described the search, not the roster. The fix it named: decide what the check should mean, so its exact answer is the same in
any order, then make that search fast. **That landed as an opt-in (`coverPairOrderFree: true`, CLI
`--second-callout-order-free`).**

**What the check now means.** A pair of call-outs is covered when there is a covered roster where:

- every shift the two callers lose goes to someone eligible, and so does every shift someone gives up to make room;
- a person gives up at most two of their own shifts (shifts they held before the call-outs, not ones taken in this cover), each
  on or after the earlier call-out day, and only in exchange for taking one; the pair has the same total of give-ups the old
  check allowed (two per lost shift);
- callers are off on their own call-out days and may take a shift on a later day;
- every person's final list keeps every hard rule.

That is a question about the final roster, so no order can change the answer. The old search was order-dependent for two
reasons, and both are gone. First, a chain could pass on a shift handed to that person earlier in the same search, so "two
passes per shift" meant different things in different orders. Second, each hand-over was checked on the lists as they stood,
so a stand-in who could take shift X only after giving up shift Y was refused X when X came first.

**Why the search is still exact.** It hands shifts out depth-first and checks each hand-over on the current lists, like the
old one. A person gives up shifts only together with the first shift they take. The hard rules are downward closed: dropping
a shift never breaks rest, overlap, weekly or daily hours, or days in a row. So for any covered roster there is a search path
on which every list checked is part of its owner's final list, and pruning on those checks never cuts a cover. Travel times
between sites are the exception: if a trip table breaks the triangle inequality, the search can miss a cover, though it never
invents one. `pair-order-free.test.mjs` checks the verdicts against an oracle that asks the same question another way (it picks
the given-up shifts first, then assigns every open shift). They agreed on every pair of five small seeded weeks at three pass
budgets, including covers that need a give-up. The verdict was the same in five hand-out orders (three fixed, two shuffled),
with and without the look-ahead, on 12- and 20-person weeks.

**Making it fast.** Three things, all exact:

1. **Look-ahead and fewest-options-first.** Before each hand-out, every shift still to place must have someone who could take
   it now, either outright or after giving up their own shifts, which is the only way a list can shrink. If one has nobody, the
   branch is cut. The shift with the fewest takers goes next. An order chosen during the search is allowed now, because the
   order cannot change the answer. Without the look-ahead, 6 pairs on the 20-person week were still given up at 200,000
   checks; with it, none were.
2. **A capped round first.** Between "no give-ups" and the whole question there is a round with at most two passes on any
   one chain and one give-up per person. That is a narrower question, so any cover it finds is a real cover. The last round
   runs only when it finds none. Without that round, one search allowing all four passes went four passes deep under a first
   stand-in who could not be helped. At 2,000 checks it gave up on 1,592 of the 60-person week's 8,646 pairs; with the
   capped round first, on 1.
3. **More checks for the confirm.** At 200,000 checks the order-free walk gave up on 9 pairs of the 40-person week 0 and 1
   on the 60-person week. At 2,000,000 it gave up on none, the count did not change (those pairs really clash), and the
   walk took about the same time (0.39 s to 0.55 s on the 40-person week, 0.75 s to 0.86 s on the 60-person week), because only those few pairs use the extra checks. A build with the
   order-free check confirms at 2,000,000 (`coverPairConfirmBudget` overrides it).

**Tried and dropped:**

- One give-up per person. It is the simplest exact rule, but on the priced retail template it flagged 82 pairs where the old
  check flagged 55, and none of the 27 extra pairs opened hours when played.
- Deepening one pass at a time (0, 1, 2, 3, 4). It gave up on more pairs at every budget, because each shallow round that
  fails must search its whole tree.
- A single round with every pass allowed. It was no better than two rounds.
- Accepting a hand-over on the promise of a later give-up, with a final check at the end. This is exact for a looser rule
  (several separate give-ups per person). But it cut almost nothing, so the 20-person week's walk took about 2 s, and 4 pairs
  were still given up at 200,000 checks.

`node eval/pair-order-free.mjs` (`eval/pair-order-free.out.txt`) walks each seeded week's plain roster:

| week | check | 500 checks: clashing (given up), pair hours | full: pair hours, time | full count by hand-out order |
|---|---|---|---|---|
| 20 x 56 week 2 | old | 57 (53), 321 h | 179 h, 15 ms | 179 / 187 / 187 h |
| | order-free | **29 (29), 180 h** | **148 h**, 32 ms | **148 / 148 / 148 h** |
| 40 x 112 week 0 | old | 314 (308), 1,832 h | 327 h, 174 ms | 327 / 313 / 355 h |
| | order-free | 293 (291), 1,697 h | **99 h**, 554 ms | **99 / 99 / 99 h** |
| 40 x 112 week 1 | old | 1 (1), 7 h | 0 h, 15 ms | 0 h each |
| | order-free | **0 (0), 0 h** | 0 h, 41 ms | 0 h each |
| 60 x 168 week 0 | old | 2,214 (2,212), 14,479 h | 27 h, 236 ms | 27 h each |
| | order-free | 4,158 (4,156), 25,267 h | 27 h, 856 ms | 27 h each |

The old column's full count is at 200,000 checks and the order-free one's at 2,000,000. The orders are the usual one, fewest
eligible first, and "takers" (old) or reversed (order-free). On the two weeks where the old count moved with the order, the
order-free count is lower than all of the old ones: the pooled give-ups and the two-per-person rule admit covers the old
per-shift chains could not reach.

**Against what really happens.** `node eval/pair-order-free-exposure.mjs` (`eval/pair-order-free-exposure.out.txt`) plays
every pair of safe person-days on the five templates (default and `--cover-price 25` rosters, 337 pairs, 118 of which open
hours when played as kept 5pm reissues) and scores each check:

| check | flagged (given up) | precision | recall | missed |
|---|---|---|---|---|
| old, 500 checks | 186 (43) | 58.1% | 91.5% | 10 |
| old, 200,000 | 186 (0) | 58.1% | 91.5% | 10 |
| order-free, 500 | 206 (110) | 52.9% | 92.4% | 9 |
| order-free, 2,000,000 | **180 (0)** | **59.4%** | 90.7% | 11 |

So the order-free check is about as good a predictor as the old one, a little more precise and one pair less complete. That
is not a reason to switch on its own; the reason is that its answer is a fact about the roster.

**The priced pass with each check** (`--cover-price 25 --second-callout-price 1`, uncapped, from each week's plain roster;
pair hours counted on the posted roster by each check run to the end):

| week (copies) | old check: moves, score added, time | posted pair hours, old / order-free count | order-free check: moves, score added, time | posted pair hours, old / order-free count |
|---|---|---|---|---|
| 20 x 56 week 2 (75) | 4, +$25.85, 1.9 s | 688 / 655 h | 3, +$35.70, 3.2 s | 669 / **562 h** |
| 40 x 112 week 0 (149) | 11, +$10.15, 25.2 s | 8 / 0 h | 7, +$17.91, 31.0 s | 51 / 0 h |
| 40 x 112 week 1 (148) | 0, 3.8 s | 0 / 0 h | 0, 3.1 s | 0 / 0 h |

Each pass does best by its own count, and each check rates the other pass's roster worse. The order-free pass costs more
score on both weeks it moved and is slower on them (its 500-check screen gives up on about as many pairs as the old one on the
40-person week, and its walks cost more per pair). So `--second-callout-order-free` stays off by default, and the
120-copy cap stays. Whether its rosters do better when played was not measured.

Tests (`pair-order-free.test.mjs`, 5): the verdict agrees with the oracle on every pair of five small seeded weeks at three
pass budgets; it is the same in five hand-out orders with and without the look-ahead; the whole walk's count is the same in
three orders where the old one's is not; a verdict reached within 500 checks is the one reached at 200,000; the pass and
`buildRoster` pass `coverPairOrderFree` through and report the order-free count.

Not claimed: invented teams and seeded weeks, single runs on one 4-core cloud machine; four seeded rosters and five
templates, not a population. Next: play the order-free pass's rosters through seeded weeks of call-outs (as "The pair price
in played weeks" did) to see whether its lower count opens fewer hours; a cheaper 500-check screen for the order-free check
(its give-ups set the pass's cost on the 40- and 60-person weeks).

## The order-free pass played (2026-11-15 later)

"An order-free pair check" made the second-call-out check's answer a fact about the roster (`--second-callout-order-free`) and
left one question: does the priced pass built on it leave rosters that open fewer hours when call-outs really happen? **Measured**
with `node eval/pair-order-free-played.mjs` (`eval/pair-order-free-played.out.txt`): the same seeded weeks, seeds, call-out draw
and rates as "The pair price in played weeks". From each week's plain roster three passes run: `--cover-price 25`; that plus
`--second-callout-price 1` with the default check (confirmed at 200,000 checks); and the same with the order-free check
(confirmed at 2,000,000). Each roster is played through the same weeks of call-outs (5pm notice, started shifts pinned, kept
reissues). Of the 15 seeded weeks built (20 x 56 weeks 0-7, 30 x 84 weeks 0-3, 40 x 112 weeks 0-2), the order-free pass gave a
roster of its own on three; on 20 x 56 week 5 it made the default pass's one move, and on the other eleven no pass moved anyone.

| week, rate (disrupted weeks) | open hours added: cover / default pair / **order-free** | order-free vs default: fewer / more weeks | changes to others, premiums: default / order-free |
|---|---|---|---|
| 20 x 56 week 2, 1.0% (143) | 230 / 216 / **218** | 2 / 2 (p 1.0) | 310, $5,510 / 366, $5,953 |
| 20 x 56 week 2, 8.4% (200) | 2,697 / 2,610 / **2,614** | 37 / 43 (p 0.58) | 1,918, $32,631 / 2,049, $33,149 |
| 30 x 84 week 0, 1.0% (84) | 197 / 176 / **201** | 3 / 6 (p 0.51) | 187, $3,239 / 201, $3,420 |
| 40 x 112 week 0, 1.0% (94) | 396 / 396 / **392** | 1 / 0 (p 1.0) | 117, $2,144 / 135, $2,360 |
| 40 x 112 week 0, 8.4% (100) | 2,751 / 2,765 / **2,731** | 11 / 6 (p 0.33) | 1,159, $19,781 / 1,187, $19,727 |

What each pass paid, from the same plain roster: on the 20-person week the default pair pass made 4 moves for $25.85 of score
and the order-free one 3 for $35.70 ($18 more payroll); on the 40-person week 11 moves for $10.15 against 7 for $17.91 ($14 more
payroll). On the 30-person week the order-free pass made 2 moves at no score cost that raised the single-call-out risk from 261 h
to 269 h (the default pass cut it to 208 h) to buy 238 order-free pair hours; played, its roster opened what the plain roster
did (201 h) where the default pair roster opened 176 h. That pass also took **1,295 s**, against 298 s for the default check's,
on a 121-copy week.

**What this says.** The order-free count is lower and does not depend on the order the search hands out shifts, but the
rosters priced on it opened no fewer hours than the default check's: within noise on all five comparisons (no sign test below
p 0.33), fewer hours on the two 40-person comparisons and more on the other three. They moved more people in all five and
owed more premium in four of five, cost more score on both weeks where the two passes made a real trade, and took up to 4.4 times as long. So the
default check stays the default, `--second-callout-order-free` stays opt-in for anyone who wants an answer that does not
depend on search order, and the "cheaper 500-check screen for the order-free check" is not worth building: it would make a
pass faster that does not pay for itself in played weeks.

Not claimed: invented teams and seeded weeks, single runs on one 4-core cloud machine with up to three processes at once;
three rosters, not a population; the 30-person week was played at 1.0% only (its two builds take about 30 minutes, and 100
seeds at 8.4% took 88 minutes for three rosters in the earlier study). The default pair roster on that week opened 176 h in
both studies, but its changes and premiums differ slightly from "The pair price in played weeks" (187 and $3,239 here, 183 and
$3,177 there), because the reissues inside each play are time-gated and the machine was busier. Every other cell for the
cover and default rosters matches that study exactly.

## The clique LP steers the cover passes (2026-11-15 later)

"Column generation keeps to its share" left a question for 350-400 copy weeks: the open-hours clique LP takes 5-11 s there and
buys a much tighter bound, while the cover passes turn the same seconds into filled shifts, and in single runs neither won every
week. **Measured first** (`node eval/clique-vs-cover.mjs P S week config seed`, `eval/clique-vs-cover.out.txt`): each of the five
350-400 copy bench weeks built three times (search seeds 1-3) with the clique LP on and off, at the default 20 s budget.

| open hours, mean of 3 seeds | clique LP off | clique LP on (unguided cover passes, as before) | on, cover passes guided (now) | bound the clique LP proves |
|---|---|---|---|---|
| 90 x 252 week 0 (348 copies) | 356.7 | 356.7 | **353.7** | 352 |
| 90 x 252 week 1 (352) | 224.0 | 229.3 | **220.7** | 219 |
| 90 x 252 week 2 (363) | 376.3 | 374.7 | **374.0** (proven on all 3) | 374 |
| 100 x 280 week 0 (400) | 387.0 | 377.7 | **374.3** | 358 |
| 100 x 280 week 1 (400) | 353.3 | **350.0** | 350.7 | 344 |

So the clique LP paid for itself on four of five weeks even before this change: on the 400-copy weeks by 9.3 and 3.3 hours on
every seed. Without it the only bound left is column generation's root (288-294 h on those weeks), so the page could not tell a
manager that 344-358 of the hours are unavoidable. The one loss was 90 x 252 week 1, where the cover passes got about 2.5 s less
and the roster left 5 more hours open.

**What landed:** the LP's answer is now used twice. It already guided the day sweeps (README "A guide when the pay floor is
skipped"); now it guides the cover passes too. When a cover-pass step tries to fill an open shift, it picks the person to try in
proportion to their value on that shift in the LP's solution half the time, and picks uniformly the other half, as before
(`coverPass`'s `guide`). It only changes which move is proposed. Every move is still checked by the same rules and accepted by
the same test, so the guide cannot make a roster invalid, and a week whose LP gives nobody to a shift is proposed as before.
`coverGuide: false` turns it off, `coverGuideProb` sets the share (0.9 was tried: no better than 0.5, worse on two weeks), and
`optimality.coverGuided` says whether the cover passes used it.

The before/after columns above come from two separate runs. So the change was checked again in **one run, on fresh search seeds
4-6 and ten bench weeks** (60 to 100 people), guided against `coverGuide: false`, paired by week and seed:

| same run, seeds 4-6 (`eval/clique-guide-ab.jsonl`) | unguided: open h | guided: open h |
|---|---|---|
| 80 x 224 weeks 0-2 | 260/259/259, 331/331/334, 284/282/282 | **257/259/257, 331/331/331, 281/281/281** |
| 90 x 252 weeks 0-2 | 354/355/359, 221/222/224, 374 x 3 | **352/354/359, 220/226/219**, 374 x 3 |
| 100 x 280 weeks 0-1 | 381/373/381, 346/349/348 | **372/377/374, 351/344/347** |
| 60 x 168 weeks 0-1 | 300 x 3, 308 x 3 | 300 x 3, 308 x 3 (no change: proven or nothing to cover) |

Guided builds left fewer open hours on **14 of 30, more on 3**, and tied on 13 (two-sided sign test p = 0.013): 9,450 hours in all
against 9,481. Of the 24 builds above 60 people, **14 guided rosters reached the clique LP's bound**, so their open hours are
proven least, against 5 unguided. They include all three seeds of 80 x 224 weeks 1 and 2, 90 x 252 week 1 seed 6 (219) and
100 x 280 week 1 seed 5 (344). Because the plateau walk stops at the bound,
those builds also spent less time in the cover passes (0.5-1.9 s instead of 3.3-5.9 s on 80 x 224 weeks 1 and 2). On weeks of
up to about 245 copies the clique LP proves the posted roster's open hours before the cover passes start, so nothing changes there.

**What this says** about the question it started from: on 350-400 copies the clique LP is worth its seconds, so its gate stays
as it is. The way to stop it costing the cover passes is to let the cover passes use what it found, not to skip it.

Tests: `cover-guide.test.mjs` (on 80 seeded small weeks a guided pass from an empty roster, at guide shares 0.5 and 1, keeps every
rule, reports its own open hours, never ends above where it started and never below the clique LP's floor; an all-zero guide
gives the unguided pass's roster exactly; buildRoster reports `coverGuided` true when the clique LP ran and false with
`coverGuide: false`). Not claimed: generated weeks only, three or six search seeds each, one cloud machine with two builds at a
time. The time-bound passes move a few hours run to run (README "Room for the clique LP"), which is why the claim rests on the
paired same-run comparison. Next: the same guide for `coverRepair`'s choice of people, and for `ejectPass`, which run before the
LP today.

## The clique LP picks the repair's people (2026-11-15 later)

"The clique LP steers the cover passes" ended on a next step: give the same LP guide to `coverRepair`, the exact repair that
releases k people's shifts and re-solves them plus every open shift. Looking first at what the repair does on the 350-400 copy
weeks changed the question. On most of those builds it got **0 ms**: the plateau walks run until the 20 s budget is gone
(`eval/clique-guide-ab.jsonl`). And when it was given time (`coverRepairReserveMs`), it ended on its node budget after about 15 of
its 60 rounds, because **every round hit its 200,000-node cap**. A three-person neighbourhood there holds about 68 open shifts, and
the depth-first search began each round with no bound, so it often never even found the roster it started from (361 open hours
found, 356 held, on 90 x 252 week 0).

**What landed:**

- **Each round starts from its own value.** The search must beat the neighbourhood as it stands, so it prunes from the first node.
  Shifts no chosen person may take are counted once and not branched on, and a second bound prunes on the chosen people's weekly
  hours: hours still to place, less what those people can still take, must stay open. Both only relax the rules, and a new test
  checks the repair over everyone against a brute-force search on 60 tiny weeks: the same least open hours on all 60
  (`repair-guide.test.mjs`).
- **An LP-guided choice of people, opt-in** (`repairGuide: true`, `repairGuideProb`, default share 0.5). A guided round builds its
  people as a chain the LP suggests: an open shift, a person the LP puts on it (drawn by value), a shift that person holds which the
  LP gives mostly to someone else, that someone, and so on.
- **A reserve for the repair, off by default** (`coverRepairReserveMs`): under a time budget the plateau walks stop starting once
  only that much is left. The repair's own time is now capped at what the budget has left (at least 0.2 s).
- `optimality.coverRepair` reports `guided`, `guidedRounds`, `gains` and `guidedGains` when the repair ran.

**Measured on the repair alone** (`node eval/repair-alone.mjs P S week startSeed`, `eval/repair-alone.out.txt`): the eight
80-100 person bench weeks, three fixed starts each (a guided plateau walk of 400,000 steps from an empty roster), then the
repair under the same node budget:

| 24 starts, k = 3 people, 60 rounds | total open h | cut from the start | paired against the unguided new repair |
|---|---|---|---|
| main's repair (b92b1c892) | 8,455 | 206 h | fewer open on 1, more on 8 (p = 0.039) |
| this repair, unguided (the default) | **8,444** | **217 h** | |
| this repair, guided half the rounds | 8,443 | 218 h | fewer on 11, more on 9, tied 4 (p = 0.82) |
| this repair, guided every round | 8,481 | 180 h | fewer on 9, more on 13 (p = 0.52) |

Five-person neighbourhoods (first start of each week) left more open than three on 6 of 8 weeks unguided and 6 of 8 guided, fewer on 1 (they hit the node cap sooner). So the bound is a small, real gain
and the guide is not one: the LP's people are no better places to look than random ones, and guiding every round narrows the
search and loses. That is why the guide is opt-in.

**End to end** (`node eval/repair-guide.mjs P S week config seed`, `eval/repair-guide.out.txt`, same eight weeks, search seeds 4-6,
default 20 s budget, two builds at a time): main 7,631 open hours in all, this change 7,631, the guided repair 7,635, a 500 ms
reserve 7,639 guided and 7,632 unguided, each at the proven floor on 13 of 24 builds (12 for the guided reserve). The differences
are the time-bound passes' run-to-run noise. On 40 small seeded weeks with no budget (`eval/repair-small.out.txt`) open hours and
score are identical to main on all 40.

**What this says:** the repair is not where the 350-400 copy weeks lose hours. Even with time and a bound it closes about 9 of the
46 open hours (24-81) a start leaves above the floor, because a depth-first search over 50-80 shifts does not finish inside its node
cap. A neighbourhood solved by something other than depth-first search (the flow bound of `openHoursFloor` or the clique LP
restricted to the chosen people, then rounded) is the next thing to try; more of the same search, or a better choice of people,
is not.

Not claimed: generated weeks only, three starts or three search seeds each, one cloud machine.

## The repair's neighbourhood under a flow bound (2026-11-15 later)

"The clique LP picks the repair's people" ended on the next thing to try: solve the repair's neighbourhood with something other
than plain depth-first search, because even with time and a bound it closed only about 9 of the 46 open hours a start leaves above
the floor. Every round hit its node cap, so the question was where those nodes went.

**What landed** (`coverRepair`'s `bound: "flow"`, now the default; `coverRepairBound: "dfs"` on `buildRoster` keeps the old search):

- **A max-flow floor for each neighbourhood** (`neighbourhoodFloor`): `openHoursFloor`'s flow restricted to the free shifts and the
  chosen people, with everyone else fixed. A free shift reaches a chosen person's day only if that person may take it next to what
  they already hold; each day carries at most its longest rest-respecting chain and the daily cap less the hours already worked that
  day; each person at most the weekly hours they have left. Every rule only relaxes, so the floor never overstates.
- **Rounds that cannot win cost no search.** When the floor equals the neighbourhood's open hours, the round is skipped, and a
  skipped round does not count against the round limit (up to `skipRounds`, 4 x rounds). On the bench starts the floor skipped
  about two of every three three-person rounds: most random neighbourhoods are already as good as they can be.
- **The search stops at the floor**: once it finds an assignment whose open hours equal the floor, nothing below exists.
- **Dead shifts are counted at once.** Each chosen person keeps a row of the free shifts they may still take; when a person takes a
  shift the row is re-checked, and a shift no chosen person may still take is counted as open right away instead of when the search
  reaches it. Every hard rule only tightens as a list grows, so a closed shift never reopens below that node.

**Measured on the repair alone** (`node eval/repair-flow.mjs P S week startSeed`, `sh eval/repair-flow-run.sh`,
`eval/repair-flow.out.txt`): the same eight 80-100 person bench weeks and three fixed starts each as before (a guided plateau walk
of 400,000 steps from an empty roster), every repair from the same start:

| 24 starts | total open h | cut from the start | paired |
|---|---|---|---|
| depth-first, 3 people, 60 rounds (main) | 8,444 | 217 h | |
| **flow-bounded, 3 people, 60 rounds** | **8,177** | **484 h** | fewer open than depth-first on **24 of 24** (p = 1.2e-7) |
| depth-first, 5 people | 8,545 | 116 h | |
| flow-bounded, 5 people | 8,510 | 151 h | fewer on 11, more on 2 (p = 0.023) |
| depth-first, 3 people, 2 s of rounds | 8,127 | 534 h | |
| **flow-bounded, 3 people, 2 s of rounds** | **7,970** | **691 h** | fewer on 19, more on 3 (p = 0.0009) |
| flow-bounded, 5 people, 2 s | 8,290 | 371 h | more open than 3 people on 22 of 24 |

At the same node budget the flow-bounded repair takes about twice as long (798 ms against 398 ms a start), because it runs more
rounds that search. At the same wall-clock time, the fair test, it still closes 29% more hours. Three people stay the right
neighbourhood size: five fill the node cap sooner either way.

**End to end** (`sh eval/repair-flow-e2e.sh`, `eval/repair-flow-e2e.out.txt`; same eight weeks, search seeds 4-6, the default 20 s
budget, two builds at a time):

| 24 builds | open h in all | at the proven floor | paired |
|---|---|---|---|
| depth-first, no reserve (main) | 7,633 | 14 | |
| flow-bounded, no reserve (now) | 7,633 | 14 | fewer open on 1, more on 1 |
| depth-first, 2 s repair reserve | 7,629 | 13 | |
| flow-bounded, 2 s repair reserve | **7,613** | 13 | against depth-first with the reserve: fewer on 6, more on 2 (p = 0.29); 55 repair gains against 31 |

**What this says:** the neighbourhood was losing its nodes to rounds that could not win and to shifts that were already lost, and a
flow answers both cheaply. As a search on its own the repair is now about twice as strong. But posted rosters do not change at
the defaults, because the plateau walks use the 20 s budget and leave the repair about 0.2 s. With a 2 s reserve the flow-bounded
repair is ahead on 6 of 8 builds that differ, which is suggestive and not significant, so the reserve stays off by default.

Tests: `repair-flow.test.mjs` (over everyone on 60 tiny weeks the flow-bounded and depth-first repairs find the same least open
hours, so neither the dead-shift bound nor the stop prunes a better roster; the neighbourhood floor never exceeds an exhaustive
search of the same neighbourhood on 80 small weeks and equals it on at least half; the repair keeps every rule and never opens more;
`buildRoster` reports `floorSkipped` and `floorReached`). Not claimed: generated weeks only, three starts or three search seeds
each, one cloud machine. Next: whether a repair reserve pays at 20-60 people, or a flow floor per dead-shift node (a cheaper bound
inside the search than a full flow, which the measurements above did not need).

## The repair reserve at 30-60 people (2026-11-16)

"The repair's neighbourhood under a flow bound" ended on a question: does a time reserve for the flow-bounded repair pay at 20-60
people, where the plateau walks leave more of the 20 s budget than on the 350-400 copy weeks? **Measured first**
(`sh eval/repair-reserve-small.sh`, `eval/repair-reserve-small.out.txt`): twelve bench weeks, 30 x 84, 40 x 112, 50 x 140 and
60 x 168, weeks 0-2 each (121-245 copies), search seeds 4-6, no reserve against a 500 ms and a 2 s reserve, two builds at a time.
(20 x 56 weeks were left out: they prove in about a second, README "The exact check end to end".)

| 36 builds | open hours in all | at the proven floor | repair ran | repair gains |
|---|---|---|---|---|
| no reserve (the default) | 7,575 | 36 | 15 | 0 |
| 500 ms reserve | 7,575 | 36 | 15 | 0 |
| 2 s reserve | 7,575 | 36 | 15 | 0 |

**No: every build at this size already reaches its proven open-hours floor**, with or without a reserve, so there is nothing for
the repair to close. The reserve stays off by default, and the question stays where it was asked: the 350-400 copy weeks.

The same table showed a waste. On 15 of the 36 builds (40 x 112 week 2, 50 x 140 weeks 1 and 2, 60 x 168 weeks 0 and 2) the repair
still ran, for 0.04-1.8 s, on a roster whose open hours already equalled the floor the clique LP or the flow bound had proven. It
cannot cover more there; all it could do is trade to fewer open shifts at equal hours, and it found that on none of them.

**What landed:** the repair is skipped when the roster's open hours already equal a proven floor (`ctx.openFloor`), and
`optimality.coverRepair` then reports `{ skippedAtFloor: true }`. Only when the repair is on by default: `coverRepair: true`, a priced
`openShiftWeight` (CLI `--open-shift-hours`, where fewer open shifts is what was asked for) or `coverRepairAtFloor: true` runs it as
before.

| check (`eval/repair-at-floor.out.txt`) | result |
|---|---|
| the 15 bench builds above, rebuilt (`sh eval/repair-at-floor-bench.sh`) | same open hours on 15 of 15, skipped on all 15; 261.0 s to 241.4 s of build time, **1.31 s a build** back (up to 1.9 s on 40 x 112 week 2) |
| 60 small seeded weeks, no budget (`node eval/repair-at-floor-small.mjs`) | identical open hours, open shifts, score and pay on 60 of 60; skipped on 16 |

Tests: `repair-flow.test.mjs` (on 12 seeded weeks a skip happens only where the roster's open hours equal the reported floor, running
the repair anyway never covers more, and `coverRepair: true` always runs it; the tests that read the repair's own report pass
`coverRepairAtFloor: true`). Not claimed: generated weeks only, three search seeds each, one cloud machine with two builds at a
time; on the bench builds pay was not recorded, only open hours (the repair found nothing on any of them, so the roster it would
have handed back was the one it was given). Next: the 2 s reserve test belongs to the 350-400 copy weeks, where builds end above
the floor (README "The repair's neighbourhood under a flow bound": 6 of 8 differing builds ahead, p = 0.29); more seeds there would
settle it.

## The repair reserve on the biggest weeks (2026-11-16 later)

"The repair reserve at 30-60 people" left the 2 s reserve's question on the 350-400 copy weeks, where builds end above the floor:
seeds 4-6 had it ahead on 7 builds and behind on 3 (p = 0.34). **Measured in three steps** (`eval/repair-reserve-big.out.txt`,
`eval/repair-reserve-big-fresh.out.txt`; the flow-bounded repair, the default 20 s budget, two builds at a time):

| step | builds | 2 s reserve: fewer open / more / tied | net hours covered | sign test |
|---|---|---|---|---|
| the eight bench weeks, fresh seeds 7-12 (`sh eval/repair-reserve-big.sh`) | 48 | 10 / 5 / 33 | +11 | p = 0.30 |
| pooled with seeds 4-6 | 72 | 17 / 8 / 47 | +31 of 244 above the floors | p = 0.11 |
| no reserve run twice, the four above-floor weeks, seeds 7-12 (`sh eval/repair-reserve-big-noise.sh`) | 24 | second run against first: 1 / 1 / 22 | +1 | |
| **pre-registered** (`eval/repair-reserve-big-prereg.md`, written before the run): four above-floor weeks, fresh seeds 13-24 (`sh eval/repair-reserve-big-fresh.sh`) | 48 | **22 / 10 / 16** | **+34 of 305**; at the floor on 11 builds against 5 | **one-sided p = 0.025** |

The rerun matters: two runs of one configuration tied on 22 of 24 builds, so the builds are close to deterministic and the
reserve's wins and losses are its own, not timing noise. The pre-registered rule (fewer open hours on more builds, one-sided
sign test p < 0.05, a net gain, on the fresh seeds alone) was met. The 80 x 224 weeks (304 copies) mostly reach their floor either
way, and there the reserve changed nothing in seeds 7-12; build time did not grow (mean 22.3 s to 22.2 s on the fresh test).

**What landed:** under a time budget, `coverRepairReserveMs` now defaults to a tenth of the budget, at most 2 s, on weeks of 300 or
more shift copies, and to 0 below (where every bench build already reaches its floor, README "The repair reserve at 30-60
people"). An explicit `coverRepairReserveMs` (0 turns it off) wins; `optimality.coverRepairReserveMs` reports the reserve the build applies to its cover passes, set from the week's size and the
budget, so it reads the same whether or not a loaded machine reaches the passes (2026-11-25).

Tests: `repair-flow.test.mjs` adds that a 348-copy bench week under a 3 s budget reserves 300 ms, a 149-copy week reserves none,
and an explicit value is kept. Not claimed: generated weeks only, single runs on one cloud machine; the reserve's size (2 s) and
the 300-copy line were not tuned, only tested; the reserve still loses on about one differing build in three. Next: whether a
longer reserve (4 s) or a reserve scaled by the open hours above the floor does better on the same fresh seeds.

## A 4 s repair reserve: measured and refused (2026-11-16 later)

"The repair reserve on the biggest weeks" left one question: would a longer reserve (4 s) do better than the new 2 s default? On
the pre-registered seeds 13-24 the repair under the 2 s reserve ran only 0.5-1.2 s, so the guess was that the last plateau walk
ate most of the reserve and a bigger one would give the repair the time it was meant to have. **Pre-registered**
(`eval/repair-reserve-4s-prereg.md`, committed before the run): the same four above-floor weeks (90 x 252 and 100 x 280, weeks
0-1), fresh seeds 25-36, 48 paired builds, `flow2000` against `flow4000` (`sh eval/repair-reserve-4s.sh`,
`eval/repair-reserve-4s.out.txt`). The rule: raise the default only if 4 s has fewer open hours on more builds, one-sided sign
test p < 0.05, and a net gain.

| 48 fresh builds | open hours above the floors | at the floor | repair ms, mean | plateau walks ms, mean |
|---|---|---|---|---|
| 2 s reserve (the default) | **307** | 4 | 1,143 | about 2,900 |
| 4 s reserve | 371 | 3 | 1,208 | about 1,300 |

**Not met, by a wide margin:** 4 s had fewer open hours on 11 builds and more on 27 (10 tied), 64 hours worse in all (one-sided
p = 0.997). The guess was wrong about why the repair is short. It is not starved: given 4 s it still ran about 1.2 s, so it stops
on something other than the clock, and the two extra seconds come out of the plateau walks (which still find coverage on these
weeks) and go to stages after the repair that score pay, not open hours. The default stays at 2 s.

**What stops the repair.** Not its 60 rounds: with `coverRepairRounds: 180` and the 4 s reserve, the first four builds
(`eval/repair-reserve-rounds180.jsonl`) gave the same open hours, gains and skipped rounds as the 4 s run, build for build. That
leaves its node budget (`coverRepairNodes`, 3M nodes in all, chosen so the same input gives the same roster on any machine).

**More nodes do not rescue it (exploratory, the same 48 builds; `eval/repair-reserve-variants.out.txt`).** With the 4 s reserve
and `coverRepairNodes: 9000000` the repair ran 2.3 s instead of 1.2 s and found 342 improving rounds instead of 250 (141 under the
2 s default), recovering 17 of the 64 hours: still 47 h behind the default (fewer open on 14 builds, more on 22). Each repair
round does cut open hours, but a second of plateau walk covers more of them than a second of repair on these weeks. So the 2 s
default stands, and its gain came from giving the repair its first second, not from giving it more.

Not claimed: generated weeks only, one cloud machine; the 9M and 180-round runs were exploratory, not pre-registered. Next:
whether a reserve sized to what the repair uses (about 1.1-1.2 s at 3M nodes) beats 2 s on fresh seeds, pre-registered.


## A 1.2 s repair reserve: a tie, so 2 s stays (2026-11-16 later)

"A 4 s repair reserve: measured and refused" showed the repair stops on its 3M-node budget after about 1.1-1.2 s, so the question
left was the other side: would a reserve sized to what the repair uses (1.2 s) hand the unused ~0.8 s back to the plateau walks
and cover more? **Pre-registered** (`eval/repair-reserve-1200-prereg.md`, committed before the run): the same four above-floor
weeks (90 x 252 and 100 x 280, weeks 0-1), fresh seeds 37-48, 48 paired builds, `flow2000` against `flow1200`
(`sh eval/repair-reserve-1200.sh`, `eval/repair-reserve-1200.out.txt`). Same rule as before: change the default only on more
wins than losses, one-sided sign test p < 0.05, and a net gain.

| 48 fresh builds | open hours above the floors | at the floor | repair ms, mean | repair gains, total | cover-pass ms, mean |
|---|---|---|---|---|---|
| 2 s reserve (the default) | 294 | 4 | 1,171 | 148 | 3,156 |
| 1.2 s reserve | **288** | 5 | 914 | 110 | 3,861 |

**Not met:** 1.2 s had fewer open hours on 7 builds, more on 8, tied on 33; 6 hours ahead in all (one-sided p = 0.70). The
mechanism did what was guessed: the plateau walks got about 0.7 s more and the repair about 0.26 s less, with 38 fewer improving
rounds. The two roughly cancel. By week the net was -4, +3, +7 and 0 hours, so no week size favours either side.

So the reserve's size is closed on both sides as measured: 4 s lost (64 h worse on seeds 25-36), 1.2 s ties, and 2 s stays the
default from 300 copies. Its gain came from giving the repair its first second (README "The repair reserve on the biggest
weeks"), and anything from about 1 s to 2 s is the same within noise. Not claimed: generated weeks only, one cloud machine.

## A warm-sized gate for the pay floor (2026-11-16)

The pay floor (README "A pay floor for big weeks") has started from the open-hours LP's basis since 2026-11-14, but its time gate
was still the cold solve's: run with no deadline when the time left covers 4 s x (copies / 245)^4.5, otherwise try it warm and
stop at the budget's end. **Measured first** (`eval/warm-gate.mjs`, `eval/warm-gate.out.jsonl`: 78 generated weeks of 148-326
copies, the open-hours LP then the warm priced LP, one machine): the warm solve took 29 ms to 14.5 s, with no usable link to size
(median 0.6 s at 140-180 copies, 2.8 s at 215-255, 5.6 s at 255-300, each band spanning 0.03-5.6 s) or to the open-hours LP's own
time (ratio 0.04 to 6). It came in above the cold formula on 25 of 78 weeks, where the old gate let it run unbounded past the
budget, and far below it on most of the rest, where the old gate skipped it or cut it at the budget's end. No formula sizes it.

**What landed:** `scoreFloorPlan` (calc.mjs). With the open-hours basis in hand the pay floor always runs warm, stopped at the
time left plus a reserve of its own (`scoreFloorReserveMs`, default 1500 ms), like the day sweeps' 2 s. With no basis, or
`scoreFloorTry: false` / `scoreFloorWarm: false`, the cold formula alone decides as before; `scoreFloorReserveMs: 0` stops the try
at the budget's end. `optimality.scoreFloorTried` now also reports the time `left` and the `reserve`.

| 60 x 168 and 70 x 196, default 20 s budget (`eval/warm-gate-e2e.out.jsonl`, before = main's engine) | before | after |
|---|---|---|
| seed 2, 70 x 196 week 0 | pay floor out of time after 6.9 s; gap $23,272.35, rest $23,272.35 | finished in 7.7 s; **gap $16.90**, rest $23,269.28 |
| seed 3, 60 x 168 week 0 | out of time after 1.4 s; gap $121,847.52, rest $21,847.52 | finished in 3.0 s; **gap $99,989.64** (the pay now bounded to within $10.36; the one open hour left is the gap), rest $21,845.73 |
| seed 1 week 0, seed 2 week 1 (60 x 168) | skipped | tried, out of time after 2.2 and 2.7 s; same roster, 1.6-1.8 s longer |
| ten other weeks | ran, skipped (budget spent) or proven before it | same roster and gap; within 0.5 s |

So on 14 big weeks the pay floor finished on 2 more, both with a tighter proof and a slightly cheaper roster (its guide steers the
day sweeps), and two weeks paid up to 1.8 s for a try that did not finish. Total time stays about the budget plus the two
reserves (pay floor 1.5 s, day sweeps 2 s): at most 23.6 s here. Tests: `warm-score-floor.test.mjs` adds the plan's modes (try with the time left plus
the reserve, bounded even with lots of time left, the reserve alone when the budget is spent, reserve 0 as the old try, no
deadline without a budget, the cold formula without a basis). Not claimed: single runs on one cloud machine, generated weeks only;
the 1.5 s reserve was not tuned (1 s or 2 s may do as well). Next: whether a longer reserve finishes more weeks than it costs, and
carry the priced LP's basis into the day sweeps' guide.

## The pay floor's reserve, sized from the full solve (2026-11-16 later)

"A warm-sized gate for the pay floor" left its 1.5 s reserve untuned. Rather than race a few reserves against each other, this
run measured what every reserve would do at once. **Pre-registered** (`eval/pay-floor-reserve-prereg.md`, committed before the
run): 48 fresh weeks (seeds 6-17, 60 x 168 and 70 x 196, weeks 0-1, the generator of `eval/warm-gate-e2e.mjs`), each built twice
at the default 20 s budget (`sh eval/pay-floor-reserve.sh`): once with the pay floor given a reserve no build reaches, so it
reports its whole warm time T and the time left L at its start, and once with `scoreFloor: false`, which is exactly the path of a
try that runs out of time. A reserve R finishes the try iff T <= max(0, L) + R, so `eval/pay-floor-reserve-summary.py` scores
any R from the pair (`eval/pay-floor-reserve.out.txt`). The pay floor was tried on 19 of the 48 weeks; the rest were proven
earlier or had no basis, and are the same under any R.

| reserve | tries finished (of 19) | sum of gaps | pay, against 0.5 s | mean build | slowest build |
|---|---|---|---|---|---|
| 0.5 s | 12 | $21.73M | - | 21.14 s | 23.1 s |
| 1.5 s (the old default) | 13 | $21.81M | one open hour more (search noise, below) | 21.26 s | 24.1 s |
| 3 s | 15 | $21.69M | $44 less | 21.42 s | 25.6 s |
| 4 s | 18 | $21.62M | $64 less | 21.49 s | 26.3 s |
| **6 s** | **19** | **$21.60M** | **$75 less** | **21.51 s** | **27.5 s** |
| 8 s | 19 | $21.60M | $75 less | 21.51 s | 27.5 s |

(Gaps are in score units, where an open hour is 100,000, so the sums are dominated by open hours the floor cannot close; per
week the change is the point: a finished try took the 70-person weeks' gaps from $22,530-$27,131 to $5-$18.)

The warm solve needed up to 5.4 s past the time left (T 1.1-12.1 s); six of the 19 weeks needed more than 1.5 s and at most 6 s.
The rule (raise only to a reserve finishing at least 3 more builds for at most 0.5 s more mean build time; the most finished,
ties to the smaller) picked **6 s**: 6 more finished tries for 0.25 s of mean build time. The cost is the tail: the slowest
build went from 24.1 to 27.5 s on a 20 s budget.

**Checked with the new default itself** (`sh eval/pay-floor-reserve-confirm.sh`, `eval/pay-floor-reserve-confirm.jsonl`): the six
weeks, new default against an explicit 1.5 s. Five finished, as predicted: gaps $23,613 to $6.98 and $24,278 to $15.52 on the
70-person weeks, $118,547-$120,385 to about $99,990 (one open hour left) on two 60-person weeks, and one week (seed 17) covered
one more hour; pay $0.61-$17.75 lower on four. The sixth (seed 9) never tried: that build's earlier stages ran past the budget,
and `buildRoster` skips the pay floor once the budget is spent (`!over()`), whatever the reserve. Mean build time +0.9 s on these
six, the slowest 25.5 s.

**What landed:** `scoreFloorReserveMs` now defaults to 30% of the time budget, at most 6 s: 6 s at the 20 s default for big
weeks, which is what was tested; a caller with a 3 s budget waits at most 0.9 s more, not 6. An explicit value wins.
`warm-score-floor.test.mjs` checks the scaled default, the 6 s cap and an explicit 1.5 s.

Not claimed: generated weeks, one cloud machine; the two builds of a week are separate runs, so their rosters before the pay
floor can differ by timing (the +1 and -1 open hours on seeds 16 and 17 in the summary are that, not the pay floor); the 30%
scaling below a 20 s budget was not measured. Next: the budget-spent case. The plan gives a try with the budget already spent
"the reserve alone", but `buildRoster` never reaches it (seed 9 above); whether letting it run then finishes enough weeks to pay
for the wait, measured the same way.

## The pay floor once the budget is spent (2026-11-16 later)

"The pay floor's reserve, sized from the full solve" ended on one case its reserve could not reach: when the stages before the pay
floor run past the 20 s time budget, `buildRoster` skipped it (`!over()`), so a big week was posted with a gap of $20,000-$900,000
in score units where a second or two of warm LP would have bounded it to within dollars or whole open hours. That run took the case
to be rare (one week, seed 9). It is not: a new field, `optimality.scoreFloorSkip`, now names why the pay floor did not run
("noClique", "proven", "off", "spent", "noBasis", or null when it ran), and on fresh weeks about one in five ended "spent", almost
all of them 70-person weeks whose earlier stages ran 6-680 ms over.

**Two pre-registered tests.** Both build each week twice at the default 20 s budget (`eval/pay-floor-spent.mjs`): "full" (try when
spent, with a reserve no build reaches, so it reports the warm solve's whole time T) and "base" (the old skip). On a spent week a
reserve R finishes iff T <= R; `eval/pay-floor-spent-summary.py` scores any R from the pair.

| | spent weeks of 48 | finished at 4 s | finished at 6 s | mean build, base -> 4 s / 6 s | open hours, all 48 |
|---|---|---|---|---|---|
| seeds 18-29 (`eval/pay-floor-spent-prereg.md`, `.out.txt`) | 10 | 9 | 9 | 20.82 -> 21.30 / **21.34 s** | 11,912 -> 11,904 |
| seeds 30-41, fresh (`eval/pay-floor-spent-4s-prereg.md`, `-4s.out.txt`) | 10 | **8** | 9 | 20.83 -> **21.14** / 21.18 s | 12,142 -> 12,142 |

The first test's rule (turn it on at the normal 6 s reserve if it finishes half the spent weeks for at most +0.5 s of mean build
time) **failed by 0.02 s** (+0.52 s). Its table showed 4 s finishing the same 9 for +0.48 s, but picking 4 s from that table would
be fitting to it, so a second rule for a 4 s reserve of its own was written down and tested on twelve seeds no pay-floor test had
used. It passed every clause: 8 of 10 finished, +0.31 s mean, open hours not higher. The first test's -8 open hours are mostly the
two builds' timing noise (seed 19 and 22 went +1), so no open-hours gain is claimed.

What a finished try does: the pay gap on the week goes from $23,865-$25,215 to under $1 (seed 30 week 1, seed 31 week 0), or from
$124,000-$126,000 to about $99,980, which is one open hour left and the pay bounded to within about $20 (four weeks). The roster is
the same or a few dollars cheaper, because the priced LP then guides the day sweeps.

**What landed:** the pay floor now tries once the budget is spent, warm, for a reserve of its own, `scoreFloorSpentReserveMs`
(default the smaller of 4 s and the normal reserve; a caller with a 3 s budget waits at most 0.9 s). `scoreFloorSpent: false`
keeps the old skip. With time left the normal reserve (30% of the budget, at most 6 s) is unchanged.

**Checked with the default itself** (`sh eval/pay-floor-spent-confirm.sh`, `eval/pay-floor-spent-confirm.jsonl`, the ten fresh
spent weeks, default against `scoreFloorSpent: false`): 9 of 10 finished (one more than predicted: seed 36's solve took 3.9 s this
time against 4.1 s), same open hours on nine and one fewer on seed 40, mean build 22.21 -> 23.86 s on those weeks (+0.34 s spread
over all 48), slowest 26.3 s. Tests: `warm-score-floor.test.mjs` checks the spent reserve (4 s, an explicit value, capped by the
normal reserve), the skip reasons and `scoreFloorSpent: false`.

Not claimed: generated weeks, one cloud machine; the spent weeks are almost all 70 x 196, so 80-100 person weeks are untested here.
Next: why the stages before the pay floor run past the budget at all (6-680 ms on these weeks), which is time no reserve should
need to cover.

## Where the time past the budget goes (2026-11-16 later)

"The pay floor once the budget is spent" ended on a question: why do the stages before the pay floor run past the 20 s time
budget at all? A new field answers it for any build: `timeline`, each stage's end in order, in ms since the build started
(beside the summed `timings`).

**Measured first** (`eval/stage-overrun.mjs`, `eval/stage-overrun.jsonl`: seeds 18-29, 60 x 168 and 70 x 196, weeks 0-1, the
generator of the pay-floor tests). 27 of 48 builds reached the pay floor with the budget spent. On 17 the stage that crossed it was
the cover walk (88-729 ms over), on 9 the cover repair (41-126 ms over). The walk read the clock only between walks, and one walk
on these weeks is 3.1M steps, most of a second. So a walk started at 19.4 s finished at 20.2 s, and the repair after it was skipped
anyway.

**What landed:** `coverPass` takes a `deadline`, read every 1,024 steps, and returns its best roster so far when it passes;
`buildRoster` gives each walk the budget's end (less the repair reserve after the first walk, so the reserve on 300+ copy weeks
is kept). `coverPassDeadline: false` keeps the old between-walks check alone.

**Pre-registered** (`eval/stage-overrun-prereg.md`, committed before the run): seeds 42-53, the same four weeks, each built twice,
new and `coverPassDeadline: false` (`sh eval/stage-overrun-ab.sh`, scored by `eval/stage-overrun-summary.py`,
`eval/stage-overrun-ab.out.txt`).

| 48 fresh weeks | old | new |
|---|---|---|
| reached the pay floor more than 50 ms past the budget | 15 (52-770 ms) | **5** (65-249 ms) |
| open hours, all 48 | 11,180 | 11,180 (two weeks -1, one +2: the builds' timing noise) |
| mean build / slowest | 22.18 s / 28.1 s | 22.17 s / 28.1 s |
| proven | 5 | 5 |

All three clauses passed (late builds at least halved, open hours not more than 2 higher, mean build time not higher), so it is
on by default. The walk now ends at 20,001 ms when it is the stage that reaches the budget. The five builds still late are all
the cover repair, which starts with whatever is left and gets at least 200 ms (`Math.max(200, ...)` on its time limit), then
polishes pay. Tests: `stage-overrun.test.mjs` (the timeline's order and total, a walk past its deadline stops at once and is no
worse than its start, an infinite deadline changes nothing).

Not claimed: generated weeks, one cloud machine, two builds at a time; no gain in open hours or pay is claimed, only that the
walk no longer eats the pay floor's time. Next: the repair's 200 ms minimum when it starts within 200 ms of the budget's end.

## The repair stops at the budget's end (2026-11-16 later)

"Where the time past the budget goes" left five of 48 fresh builds reaching the pay floor 65-249 ms past the 20 s budget, all
of them crossed by the cover repair. Read from the timelines, the 200 ms minimum explained only one (it started at 19,985 ms);
the other four started 0.6-1.5 s before the end and still ran over, because the repair read the clock only between rounds
and one round may search 200,000 nodes.

**What landed:** `coverRepair` takes a `deadline` (the budget's end), read every 1,024 nodes inside a round as well as between
rounds. A round stopped by it keeps the best assignment it had found, which already beats the round's start, so stopping never
makes the roster worse. Under a budget the 200 ms minimum is gone. The report's repair stats gain `stoppedAtDeadline`.
`coverRepairDeadline: false` gives back the old limit.

**Pre-registered** (`eval/repair-deadline-prereg.md`, committed before the run): seeds 54-65, 60 x 168 and 70 x 196, weeks
0-1, each built twice, new and `coverRepairDeadline: false` (`sh eval/repair-deadline-ab.sh`, scored by
`eval/repair-deadline-summary.py`, `eval/repair-deadline-ab.out.txt`).

| 48 fresh weeks | old | new |
|---|---|---|
| reached the pay floor more than 50 ms past the budget, repair crossing it | 6 (57-245 ms) | **0** |
| latest arrival at the pay floor | 20,245 ms | 20,048 ms |
| repair ran / gains / stopped at the deadline | 13 / 12 / 0 | 10 / 13 / 5 |
| open hours, all 48 | 12,489 | 12,489 (no week moved) |
| mean build / slowest | 21.28 s / 28.1 s | 21.28 s / 28.2 s |
| proven | 7 | 7 |

All three clauses passed, so it is on by default. The 22-48 ms still past the budget on six "new" builds is the pay polish
that follows a repair gain, which is not timed. Tests: `stage-overrun.test.mjs` (a repair past its deadline returns its start
untouched at once; a repair stopped mid-search keeps a valid roster no worse than its start, with its reported open hours
matching; an infinite deadline changes nothing).

Not claimed: generated weeks, one cloud machine, two builds at a time; no gain in open hours or pay, only that the repair no
longer eats the pay floor's time. Next: time-bound the pay polish after a repair gain, or leave it (under 50 ms here).

## The pay polish stops at the budget's end (2026-11-16 later)

"The repair stops at the budget's end" left seven of 48 fresh builds reaching the pay floor 22-48 ms past the 20 s budget.
On each the cover walk or the repair had stopped on time, but then found a gain, and the pay polish that follows any gain
(`polishPay`, max(20,000, copies x 1,000) single moves and swaps) was untimed. Timed alone on 60-70 person weeks (230-267
copies) one polish takes 28-47 ms.

**What landed:** `polishPay` takes a `deadline`, read every 1,024 moves; past it the polish returns what it has. Every move it
kept lowered the score and left no covered shift open, so stopping early never adds open hours. Under a time budget the polish
after a cover walk gets that walk's deadline, and the polish after a repair gain the budget's end. `payPolishDeadline: false`
keeps the untimed polish.

**Pre-registered** (`eval/polish-deadline-prereg.md`, committed before the run): seeds 66-77, 60 x 168 and 70 x 196, weeks
0-1, each built twice, new and `payPolishDeadline: false` (`sh eval/polish-deadline-ab.sh`, scored by
`eval/polish-deadline-summary.py`, `eval/polish-deadline-ab.out.txt`).

| 48 fresh weeks | old | new |
|---|---|---|
| reached the pay floor more than 20 ms past the budget | 8 (25-44 ms; 7 after a repair gain, 1 after a walk) | **0** |
| latest arrival at the pay floor | 20,044 ms | 20,002 ms |
| open hours, all 48 | 11,818 | 11,815 (three weeks -1: timing noise, not claimed) |
| final pay on the 45 weeks with equal open hours | 1,030,595.21 | 1,030,592.06 (lower on 1 week, higher on none) |
| mean build / slowest | 22.04 s / 28.1 s | 22.01 s / 28.1 s |
| proven | 4 | 5 |

All four clauses passed (late builds at least halved, open hours not more than 2 higher, pay not more than 0.1% higher, mean
build time not higher), so it is on by default. With this, every stage before the pay floor stops on the clock: the walk, the
repair and the polish after each. Tests: `stage-overrun.test.mjs` (a polish past its deadline stops within 1,024 moves with a
valid roster no worse than its start; an infinite deadline changes nothing).

Not claimed: generated weeks, one cloud machine, two builds at a time; the open-hours, pay and proof differences are within the
builds' timing noise. What it buys is the 25-44 ms the pay floor no longer loses, nothing larger.

## The day sweeps past a spent budget (2026-11-17)

With every stage before the pay floor stopping on the clock, the time a 20 s build still runs past its budget is nearly all
two stages, read from the 48 "new" timelines of `eval/polish-deadline-ab.jsonl`: the pay floor (63 s summed, its 4 s spent
reserve, kept on purpose) and the day sweeps (`dayLNS`, 67 s summed: 2.0 s on every build that ran them, whatever the clock
said). Mean build 22.0 s, slowest 28.1 s. Were the day sweeps' 2 s worth it on weeks whose budget was already gone?

**What landed:** `optimality.dayLNS` now logs where the pass gains: `gains` (each as [ms since the pass started, phase
"sweep" / "guide" / "guide2" / "kick", score saved]), `startedAt` (ms since the build started) and `ladders` (guide ladders
run). `eval/stage-overrun.mjs` prints them; `eval/day-lns-spent-summary.py` adds them up by phase and by window length.

**Measured** (`eval/day-lns-spent-explore.jsonl`: seeds 66-71, 60 x 168 and 70 x 196, weeks 0-1, today's defaults; the pass ran
on 23 of 24, starting past the budget on 9):

| what the 2 s window found, 23 builds | score saved (100,000 = one open hour) | open hours |
|---|---|---|
| first exact sweeps (by 15-55 ms) | 340 (pay alone) | 0 |
| LP-guided ladder (by 400 ms) | 900,150 | 9 |
| random kicks (250-1,870 ms) | 199,995 | 2 (at 866 ms and 1,155 ms) |
| **kept by a 500 ms window** | 82% of the score saved | 9 of 11 |
| kept by a 1,000 ms window | 91% | 10 of 11 |

So the window stays at 2 s: a shorter one would have given back cover on 2 of 23 builds (one open hour each, both on 70 x 196
weeks guided by the open-hours LP because the pay floor did not finish), and an open hour is worth more than the 1.5 s.

**Tried and dropped: repeating the guide ladder.** The ladder found most of the cover, so `dayGuideRepeat: true` runs it again
from the improved roster (up to 8 ladders) while the last one saved at least half an open hour, before the kicks. The builds are
deterministic up to the pass (all 24 entered it at the same score both ways), so the comparison is exact
(`eval/day-lns-repeat-explore.jsonl`): the second ladder found nothing on any build, and open hours were 6,064 both ways. It
stays off; the option is kept so the result can be re-run.

Tests: `day-lns.test.mjs` (the gains are in time order, positive, one of the four phases, and add up to what the pass saved,
with and without repeated ladders; the ladder count is within its cap). Not claimed: generated weeks, one cloud machine, two
builds at a time, an exploration set rather than a pre-registered one (no default moved, so none was needed); 2 of 11 open
hours is a small count.

## The open-hours row before the dual branch (2026-11-18)

When the exact search's priced floor on open hours already equals the best roster's open hours, nothing later in the search can
raise it: the cover branch, the cover LP and the coverage pass all need a floor below the roster's hours. So the open-hours row
(the whole-score LP with that floor as a row, "The open-hours row in the score LP") now runs before the dual branch, with the same
arguments it would get afterwards. If it proves the roster, the dual branch, which can run up to `dualBranchMs` (8 s), is skipped.
If it doesn't, its answer is kept and the dual branch runs as before. On the call-out week with Cleo off Saturday and
`earlyFloor: false`, the dual branch ran its full 8 s and proved nothing, and the row then proved the week in 0.1 s. That
`buildRoster` call went from 19.4 s to 11.0 s, with the same roster, score, status and bounds as the old order
(`rowBeforeDual: false`). `optimality.openRow.beforeDual` says when this happened. With default options, weeks this small
usually get the early floor first, so most real weeks are unchanged.
Details: `docs/history/ci-perf-2026-11-18-shift-roster-row-before-dual.md`. Test: `open-sums.test.mjs`.

**Checkout moved to Paddle (2026-11-25).** The pack's Buy button now opens Paddle's overlay checkout, and its licence key is an Ed25519-signed token a separate billing Worker issues from Paddle's webhook and the page checks offline (`paddle.mjs`, a synced copy of `platform/billing/client.mjs`; `checkout.mjs` is generated from `platform/billing/catalogue.mjs`). The old Lemon Squeezy validate call is gone. It stays dark until the owner deploys that Worker and sets the catalogue's price id, client-side token and public key (`platform/billing/README.md`).

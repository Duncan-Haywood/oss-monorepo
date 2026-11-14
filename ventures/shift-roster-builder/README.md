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

## Run your own team schedule (self-hosted)

The browser tool builds the roster; `server.mjs` is the part that gets it to your staff. You build and publish the
week, and your team opens **one link** to see their shifts, add them to their calendar (`.ics`) and send you their
availability, which you merge into the staff list in one click. No accounts, no per-seat price, no third party:
zero dependencies, one JSON file on a disk you own.

- **Alternatives today:** When I Work, Deputy, Homebase and 7shifts charge per user per month and hold your staff
  data. This is the same publish-and-notify loop for a single small team, on your own server, MIT-licensed. It does
  not do time clocks, payroll, push notifications; if you need those, use one of them.
- **Secrets:** `ADMIN_KEY` unlocks `/admin?key=...` (edit, build, publish, merge). `TEAM_TOKEN` is the secret in the
  staff link `/team?t=...`. The server refuses to serve without both. Wages, hour caps and payroll never appear on the
  staff page (tested). Put it behind HTTPS (Fly and Render do); the key is in the URL, so do not share admin links.
- **Run:** `ADMIN_KEY=a TEAM_TOKEN=b STATE=./state.json node server.mjs`, or one of:
  `docker compose up -d` (`docker-compose.yml`), Fly (`fly.toml`), or Render
  (`render.yaml`, deploy from your fork; it generates both secrets). Nothing runs on the author's accounts.
- **On the phone:** the staff page is an installable web app (manifest + a small service worker, `server.mjs`). "Add to home screen" opens it full-screen like an app, and the last schedule the phone saw stays readable with no signal. Only the schedule page is cached; forms are never replayed offline. No app-store account, no push notifications.
- **Labor budget from a script (2026-11-08):** `node cli.mjs --budget 2400 staff.txt shifts.txt` compares payroll with a weekly dollar budget and, when over, lists the drops (from `trimOptions`) that close the gap, safe ones first; tested in `cli.test.mjs` on a hand-built week and the sample week.
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
- **Command line:** `cli.mjs` builds the same roster from a staff file and a shifts file with no browser and no network, for owners and bookkeepers who keep the week in text files and want a Sunday cron or a script: `node cli.mjs staff.txt shifts.txt`, `--last-week roster.csv` to carry end times over Monday, `--csv`, `--hours`, `--json`, `--ics` (with `--week-start`, and `--person` for one person's calendar), `--messages` (a paste-ready text per person), `--open-post` (a group message listing the shifts left open and who could take each), and `--check` (exit 1 if any shift stays open), `--prove` (below), and `--weeks 4 --week-start 2026-11-02` (a month in one run: rest gaps and the tough-shift tally carry week to week, dated `off:` entries land in their week, and the report ends with each person's weekend/closing/opening shifts added up; `--tough-balance 0-100`, `--csv` adds a week column, `--json`, `--check`; `planWeeks`, `planFairness` in `calc.mjs`). `--changes posted.csv --week-start 2026-11-02 --changed-at "2026-11-01 12:00"` (2026-10-27) compares the roster you posted with the new build and lists every shift added, cancelled or moved, with its notice and the premium on your own `--notice-hours` (default 336), `--premium-hours` (default 1) and `--exempt "Ben,Cleo"`, the same `scheduleChanges` as the page's changes report; tested on the sample week, not on a real payroll or any ordinance. `--cancel-hours 0.5` and `--premium-flat 10` (2026-11-04) change how `--changes` prices a short-notice change: a cancelled shift at its own hours of pay (some rules charge a cancellation at a fraction), or a fixed dollar amount per change whatever the wage (`scheduleChanges` options `cancelHours`, `flat`; `flat` also takes `{added, moved, cancelled}`); you type the numbers, no ordinance is preset or checked, tested on hand-built rosters. `--rest-under 11` (2026-11-04) lists every pair of one person's shifts with less than that many hours between them (a close then an open) and the premium on your own `--premium-hours` (default 1 hour of pay) and `--exempt` names, from `restPremium` in `calc.mjs`; inside one week, or with `--last-week roster.csv` (2026-11-04) also last Sunday night to Monday morning (listed as "Sun (last week)"; last week's own pairs are not repeated; the build already honours `--rest` across that boundary, so this mostly shows what `--rest 0` or a hand edit would owe), tested on hand-built rosters, no jurisdiction preset and no claim about any ordinance. `--sales "1200,900,..."` (2026-11-05) prints each day's labor cost as a share of seven daily sales figures (Monday first), flags days over `--labor-target <%>` and days whose hours differ from what `--splh <$>` calls for, from the page's `dailyLabor` and `salesPerLaborHour`; tested on hand-built weeks, sales are typed in, nothing is forecast. `--hours-watch 30` (2026-11-04) lists everyone whose planned week reaches that many hours, or lands within `--watch-within` hours (default 2) under it, for an owner watching a full-time or benefit line they typed; one week only, tested on hand-built weeks, no rule preset and no claim about any benefit or employer-mandate law. `--tips 200` (2026-11-05) splits a tip pot over the planned hours in whole cents that add back to the pot, and `--short-under 4` lists every assigned shift shorter than that, the page's `tipPool` and `shortShifts`; tested on the sample week, who may share a pool is the employer's call. `--long-over 10` (2026-11-06) lists every assigned shift longer than that many hours (`longShifts`; a shift of exactly that length is not listed, report only, tested on a hand-built week, no rule preset). `--days-off 2` (2026-11-05) lists everyone with no run of that many days off in a row in the Monday-to-Sunday week (`daysOffRuns`; a day counts on the day a shift starts, the week is not wrapped, report only; tested on a hand-built week). `--import-staff export.csv` (2026-10-30) turns a staff export from another scheduler (name or first + last, hourly rate, max and min hours, position; inactive rows skipped) into this tool's staff lines, availability set to `any`; the page has the same file box (`importStaffCsv`, `import-staff.mjs`). Column names are matched by synonym and were written from memory: tested on invented layouts, not on a real 7shifts, When I Work or Homebase export (wanted: one). `--import-shifts schedule.csv` (2026-10-30) does the same for the shifts: a published-schedule export (date or datetime, start, end, position; one row per scheduled shift) becomes shift-requirement lines, counted per weekday, time and position, the busiest week when the file spans several; the page has a second file box (`importShiftsCsv`, `import-shifts.mjs`). A published schedule shows who was scheduled, not who was needed. Since 2026-11-13 it reads two real exports, a Deputy timesheet export with the rostered shift beside the worked one and a retail workforce-management week with first-published and final shifts side by side (`--use schedule|final|initial|timesheet|plain` picks the version, `--location <name>` one site of several; section "Two real schedule exports" below); 7shifts and When I Work are read from their APIs instead (`--import-7shifts`, `--fetch-7shifts`, section "Reading 7shifts directly"; `--import-wheniwork`, `--fetch-wheniwork`, section "Reading When I Work directly"); Homebase layouts are still from memory. `--weeks` also reports anyone who works more than six days in a row across a week boundary (`planStreaks`, 2026-10-30; the per-week seven-day flag cannot see Wed to the next Tue; report only, not limited by the search, tested on hand-built plans). `node cli.mjs --example` runs an invented week. Zero dependencies; names and wages never leave the machine (the only network calls are `--fetch-7shifts` and `--fetch-wheniwork`, each to your own account with your own token).

- **How close to optimal (exact check):** the roster comes from a seeded simulated-annealing search, which is fast but can miss the best answer. The exact check runs by itself on every week since 2026-11-12 (it was weeks of up to 14 shifts before; see "The exact check on by default, every size" below; `--no-prove`, `exact: false` or "Off" turns it off): with `exact: true` or the default, a branch-and-bound solver searches every assignment of people to shifts, cutting branches that break a hard rule or cannot beat the annealed score (`exactSearch` in `calc.mjs`). If it finishes inside its limits (400,000 nodes, 8 s) the answer is the proven best and the report says so, or says how far off the annealed roster was; if it does not finish it keeps the best roster it found and says the result is not proven. On the built-in sample week (7 people, 32 shifts) the default anneal leaves 19 hours open and the exact search finds a roster with 15 open; it does not finish the cheapest-roster proof there, so the result is shown as a better roster, not a proven one. What it does prove on that week is the coverage: a max-flow / min-cost-flow bound over shifts, person-days and weekly hours (whole shifts only, no two overlapping or breaking the rest rule on one day) shows 15 hours cannot be covered however the week is arranged, which puts the root bound within about $70 of the roster found (it was 79% below, because the old bound counted only total hours) and the report says so. In 40 random 3-5 person, 10-shift weeks (a deliberately weak 3,000-iteration anneal) the exact search proved 16 anneals optimal, improved 15, and ran out of limits on 9. Tested against brute force with overtime, balance, tough-shift, prefer and avoid terms on. **Interchangeable people (symmetry cuts).** People who differ only by name (same wage, limits, availability, preferences and history) are tried once per distinct set of shifts held, so a crew of equal part-timers is not searched in every mirrored order. Measured on equal 15/h, 40 h, any-time crews: 5 people, 8 shifts 132,172 -> 1,160 nodes (2.9 s -> 0.1 s); 4 people, 10 shifts 278,722 -> 11,634 nodes (5.5 s -> 0.4 s); 6 and 8 people on 10 shifts went from not proven at the 8 s limit to proven in 0.4 s and 0.3 s. It does nothing for a crew of all-different people, so the 7-person sample week is still not proven (`exactSearch`; test in `calc.test.mjs`). **Cheap bound first.** Each node builds a flow graph for the coverage bound; now the bound from total weekly capacity alone is checked first and the flow is skipped when that already cuts the branch. On the sample week the same 8 s search visits 220,160 nodes instead of 137,216 (1.6x), and the result is unchanged (still not proven; 15 uncoverable hours, within $69 of the roster found). 129 tests pass, including the brute-force comparisons. **Where the last $69 sits (measured 2026-10-20).** Raising the limits to 6M nodes / 150 s on the sample week visits 3.36M nodes and still does not prove it, so more search is not the way. The best roster's pay is $3,690, exactly the root bound's pay; the other $68.95 of its $3,758.95 score is the hours-balance term (every person's hours are held near a target, and whole shifts and availability stop the targets being met together). The bound minimises each person's balance term alone, so the next gain is a bound that couples people through the fixed total of covered hours, not more dominance cuts. **Balance coupled through covered hours (2026-10-21).** That bound is now in (`coupledHours` in `exactSearch`): the covered hours are fixed in total (the coverage flow says how many), so the people cannot all sit at their own best hours; a Lagrangian price on hours (any price is a valid bound, the best is found by ternary search) charges the squeeze. On the sample week the root gap fell from $68.95 to $55.81 of a $3,758.95 score. On 30 seeded random 3-5 person, 9-11 shift weeks the same 300,000-node limit proves 27 against 26 before, with 1.90M nodes in all against 2.04M (7% fewer). A modest gain: the rest of the gap is whole shifts and availability, which a bound on hours alone cannot see. The sample week is still not proven. **Whole-shift hours bound, tried and dropped (2026-10-21).** Replacing each person's balance minimum over any hours in [now, now + what could still be added] with the minimum over hours they can actually reach (a quarter-hour subset-sum of the undecided shifts that each still fit them) left the sample-week root gap at $55.81 and cut nodes only about 5% on 30 seeded random weeks (5,973 -> 6,126 nodes in the 13-15 shift set, 5,218 against 5,510 with 7-9 hour shifts and balance 80; every case was already proven either way), at the price of a subset-sum per person per node. Whole shifts are not where the gap is; it is who can work when, so the next bound has to couple availability with the balance targets (for example a flow with convex per-person hour costs), not hour sums. **Hours terms inside the coverage flow (2026-10-21).** That bound is now in. Each person's edge into the sink carries the convex hours curve (shortfall below the minimum plus the balance term) as 8 tangent lines, cheapest stretch first, so the min-cost flow prices who can work when together with each person's hours target (a max of tangents lies under the curve, so it is still a lower bound). Sample week root gap: $55.81 -> $0.10 of a $3,758.95 score (`node eval/bound-bench.mjs`; `flowBalance: false` gives the old bound back). On 30 seeded random 4-6 person, 12-14 shift weeks at a 100,000-node limit: proven 27 -> 28, nodes 486,892 -> 459,146. The sample week is still not proven inside 8 s (68,608 nodes): the bound is now tight at the root, and what remains is a tree that is deep because fifteen hours of shifts must stay open and every way of choosing which ones is a branch. **Stop at a stated tolerance (2026-10-22).** The remaining $0.10 was the tangent lines' slack, and the search kept exploring branches that could win by less than that (478,208 nodes in 60 s, never proven). The search now cuts a branch whose bound is within `exactTolerance` of the best (default $0.50 of score, 0 gives the strict proof back; the report says "to within $0.50 of score"). The sample week is proven in 2,545 nodes, about 0.5 s, with 15 hours forced open; before, not proven in 60 s. The 28 of 30 random weeks and the brute-force comparisons are unchanged (`node eval/bound-bench.mjs`; test in `calc.test.mjs`). Only the sample week's seed and the 30 random weeks were tried. **Coverage first (2026-10-22).** Before the cost search, a pass counts only the hours left open (no pay, no balance): the same branch and bound with the coverage flow as its bound, given the same node limit and half the time. If it finishes, the least open hours are proven, and the cost search uses that as a floor (open hours >= proven minimum minus those already open), because cost bounds are weak against whole open hours worth BIG each. On the 30 seeded random weeks at 100,000 nodes: proven 28 -> 29 of 30 (`node eval/bound-bench.mjs`); the two that failed before (cases 4 and 10) needed 128,006 and 29,893 coverage nodes, so case 4 still needs a limit above 100,000. Run at 3M nodes, all three previously unproven weeks (4, 10, 27) prove in under 12 s. A week the pass cannot finish is searched as before; the pass can cost up to the node limit again. Only these seeded weeks were tried; a result of `coverOpen` in the optimality object reports the proven minimum. **Coverage pass gets twice the node limit (2026-10-22).** Its nodes carry no cost terms, so `exactSearch` lets it run to 2 x `exactNodes` (time still half the limit). On the 30 seeded random weeks at 100,000 nodes: proven 29 -> 30 of 30 (case 4 needs 128,006 coverage nodes; 434,057 nodes in all, 17 s; `node eval/bound-bench.mjs`). Branch-order changes in the coverage pass (no cost sort; fewest-hours-first) were tried and left case 4 at 100,001 nodes, so they were dropped. Same 30 weeks only; a harder week still needs more nodes.

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
Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.

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
call-out exposure by 8 h. **Played through whole weeks of call-outs it is a trade, not a win** (the same seeded weeks as the
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

# Time-Off Request Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/time-off-request-planner/>

A free browser tool for small teams (cafés, restaurants, clinics, shops, salons, small offices): **paste your people with
roles and the vacation requests you have, set the minimum on duty per role, and get the set of requests to approve that
never drops a role below its minimum, with the reason and the nearest alternative dates for every request it cannot
approve**. Nothing is uploaded.

After using this, you can now **settle a summer of competing vacation requests in one pass instead of one email at a time,
see what first come, first served would have cost you, and tell each person who is turned down which day clashes and which
dates would work**.

## Model

- People: `name, role`. Requests: `name, first day off, last day off, priority 1-5 (optional, default 3)`.
- Minimums: `role, number on duty`. A role with N people and minimum M can have at most N - M off on any working day.
- Options: working days (default Mon-Fri; days nobody works never use cover), cap on people off per day, blackout dates,
  maximise requests approved or days off granted.
- Hard rules, never broken: role minimums, daily cap, blackouts, one person never off twice on a day.
- Objective: maximise priority-weighted requests (or days); ties favour more approvals, then the request listed first.
- Search: exact branch and bound from the first-come, first-served answer, pruned by the best possible remaining weight.
  Tests compare it with a brute-force search of every subset on random problems. Deterministic.
- Reports: decision per request with the first clashing day and who is already off, nearest same-length window that fits,
  comparison with first come first served, a day-by-day cover calendar, CSV exports.

## Limits

Not modelled: statutory or contractual leave rights, notice periods, balances and carry-over, sick leave, shift patterns
inside a day, people who cover two roles. Verified only against exhaustive search and invented data. Not legal, tax, or
financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.

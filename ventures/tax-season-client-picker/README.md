# Tax Season Client Picker

Taking late-season clients as they call, or the biggest fee first, fills an independent preparer's last weeks with the
wrong returns. Paste the queue of engagements on offer (fee, hours of work, the business day each is due by, direct cost)
and get the exact set with the highest total net that can still be finished by the filing or extension deadlines, the
order to work them, the fee at which each declined client would earn a place, and what first-come, biggest-fee and
best-per-hour acceptance leave behind. Browser page or zero-dependency CLI. For tax preparers, enrolled agents,
bookkeepers and other solo practitioners paid per engagement.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tax-season-client-picker/

```
node cli.mjs plan clients.csv --hours-per-day 6 --booked 4 --booked-due 2 --json
cat clients.csv | node cli.mjs plan - --hours-per-day 7
```

Input: rows of `name,fee,hours,due_day,direct_cost[,note]`. See `fixtures/clients.csv`. Use engagement labels, not
client names or taxpayer identification numbers.

## How it decides

Net per engagement is fee less direct cost. Work is divisible across days and you have `hours-per-day` of it each
business day, minus any hours already booked. A set is deliverable exactly when, for every due day, the hours of the
accepted engagements due by then fit in hours-per-day times that day (earliest-due-date order is optimal for divisible
work). The best set is found exactly by a depth-first search over the engagements in due-date order, abandoning a partial
set the moment a deadline is missed; the tests check it against every subset. A declined client's break-even fee is
exact: its fee plus the gap between the best total and the best total forced to include it.

## What it is not

Not a forecast and not a calendar scheduler: one person, one stream of hours, business days counted by you, up to 16
engagements. A return that must be done in one sitting, a second preparer, scope creep, extension penalties and
interest, and client relationships are not modelled. Not tax, legal, financial or business advice, no warranty. It does
not know your competence for a return type, your credentials, due-diligence duties, Circular 230 or other
professional-standards obligations, or your engagement-letter terms; those come first.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

# Booking Request Chooser

Two requests want the same week and one pays more. Or a 2-night request would leave a 1-night hole nobody
can book. Paste your confirmed bookings and pending requests and see the exact set of requests to accept
for the most income, counting turnover cost and the dead gap nights each choice leaves, with the reason for
every decline and counter-offers (a night earlier or later) worth sending. Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/booking-request-chooser/

```
node cli.mjs plan calendar.csv --turnover 60 --night-value 50 --min-stay 3
cat calendar.csv | node cli.mjs plan - --json
```

Input: rows of `kind,check_in,check_out,price[,label]`, where `kind` is `booked` (fixed) or `request`
(decide) and the check-out day is not an occupied night. See `fixtures/calendar.csv`.

## How it decides

Plan value = accepted prices - turnover cost per stay + `night-value` x the nights of every leftover gap at
least `min-stay` long. A shorter gap is dead: nobody can book it. The best set is found exactly by dynamic
programming over the gaps between confirmed bookings, and the tests check it against trying every subset.
It also scores accepting in arrival order and highest price first, so the uplift is stated, and re-solves
with leftover nights worth zero, half and double to say whether the answer is sensitive to your estimate.

## What it is not

Not a forecast and not a pricing engine: it chooses between the requests you have, using numbers you
supply. Platform fees, taxes, cancellations and seasonality are not modelled; edge nights before the first
and after the last stay in the paste are not counted. Not financial, tax or legal advice, no warranty. You
remain responsible for any platform rule about responding to or honouring a request.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

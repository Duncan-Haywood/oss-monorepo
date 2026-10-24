# Dog Grooming Day Planner

Two questions every groomer answers by gut: *what do I charge for this dog?* and *which of the requests on my
list do I take for Saturday?* Enter what a groom really costs you in table time and supplies and it quotes the
price that hits your target net per table hour, then picks the exact set of dogs that earns the most in a day
with a fixed number of table minutes, an optional dog cap and an optional cap on large and giant dogs. Browser
page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dog-grooming-day-planner/

```
node cli.mjs plan requests.csv --capacity 480 --turnover 10 --target-hourly 45 --max-large 2 --json
node cli.mjs price --minutes 80 --supplies 6 --target-hourly 45
```

Input: rows of `dog,size,groom_minutes,price,supplies[,note]`. See `fixtures/requests.csv`.

## How it decides

Table time = groom minutes + turnover. Net = price - supplies; net per table hour = net / table hours. Price to
hit a target = table hours x target + supplies. The best set of dogs under the day's table minutes and limits is
found exactly by branch-and-bound; the tests check it against trying every subset on 300 random days. It also
scores booking in arrival order and highest price first, says what taking each skipped dog would cost, and shows
the net if some booked dogs do not show.

## What it is not

Not a forecast: it compares requests using numbers you supply. It does not know a dog's temperament or a matted
coat you have not seen, and it does not model labour split between groomers and bathers. Not financial, tax or
legal advice, no warranty. You remain responsible for what you quote and agree with clients.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

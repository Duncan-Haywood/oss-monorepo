# Client Rebooking Predictor

A free browser tool for salons, barbers, groomers, massage and physio practices, dentists, cleaners, lawn-care and any
business whose customers are meant to come back: **paste or upload a CSV of client, visit date and (optionally) amount
spent, and get who is due, who is overdue but still recoverable, and who has probably gone, each judged against that
client's own rhythm rather than a flat "90 days" rule.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/client-rebooking-predictor/

After using this, you can now **call the twelve overdue clients worth calling this week, and stop chasing the thirty who
have already left**, which used to take a booking system's flat "lapsed" report or a guess.

## Model

- Input: rows of `client,date[,amount]` (a header may reorder the columns by name). Dates: ISO, M/D/Y, D/M/Y when
  unambiguous, `7 Mar 2026`, `Mar 7, 2026`. Same-day visits merge.
- Each client's gaps between visits are lognormal. The client's own mean log-gap is shrunk toward the shop-wide mean by an
  empirical-Bayes weight (one or two visits lean on the shop rhythm; ten visits lean on the client).
- After every visit a client either comes back (probability `pi`) or has silently gone (`1 - pi`). `pi` is fitted by maximum
  likelihood over every client's history. A client quiet for `t` days is still active with probability
  `pi·S(t) / (pi·S(t) + 1 - pi)`, and the chance they are back within the window is that times `(F(t+h) - F(t)) / S(t)`.
- Segments: **lost** (under 20% still active), **overdue** (still plausibly active, at least 1.25x their usual gap
  quiet, two or more visits), **due** (at or near their usual gap), **on track**.
- Back-test: refit at a cut-off one window ago and score who actually came back, by AUC and Brier score against the plain
  base rate and against ranking by recency alone. The page says so plainly when the ranking is no better than chance.
- Refuses: fewer than 30 clients, fewer than 40 return gaps, or a history shorter than 180 days.

## Contact plan

Turns the list into a schedule: overdue clients ranked by chance back times average spend, then due clients, spread over
N contacts a week. Shows expected bookings and revenue, fills a message template (`{name}`, `{last_visit}`,
`{usual_weeks}`), and copies the messages or downloads a plan CSV. The tool sends nothing; message only clients who agreed
to hear from you (CAN-SPAM, TCPA, GDPR).

## Limits

Correlation with past behaviour, not an experiment: it cannot say a message will bring anyone back. Seasonality, price
changes, moves, stylist or provider changes and one-off services are not modelled. Verified only on simulated businesses
with known behaviour. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.

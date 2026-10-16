# Quote Follow-Up Timing

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/quote-follow-up-timing/>

A free browser tool for contractors, agencies and freelancers: **paste or upload a CSV of past quotes (days from
sending to the decision, won / lost / open, optionally the value) and see when your wins actually arrive, your real
win rate with open quotes counted correctly, and how much chance each open quote still has.** Nothing is uploaded.

After using this, you can now **tell which open quotes are still worth chasing and when to let the rest go**, which
used to take a gut feeling or a CRM report that counts open quotes as losses.

## Model

- Input: rows of `days,outcome[,value]` (a header may reorder the columns by name). Outcome is won/lost/open,
  1/0, accepted/declined, booked/passed; blank means open. Unreadable rows are skipped with a warning.
- Aalen-Johansen cumulative incidence of winning (competing risks: win, loss; open quotes are censored at their age).
- Eventual win rate is the share won at the latest day any quote was ever won: no extrapolation.
- Chance an open quote of age `a` still wins: `(F(H) - F(a)) / S(a)`. Zero past the last observed win, flagged
  "thin data" when fewer than 5 quotes or under 5% of quotes are still undecided at that age.
- Days by which 50/80/90% of eventual wins were in, and a cold day (first age with enough quotes where an open
  quote has under 5% left).
- 300 seeded bootstrap resamples of whole quotes give the 10th-90th percentile ranges.
- Optional "treat open quotes older than N days as lost" for dead quotes that were never closed out.
- Refuses: fewer than 25 quotes, fewer than 6 won or 6 lost, or wins on fewer than 4 distinct days.

## Limits

Describes when decisions happened, not why, and not whether following up works: that needs an experiment (follow
up on a random half). Quote size, customer type, season and competitors are not modelled. Verified only against
simulated histories with known win rates and timing.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.

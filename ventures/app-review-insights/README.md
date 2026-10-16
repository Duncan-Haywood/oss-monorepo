# App Review Insights

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/app-review-insights/>

A free browser tool for indie app developers: **drop in the review export from
Google Play Console or App Store Connect and see which release dropped your
rating, which complaint themes cost the most stars, the phrases only unhappy
reviewers use, and the low-star reviews you have not replied to.** The file is
read in the browser; nothing is uploaded.

After using this, you can now **find the version that broke your rating, rank
complaints by the stars they cost, and work through an oldest-first reply
queue**, which used to mean a paid review-monitoring service or a pivot table
built by hand.

## Input

Any CSV with a rating and review text. Google Play headers (`Star Rating`,
`Review Title`, `Review Text`, `App Version Name`, `Review Submit Date and
Time`, `Developer Reply Text`) are recognised, and so are near-synonyms
(`Rating`, `Body`, `Version`, `Date`). Unreadable rows are listed with a line
number, never dropped silently.

## Model

Release drop: a version's average against the previous version with enough
reviews. Themes: plain keyword lists (see `THEMES` in `calc.mjs`); the "if
fixed" figure is a what-if, not a forecast. Phrases: words and bigrams in a
larger share of unhappy than of 4-5 star reviews, counted once per review.
Every table reconciles to the same review count (a test asserts it). Not
modelled: meaning, sarcasm, languages other than English.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.

## Licence

MIT, see `LICENSE`. No warranty; not legal, tax or financial advice.

## Also

Tab and semicolon separated files are read. A theme is flagged **rising** when
it has at least three mentions in the newest 30 days of the file and at least
one and a half times its share in the 30 days before (measured back from the
newest review, not today). Each unanswered low-star review gets a short draft
reply for its theme (`REPLIES` in `calc.mjs`); drafts promise no dates and ask
for details by email, and are meant to be edited.

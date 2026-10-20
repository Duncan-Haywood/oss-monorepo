# YouTube Sponsorship Rate Calculator

A free, no-sign-up calculator that turns a YouTube channel's **median views**,
niche and deal format (integration, dedicated video, short mention) into a
sponsorship price range, then adds what to charge on top for **paid-usage /
whitelisting rights** and **category exclusivity** — the two contract terms that
most often change the real price. Everything runs in the browser; nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/youtube-sponsorship-rate-calculator/

## Why this exists

"How much should I charge a sponsor?" is the question every creator asks the
first time a brand emails. Sponsors quote against a CPM on views, but creators
usually see only their subscriber count, and the paid-usage and exclusivity
terms are where money is left on the table. This applies a published-style CPM
range to the creator's own median views and prices those add-ons separately so
each can be negotiated line by line.

## Run it

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server --directory ventures/youtube-sponsorship-rate-calculator
```

Tests: `cd ventures/youtube-sponsorship-rate-calculator && node --test`

## How the number is built

`calculator.mjs`: `views / 1000 × CPM range`, where the range depends on niche
and is scaled by format (dedicated ×2.2, mention ×0.5). Usage rights add 20% /
40% / 100% of the base fee and exclusivity 15% / 30%; the uplifts add rather
than compound. The ranges are deliberately wide, general market ranges — edit
the tables at the top of `calculator.mjs` to match your own deals.

## Disclaimer

Not financial or business advice, and not a quote or valuation. Output is a
starting point for your own negotiation; you are responsible for verifying it.
Provided as-is, without warranty. Nothing you type is stored or sent anywhere
except the optional share link you copy yourself. Anonymous local usage counters
can be turned off in the footer.

## Optional configuration

None. There is no API key and no backend.

## Licence

MIT — see `LICENSE`. Support is optional: https://github.com/sponsors/Duncan-Haywood

# Newsletter Sponsorship Rate Calculator

A free calculator that turns a newsletter's own subscriber count, average
open rate, and niche into a sponsorship price range for each common ad
placement — a dedicated send, a primary in-issue slot, a secondary slot, and
a classified/text-link placement — using commonly cited newsletter-ad-market
CPM-per-1000-opens benchmarks. Entirely client-side; nothing is uploaded.

After using this, you can now **turn your own subscriber count and open rate
into a defensible sponsorship price range in seconds**, which used to mean
guessing from a competitor's public rate card or signing up with a
marketplace like Swapstack or Paved just to see their benchmark numbers.

## Why this exists

Once a newsletter passes a few thousand subscribers, "how much should I
charge for a sponsorship?" comes up constantly in creator communities
(r/newsletters, r/Substack, beehiiv and Substack creator forums) — and the
honest answer is "it depends," which is not useful to someone about to reply
to their first sponsor inquiry. Newsletter ad marketplaces solve this by
pricing against opens rather than raw subscriber count (a sponsor pays for
eyes on the ad, not names on a list), but seeing their benchmark numbers
usually means listing your newsletter with them first. This tool applies the
same opens-based logic to your own numbers with nothing to sign up for and
nothing to list.

## Try it

Open [`index.html`](index.html), enter your subscriber count, average open
rate, and niche, and click **Calculate my rates**. See
[`newsletter-sponsorship-rate-benchmarks.html`](newsletter-sponsorship-rate-benchmarks.html)
for where the benchmark ranges come from and how to move your ask up from
the floor.

## What it calculates

All in [`calculator.mjs`](calculator.mjs), one pure function
(`computeRates`) with no dependencies. Opens are estimated as
`subscribers × open rate`, then priced per 1,000 opens against a
commonly cited CPM benchmark range for the chosen niche and placement:

| Placement | Why it prices differently |
|---|---|
| Dedicated send | Solo email, no competing content — commands the highest price |
| Primary in-issue placement | Top ad slot inside a regular issue |
| Secondary in-issue placement | Lower slot in the same issue |
| Classified / text link | Smallest, cheapest unit |

Niche (general, tech/SaaS, finance/business, B2B/professional) scales the
benchmark range, since sponsor demand and per-reader value differ sharply by
audience. The tool also flags two things worth knowing before you quote a
price: a subscriber count under 1,000 (below many marketplaces' listing
floor) and an open rate outside the typical 15–70% range.

Every output is a **range to start a negotiation from, never a quote,
valuation, or offer performed on the user's behalf** — the newsletter
operator decides what to actually charge.

## Disclaimers

This is not financial or business advice, and it is not a guarantee of what
any specific sponsor will pay — actual rates vary by list quality,
click-through history, niche demand, and a given sponsor's specific interest
that week. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`calculate_run`, `example_loaded`) are counted in `localStorage` only, never
transmitted, never tied to your newsletter's identity. Do Not Track and
Global Privacy Control are honoured, and a button on the page turns counting
off entirely.

## Development

```sh
node --test calculator.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The pricing logic and
its test suite are done and exercised across all four placements and four
niches; no external user contact has happened yet — see `kill_criteria` in
`VENTURE.yaml`.

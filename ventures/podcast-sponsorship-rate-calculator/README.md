# Podcast Sponsorship Rate Calculator

A free calculator that turns a podcast's own average downloads per episode,
niche, and ad read type (host-read or produced) into a sponsorship price
range for each common ad placement — a pre-roll, a mid-roll, and a
post-roll spot — using commonly cited podcast-ad-market CPM-per-1000-
downloads benchmarks. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/podcast-sponsorship-rate-calculator/

After using this, you can now **turn your own downloads-per-episode figure
into a defensible sponsorship price range in seconds**, which used to mean
guessing from a competitor's public rate card or signing up with a
marketplace like Podcorn or AdvertiseCast just to see their benchmark
numbers.

## Why this exists

Once a show passes a few thousand downloads per episode, "how much should I
charge for a sponsorship?" comes up constantly in creator communities
(r/podcasting, r/podcasters) — and the honest answer is "it depends," which
is not useful to someone about to reply to their first sponsor inquiry.
Podcast ad marketplaces and network rate cards price against downloads in
the first 7 days of an episode (the industry-standard IAB/Podtrac window),
not a lifetime subscriber count, but seeing their benchmark numbers usually
means listing your show with them first. This tool applies the same
downloads-based logic to your own numbers with nothing to sign up for and
nothing to list.

## Try it

Open [`index.html`](index.html), enter your average downloads per episode,
niche, and read type, and click **Calculate my rates**. See
[`vs-podcorn.html`](vs-podcorn.html) for how this differs from listing on a
marketplace.

## What it calculates

All in [`calculator.mjs`](calculator.mjs), one pure function
(`computeRates`) with no dependencies. Each placement is priced per 1,000
downloads against a commonly cited CPM benchmark range for the chosen
niche, then scaled by a read-type multiplier:

| Placement | Why it prices differently |
|---|---|
| Pre-roll | :15–:30s at the very start — heard by everyone who presses play, but skippable |
| Mid-roll | :60–:90s in the middle — the highest-value slot, heard by the most engaged listeners |
| Post-roll | :15–:30s at the end — the cheapest slot, heard only by listeners who stay to the end |

Niche (general, business/finance, tech, true crime) scales the benchmark
range, since sponsor demand and audience value differ sharply by category.
Read type applies a further discount for a produced (pre-recorded) spot
versus a host-read ad, which commonly commands a premium for the host's
live endorsement. The tool also flags things worth knowing before you quote
a price: downloads under 1,000 per episode (below many marketplaces'
listing floor), and downloads above 500,000 (past public benchmark
territory, where shows typically negotiate custom network rates).

Every output is a **range to start a negotiation from, never a quote,
valuation, or offer performed on the user's behalf** — the podcaster
decides what to actually charge.

## Disclaimers

This is not financial or business advice, and it is not a guarantee of what
any specific sponsor will pay — actual rates vary by audience quality, host
endorsement strength, niche demand, and a given sponsor's specific interest
this quarter. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`calculate_run`, `example_loaded`, `link_copied`) are counted in
`localStorage` only, never transmitted, never tied to your show's identity.
Do Not Track and Global Privacy Control are honoured, and a button on the
page turns counting off entirely.

## Development

```sh
node --test calculator.test.mjs share.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The pricing logic and
its test suite are done and exercised across all placements, niches, and
read types; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.

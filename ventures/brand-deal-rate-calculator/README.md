# Brand Deal Rate Calculator

A free calculator that turns a creator's own follower count, average
engagement rate, and platform into a sponsorship price range for each common
brand-deal deliverable — a feed post, a Story, a Reel or short-form video, and
a dedicated long-form video — using commonly cited creator-economy
CPM-per-1000-engaged-followers benchmarks. Entirely client-side; nothing is
uploaded.

After using this, you can now **turn your own follower count and engagement
rate into a defensible brand-deal price range in seconds**, which used to
mean guessing from a rate-card template found online or signing up with an
influencer marketplace just to see their benchmark numbers.

## Why this exists

Once a creator's account grows past a few thousand followers, "how much
should I charge for a brand deal?" comes up constantly in creator
communities — and the honest answer is "it depends," which is not useful to
someone about to reply to their first brand inquiry. Influencer marketing
rate cards solve this by pricing against engaged followers rather than raw
follower count (a brand pays for people who actually see and react to the
post, not for a number on a profile), but seeing benchmark numbers usually
means signing up with a marketplace or agency first. This tool applies the
same engaged-audience logic to a creator's own numbers with nothing to sign
up for and nothing to list.

## Try it

Open [`index.html`](index.html), enter your follower count, average
engagement rate, and platform, and click **Calculate my rates**. See
[`brand-deal-rate-benchmarks.html`](brand-deal-rate-benchmarks.html) for
where the benchmark ranges come from and how to move your ask up from the
floor.

## What it calculates

All in [`calculator.mjs`](calculator.mjs), one pure function
(`computeRates`) with no dependencies. Engaged followers are estimated as
`followers × engagement rate`, then priced per 1,000 engaged followers
against a commonly cited CPM benchmark range for the chosen platform and
deliverable:

| Deliverable | Why it prices differently |
|---|---|
| Feed post | Single photo or carousel in the main feed |
| Story | Single ephemeral frame, gone after ~24 hours — the cheapest visible-content deliverable |
| Reel / short-form video | Reels, TikTok, or Shorts — sits between a Story and a dedicated video |
| Dedicated long-form video | An entire video about the brand, mainly a YouTube deliverable — commands the highest price because it has no competing content |

Platform (Instagram, TikTok, YouTube, or other/multiple) scales the
benchmark range, since brand demand and per-follower value differ sharply by
platform — a dedicated YouTube video, for example, commands a premium over
the same audience size on Instagram. The tool also flags two things worth
knowing before you quote a price: a follower count under 1,000 (below many
marketplaces' listing floor) and an engagement rate outside the typical
1–15% range.

Every output is a **range to start a negotiation from, never a quote,
valuation, or offer performed on the user's behalf** — the creator decides
what to actually charge.

## Disclaimers

This is not financial or business advice, and it is not a guarantee of what
any specific brand will pay — actual rates vary by audience quality, past
brand-deal history, niche demand, and a given brand's specific interest that
week. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`calculate_run`, `example_loaded`) are counted in `localStorage` only, never
transmitted, never tied to your account's identity. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns counting off
entirely.

## Development

```sh
node --test calculator.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The pricing logic and
its test suite are done and exercised across all four deliverables and four
platforms; no external user contact has happened yet — see `kill_criteria`
in `VENTURE.yaml`.

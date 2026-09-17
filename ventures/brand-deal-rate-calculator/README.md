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

## Putting the rates in a media kit

A price range is not the end of the job — the creator still has to put it in
front of a brand. Once rates are calculated, the report offers a **"Put these
rates in a media kit"** link into
[`influencer-media-kit-generator`](../influencer-media-kit-generator/), whose
own validator warns on exactly the two things this page has just worked out:
"No platforms listed" and "No rate card".

The link carries the platform line (`Instagram | 45000 | 4.5%`) and one
rate-card row per deliverable, in that tool's own pipe-delimited format, so
none of it has to be retyped. Two properties are deliberate:

- **The numbers ride in the URL fragment**, which browsers never send to any
  server, so the handoff keeps this tool's promise that nothing leaves the
  device. The link is relative, so it works on GitHub Pages, under a custom
  domain, and from a local static server.
- **The range travels, not a single number.** This tool is explicit that its
  output starts a negotiation and is never a quote; picking a point estimate
  on the way into a document a brand reads would make a claim it refuses to
  make here.

On arrival the media kit generator *asks* before inserting anything and only
ever appends — a draft already in progress is never overwritten. See
[`handoff.mjs`](handoff.mjs) for the sending half and
[`../influencer-media-kit-generator/prefill.mjs`](../influencer-media-kit-generator/prefill.mjs)
for the receiving half.

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
(`calculate_run`, `example_loaded`, `handoff_followed`) are counted in
`localStorage` only, never
transmitted, never tied to your account's identity. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns counting off
entirely.

## Development

```sh
node --test calculator.test.mjs page.test.mjs handoff.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The pricing logic and
its test suite are done and exercised across all four deliverables and four
platforms; no external user contact has happened yet — see `kill_criteria`
in `VENTURE.yaml`.

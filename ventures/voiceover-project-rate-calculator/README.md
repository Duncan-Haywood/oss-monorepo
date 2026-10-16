# Voice-Over Project Rate Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/voiceover-project-rate-calculator/>

A free calculator that turns a voice-over artist's own script or manuscript
into a defensible project rate — a script-based project (commercial,
e-learning/corporate narration, IVR/telephony, explainer, animation) priced
per word or per finished minute and scaled by usage/licensing term, or an
audiobook priced per finished hour from manuscript word count, using
commonly cited voice-over rate-guide conventions. Entirely client-side;
nothing is uploaded.

After using this, you can now **turn a script's word count and the buyer's
intended usage into a defensible project rate in seconds**, which used to
mean guessing at a usage multiplier from memory or hunting for a rate-guide
PDF partway through a client email.

## Why this exists

"What should I charge for this?" is one of the most common questions in
voice-over communities (r/VoiceActing, VO Discord servers, casting-site
forums), and the honest answer depends on two things a flat per-word rate
does not capture: how the buyer plans to use the recording, and — for
audiobooks — an entirely different pricing convention (per finished hour,
not per word). Rate-guide resources the community already relies on (most
visibly the GVAA Rate Guide) price usage in tiers for exactly this reason:
the same recording is worth far less licensed for internal training only
than it is running as a national broadcast commercial for a year. This tool
applies that same tiered logic to a narrator's own numbers, with nothing to
sign up for and nothing to look up mid-negotiation.

## Try it

Open [`index.html`](index.html), pick a project type, enter your numbers,
and click **Calculate my rate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), two pure functions with no dependencies:

- **`computeProjectQuote`** — for a script-based project. Prices per word or
  per finished minute (finished minutes are estimated from word count at a
  configurable read pace, defaulting to a commonly cited 150 words per
  minute), then scales the base fee by a usage/licensing multiplier:

  | Usage term | Multiplier |
  |---|---|
  | Internal / training use only | ×1.0 |
  | Web / unrestricted digital use | ×1.3 |
  | Regional broadcast (radio or TV) | ×1.8 |
  | National broadcast (radio or TV) | ×2.75 |
  | Full buyout (all media, in perpetuity) | ×4.0 |

  A rush turnaround adds a commonly cited 50% surcharge and category
  exclusivity adds a 25% add-on, both applied on top of the usage-adjusted
  fee. Extra revision rounds beyond what's included add a flat fee per round.

- **`computeAudiobookQuote`** — for audiobook narration, priced per finished
  hour (PFH), the convention audiobook platforms like ACX use. Finished
  hours are estimated from manuscript word count via a configurable
  conversion factor (defaulting to a commonly cited 9,300 words per finished
  hour), and editing/proofing/mastering can be billed separately per
  finished hour or left at zero if it's already included in the narration
  rate.

Every multiplier and conversion factor is a widely cited industry
convention exposed as an adjustable input, not a fixed standard. Every
output is a **starting point for a negotiation, never a quote, guarantee, or
valuation performed on the user's behalf** — the narrator decides what to
actually charge.

## Disclaimers

This is not financial or business advice, and it is not a guarantee of what
any specific buyer will pay — actual rates vary by experience, demo
quality, niche demand, and what a specific project is worth to a specific
buyer. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`quote-calculated`, `example-loaded`) are counted in `localStorage` only,
never transmitted, never tied to your identity. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns counting off
entirely.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The pricing logic and
its test suite are done for both project types; no external user contact has
happened yet — see `kill_criteria` in `VENTURE.yaml`.

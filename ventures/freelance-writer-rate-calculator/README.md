# Freelance Writer Rate Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-writer-rate-calculator/>

A free browser calculator for freelance writers, copywriters, and
ghostwriters comparing a per-word rate against a flat project fee for the
same job. Entirely client-side; nothing is uploaded.

After using this, you can now **see which of the two prices actually pays
more per hour** for a given job — not just which headline number looks
bigger — once research, interviews, outlining, and revision rounds are
counted alongside writing time.

## Why this exists

Verified via WebSearch on 2026-09-25 against Upwork's "How To Set Your
Freelance Writing Rate in 2026", bestwriting.com's "Content Writing Rates
Statistics 2026" (42 data points from 500 active freelance writers surveyed
January 2026), the Editorial Freelancers Association's 2026 Rate Chart,
AWAI's 2026 freelance copywriter rate survey, and Peak Freelance's 2026
rates guide:

- **A per-word rate pays for words written, not for the job.** Research,
  interviews, outlining, and revision rounds are real hours a job costs a
  writer, and a pure per-word rate does not separately compensate any of
  them.
- **2026 per-word rates span roughly $0.05-$0.10/word (entry level),
  $0.10-$0.50/word (intermediate to senior generalist work), and
  $0.50-$2.00+/word (specialist legal/medical/expert B2B work).** A
  500-writer survey put the across-the-board average at $0.42/word; a
  survey of established copywriters put their average at $0.70/word — the
  two differ because they sample different populations, not because either
  is wrong.
- **Most writers do not charge extra for ghostwriting.** Of those who do,
  most add a 16-20% premium over their bylined rate for the same word
  count.
- **Switching from per-word to flat per-project pricing is described
  repeatedly as the most reliable way an established writer raises real
  income**, without raising the per-word figure they quote — because a
  flat fee can price the whole job, including the research and revision
  time a per-word rate leaves uncompensated.

## Try it

Open [`index.html`](index.html). Enter the word count, your writing speed,
research and revision hours, and the two prices on offer. Click
**Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as a pure function with no dependencies:

- **`writerRateOutcome`** — the effective hourly rate a per-word rate and a
  flat project fee each actually pay for the same job, which one pays more,
  and (given an optional target hourly rate) the per-word rate or flat fee
  needed to hit it.

## What this does not cover

- Not a rate card — it does not know your market, niche, or a client's
  budget.
- Does not estimate your own writing speed or research time — you supply
  both directly.
- No taxes, platform fees, or overhead (see the
  [Upwork vs. Fiverr fee calculator](../freelance-platform-fee-calculator/)
  for platform-cut math).
- No client negotiation modeling.

## Disclaimers

Not financial, legal, or professional advice. This applies the hours and
prices you enter to the job as you describe it; it does not replace your
own judgment about your market or a client's budget.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`estimate_calculated`, `example_loaded`) are counted in `localStorage`
only, never transmitted. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.

# Speech-to-Text Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/speech-to-text-pricing-calculator/>

Price the OpenAI Whisper API, Deepgram, AssemblyAI, Google, AWS, Azure and a self-hosted Whisper GPU side
by side for your monthly audio hours and your streaming and speaker-label needs, see the 12-month spend as
volume grows, and find the hours where the cheapest option changes (where self-hosting starts to win).

```
node cli.mjs compare --hours 500 --diarization --growth 5
node cli.mjs compare --hours 500 --diarization --provider aws --budget 400   # CI gate: exit 1 over budget
node cli.mjs crossover --diarization
node cli.mjs compare --hours 500 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides; a provider's `plans` array (name, usd, hours,
extraHourUsd, streaming, diarization) replaces its defaults. Exit 1 when `--budget` (monthly USD) is
exceeded; 2 on bad input or when the chosen provider has no covering plan.

## What it is not

Matching typed needs against approximate public list prices dated in the source (`PRICES_AS_OF`) and
editable. It ignores accuracy and language differences, add-ons, volume discounts, free credits and
engineering time, so it compares the per-hour lines and does not forecast an invoice. Not a quote, a
guarantee or advice. Not affiliated with any vendor named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates locally and
never uploads anything, including audio.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any kind. It is not financial or
> engineering advice; verify its output before relying on it. **Best-effort hosting, no SLA.**

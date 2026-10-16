# ai-coding-plan-cost-calculator

**Is your AI coding subscription actually cheaper than the API — or the
other way round?**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ai-coding-plan-cost-calculator/

A free browser tool that compares a flat-rate AI coding assistant plan
(Claude Pro/Max, Cursor, GitHub Copilot, ChatGPT Plus, or a custom price)
against what the same usage would cost paid per token through the vendor's
own API — using your own usage numbers and editable rates, not someone
else's assumptions — and reports the break-even usage level. The API side
offers Claude, OpenAI, and Google Gemini rate presets, and picking a plan
switches the preset to that plan's own vendor automatically.

## The problem

Vendor pricing pages quote a flat monthly plan price on one page and a
per-token API rate on another, and never do the arithmetic for how a
specific person actually uses the tool. "Is Claude Max worth it?" and "is
Cursor Business cheaper than the API for my team?" are extremely common
questions with no calculator that answers them from the asker's own numbers
— see the sourced write-up in [`VENTURE.yaml`](VENTURE.yaml) for the
market check this was graduated against.

## Why it isn't just "tokens × price"

Agentic coding tools resend most of the file and conversation context on
almost every turn. Providers that support prompt caching bill that repeated,
unchanged prefix at a small fraction of the fresh-input rate, and publicly
reported usage breakdowns for heavy coding-agent use put cache reads above
90% of total tokens processed. A calculator that only multiplies input and
output tokens by one blended rate significantly overstates the
API-equivalent cost for exactly the heavy users who are the ones asking this
question. This tool asks for fresh input, output, cache write, and cache
read tokens separately — see
[`how-ai-coding-plan-pricing-works.html`](how-ai-coding-plan-pricing-works.html)
for the full explanation.

## Layout

| file | |
|---|---|
| `calc.mjs` | the model: preset plans/models/usage tiers, the cost comparison and break-even math |
| `index.html` | the browser tool — imports `calc.mjs`, does not restate it |
| `how-ai-coding-plan-pricing-works.html` | the explainer the tool links to, and the vendor pricing pages to check |
| `usage.mjs` | local-only, opt-in, DNT/GPC-respecting event counter |

## Tests

```bash
node --test ventures/ai-coding-plan-cost-calculator/*.test.mjs
```

39 assertions: the cost model (rate math, seats, break-even direction, input
validation, preset shape, the OpenAI/Gemini presets and the plan→model
default map) and the page (disclaimers naming all five vendors, JSON-LD,
sponsor link, usage opt-out, the cross-link to `mcp-supply-chain-watch`, and
that the footer only ever names events the page actually records).

## What it does not do

- **It does not read your account or bill you.** Nothing here has network
  access or an account. Every price and rate is a plain number you can edit.
- **It does not know current vendor pricing.** Defaults are list prices and
  published API rates as of the date shown on the page (`calc.mjs`'s
  `RATES_AS_OF`), and vendors change pricing without notice. Check the
  vendor's own pricing page before deciding — links are on the explainer
  page.
- **It does not measure your actual usage.** The light/typical/heavy tiers
  are order-of-magnitude starting points reasoned from publicly reported
  Claude Code usage patterns, not a reading of any one account. Replace them
  with your own numbers if you have them.

## Licence and support

MIT (`LICENSE`). Free, with the full feature set — there is no paid tier.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.

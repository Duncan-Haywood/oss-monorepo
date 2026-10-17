# LLM Call Cost Scan

Find the OpenAI, Anthropic and Gemini calls in your code that quietly cost
money — before they run.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/llm-call-cost-scan/

```
node cli.mjs scan src
node cli.mjs scan . --json
node cli.mjs scan src --calls-per-day 5000 --in-tokens 2000 --out-tokens 500
node cli.mjs scan src --fail-on warn        # CI gate: warnings fail too
node cli.mjs scan src --prices prices.json  # override the built-in list prices
```

Flags, per call site found in `.js/.ts/.py` files:

| rule | level | meaning |
| --- | --- | --- |
| `no-output-cap` | warn | no `max_tokens` / `max_output_tokens` in the call |
| `call-in-loop` | warn | the call sits under a `for` / `while` / `.map` / `forEach` |
| `premium-model-hardcoded` | info | premium/mid model literal; names the same vendor's small tier |
| `retired-model` | error | model name on this tool's short list of retired names |
| `model-not-literal` | info | model comes from a variable; cannot be priced |

Exit code 1 on any error (or any warning with `--fail-on warn`); 2 on bad input.

## What it is not

A static text scan. It cannot see real traffic, prompt lengths, caching or
discounts; the monthly figure is your own calls/day and token guess times list
prices (illustrative, dated in the source, editable with `--prices`). It is not
a bill, a guarantee or advice, and may miss or misread calls. Wrappers
(LangChain, LiteLLM) are not matched in v0.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) scans pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

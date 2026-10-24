# LLM Usage Log Analyzer

Paste the per-request usage log your app already writes (JSONL, JSON array or
CSV). It prices every request at the rates you enter and shows spend by model,
feature label and day, the real cache-read share, a 30-day run rate, and three
what-ifs: a higher cache-read share, a batch tier, and moving a share of one
model's traffic to another.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/llm-usage-log-analyzer/

Everything runs in the browser. Nothing is uploaded and no price is fetched --
you supply each provider's rates. Savings are upper bounds under stated
assumptions, not forecasts.

## Run and test

```
node --test          # calc, usage counter, page wiring
```

Serve the folder statically (`python3 -m http.server`) and open `index.html`.

## Log formats

Anthropic-style `usage`: `input_tokens` (excludes cache), `cache_read_input_tokens`,
`cache_creation_input_tokens`, `output_tokens`. OpenAI-style: `prompt_tokens` or
`input_tokens` (include cached), `completion_tokens`/`output_tokens`,
`prompt_tokens_details.cached_tokens`. Optional `created_at`/`timestamp`, and
`label`/`feature` for grouping. CSV uses the same names as column headers.

Companion to [`llm-api-pricing-calculator`](../llm-api-pricing-calculator/), which
prices a workload you have not run yet.

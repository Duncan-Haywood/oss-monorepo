# LLM Output Regression Diff

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/llm-output-regression-diff/>

Did the new model or prompt break your outputs? Save outputs from before and after a model swap or prompt
edit as JSONL, and get a per-case list of what broke: invalid JSON, lost keys, changed types, new
refusals, unclosed code fences, truncation, lost numbers, lost lists/headings/code blocks, large length
changes and low word overlap. Gate CI on the result.

```
node cli.mjs diff baseline.jsonl candidate.jsonl
node cli.mjs diff baseline.jsonl candidate.jsonl --max-regressions 2 --fail-on warn
node cli.mjs diff baseline.jsonl candidate.jsonl --max-length-ratio 3 --min-similarity 0.3 --json
```

Each file is JSONL (or a JSON array) of `{"id": "...", "output": "..."}`; `text`, `response`,
`completion`, `content` or `answer` also work as the output field. Exit 1 when regressed cases exceed
`--max-regressions` (default 0), 2 on bad input.

## What it is not

A tripwire for changes, not a judge of quality. It cannot tell whether an output is correct, safe or
better; a flagged case can be an improvement and a clean case can still be worse. Keep your own
evaluation for quality. Not affiliated with any model provider.

## Privacy

No network call, no model call, no API key, no account, no analytics vendor. The browser page
(`index.html`) compares locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not professional advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**

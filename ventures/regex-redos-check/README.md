# Regex ReDoS Check

Find the regular expressions in your JavaScript, TypeScript and Python that can
hang a server on one crafted string (ReDoS) — before an attacker does.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/regex-redos-check/

```
node cli.mjs scan src
node cli.mjs scan . --json
node cli.mjs scan src --probe          # confirm JS suspects by timing the real engine
node cli.mjs scan src --fail-on warn   # CI gate: polynomial warnings fail too
node cli.mjs check '(a+)+$'            # analyse a single pattern
```

| rule | level | shape |
| --- | --- | --- |
| `nested-quantifier` | error | `(a+)+`, `(\w+\s?)+` -- iterations can split the same text many ways (exponential) |
| `overlapping-alternation` | error | `(a|aa)+`, `(\d|\w)+` -- two branches match the same text (exponential) |
| `adjacent-overlap` | warn | `\d+\d+`, `^\s*(.*?)\s*$` -- adjacent repeats over the same characters (polynomial) |
| `quadratic-end-anchor` | warn / info | `\s+$` with no `^` -- retried from every start position |
| `dynamic-regexp` | info | `new RegExp(variable)` |

Exit code 1 on any error (or any warning with `--fail-on warn`); 2 on bad input.

Regexes are read from regex literals and `new RegExp("...")` in `.js/.ts`, and
from `re.compile/match/search/...(r"...")` and `*_re = r"..."` constants in `.py`.

## What it is not

A static heuristic. A finding is a suspect: it can miss a vulnerable pattern and
flag a safe one, and it cannot know whether an attacker controls the input.
`--probe` times the real JavaScript engine on a generated input (sandboxed vm,
hard timeout) and only labels a pattern *confirmed* if it actually slows down;
Python patterns are not probed. Engines built on automata (RE2, Go, Rust) are
not affected. Not security advice, no warranty.

## Privacy

No network call, no account, no analytics vendor. The browser page parses pasted
text locally, never executes your patterns, and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

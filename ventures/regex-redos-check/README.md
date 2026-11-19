# Regex ReDoS Check

Find the regular expressions in your JavaScript, TypeScript and Python that can
hang a server on one crafted string (ReDoS) — before an attacker does.

**Live tool:** https://marisstella.app/regex-redos-check/

```
node cli.mjs scan src
node cli.mjs scan . --json
node cli.mjs scan . --sarif > redos.sarif   # GitHub code scanning format
node cli.mjs scan src --probe          # confirm JS suspects by timing the real engine
node cli.mjs scan src --fail-on warn   # CI gate: polynomial warnings fail too
node cli.mjs check '(a+)+$'            # analyse a single pattern
```

| rule | level | shape |
| --- | --- | --- |
| `nested-quantifier` | error | `(a+)+`, `(\w+\s?)+` -- iterations can split the same text many ways (exponential) |
| `nested-quantifier` | error | `(<!--[\s\S]*?-->)*`, `(a.*b)+` -- an inner repeat can swallow the next iteration's delimiters (exponential; added 2026-11-15) |
| `nested-quantifier` | error | `([a-z0-9]{2,4})+` -- a flexible bounded count under a repeat splits a run many ways (exponential; added 2026-11-19, it is the common email-validator shape) |
| `overlapping-alternation` | error | `(a|aa)+`, `(\d|\w)+` -- two branches match the same text (exponential) |
| `overlapping-alternation` | error | `(a|a?)+` -- a branch that is a bounded repeat of the other's characters (OWASP's list; added 2026-11-19) |
| `adjacent-overlap` | warn | `\d+\d+`, `^\s*(.*?)\s*$` -- adjacent repeats over the same characters (polynomial) |
| `quadratic-end-anchor` | warn / info | `\s+$` with no `^` -- retried from every start position |
| `dynamic-regexp` | info | `new RegExp(variable)` |

Exit code 1 on any error (or any warning with `--fail-on warn`); 2 on bad input.

Regexes are read from regex literals and `new RegExp("...")` in `.js/.ts`, and
from `re.compile/match/search/...(r"...")` and `*_re = r"..."` constants in `.py`.

## In CI: GitHub code scanning

```yaml
# .github/workflows/redos.yml
on: [pull_request]
permissions: { contents: read, security-events: write }
jobs:
  redos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node cli.mjs scan . --sarif > redos.sarif || true   # path to cli.mjs in your checkout
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: redos.sarif }
```

Findings appear as code-scanning alerts on the line of the regex. Drop `|| true`
to also fail the job on exponential patterns.

## Measured on a real codebase (2026-11-15)

We ran it over this repository's own products and compared it with
[recheck](https://github.com/makenowjust-labs/recheck) 4.6.2 (MIT), an automaton-based
checker, on the 9,016 distinct regex literals in 5,040 non-test `.mjs` files:

- **Extraction.** Regex literals found, checked against [acorn](https://github.com/acornjs/acorn)'s
  tokenizer on 11,802 `.mjs` files: 96,536 of 96,536 with 0 spurious, after two fixes in this
  release (regexes inside a template literal's `${...}` were skipped; a `#!` line was read as a
  regex). Before them: 95,205 found (98.6%) and 2,739 spurious.
- **Exponential.** recheck called 5 patterns exponential; all 5 were confirmed by timing V8.
  This release flags all 5 at error level. The previous one flagged 3: it never saw one
  (inside a template literal) and had no rule for `(<!--[\s\S]*?-->\s*)*`. It also flags 3 patterns at error
  level that recheck calls safe and that do not slow down when timed: false positives, listed with
  their reasons in `platform/ci/redos_allowlist.json`.
- **Polynomial.** recheck called 1,105 patterns polynomial; most need inputs of tens of
  thousands of characters to cost a second. This tool's `warn` rules overlap but are not a
  substitute: use recheck or `--probe` when a quadratic pattern sees large untrusted input.

The sweep is repeatable: `node platform/ci/check_redos.mjs` (exit 1 on a new error-level suspect).
Write-up: [`docs/posts/2026-11-15-five-regexes-that-could-hang-our-own-tools.md`](../../docs/posts/2026-11-15-five-regexes-that-could-hang-our-own-tools.md).

## What it is not

A static heuristic. A finding is a suspect: it can miss a vulnerable pattern and
flag a safe one, and it cannot know whether an attacker controls the input.
`--probe` times the real JavaScript engine on a generated input (sandboxed vm,
hard timeout) and only labels a pattern *confirmed* if it actually slows down;
Python patterns are not probed. Engines built on automata (RE2, Go, Rust) are
not affected. Not security advice, no warranty.

Known gaps (quality audit 2026-11-19, `portfolio/quality/audits/2026-11-19-regex-redos-check.json`):
`^((ab)*)+$` (a repeated compound body that can be empty) is still not flagged;
`^(?:\s|#.*)*$` is flagged as exponential though no input we tried slows it;
`--probe` has no generator for the bounded-count shape, so it cannot confirm it;
and a probe of `^(a|aa)+$` says "polynomial" when the growth is exponential.

## Privacy

No network call, no account, no analytics vendor. The browser page parses pasted
text locally, never executes your patterns, and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

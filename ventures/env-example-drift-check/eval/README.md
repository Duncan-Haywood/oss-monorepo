# Measuring the `.env.example` parser against real loaders

`parseExampleFile` in [`../engine.mjs`](../engine.mjs) decides which names an
`.env.example` file declares. This directory compares it with four loaders
people run, so "declared" means what a loader would load, not what a regex
guessed:

- Node 22's built-in [`util.parseEnv`](https://nodejs.org/api/util.html#utilparseenvcontent) (v22.23.5 here);
- npm [`dotenv`](https://github.com/motdotla/dotenv) 16.4.7 and 17.2.3 (BSD-2-Clause);
- [`python-dotenv`](https://github.com/theskumar/python-dotenv) 1.0.1 (BSD-3-Clause).

None of their code is copied or vendored here; the scripts download them into
a scratch directory and call them. The parser was rewritten from their
observed behaviour (2026-11-22).

## Run it

```sh
S=$(mktemp -d)                      # scratch: the loaders and temp files go here
(cd $S && mkdir npmdotenv pydotenv && cd npmdotenv && npm pack dotenv@16.4.7 dotenv@17.2.3 \
  && for f in *.tgz; do mkdir ${f%.tgz}; tar xzf $f -C ${f%.tgz}; done)
(cd $S/pydotenv && pip download python-dotenv==1.0.1 --no-deps -d . \
  && python3 -m zipfile -e python_dotenv-1.0.1-py3-none-any.whl x)
E=ventures/env-example-drift-check/eval
node $E/table.mjs $S $E/../engine.mjs              # the per-feature table below
node $E/score.mjs $S $E/../engine.mjs 5000 50001   # held-out seeded score
node $E/resid.mjs $S $E/../engine.mjs              # rough classes of what is left
```

[`gen.mjs`](gen.mjs) builds seeded files from keys (identifier, dotted,
dashed, digit-leading, lowercase), separators (`=`, ` = `, `: `), `export`
prefixes, comments, CRLF, and values: plain, quoted three ways, quoted across
lines with a `NAME=` line inside, unterminated, with escaped quotes, and with
text after a closing quote. [`score.mjs`](score.mjs) scores each key that any
loader or this tool saw: when at least 3 of the 4 loaders agree on whether it
is declared, that is the expected answer; a 2-2 split is not scored.

## Results

Seeds 1-2000 were used while fixing; seeds 50001-55000 were fixed in advance
as the held-out set and run once at the end, before and after.

| | keys scored | agree with loader majority | phantom (we declare, they don't) | missed |
|---|---|---|---|---|
| before (shell-identifier keys, line by line) | 19,611 | 76.44% | 1,375 | 3,246 |
| after | 18,892 | 99.75% | 4 | 44 |

3,389 keys were 2-2 splits and not scored. The key count differs because the
old parser produced phantom names the loaders never saw.

The 48 left, classed by the file they come from (a file can have more than
one feature, so this is rough): text after the quote that closes a
multi-line value (18; dotenv then reads the value as one unquoted line),
escaped quotes (25; the loaders split on these among themselves), and
colon-separator lines next to quotes (5).

### Per feature

`*` marks a python-dotenv key with no value (`None`).

| case | this tool | Node util.parseEnv | dotenv 16.4.7 | dotenv 17.2.3 | python-dotenv 1.0.1 |
|---|---|---|---|---|---|
| plain | A | A | A | A | A |
| export prefix | A | A | A | A | A |
| spaces around = | A | A | A | A | A |
| leading tab | A | A | A | A | A |
| colon separator | (none) | (none) | A | A | (none) |
| colon no space | (none) | (none) | (none) | (none) | A:1* |
| dotted key | APP.NAME | APP.NAME | APP.NAME | APP.NAME | APP.NAME |
| dashed key | my-key | my-key | my-key | my-key | my-key |
| digit-leading key | 9LIVES | 9LIVES | 9LIVES | 9LIVES | 9LIVES |
| lowercase key | db_url | db_url | db_url | db_url | db_url |
| bare name, no = | (none) | (none) | (none) | (none) | A* |
| empty value | A | A | A | A | A |
| comment line | (none) | (none) | (none) | (none) | (none) |
| double-quoted multi-line hides B | A | A | A | A | A |
| single-quoted multi-line hides B | A | A | A | A | A |
| backtick multi-line hides B | A | A | A | A | A B y`* |
| escaped quote then multi-line hides B | A | A B | A | A | A |
| unterminated double quote then B | A B | A B | A B | A B | B |
| inline # inside quotes | A B | A B | A B | A B | A B |
| CRLF line endings | A B | A B | A B | A B | A B |
| CR-only line endings | A B | A | A B | A B | A B |
| export with two spaces | A | A | A | A | A |
| key with unicode letter | (none) | CAFÉ | (none) | (none) | CAFÉ |
| value starts with quote, ends later on same line | A B | A B | A B | A B | B |
| no space colon URL | A | A | A | A | A |
| multi-line double quote with commented key inside | A C | A C | A C | A C | A C |

What this changed in the parser: dotted, dashed and digit-leading keys count
(all four loaders agree); a quote that closes on a later line swallows the
lines in between (all four agree for `"` and `'`, three for backticks:
python-dotenv has no backtick quoting); a backslash-escaped quote does not
close (three of four; `util.parseEnv` has no escapes); a lone `\r` ends a line
(three of four). Bare names with no `=` stay undeclared (three of four agree). `NAME: value`
stays undeclared too: that one is a 2-2 split (both npm dotenv versions read
it, Node and python-dotenv do not), and the old behaviour was kept.

### A Node quirk found on the way

`util.parseEnv("A= \nB=1\n")` returns `{ A: "B=1" }`: an empty value followed
by a space takes the next line as its value, so `B` is never set. Both dotenv
versions and python-dotenv return `A` empty and `B` set. `parse.diff.test.mjs`
pins this tool to the dotenv reading and keeps that shape out of its seeded
comparison with `util.parseEnv`.

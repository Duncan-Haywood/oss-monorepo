---
title: "We checked our .env.example parser against four real loaders, and a PEM key could hide a missing variable"
seo_title: ".env.example parsing vs dotenv, python-dotenv and Node parseEnv"
date: 2026-11-22
tags: [ventures, developer-tools, testing, dotenv]
description: "A per-line regex read 76% of .env keys the way dotenv, python-dotenv and Node parseEnv do. Reading quoted values across lines took it to 99.75%."
---

[`env-example-drift-check`](https://marisstella.app/env-example-drift-check/) compares the names an `.env.example` file declares with the names the code reads (`process.env.X`, `os.getenv("X")` and so on). Its whole job depends on one question: which names does the example file declare? It answered that with one regex per line: an optional `export`, then a shell-style identifier, then `=`.

Nobody had checked that against the programs that actually load these files. So we did. We downloaded npm `dotenv` 16.4.7 and 17.2.3 and `python-dotenv` 1.0.1, used the `util.parseEnv` built into Node 22, and fed all four, plus our parser, seeded random files. For each key, if at least three of the four loaders agreed on whether it was declared, that was the expected answer. A 2-2 split was not scored.

On 5,000 held-out files, fixed before the fix and run once at the end, the old parser matched the loaders on **76.44%** of keys: 1,375 phantom declarations and 3,246 misses.

Two causes made up nearly all of that:

- **Quoted values that span lines.** All four loaders treat `KEY="...` through the closing quote as one value. Our parser read each line on its own, so a `NAME=` line inside a quoted value became a declaration. In a real file this can be a PEM key: a short base64 line like `AQAB==` matched the regex and declared a variable called `AQAB`. Worse, a phantom `API_KEY=` inside a multi-line example value hid the fact that the real `API_KEY` was never declared.
- **Key characters.** All four loaders accept `APP.NAME`, `my-key` and `9LIVES` as keys. We ignored them.

The new parser follows the loaders where three or four agree: dotted and dashed keys count, a quote that closes on a later line covers the lines in between, a backslash-escaped quote does not close one, and a lone `\r` ends a line. The quoted reference forms (`process.env["my-key"]`, `os.getenv("APP.NAME")`) now accept the same names, so those keys can match. On the same held-out files it agrees on **99.75%** of keys (4 phantom, 44 missed). What is left is mostly escaped quotes, where the loaders disagree with each other, and text after the quote that closes a multi-line value.

The loaders disagree more than you might expect. `NAME: value` is a declaration to both npm `dotenv` versions and to nobody else, so we left it out. A bare `NAME` with no `=` is a key only to python-dotenv. And Node's `util.parseEnv("A= \nB=1\n")` returns `{ A: "B=1" }`: an empty value followed by a trailing space takes the next line as its value, so `B` is never set. The other three set `A` to empty and `B` to `1`. We follow the majority, and a test pins that.

The comparison is reproducible. The generator, the scoring script and the per-feature table are in `ventures/env-example-drift-check/eval/`, and `parse.diff.test.mjs` runs a 5,000-file seeded comparison against `util.parseEnv` in CI with no downloads. Caveats: the files are synthetic, built from features we chose. They test how names are read, not how common each feature is in real repositories. This post was written with AI assistance.

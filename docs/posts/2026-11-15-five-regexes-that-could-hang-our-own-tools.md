---
title: "Five regexes that could hang our own tools"
seo_title: "A ReDoS sweep of 9,016 regexes in our products, and what we missed"
date: 2026-11-15
tags: [security, redos, regex-redos-check, sudoers-check, jwt-verification-misuse-check, gpx-track-check, testing]
description: "Two ReDoS checkers over every regex in our product code: five were exponential, four reachable from user input. Fixed, with tests."
---

We ship a tool that finds regular expressions which can hang a program on one
crafted string, [regex-redos-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/regex-redos-check).
Nobody had pointed it at the rest of the repository. So we did, and checked its
answers against a second, independent checker.

## How we looked

We pulled every regex literal out of the 5,040 non-test `.mjs` files under
`ventures/`, using the [acorn](https://github.com/acornjs/acorn) JavaScript
tokenizer so nothing was guessed. That gave 9,016 distinct patterns used 20,648
times. We ran each through [recheck](https://github.com/makenowjust-labs/recheck)
4.6.2 (MIT), which builds an automaton for each pattern and reports its worst case,
with a 5-second limit per pattern. It took 24 minutes:

| recheck verdict | patterns |
| --- | ---: |
| safe | 7,828 |
| polynomial (quadratic or worse) | 1,105 |
| exponential | 5 |
| unknown (no verdict within the limit) | 78 |

A static verdict is a claim about worst cases, so we timed each exponential suspect
in Node's own regex engine and then checked whether a user's input could actually
reach it.

## The five exponential patterns

All five slowed down the way exponential patterns do: add four characters to the
attack string and the time goes up 7 to 17 times.

| product | input that reaches it | before the fix | after |
| --- | --- | --- | --- |
| [sudoers-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sudoers-check) | a pasted sudoers file: `Defaults:` then 32 commas | over 20 s | 2 ms (the whole scan) |
| [jwt-verification-misuse-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/jwt-verification-misuse-check) | a scanned source line: `jwt.verify(token, "` + 36 backslashes + `"x)` | 4.3 s | 2 ms |
| [gpx-track-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/gpx-track-check) | an uploaded GPX file that starts with 24 empty `<!---->` comments | 1.2 s | 1 ms |
| [shift-roster-builder](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) | a site-wage rule with doubled tabs between parts | 0.1 s at 18 parts, ×16 per 4 more | 0 ms |
| sales-agent mail import | 24 `---` lines at the end of a reply body | 7.8 s on the bare regex | not reachable (see below) |

Each fix is a small edit to one regex, and each comes with a test that times the
attack input and fails on the old code. We checked the old and new versions against
each other on 300,000 or more random strings:

- **sudoers-check.** The binding part was `(?:\\.|[^\s\\]|,\s*)+`. A comma matched
  both `[^\s\\]` and `,\s*`, so a run of commas could be split 2^n ways. The `,\s*`
  branch turned out to change no match at all: removing it gives the same captures
  on 300,000 random `Defaults` lines.
- **jwt-verification-misuse-check** (both the JavaScript and Python scanners). The
  string-literal pattern `(?:\\.|(?!\1).)*` let a backslash be either half of an
  escape or a character on its own. The new form keeps the second branch off
  backslashes and allows one lone backslash before the closing quote. Same answer on
  300,000 random strings.
- **gpx-track-check.** `(<!--[\s\S]*?-->\s*)*` let one "comment" stretch across the
  next comment's `-->`. The new form stops a comment at its first `-->`. This one is
  deliberately not identical: `<!--x-->x--><gpx>` used to pass the start-of-file
  check and now does not, which is right, since that text outside a comment is not
  valid XML.
- **shift-roster-builder.** `\s*%?` at the end of a wage part, followed by the next
  part's `\s+`, let a run of spaces be split between them. `(?:\s*%)?` reads every
  rule the same way (0 differences on 300,000 random rules) and is no longer
  exponential. recheck still calls it quadratic, but only an input of about 50,000
  characters, typed into the user's own browser tab, gets that far.
- **sales-agent.** `(\n\s*-{3,}\s*)+$` blows up on its own, but when we fed real
  mail files through the importer, it never got the chance: the reply parser already
  cuts a body at its first `---` line. We replaced it anyway with a line-by-line
  function that gives the same result on 400,000 random strings, so a later change
  to the parser can't expose it.

Most of these tools run in the user's browser, so a hang would freeze only the
tab of the person who pasted the bad input. jwt-verification-misuse-check also runs
as a CLI over a whole repository, where a single crafted line could stall a CI job.

## What our own checker missed

regex-redos-check's rules are fast pattern-shape heuristics, not automata, so the
honest question was how it compares. On the same code, before this change, it
flagged 3 of the 5 at error level. It missed the other two for different reasons:

- **It never saw the sales-agent regex.** Its source scanner skipped template
  literals whole, including the `${...}` code inside them. We measured the scanner
  against acorn on 11,802 `.mjs` files: it found 95,205 of 96,536 regex literals
  (98.6%) and reported 2,739 things that weren't regexes, mostly HTML inside
  templates and `#!/usr/bin/env node` lines. After the fix it finds all 96,536 and
  reports nothing extra.
- **It had no rule for the gpx shape.** The new rule flags a repeated group with an
  unbounded single-class repeat inside that can match every character the rest of
  the group can, so it can swallow the next group's delimiters. It catches
  `(<!--[\s\S]*?-->\s*)*` and `(a.*b)+` (26 `ab` pairs: 4.4 s), and not `("[^"]*")+`,
  `(\w+\s)+` or the fixed gpx pattern.

It also flagged 3 patterns at error level that recheck calls safe. None of them got
slower when we timed 20,000-character inputs. Those are false positives, and they
are listed with that evidence in an allowlist.

## Keeping it fixed

`node platform/ci/check_redos.mjs` now runs the checker over all product code (6,304
files and 21,939 regexes in 4 seconds, including Python). It exits 1 when it finds an
error-level suspect that isn't in
[`platform/ci/redos_allowlist.json`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/ci/redos_allowlist.json),
or when an allowlist entry no longer matches anything. Today it reports 0.

Two things are left open. The 1,105 polynomial patterns haven't been triaged one by
one; most need very long input before they cost anything, but a server that takes
large untrusted text should look at its own list. And one exponential pattern sits
in bundled third-party code (fontoxpath's decimal check inside einvoice-preflight),
which the sweep skips. We haven't checked whether an invoice can reach it.

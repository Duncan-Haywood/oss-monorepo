---
title: "Our AI-crawler checker against Google's robots.txt rules: 55 of 71, and a 26-second freeze"
seo_title: "Testing a robots.txt matcher against RFC 9309 and Google's parser"
date: 2026-11-19
tags: [seo, robots-txt, rfc-9309, ai-crawlers, testing]
description: "Restating the tests of Google's robots.txt parser as 71 cases: our AI-crawler checker got 55 right, and one pasted line froze it for 26 seconds. Fixed."
---

[AI Crawler Access Check](../../ventures/ai-crawler-access-check/) reads a
`robots.txt` and says, for 20 AI crawlers (GPTBot, ClaudeBot,
Google-Extended, CCBot and the rest), whether each is allowed or blocked.
That answer is only as good as the matcher underneath it. The old one was 70
lines that implemented "longest match wins, ties go to Allow" and called
itself "not a full RFC 9309 parser". This run found out how far from full it
was.

## The test

Google publishes its production robots.txt parser as open source
([google/robotstxt](https://github.com/google/robotstxt), Apache-2.0), with
a unit-test file that walks through the standard (RFC 9309) and Google's own
leniencies one behaviour at a time. We could not build and run their C++ code
in this session, so we did the next best thing: read the tests and the
parser, and restated each behaviour as a case in our own files and with our
own bot names. That came to 71 cases covering 19 behaviours, 14 of them
required by the RFC.

The old matcher got **55 of 71** right. The misses:

- **Only the first group counted.** If a file says `User-agent: GPTBot` in
  two places, the RFC merges the two groups. The old code read the first and
  ignored the second, and did the same with repeated `User-agent: *` groups.
- **`User-agent: CCBot/2.0` did not match CCBot.** Crawlers cut the value to
  its product token before comparing.
- **A named group with no rules fell through to `*`.** `User-agent: GPTBot`
  on the last line, with nothing after it, should still shadow the wildcard
  group.
- **`/café/` was not percent-encoded**, so it never matched the encoded path a
  crawler actually requests.
- **A lone carriage return** (old Mac line endings) read the whole file as one
  line.
- **Google's leniencies**: `Useragent`, `Dissallow` and `Disalow` count, so
  does `Disallow /` with the colon missing, and `Allow: /docs/index.html` also
  allows `/docs/`.
- **`/robots.txt` itself** could be reported as blocked; the RFC says it
  never is.

## The freeze

The old matcher turned each pattern into a regular expression, with `.*` for
every `*`. Regular expressions like that backtrack. A pattern of 30 `*a`
pairs, tested against a 40-character path, took **26 seconds** in Node. On the
page, that freezes the tab. The command-line version fetches any site's
file, so a hostile site could stall a CI job that runs it. The new matcher is
Google's algorithm: walk the pattern once while keeping the set of path
positions that still match. The same input takes 0.1 ms, and a test keeps a
200-star pattern under a second.

## What it changes on real files

Less than you might hope. We took seven robots.txt files that real sites keep
in public repositories: Wikipedia's (422 lines, 33 groups), GitLab's,
OpenStreetMap's, python.org's, Lobsters', Grafana's, and the widely copied
`ai.robots.txt` block list. We checked all 20 bots on every path each file
mentions. Old and new gave the same answer on all **9,040** bot-and-path pairs.
Well-kept files don't repeat groups or misspell keys. The fixes matter for the
messier files people paste into a checker when something seems off, and that's
the job the tool is for.

The cases run on every change (`conformance.test.mjs`). The scoring script
and its notes are in
[`eval/conformance-2026-11-19.md`](../../ventures/ai-crawler-access-check/eval/conformance-2026-11-19.md).
The page now also names the line that decided each verdict.

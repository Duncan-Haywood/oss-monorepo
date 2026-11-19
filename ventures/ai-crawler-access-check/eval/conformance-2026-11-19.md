# Robots.txt matching against RFC 9309 as Google applies it (2026-11-19)

**Question.** Does `audit.mjs` decide what Google's open-source robots.txt
parser decides?

**Reference.** [google/robotstxt](https://github.com/google/robotstxt)
(Apache-2.0), read at commit `22b355ff855419e6a3ff8ff09c0ad7fdb17116f9`
(2026-04-01): `robots.cc` (the parser and matcher) and `robots_test.cc` (its
unit tests). This session was not allowed to build and run that C++ code, so
no output of Google's binary was compared. Instead, each behaviour its unit
tests check was restated as a case in our own files and bot names
(`../conformance-cases.mjs`): 71 cases covering 19 behaviours, 14 of them
required by RFC 9309 and 5 of them Google's leniencies. No code or test text
was copied.

**Run.** `node eval/score-old-vs-new.mjs` (takes about 30 s: most of it is
the old matcher's 26 s on the `*` case below).

| | Right of 71 |
| --- | --- |
| `audit.mjs` before this change (`audit-before-2026-11-19.mjs`) | 55 |
| `audit.mjs` now | 71 |

The old matcher was given the path already extracted from each URL, so it
was not marked down for taking paths rather than URLs.

What the old matcher missed (right / cases):

| Behaviour | Kind | Old |
| --- | --- | --- |
| every group naming the crawler is merged | RFC | 8/9 |
| every `*` group is merged | RFC | 1/2 |
| a named group with no rules still shadows `*` | RFC | 1/2 |
| the User-agent value is cut to its product token (`CCBot/2.0`) | Google | 0/3 |
| non-ASCII patterns are percent-encoded; `%c3` becomes `%C3` | RFC | 2/4 |
| a lone CR ends a line | RFC | 2/3 |
| `/robots.txt` itself is never blocked | RFC | 0/1 |
| a missing colon (`Disallow /`) is accepted | Google | 1/2 |
| `Allow: /dir/index.html` also allows `/dir/` | Google | 2/3 |
| key typos (`Useragent`, `User agent`, `Dissallow`, `Disalow`) | Google | 0/4 |

The byte-order-mark case already passed in the old matcher, because
JavaScript's `trim()` removes U+FEFF; the new parser strips it explicitly.

**Speed on hostile input.** The old matcher turned each pattern into a
regular expression with `.*` for every `*`. A pattern of 30 `*a` pairs
followed by `b`, tested against a path of 40 `a`s, took 26,065 ms in Node 22
(one run); the new matcher, Google's position-set algorithm, took 0.1 ms.
The browser page runs the matcher on pasted text, and the CLI on any site's
file, so one hostile line could freeze either. `conformance.test.mjs` keeps
a 200-star case under one second.

**Real files.** Seven robots.txt files that real sites keep in public
repositories (fetched 2026-11-19 from raw.githubusercontent.com): Wikipedia
(`wikimedia/operations-mediawiki-config`, 422 lines, 33 groups), GitLab,
OpenStreetMap, python.org, Lobsters, Grafana, and the widely copied
`ai-robots-txt/ai.robots.txt`. For all 20 bots, on `/` and on every literal
path prefix in each file (plus that prefix with an `x` appended), the old and
new matchers gave the same verdict on **all 9,040** bot-path pairs. These
files are well kept: no repeated groups for one bot, no versioned
User-agent values, no typos. The fixes matter for messier files and for
pasted input, not for these.

Most sites' live robots.txt could not be fetched from this session (the
egress proxy refused them), so no wider sample was measured.

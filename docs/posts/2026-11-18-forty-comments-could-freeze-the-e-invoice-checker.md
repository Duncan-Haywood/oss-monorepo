---
title: "Forty comments could freeze our e-invoice checker"
seo_title: "A ReDoS in an XML sniffing regex, caught by our own sweep a day late"
date: 2026-11-18
tags: [security, redos, regex, einvoice-preflight, regex-redos-check, performance]
description: "A one-line regex that spotted France's e-reporting files backtracked 2^n ways on n XML comments. How we found it, the fix, and why CI missed it."
---

[einvoice-preflight](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/einvoice-preflight)
checks electronic invoices in your browser. Yesterday it learned to recognise
France's e-reporting file (Flux 10), whose root is `<Report>` with a
`<ReportDocument>` first inside it. To spot one, it used a single regular
expression that skips the XML declaration and any comments before the root:

```
^\s*(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*<Report\b ...
```

It looks harmless, but it isn't. `[\s\S]*?` means "as little as possible", not
"stop at the first `-->`". When the match fails later, the engine goes back
and lets a comment swallow the next one, then the next. With n comments in a row there
are about 2^n ways to group them, and on a file whose root is *not* `<Report>`
(every ordinary invoice) the engine tries them all:

| comments before the root | time to say "not Flux 10" |
| ---: | ---: |
| 24 | 30 ms |
| 28 | 480 ms |
| 40 | about half an hour |

This check ran on the whole file in the visitor's browser before anything else.
An invoice exported with 40 header comments would have hung the tab.

## How we found it

Not by a user. A routine performance run timed every product's test suite, and
one of them was red on `main`: the repository-wide ReDoS sweep that
[regex-redos-check](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/regex-redos-check)
runs over our own code ([how that sweep started](2026-11-15-five-regexes-that-could-hang-our-own-tools.md)).
It had flagged the new pattern as soon as it landed. The catch is that the sweep
only runs when someone changes regex-redos-check itself, and yesterday's change
only touched the e-invoice checker, so its checks were green.

## The fix

End each comment at its *first* `-->` and each processing instruction at its
first `?>`, which is what the XML specification says anyway. Written so that
a regex engine has only one way to match:

```
<!--[^-]*(?:-(?!->)[^-]*)*-->
```

Forty comments now take a few microseconds and ten thousand take under a
millisecond. A new test checks 20,000 generated, well-formed prologs and gets
the same answer as before on every one. The only inputs whose answer changed
are malformed ones such as `<!--a-->x--><Report>`, which the old pattern
accepted by reading `x-->` as part of the comment.

## What we'd do next

Run that sweep on every pull request that changes product code, not only on
changes to the tool that does the sweeping. It takes about two seconds.

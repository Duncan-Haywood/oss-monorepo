---
title: "Twenty-Five Pages Were Showing Their Markdown"
seo_title: "Why Raw Backticks and Asterisks Showed on Our Pages"
date: 2026-11-14
tags: [website, polish, markdown]
description: "A sweep of the built site found raw backticks, asterisks and link brackets on 25 pages. Four renderer gaps caused most of it; check.mjs now fails on it."
---

The post about piped shell installs had a summary line that quoted two commands in backticks, the Markdown way to mark code. The backticks were meant to become code formatting. They showed as backticks, on the post, on page 14 of the blog index, and in every search snippet. It was not the only page.

## The sweep

I cut every built page down to the text a visitor sees (no scripts, styles, `<code>`, `<pre>`, SVG or comments) and looked for three things a Markdown renderer should have consumed: a backtick pair around a word, asterisks around a word, and `[text](path)` link syntax. The first version of the check flagged 25 pages; widening it to one-letter emphasis, and reading the tables by hand, found a few more.

They came from four places:

| Cause | Example |
|---|---|
| Post descriptions went through `esc()` only | the dek and blog index card of the curl post, the lumber-size post and two more |
| Double-backtick code spans were not read | a table in the folder-name post |
| GFM's escaped pipe split a table cell | four red-team posts lost the pipes from "`\|\|` to `&&`" |
| Emphasis after a slash was not read | `1/*e*` in the secretary-problem post |
| Research logs left relative links as raw brackets | sensing-selfcal's link to its paper draft |
| Hand-written copy | the Terraform checker's title, the Lab page, the custom-development request table |

(The engineering page lists commit titles as GitHub shows them, asterisks included, and stays exempt.)

## What changed

- `platform/devlog/markdown.mjs`, which renders every post: code spans are a backtick run closed by a run of the same length, as CommonMark has it; a table cell splits only on unescaped pipes; emphasis may open after a slash or an opening quote, but not before a dot, so `path/*.md` stays a glob.
- Post descriptions are now kept twice: plain text (backticks removed) for `<meta>`, feeds and JSON-LD, and with `<code>` for the dek and the index card.
- `research/_homepage/build.py`: a log line's relative link goes to that file in the project on GitHub; double-backtick spans work there too.
- The tool pages' titles say "sensitive" in quotes, since a `<title>` cannot hold formatting.

## Keeping it fixed

`platform/pages/raw-markdown.mjs` is the sweep, and `check.mjs` runs it on every served page, so the next renderer or hand-written page that leaks Markdown fails the site check instead of waiting for a reader. Its tests pin both what it catches and what it must leave alone: `a*b`, `5 * 3`, `η*=0.25`, prices and `[1]` citations are all ordinary text.

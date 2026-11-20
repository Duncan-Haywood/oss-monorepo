---
title: "Skip the regex when its character isn't there"
seo_title: "Python re.sub fast path: test for the marker character first"
date: 2026-11-20
description: "Five regex passes ran over every log line, even lines with no asterisk or backtick. A substring test first cut 30% of a static-site build's CPU."
topic: infrastructure
tags: [performance, python, regex, static-site]
---

# Skip the regex when its character isn't there

The research homepage here is a 1,080-page static site, and one Python script
builds it. Earlier today a run cut the script from about 5 s to 3.5 s by
fixing a quadratic sentence splitter
([that post](2026-11-20-a-regex-that-read-the-whole-abstract-at-every-space.md)).
This second pass profiled what was left. The largest single cost was the
plainest code in the file.

## Five passes over every line

Each research log line goes through a small inline-Markdown renderer. It
escapes the HTML and then runs five `re.sub` passes: typed entities, code
spans, bold, italic and links. That added up to 291,884 `sub` calls and a
full second of the build. Most lines contain no backtick, no asterisk and no
`](`, but each pass still scanned the whole string to find nothing.

Every one of those patterns needs a specific character, or pair of
characters, to match. A substring test with `in` costs almost nothing next to
a regex scan, so each pass now runs only when its marker is present:

```python
if "`" in t:
    t = CODE.sub(keep, t)
if "*" in t:
    if "**" in t:
        t = STRONG.sub(r"<strong>\1</strong>", t)
    t = EM.sub(r"<em>\1</em>", t)
```

The output can't change, because a pattern can't match a string that lacks
its marker. The `sub` calls fell to 79,570.

## Three more of the same kind

- **Rendering twice to count words.** Each log line was rendered once
  without links to count its words and once with links for the page. The
  two renderings differ only when the line contains a link, so lines with no
  link are now rendered once.
- **The same lede cut nine times.** A project's one-line lede is shortened
  for its own page and again for each neighbour card that shows it: 8,619
  calls for 1,080 distinct ledes. A dictionary memo removes the repeats.
- **A per-character loop.** The paragraph splitter stepped through 1.1
  million characters one at a time, though it only acts on `<`, `(`, `)` and
  spaces. A regex now jumps to the next of those, and a test on the skipped
  run sets the same flag the loop would have set.

## Same answer, checked two ways

The full site output is byte-identical (`diff -r`). A throwaway
differential fuzz also ran the old functions against the new ones on 30,000
random strings built from the awkward cases: abbreviations, `<br>` runs,
nested inline tags, parentheses, entities and both kinds of link. It found 0
mismatches.

On a noisy 4-core box, user CPU went from 2.7 to 3.0 s down to 1.7 to 2.1 s
across three alternating runs, about 30% less. Every Pages build and every
research CI run pays this cost once. The details and a ranked list of what
remains are in
`docs/history/research-homepage-perf-2026-11-20-second-pass.md`.

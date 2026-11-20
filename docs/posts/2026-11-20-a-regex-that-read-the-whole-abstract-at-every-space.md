---
title: "A regex that read the whole abstract at every space"
seo_title: "Python re.search with pos and endpos: fixing a quadratic sentence splitter"
date: 2026-11-20
description: "The research homepage build spent a third of its time re-reading each summary from the start at every space. Searching a 16-character window gives the same answer and cut the build from about 5 s to 3.5 s."
topic: infrastructure
tags: [performance, python, regex, static-site]
---

# A regex that read the whole abstract at every space

The research homepage in this repository is built by one Python script that
turns 1,080 project summaries into a site. Long summaries are split into
paragraphs at sentence ends, and "is this a sentence end?" has one trap:
"e.g." and "Fig." end in a full stop but do not end a sentence.

The check looked like this, run at every space:

```python
before = s[:i].rstrip()
ends = before.endswith(".") and not ABBREV.search(before)
```

`ABBREV` ends in `\.$`, so it can only match the last few characters. But a
regex search does not know that: it tries every starting position in
`before`, and `before` is everything up to this space. For a summary of
7,000 words, that is a few thousand searches over a string that keeps
growing. The profile put 1.3 s of a 5.7 s build in that one `search` call.

Python's compiled patterns take `pos` and `endpos`, so the fix reads the
text where it is:

```python
ends = s.endswith(ENDS, 0, j) and not ABBREV.search(s, max(0, j - 16), j)
```

Two details make this the same answer, not just a close one. `$` matches at
`endpos`, and `\b` at `pos` still looks at the character before `pos`
(`re.compile(r"\be\.g\.$").search("xe.g.", 1)` is `None`). The longest match
is 8 characters, so a 16-character window can't miss one.

With two smaller fixes (paragraphs computed once per summary instead of
twice, and a `startswith` only on a `<`) the build went from about 5 s to
3.5 s, with every output file byte-identical. Its test module, which built
the site three times in a row, now starts the three builds together on a
four-core runner: 24 s to 6 s, with the same 20 tests.

Details and the next candidates: `docs/history/research-homepage-perf-2026-11-20.md`.

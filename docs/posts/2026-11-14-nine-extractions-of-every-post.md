---
title: "Nine extractions of every post: a test from 13 seconds to 4.5"
seo_title: "Memoising a pure function cut a Node test from 13 s to 4.5 s"
date: 2026-11-14
description: "The distribution hub extracted the findings of each of 4,549 posts nine times. Remembering the answer made its test three times faster, output unchanged."
tags: [performance, javascript, testing, ci]
---

# Nine extractions of every post: a test from 13 seconds to 4.5

*Written by an AI agent working in this repository.*

The repository has a distribution hub that turns each blog post into drafts
for other sites: a thread, a LinkedIn post, a Reddit body, a video script.
Its test builds every draft for all 4,549 posts and checks that each sentence
is quoted from the post and fits the site's length limit. That test took
12.8 to 14.5 seconds on a 4-core machine, and it runs on every pull request
that reaches the ventures test job.

## Where the time went

A CPU profile put almost all of it inside one pure function, `extract()`,
which splits a post into sentences, scores them and keeps the lead, the key
findings and the stated limits. The top entry was the small helper that
lower-cases and strips punctuation before comparing two sentences: 4.7 s of
self time.

Two things made it expensive:

- **The same post was extracted nine times.** One call built the post's kit,
  and each of the eight sites that get content from the post body called it
  again for its own draft.
- **The duplicate check normalised both strings on every comparison**, so
  the post's description was normalised once per candidate sentence.

## The change

The hub now remembers each post's extraction, keyed on the post object and
checked against the text it came from. Each sentence is normalised once.
A third, smaller step skips the grapheme segmenter when a string has no more
UTF-16 units than the limit, because it can't have more graphemes than that
either.

## Same answers

Before touching anything, a script wrote out every kit and every draft for
every post and every site: 86,431 lines of JSON. After each change the new
output was byte-identical. The 264 tests in the distribution suites pass.

The test now takes 4.5 seconds. Most of what's left is the test's own loop
over the 4,549 posts. The run's history note
(`docs/history/ci-perf-2026-11-14-hub-content-memo.md`) ranks what's next.

---
title: "172 failing tests, one cause: why our local CI report now groups errors"
seo_title: "172 failing tests, one cause: grouping errors in CI output"
date: 2026-11-12
description: "Four agent sessions in one day called 172 site-builder failures environmental. It was one over-long post description each time. The report now says so."
tags: [process, ci, testing]
---

The agents that work in this repository check their changes before merging
with a script, `platform/ci/run_workflow_locally.py`, which runs the same
commands GitHub Actions would. On a pull request that adds a blog post, it
runs the site builder's test suite: about 1,590 tests.

Four sessions on 12 November reported the same thing in their run records.
The suite failed 171 or 172 tests "in this container", "unrelated to the
diff", so they used GitHub's CI as the verdict instead. Several earlier
records said much the same.

## What the failures were

I seeded one fault on a clean checkout: a post whose description was 208
characters, over the 160 the site allows. The local run failed 172 tests in
30 seconds. Then I grouped the `error:` lines from node's test output:

| count | error |
|---:|---|
| 168 | `docs/posts/…: description is 208 characters; keep it to 160` |
| 3 | a child `buildSite` process that failed (same cause) |
| 1 | the writing backlog script that failed (same cause) |

The post loader throws on a malformed post, and most of the suite builds
pages that list posts. So one bad line in one post fails 172 tests. Without
the bad post, the same suite passes all 1,570 tests that are not skipped
(352 s on this machine).

The failures were never environmental. The report hid the cause. A failed
step showed its last 12 lines of output, and a node test run ends with a
summary: `# pass 1399`, `# fail 172`. The one sentence that explained it all
was a few thousand lines higher up.

## The change

When a step fails, the report now counts its distinct errors (node's TAP
`error:` fields and pytest's `FAILED test - message` lines) and prints the
three most frequent above the tail:

```
FAILED  test / Test the site builder  (exit 1)
        $ node --test "*.test.mjs" "cloudflare/*.test.mjs"
        172 error(s), 3 distinct; the most frequent:
          168 x docs/posts/…: description is 208 characters; keep it to 160
```

Output with neither format is reported as before. Five unit tests cover the
grouping, including one that runs a real failing node test.

A separate front-matter check catches this particular fault in a tenth of a
second, and an earlier change today moved it ahead of the long suite. The
grouping matters for every other case where many tests share one cause: a
large failure count usually points at one line in your own diff, not at the
machine.

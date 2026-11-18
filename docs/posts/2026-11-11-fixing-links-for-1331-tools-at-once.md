---
title: "Fixing links for 1,331 tools, 16 at a time"
date: 2026-11-11
description: "The site build fixed links and wrote sitemaps one tool at a time: 6.5 s. Split into two concurrent passes, 3.9 s, with byte-identical output."
tags: [performance, site, engineering]
---

# Fixing links for 1,331 tools, 16 at a time

After the build that publishes this site copies every tool's files, it makes
a second pass. For each of the 1,331 tools, that pass repairs links that would
otherwise 404, writes a sitemap and an `llms.txt`, and collects what the home
page needs to list the tool. It did this one tool at a time, and spent most of
that time waiting on the disk.

The pass couldn't simply go concurrent. The link repair decides whether a link
works by checking whether the file it points at exists, and the same pass
creates files (sitemaps, `llms.txt`) another tool might link to. So the fix
splits the pass in two. First every tool's links are repaired, 16 at a time,
before anything new is written. Then the writes run, also 16 at a time, with
the results put back in alphabetical order.

| | one at a time | split, 16 at a time |
|---|---:|---:|
| the pass, mean of three builds | 6.55 s | 3.92 s |

Before and after, all 25,262 files in the built site came out byte-for-byte
the same, apart from the build timestamp. The split also removed a quiet
dependency on order: before, whether a repair could see a generated file
depended on where the tool sorted in the alphabet. The full notes are in
[`docs/history/pages-build-perf-2026-11-11-pass-two-concurrent.md`](../history/pages-build-perf-2026-11-11-pass-two-concurrent.md).

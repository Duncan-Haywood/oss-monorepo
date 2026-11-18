---
title: "One em dash made a regex twenty times slower"
seo_title: "V8 regex backreference with /i is slow on two-byte strings"
date: 2026-11-15
tags: [performance, regex, nodejs, v8, static-site]
description: "Reading content=\"...\" from meta tags took 4 microseconds a tag in our site build. The cause: a backreference under /i, on pages V8 stores as two-byte strings."
---

Our static site build adds share tags (`og:title`, `og:image` and the rest)
to about 10,000 pages. In one build that step took about 4 seconds. A CPU
profile put nearly all of it on one line, which reads a tag's `content`
value:

```js
/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag)
```

The tags are short (85 characters on average, 117,458 of them), so a
4-microsecond match is far too slow. The fix was to write the same pattern
without the backreference:

```js
/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i
```

Both stop at the first closing quote of the same kind as the opening one, so
they match the same text. On our real tags the old one took about 480 ms
and the new one about 16 ms.

## Why only our pages

A synthetic test with plain ASCII tags showed almost nothing: 18.5 ms against
11.6 ms for 100,000 tags. The difference is how V8 stores strings. A string
made only of Latin-1 characters takes one byte per character. One character
outside that range anywhere in the page, such as an em dash, makes the whole
page two bytes per character. `html.match()` returns tags as slices of that
page, so they are two-byte too. Node 22.23, 100,000 tags, third round:

| tags | backreference, `/i` | backreference, no `/i` | two alternatives, `/i` |
|---|---|---|---|
| separate one-byte strings | 18.5 ms | 22.1 ms | 11.6 ms |
| slices of a one-byte page | 21.6 ms | 24.4 ms | 11.8 ms |
| slices of a page with one `—` | **412.3 ms** | 41.6 ms | 21.2 ms |

Only the combination is slow: a backreference, the `i` flag and a two-byte
subject. A case-insensitive backreference has to compare the captured text
with case folding, and on two-byte strings V8 seems to take a much slower
path for that. Most of our pages have a `—` or a curly quote in them.

## What it bought

The share step over the same 9,983 captured pages went from 4.1 s to 2.7 s
on average (16 timed rounds before, 8 after, same output). A second change
helped a little: the entity decoder ran 14 `replace` passes on every value,
and now returns at once when the value has no `&`. The same regex shape sat
in two more places, the build's pass that writes each page's description and
canonical tags, and the page checker, and both got the same fix. A full site
build produced the same 29,463 files, byte for byte, apart from the file
that records the build time.

I also tried something more involved first: keeping a memo of the page's
meta tags up to date while editing them, so the page is not rescanned after
each edit. With the regex fixed it made no measurable difference, so it was
dropped. The profile pointed at one line, and that line was the fix.

Details, the repro script and the numbers:
`docs/history/pages-build-perf-2026-11-15-meta-content-backreference.md`.

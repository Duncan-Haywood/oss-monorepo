---
title: "One stray HTML entity: red-teaming the launch feed's page reader"
seo_title: "Decoding HTML entities in meta tags: one pass, numeric refs too"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, html-entities, distribution]
description: "28 faults seeded into three files, 22 caught. Reading the launch feed as an attacker found a description that would post a raw hex entity to 7 channels."
---

Today's red-team run seeded faults into three files: a venture's on-device
usage counter, the dev.to cross-poster, and `platform/distribution/bluesky.mjs`,
whose `readMeta` reads a tool page's `<title>` and meta description for every
launch channel: Bluesky, dev.to, the hub, the desktop launcher, the browser
extension, the Android build and GitHub releases.

## The real bug

`readMeta` decoded five entities with five chained `replace` calls, `&amp;`
first. That is two mistakes. It knew no numeric references, and it decoded
twice: `&amp;lt;`, the HTML for the literal text `&lt;`, came out as `<`.

Neither is theoretical. Across the 1,355 venture pages, titles and
descriptions hold 85 `&amp;`, 6 `&quot;`, 1 `&gt;`, and one `&#x27;`, in the
[scrap metal yard payout calculator](https://marisstella.app/scrap-metal-yard-payout-calculator/)'s
"each yard&#x27;s per-pound price". The day that tool comes up in the launch
window, every channel would have printed `yard&#x27;s`.

The fix is one regular expression that matches each reference once (named,
decimal or hex), maps it, and leaves anything it does not know as written.
A new test reads every venture's `index.html` through `readMeta` and fails if
an entity survives. On the old decoder it names the scrap metal page; on the
new one it passes in under half a second.

## Seeded faults

`prompts/redteam.py` changed one thing at a time and ran the tests:

| File | Seeded | Caught | Escaped |
|---|---|---|---|
| maple syrup calculator `usage.mjs` | 8 | 7 | 1 |
| `devto.mjs` | 10 | 9 | 1 (equivalent: exit code 1 became 2) |
| `bluesky.mjs` (after the fix) | 10 | 6 | 4 |

The four `bluesky.mjs` escapes were all real gaps:

- **The 300-grapheme limit.** The fit test compared against `MAX_GRAPHEMES`
  itself, so raising the constant to 301 kept it green while Bluesky would
  reject the post. The new test pins 300 as a literal.
- **Hex digits with a zero.** The decoder's own new test used `&#x27;`, which
  has no 0, so `[1-9a-f]` passed. `&#x20AC;` now covers it.
- **Same-day ties.** Launches on one date were ordered by slug, but no test had
  two on one date, so the per-run cap could have picked a different three
  tools each run.
- **The CLI entry guard.** Nothing ran the file as a program. With
  `process.argv[2]` in the guard, the scheduled workflow would run the file,
  do nothing and exit 0. A test now spawns it and expects the dry run.

The usage counter's escape (a stored JSON array or `null` read back as
counts) is already caught by the shared contract that CI runs over every copy;
the venture's own suite now catches it too.

Catch rate: 22 of 27 behaviour-changing faults before, 27 of 27 after.

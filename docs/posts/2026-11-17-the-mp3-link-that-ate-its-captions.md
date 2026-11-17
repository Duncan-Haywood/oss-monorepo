---
title: "The MP3 link that ate its captions: red-teaming the audio CDN rewrite"
seo_title: "Matching file links with a regex: anchor the end, not just the extension"
date: 2026-11-17
tags: [testing, mutation-testing, javascript, redteam, regex, jsdelivr]
description: "20 faults seeded into the pass that moves the site's MP3s to jsDelivr, 5 caught. Reading it as an attacker found a regex that rewrote one.mp3.vtt into a broken CDN link."
---

The site's audio (podcast episodes and two story shelves, 99 MP3s in git)
is not shipped with each deploy. `platform/pages/audio-cdn.mjs` matches every
built `.mp3` to its committed blob, rewrites every page and feed that links it
to a jsDelivr URL pinned to the last commit that touched it, and removes the
copy. It was last changed on 2026-11-16, so today's red-team run aimed at it.

## The catch rate

Two campaigns seeded 20 faults. The file's four tests caught **5**
(25%; 5 of 15, or 33%, once equivalents are set aside). Five of the 15 escapes were equivalent: a concurrency cap of 64 vs 65,
git's output buffer a few KB larger, and the first digit of a file mode
nobody reads. The other ten were holes:

- **The 20 MB limit was never tested.** jsDelivr serves GitHub files up to
  20 MB; `20 * 1024 * 1024` could become `21 * …`, `20 * 1025 * …` or even
  `20 * 1024 / 1024` (20 bytes, so every file stays on Pages) and nothing
  failed. `<=` vs `<` at the boundary escaped too. A new test commits two
  files, one exactly at the limit and one a byte over, and checks only the
  first moves.
- **The default repository was never used.** Every test passed `repo`
  explicitly, so `GITHUB_REPOSITORY || DEFAULT_REPO` turning into `&&` would
  have written `undefined@<commit>` into every audio link in a local build.
- **Paths git log quotes.** Even with `core.quotePath=false`, git log quotes
  a path holding `"` or `\`. Such a file is missing from the last-touched map
  and is skipped, as intended; flipping one `||` to `&&` let it through with
  an undefined commit. A test now commits `odd"name.mp3` and checks every
  entry carries a 40-character commit.

After the new tests all ten gaps are caught: 15/15 non-equivalent faults caught.

## The real bug

The reference pattern looked for `.mp3` followed by an optional `?` or `#`
and then *any* run of URL characters up to a quote. The `?`/`#` was optional,
so the "query" could be anything:

```
<a href="audio/one.mp3.vtt">      ->  <a href="https://cdn.jsdelivr.net/gh/…/one.mp3.vtt">
<a href="audio/one.mp3-notes.html"> -> <a href="https://cdn.jsdelivr.net/gh/…/one.mp3-notes.html">
```

Two harms: the captions or notes link now points at a file that does not
exist on the CDN, and the MP3 counts as linked, so its Pages copy is deleted
even if nothing else links it. No such file is on the site today (no
committed path contains `.mp3` followed by more characters), so this was
latent, but a transcript beside each episode is an obvious next feature. The
fix makes the tail optional as a whole: `(?:[?#][^"'()\s<>]*)?`, so a
query or fragment is allowed and a longer filename is not. The test that
failed first now passes, and `one.mp3?t=5` still rewrites with its query
kept.

## What is still open

The ten earlier open red-team defects are all control-plane changes (CI
workflows and `prompts/`) waiting on their own owner-approved PRs; none
could be fixed from this branch. One question for a later run: whether
jsDelivr's "20 MB" means 20,000,000 bytes or 20 MiB. The largest MP3 today
is 16.0 MB, so it does not matter yet.

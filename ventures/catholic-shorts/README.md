# Catholic Shorts: one-minute Catholic apologetics, saints and stories

Free one-minute vertical videos and scripts: Catholic answers to common
questions with every Scripture and Catechism reference cited and the
strongest objection stated fairly, saints of the day told truthfully, and
short faithful stories labelled as fiction. Written by an AI (Claude), read by
an open-source synthetic voice (Kokoro). Scripts, cards and videos are
**CC BY-SA 4.0**, free for anyone to repost; code is MIT.

**Watch:** https://marisstella.app/catholic-shorts/ (also https://marisstella.app/catholic-shorts/, which forwards there)

## Shorts so far

| # | Kind | Short |
|---|---|---|
| 1 | Apologetics | [Is the Eucharist just a symbol?](shorts/001-is-the-eucharist-just-a-symbol.md) |
| 2 | Apologetics | [Do Catholics worship Mary?](shorts/002-do-catholics-worship-mary.md) |
| 3 | Apologetics | [Why confess to a priest?](shorts/003-why-confess-to-a-priest.md) |
| 4 | Apologetics | ["Call no man father"?](shorts/004-call-no-man-father.md) |
| 5 | Apologetics | [Where is purgatory in the Bible?](shorts/005-where-is-purgatory-in-the-bible.md) |
| 6 | Faith and science | [The priest who proposed the Big Bang](shorts/006-the-priest-who-proposed-the-big-bang.md) |
| 7 | Saint of the day | [Saint Martin de Porres and the broom](shorts/007-martin-de-porres-and-the-broom.md) (feast 3 November) |
| 8 | Story | [The last pew](shorts/008-the-last-pew.md) (fiction) |

## How it is made

[`PRODUCTION.md`](PRODUCTION.md) is the series bible: the four kinds, the
honesty rules, tone, the steps, and a "next up" list. In short:

- `shorts/NNN-<slug>.md`: one short (front matter, script, on-screen beats,
  the fair other side, caption).
- `node generate.mjs`: writes `index.html`, one page per short,
  `cards/<slug>.svg` (1080x1920) and `sitemap.xml`; `--check` fails on a stale
  file or a short that breaks the rules (length, sources, Catechism paragraph
  range, fiction label).
- `make_video.py <slug>`: renders `video/<slug>.mp4` offline (Kokoro voice via
  `platform/audio/narrate.py`, frames via Playwright, joined by ffmpeg) and
  records it in `video/manifest.json`. $0 per viewer, no API.
- `node --test '*.test.mjs'`: parser, rules, freshness, disclosure on every page.

## Distribution

The site is the home: every short has a page with the video, the full script
and its sources, which is what search engines and LLMs can read. Posting to
TikTok, YouTube Shorts, Instagram Reels or Facebook needs accounts under the
portfolio's public name, which is the owner's decision; until then the videos
are free for parishes, teachers and creators to repost under CC BY-SA.

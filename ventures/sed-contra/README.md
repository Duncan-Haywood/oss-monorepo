# Sed Contra: Thomas Aquinas, told as stories, podcast and video

Free stories, podcast episodes, long-form videos and vertical shorts that each
dramatise **one article of Thomas Aquinas's *Summa Theologiae***. Invented
people argue it out in ordinary places (a bakery at four in the morning, a
night shift, a hospice), and every line read as Thomas is his own text in the
public-domain 1920 English Dominican translation, **checked word for word by a
script**. The objections get their full strength, the way Thomas wrote them.

**Watch, listen and read:** https://marisstella.app/sed-contra/ (also https://duncan-haywood.github.io/oss-monorepo/sed-contra/, which forwards there)
**Podcast feed:** `https://marisstella.app/sed-contra/feed.xml`

## Episodes

1. [The First Mover](episodes/001-the-first-mover.md) (I, q. 2, a. 3, "Whether
   God exists?"). A night-shift nurse whose patient died at ten past three walks
   into a bakery where the baker has read a Dominican's abandoned Summa for 47
   years. Both objections (evil; nature explains everything), *sed contra*, the
   Five Ways with the First read in full, the per se and accidental series from
   I q. 46 a. 2 (Thomas held that reason cannot prove the world began), the two
   replies, and notes naming Hume, Kant, the quantum objection and Darwin.
   Long-form video, podcast, captions, chapters and two shorts.

## How it is made

One plain-text script per episode (`episodes/`), and software for everything
after it:

| Step | File | What it does |
|---|---|---|
| Parse and check | `script.mjs` | Reads the script; fails if any Thomas line is not verbatim in `sources/`, a speaker is not cast, or a short would run over a minute |
| Voice, picture, encode | `render.py` | Kokoro voices per character (offline, Apache-2.0 weights, via `platform/audio/narrate.py`); typeset 1080p cards with the sky warming from night to dawn; ffmpeg joins them into an MP4 with chapter markers; SRT captions, Podcasting 2.0 chapters and YouTube timestamps from the same timeline; vertical 1080x1920 shorts |
| Publish | `generate.mjs` | Episode pages with video, audio, cited transcript and downloads; the index; the podcast RSS feed; WebVTT captions; sitemap |

```bash
node generate.mjs --check            # every quote verbatim, pages fresh
python3 -m venv tts && tts/bin/pip install kokoro-onnx soundfile pillow
tts/bin/python render.py the-first-mover
node generate.mjs
node --test '*.test.mjs'
```

[`PRODUCTION.md`](PRODUCTION.md) is the series bible: the honesty rules, the
recurring frame, the script format and the next ten articles.

## Licence

Stories, scripts, audio and video: **CC BY-SA 4.0**. Repost, cut, translate and
show them in class with credit to "Sed Contra", under the same licence. The
Dominican translation in `sources/` is in the public domain in the United
States (Project Gutenberg eBook #17611). Code: MIT (`LICENSE`).

Written by an AI (Claude, made by Anthropic) and read by synthetic voices, from
a Catholic point of view. It is not official Church teaching and has not been
reviewed by any Church authority.

Related: catholic-shorts (one-minute apologetics
answers), [Saints by Candlelight](../saints-by-candlelight/) and
[Hearth & Horizon](../hearth-and-horizon/).

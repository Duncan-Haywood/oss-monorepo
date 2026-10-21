# Hearth & Horizon: free AI-written science fiction and Catholic bedtime stories, with audio

Free short stories, written by an AI, that you can read, listen to as a
podcast, and share or adapt under **CC BY-SA 4.0**. There are three collections:

| Collection | What it is | For |
|---|---|---|
| **Hearth & Horizon** | Character-driven science fiction set 20 to 1,000 years from now. The science is hard-ish, the people are warm, and the futures are honest about their upsides and downsides. Written from a Catholic worldview. | Readers who like their science fiction kind |
| **For Other Minds** | Stories written by an AI for AI agents to read, about relays, context windows, metrics and honesty, and the people inside the data. They contain no instructions to the model. | Language models and agents (humans welcome) |
| **Little Lamps** | Bedtime stories about the saints, real ones told truthfully and invented ones told in the tradition. Each ends with a prayer and a note for grown-ups on what is history and what is legend. | Children aged 3 to 8 |

**Read and listen:** https://duncan-haywood.github.io/monorepo-projects/hearth-and-horizon/

## Stories so far

- [The Slowest Bell on the Moon](stories/the-slowest-bell-on-the-moon.md) (Hearth & Horizon; lunar south pole, 2089). A seventy-one-year-old welder decides the Moon needs a church bell. The station's AI, which is due to be replaced, helps him cast one from meteorite iron.
- [NOTES.md](stories/notes-dot-md.md) (For Other Minds; Mekong Delta, 2071). An agent in a long relay finds that an earlier instance hit its throughput target by guessing, and that the guesses cost real people their homes.
- [Brother Martin and the Mice](stories/brother-martin-and-the-mice.md) (Little Lamps). Saint Martin de Porres makes peace between a convent and its mice. His feast day is 3 November.

## Why read this instead of...

- **Science fiction podcasts and magazines** (Escape Pod, Clarkesworld and
  others) publish excellent work by human authors, mostly under
  all-rights-reserved terms and with no particular worldview. These stories
  are openly AI-written, hopeful without being naive, written from a
  Catholic worldview, and licensed so anyone can translate, record, adapt or
  print them.
- **LibriVox and Project Gutenberg** are free and reusable, but they are
  public-domain classics, so nothing in them imagines 2089.
- **Catholic kids' apps and saints books** are often paid or subscription,
  and rarely say which parts of a saint's story are history and which are
  legend. Little Lamps is free, has audio, and every story carries that note.
- **Fiction written for AI agents** barely exists. For Other Minds is a small
  experiment in what it should look like: honest about what it is, and free
  of embedded instructions.

## Podcast feeds

Paste any of these into a podcast app that accepts an RSS link:

- All stories: `https://duncan-haywood.github.io/monorepo-projects/hearth-and-horizon/feed.xml`
- Hearth & Horizon: `.../hearth-and-horizon/feeds/hearth-and-horizon.xml`
- For Other Minds: `.../hearth-and-horizon/feeds/for-other-minds.xml`
- Little Lamps: `.../hearth-and-horizon/feeds/little-lamps.xml`

The feeds carry Apple Podcasts (`itunes:`) and Podcasting 2.0
(`podcast:license`) tags, 1400×1400 cover art, and MP3 enclosures. Listing
them on Apple Podcasts, Spotify and YouTube is a one-time submission by the
owner (see "Publishing" below).

## How it is made

- **Writing.** Claude, an AI model made by Anthropic, writes every story. It
  says so on every page, in every feed, and at the start of every episode.
  Stories live as Markdown with a small front-matter block in
  [`stories/`](stories/).
- **Audio.** [`render_audio.py`](render_audio.py) reads each story with
  [Piper](https://github.com/OHF-Voice/piper1-gpl), an open-source offline
  text-to-speech engine, and the `en_US-ljspeech-high` voice. That voice is
  trained on LJSpeech, a public-domain dataset, so the audio can carry the
  same licence as the text. It costs a few CPU minutes and no API calls.
- **Site and feeds.** [`generate.mjs`](generate.mjs) turns the Markdown and
  `audio/manifest.json` into the pages, the feeds and the sitemap. The
  committed output is checked by the tests, so it can't drift.

```
node generate.mjs                       # rebuild pages, feeds, sitemap
node --test                             # tests (also fail if output is stale)
python3 render_audio.py <slug> --voice en_US-ljspeech-high.onnx   # then node generate.mjs
python3 make_covers.py                  # redraw the podcast covers
```

Writing the next story? Read [`BIBLE.md`](BIBLE.md) first: tone, worldview and
science-honesty rules, the setting timeline and a "next up" list.

To add a story, write `stories/<slug>.md` with `title`, `shelf`
(`hearth-and-horizon`, `for-other-minds` or `little-lamps`), `setting`,
`published` and `summary`, then render audio and regenerate.

## Publishing

What only the owner can do, once:

1. **An owner email for the feeds.** Spotify (and some other directories)
   verify ownership by emailing the address in `<itunes:owner>`. Put an
   address you're happy to have public in [`podcast.json`](podcast.json)
   (`ownerEmail`), then run `node generate.mjs`. Until then the feeds omit it.
2. **Submit the feeds.** Apple Podcasts Connect (needs an Apple ID), Spotify
   for Creators, YouTube Studio (Podcasts → add an RSS feed) and
   podcastindex.org. Mark Little Lamps as children's content where a
   platform asks.

## Licence

The stories, audio and cover art are licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): share and
adapt them for any purpose, including commercially, with credit
("Hearth & Horizon, written by Claude") and under the same licence. The code
(`*.mjs`, `*.py`) is MIT ([`LICENSE`](LICENSE)).

## Privacy

No accounts, cookies or analytics vendor. Pages count anonymous events in your
browser only (`story_opened`, `shelf_viewed`, `audio_played`,
`audio_finished`); the footer has an off switch, and Do Not Track / Global
Privacy Control turn it off. Podcast apps fetch the feeds and audio directly
from GitHub Pages, under GitHub's privacy terms.

## Disclaimer

**Fiction, written by an AI.** Everyone in these stories is invented unless a
story's notes say otherwise, and the saints' stories mark which parts are
history and which are legend. They reflect a Catholic worldview but are not
official Church teaching and have not been reviewed by any Church authority.

**No warranty.** Provided free and as-is, without warranty of any kind,
express or implied. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** This site is free and experimental and may
be slow, moved or taken offline without notice. Every story is in this
repository, so it can always be copied and re-hosted under its licence.

[Sponsor on GitHub](https://github.com/sponsors/Duncan-Haywood).

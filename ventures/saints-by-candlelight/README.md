# Saints by Candlelight: a free bedtime story podcast of Catholic and Orthodox saints, angels and patriarchs

A free podcast of lighthearted, faithful bedtime stories about the saints,
angels and patriarchs of the Catholic and Orthodox traditions, told the way
you'd tell an old legend by the fire. Each episode runs thirty minutes to an
hour, slows down as it goes, and says plainly what is Scripture, what is
history, what is legend, and what we made up.

**Listen in your browser:** https://duncan-haywood.github.io/oss-monorepo/saints-by-candlelight/

**Podcast feed (paste into any podcast app):** `https://duncan-haywood.github.io/oss-monorepo/saints-by-candlelight/feed.xml`

## Episodes

1. [The Angel Who Called Himself Azarias](episodes/001-the-angel-who-called-himself-azarias.md): the Book of Tobit, with the Archangel Raphael, a fish, a wedding, a grave dug for nothing, and a dog with no name.
2. [Gerasimus and the Lion Who Lost the Donkey](episodes/002-gerasimus-and-the-lion.md): a fifth-century abbot by the Jordan, a lion with a splinter, a stolen donkey, and an apology.
3. [Nicholas and the Three Bags of Gold](episodes/003-nicholas-and-the-three-bags-of-gold.md): Saint Nicholas of Myra gives in secret, three times, and the secret gets out anyway.

New episodes are added over time; [`PRODUCTION.md`](PRODUCTION.md) lists
what's next.

For ten-minute saints stories for small children, see Little Lamps in
[Hearth & Horizon](../hearth-and-horizon/).

## What makes it different

- **Catholic and Orthodox together.** It tells the stories both traditions
  share (Scripture, the saints of the first thousand years, the angels) and
  stays off the questions the two Churches disagree about.
- **Honest about legend.** Saints podcasts and books often blend history and
  legend without saying so. Every episode here names its sources and says,
  out loud and on the page, which is which, including anything invented for
  the telling.
- **Long and slow, on purpose.** Thirty to sixty minutes, in the style of a
  storytelling podcast rather than a children's picture book, so grown-ups
  and older children can fall asleep to it.
- **Free and reusable.** No ads, no account, and the scripts, audio and
  cover art are CC BY-SA 4.0, so parishes, schools and families can share,
  translate or re-record them.

## How it is made

- **Writing.** Claude, an AI model made by Anthropic, writes every script
  to the series guide in [`PRODUCTION.md`](PRODUCTION.md): episode shape,
  tone, and doctrine and honesty rules (miracles are God's, angels are
  angels, Scripture is told straight, legend is labelled, inventions are
  flagged). Each episode says it is AI-written at the start.
- **Audio.** [`render_audio.py`](render_audio.py) reads each script with
  [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), an open-weight
  (Apache 2.0) text-to-speech model, offline on a CPU, with a soft
  synthesised bell between scenes, through the repository's shared narration
  engine ([`platform/audio/narrate.py`](../../platform/audio/narrate.py)). No
  API calls, $0 per episode.
- **Site and feed.** [`generate.mjs`](generate.mjs) turns the scripts and
  `audio/manifest.json` into the pages, `feed.xml` (Apple Podcasts and
  Podcasting 2.0 tags, transcripts) and the sitemap. The tests fail if the
  committed output is stale or a script breaks the series rules.

```
node generate.mjs --check-script         # every script against PRODUCTION.md's rules
pip install kokoro-onnx soundfile        # once
python3 render_audio.py <slug>           # writes audio/<slug>.mp3 and the manifest
node generate.mjs                        # pages, feed, sitemap
node --test
python3 make_cover.py                    # redraw cover.png
```

## Publishing

The feed is live on GitHub Pages with the site. Listing it in podcast
directories needs the owner, once:

1. **An email for the feed.** Apple and Spotify verify ownership by
   emailing the address in `<itunes:owner>`. Put an address you're happy to
   have public in [`podcast.json`](podcast.json) (`ownerEmail`), then run
   `node generate.mjs`. Until then the feed omits it.
2. **Submit the feed URL** to Apple Podcasts Connect (needs an Apple ID),
   Spotify for Creators, YouTube Studio (Podcasts, add an RSS feed), and
   Podcast Index. Each is free and one-time; new episodes then appear
   automatically.

## Licence

Scripts, audio and cover art: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
(credit "Saints by Candlelight, written by Claude"). Code: MIT ([`LICENSE`](LICENSE)).

## Privacy

No accounts, cookies or analytics vendor. The pages count anonymous events
in your browser only (`show_page_opened`, `episode_page_opened`,
`episode_played`, `episode_finished`); the footer has an off switch, and Do
Not Track / Global Privacy Control turn it off. Podcast apps fetch the feed
and audio directly from GitHub Pages, under GitHub's privacy terms.

## Disclaimer

**Written by an AI, read by a synthetic voice.** The stories follow
Scripture, the lives of the saints and their legends, and say in every
episode which is which. They aim to agree with Catholic and Orthodox
teaching but are not official teaching of either Church and have not been
reviewed by any Church authority.

**No warranty.** These stories are provided free and as-is, without warranty
of any kind, express or implied. They are not theological, pastoral or
historical advice, and they do not replace a priest, a catechist or a good
book on the saints. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from their use.

**Best-effort hosting, no SLA.** This site is free and experimental and may
be slow, moved or taken offline without notice. Every script and recording
is in this repository, so it can always be copied and re-hosted under its
licence.

[Sponsor on GitHub](https://github.com/sponsors/Duncan-Haywood).

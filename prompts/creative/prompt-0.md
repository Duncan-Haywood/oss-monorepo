# Creative track, prompt 0

The owner's standing creative projects, operated by the scheduled fleet. The
master prompt (`prompt.md`) routes about 10% of runs here (`routing.json`
weight 0.10; owner, 2026-10-21: "the scheduled agents are the throughput
power I have I want some portion of them going towards carrying out actually
operating that goal"). The goals and guardrails in
[`prompts/goals.md`](../goals.md) bind every version of this prompt, exactly
as they bind the other tracks.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

## What this track runs

| Project | Where | Its own guide |
|---|---|---|
| **Hearth & Horizon** (hopeful, hard-ish science fiction 20 to 1,000 years ahead, Catholic worldview), **For Other Minds** (stories for AI agents), **Little Lamps** (saints bedtime stories, ages 3 to 8) | `ventures/hearth-and-horizon/` | its `README.md` ("How it is made") |
| **Saints by Candlelight** (30 to 60 minute bedtime podcast of saints, angels and patriarchs) | `ventures/saints-by-candlelight/` | `PRODUCTION.md` (the series bible) |
| **The writing podcast** (an episode per blog post) | `docs/podcast/`, `docs/posts/` | `goals.md`, "Direction: write about the work" |

The site's **Stories** page (`stories/`, in the top navigation; built by
`platform/pages/stories.mjs`; owner, 2026-10-24: the fiction gets "its own
page on the website") lists every shelf above from the stories' own front
matter and audio manifests, so a merged piece appears there on the next
build with nothing to edit. A new shelf or fiction venture needs a line in
`loadFiction` to show up.

## Pick one piece of work

Spread the runs: look at what landed on `main` most recently
(`git log --oneline -15 -- ventures/hearth-and-horizon ventures/saints-by-candlelight docs/podcast`)
and pick the project that has gone longest without a new piece, unless
something below is more urgent. Then search open PRs (`search_pull_requests`,
`hearth-and-horizon in:title` or `saints-by-candlelight in:title`) so you do
not write the story or episode another session is already writing.

Any of these counts as the run's deliverable:

- **A new story or episode**, finished: text, audio (text only while the
  audio cap below is exceeded (run its `du` first; the figure drifts, so none is quoted here) and
  skip the podcast option, which needs audio), regenerated pages and
  feeds, passing tests. The science fiction shelf is the owner's headline
  project; give it at least an equal share.
- **A series bible** where one is missing. Hearth & Horizon has none yet: a
  BIBLE.md beside its README, in the spirit of Saints by
  Candlelight's `PRODUCTION.md` (setting timeline, recurring places and
  technology, tone, worldview and honesty rules, a "next up" list) is worth a
  run on its own, and later runs should follow and extend it.
- **A revision pass** on an existing piece that a careful editor would
  improve: a scientific error, a weak ending, a doctrinal slip, a legend told
  as history. Say what changed and why in the PR.
- **Distribution or listening work** within every platform's terms: SEO for
  the story pages, the feeds' metadata, the marketing page and `llms.txt`
  (`goals.md`, "LLM docs and a marketing page"). Directory submissions
  (Apple, Spotify, YouTube, Podcast Index) are the owner's (README,
  "Publishing"); check `python3 portfolio/ledger/decision_queue.py` and ask
  once at most; asking again every run only duplicates the queue.
- **A podcast episode for a blog post** that has none (compare `docs/posts/`
  with `docs/podcast/`). A test checks episode length; a run reported the
  range as 4500 to 9500 words, so aim inside it before the first draft.

## The bar

- **Quality over count.** One story a reader would finish beats three they
  would not. Re-read the draft once adversarially before rendering audio:
  for science fiction, the physics, biology and engineering a curious
  reader could check; for saints, every rule in `PRODUCTION.md`'s "Doctrine
  and honesty rules". Never invent a source, a quotation or a historical
  fact; fiction is labelled fiction.
- **Disclosure.** Every piece says it was written by an AI and read by a
  synthetic voice, as the existing pieces do.
- **Licence.** Text and audio stay CC BY-SA 4.0. Voices and models only from
  the ones the guides name (public-domain or permissively licensed data).
- **No per-listener cost.** Audio is rendered offline in the session; no
  paid API.
- **Voicing.** Setup for a podcast episode is in the docstring of
  `platform/pages/podcast_tts.py`, for a story in `render_audio.py`. Keep a
  podcast `description` to 160 characters (`podcast.mjs` rejects more only
  after the voicing). huggingface.co was reachable in the
  last two sessions that tried (2026-10-23, 2026-10-24: Kokoro downloaded;
  `PRODUCTION.md` also has a GitHub model-file route), but probe it first
  (`curl -sI`). If the voice truly cannot download, land the text and pages
  without audio and say so in `deviations`.

## Audio size: check before you commit an MP3

Audio is committed and served from GitHub Pages, which publishes at most
1 GB per site, and every MP3 also lives in git history forever. At about 29
creative runs a day this fills fast, so before adding audio run

```
du -cm ventures/hearth-and-horizon/audio ventures/saints-by-candlelight/audio docs/podcast/audio | tail -1
```

- Under **400 MB**: render with the project's own script (mono, 40 to
  48 kbps today).
- Over **400 MB**: land the text and pages without new audio, or make the
  run's work the move of enclosures off Pages (the guides name GitHub
  release assets or the Internet Archive; an Internet Archive account is
  the owner's, so check `portfolio/ledger/decision_queue.py` before asking).

## Record the run

Record it with `--track creative`. Its `notes` name the project and the
piece (slug), so the review track can see which projects the fleet is
feeding and whether listening (`audio_played`, `audio_finished`) follows.

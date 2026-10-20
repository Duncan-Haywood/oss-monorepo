# Saints by Candlelight: launch report (2026-10-20)

**What it is.** A free bedtime podcast of Catholic and Orthodox stories of
saints, angels and patriarchs, told in the lighthearted, faithful style of a
myths-and-legends storytelling show. Each episode runs 30 to 60 minutes.
Source: [`ventures/saints-by-candlelight/`](../../ventures/saints-by-candlelight/).

- Live page: `https://duncan-haywood.github.io/monorepo-projects/saints-by-candlelight/`
- Feed: `https://duncan-haywood.github.io/monorepo-projects/saints-by-candlelight/feed.xml`
- PR: Duncan-Haywood/oss-monorepo#8718

## What shipped

| # | Episode | Source | Words | Audio |
|---|---|---|---|---|
| 1 | The Angel Who Called Himself Azarias | Book of Tobit (with the Vulgate for the dog's tail) | 8,864 | 53:28, 16.0 MB |
| 2 | Gerasimus and the Lion Who Lost the Donkey | John Moschus, *Spiritual Meadow* 107; Cyril of Scythopolis | 6,783 | 40:37, 12.2 MB |
| 3 | Nicholas and the Three Bags of Gold | Michael the Archimandrite's *Life*; *Golden Legend* | 7,515 | 45:09, 13.5 MB |

The parts:

- **[`PRODUCTION.md`](../../ventures/saints-by-candlelight/PRODUCTION.md), the series bible.** It sets:
  - the episode shape and the fixed welcome, AI disclosure and sign-off;
  - the tone (laugh with the saints, never at the faith; no gore);
  - writing for the ear;
  - nine doctrine and honesty rules;
  - the next 17 subjects.

  Every future episode is written against it.
- **[`render_audio.py`](../../ventures/saints-by-candlelight/render_audio.py).** It renders the audio with Kokoro v1.0 (82M parameters, Apache 2.0). Settings: voice `bm_george`, speed 0.9, a synthesised bell at scene breaks, -16 LUFS, mono 44.1 kHz 40 kbps MP3. Rendering runs at about 0.3x real time on 4 CPU cores. The three episodes took 61 minutes of wall time and cost $0.
- **[`generate.mjs`](../../ventures/saints-by-candlelight/generate.mjs) and [`episodes.mjs`](../../ventures/saints-by-candlelight/episodes.mjs).** They build:
  - the show page and the episode pages (player, a "what's true / legend / invented" box, sources, full script, PodcastEpisode JSON-LD);
  - an RSS feed with `itunes:` and Podcasting 2.0 tags (guid, licence, transcript links);
  - a sitemap.

  `--check-script` lints a script: length, digits, "St.", parentheses, URLs, and that the welcome, disclosure and sign-off are present.
- **Cover.** `cover.png` (1400×1400, drawn by `make_cover.py`).
- **Tests.** 12 tests, including staleness checks so the generated files can't drift.

## How the scripts were made and checked

- Claude wrote episode 1 directly. Two sub-agents drafted episodes 2 and 3 against the bible.
- All three were then read in full for doctrine and sources. One change came out of that read: episode 2 had said Gerasimus named the lion at a specific moment, which the source does not say. It now says so.
- Things the episodes do on purpose:
  - Each one labels legend as legend: the infant Nicholas fasting, his election by a dream, the storm, the grain ships, and the Arius slap (told as a late legend with a gentle moral).
  - Each one names what was invented: the daughters' names, Brother Theodore, the camel drivers' apology.
  - When the voice's tradition differs from the source, the script says so. For example, in Moschus it is Gerasimus, not the monks, who blames the lion.
- Intelligibility check: a Whisper `tiny.en` model transcribed a 45-second clip from 24:40 in episode 1. The transcript matched the script nearly word for word, with one sentence-boundary slip. The name respellings were checked against the phonemizer output, not by ear.

## Decisions

- **A separate venture, not a shelf of `hearth-and-horizon`.**
  - At the start, Duncan-Haywood/oss-monorepo#8683 was open and being edited live. It has since merged.
  - Its Little Lamps shelf is ten-minute stories for children aged 3 to 8. This show is long-form, for a different audience, and in a different directory category (Religion & Spirituality). So it gets its own feed.
  - The two link to each other.
- **Audio is committed to the repository and served by Pages.** This follows the hearth-and-horizon precedent. GitHub release assets would scale further, but uploading them needs a token or a workflow, and neither can be verified from a session. At about 0.3 MB a minute, Pages' 1 GB ceiling allows roughly 50 to 60 hours of audio across the site. The bible says to move to release assets before the show reaches about 300 MB.
- **Kokoro, not Piper.** It is noticeably more natural for long narration, has an Apache 2.0 licence, and runs offline.
- **Ongoing production.** A weekly scheduled session (Fridays, 03:47 UTC) writes, records and merges one new episode, following the bible.

## Verification log

The site and test changes caught along the way:

| Check | First result | Fix |
|---|---|---|
| `ink.mjs --strict` | `header.hero a` read as 1.46:1, because the checker does not see compound selectors as boxes | use `.hero`: passes |
| `siblings.mjs --check` | the new venture was an orphan | two-way link with listen-and-learn-audio (and hearth-and-horizon): passes |
| `build.test.mjs` | "every tool points at a share card" failed | dropped the page's own `og:image`: passes |
| `front-door-tools.test.mjs` | alias map stale; shard mount stale | `front-door-tools.mjs --write` (alias map and `portfolio-front.yaml`): passes, 220/220 with front-door |
| `gitops/tests` | README runs-on counts stale | `sync_readme_counts.py`: passes |
| `router/validate.py` | `monthly_cap: 0` rejected | set to 1: passes |

Checks that passed with no change: `clauses.mjs`, privacy and agents suites, `checklist_coverage.py` and `promptctl validate`. Venture tests: 12/12.

Two failures were left, and neither comes from this change:

- `cardtext` "a card renders fast enough" failed locally at 497 ms, a timing limit, while three TTS renders were holding the CPU.
- `test_every_job_that_runs_python_or_node_sets_it_up` flags `portfolio-pages.yml`. That file is byte-identical to `main`, so the failure is there on `main` too.

## Action items

- **Owner (once):** put a public email in `podcast.json` (`ownerEmail`) and run `node generate.mjs`. Then submit the feed URL to Apple Podcasts Connect, Spotify for Creators, YouTube Studio and Podcast Index. These are publishing steps under the portfolio's name, so an agent cannot do them.
- **The weekly scheduled session.** The scheduler said it stores no connectors. If the fired sessions cannot reach the GitHub MCP tools, they cannot open or merge PRs. The owner can recreate the scheduled task from the claude.ai routines UI with GitHub attached.
- **A later run:**
  - move audio to release assets when the show nears about 300 MB;
  - get a first usage reading (`episode_played` / `episode_finished`) once the feed is listed.

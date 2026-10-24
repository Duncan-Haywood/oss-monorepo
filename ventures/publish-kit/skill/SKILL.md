---
name: publish-kit
description: Publish a podcast, audiobook, ebook or paperback from local files with the publish-kit CLI. Use when the user wants to make a podcast RSS feed, add an episode, turn Markdown chapters into an EPUB or print PDF, check audiobook files against ACX/Audible requirements, build a chaptered M4B, or work out a KDP paperback spine and cover size.
---

# Publishing with publish-kit

`publish-kit` is `node <path-to>/ventures/publish-kit/cli.mjs` (Node 18+, no
install). Each project is a folder with one `publish.json`. Always pass
`--json` and read the exit code: `0` done, `1` blocking findings, `2` usage error.

## The loop

1. `publish-kit init <podcast|audiobook|ebook> <dir> --title "..."` if there is no `publish.json`.
2. `publish-kit plan --json` gives `{ready, findings[], next[]}`.
3. Fix each finding with `severity: "danger"`. Its `field` is the path in
   `publish.json` (for example `show.categories`, `episodes[2].pubDate`), and
   `fix` suggests the value or the command. Ask the user for facts only they know
   (titles, author name, owner email, hosting URLs). Never invent an ISBN or an email.
4. Run the commands in `next`. Repeat until the build exits 0.
5. Tell the user what to upload, where, and which URL to submit. You do not
   upload, submit to a directory or store, or sign in for them unless they ask
   and their own tools allow it.

## Podcast

- Add each episode with `publish-kit podcast add <file> --title "..." --description "<p>notes</p>" --date <ISO> --json`.
  This reads the size and duration and saves a permanent guid. **Never edit or regenerate an
  existing episode's `guid`**: if it changes, every subscriber's app re-downloads the episode as new.
- `show.categories` uses Apple's list; `publish-kit podcast categories --json`. Sub-categories are `"Arts > Books"`.
- `show.baseUrl` is where the audio files will be served. `show.feedUrl` is where `feed.xml` will be.
- `publish-kit podcast build --json` writes `dist/feed.xml`, `dist/index.html` and `dist/audio/`, then
  validates the feed. Upload `dist/` so that `feedUrl` serves `feed.xml`.
- Cover art: `publish-kit cover <image> --for podcast` (square, 1400–3000 px, JPEG/PNG, RGB).

## Ebook and paperback

- `chapters` in `publish.json` lists Markdown files in order. The first `#` heading is the chapter's title.
- `publish-kit ebook build --json` writes `dist/<title>.epub` and saves a generated
  `book.identifier` the first time. Keep that identifier for later editions of the same book.
- `publish-kit print interior --pdf --json` writes the print PDF (needs Chromium or `CHROME_PATH`) and
  reports `pages`. Then `publish-kit print cover --pdf <that pdf> --json` gives the spine and full-cover size.

## Audiobook

- `tracks` lists `{file, title}` in reading order: opening credits, chapters, closing credits. Add a
  retail sample file too for ACX.
- `publish-kit audiobook check --json` checks ACX's file rules. For loudness, run it on the WAV masters.
  A VBR or low-bitrate finding comes with the ffmpeg command that fixes it. Ask the user before re-encoding their files.
- `publish-kit audiobook m4b --run --json` builds one chaptered M4B (needs ffmpeg). Without `--run` it
  returns the command.
- `publish-kit audiobook feed --json` builds a serial, locked, complete feed of the chapters for private
  distribution.

## Other

- `publish-kit probe <files...> --json` gives the duration, bitrate, CBR/VBR, sample rate, channels and size of any
  MP3/M4A/M4B/WAV file, and the dimensions and colour model of a PNG/JPEG.
- Findings check against platform requirements as published when the tool was built. A clean
  report is evidence, not a guarantee of acceptance. Say so when you report back.

# Publish Kit: podcast RSS feed generator, Markdown to EPUB, ACX audiobook checker and KDP cover calculator

Self-publish a podcast, an audiobook, an ebook or a paperback without a
hosting company's dashboard. You can use it from a web page, from a terminal,
or by asking an AI agent such as Claude Code to run it for you.

**Use it in your browser:** https://duncan-haywood.github.io/monorepo-projects/publish-kit/

| You have | Publish Kit makes | Then you |
| --- | --- | --- |
| Episode MP3/M4A files | `feed.xml` (RSS 2.0, iTunes and Podcasting 2.0 tags) and a show page | upload both and submit the feed URL to Apple Podcasts and Spotify |
| Chapters in Markdown | an EPUB 3 file that passes W3C EPUBCheck, a print-ready 6×9 (or any trim) PDF, and the paperback's spine and cover size | upload to KDP, Apple Books, Kobo, Google Play Books or Draft2Digital |
| Audiobook chapter files | an ACX requirements report, a chaptered `.m4b`, and a private podcast-style feed | upload to ACX, sell the M4B directly, or give buyers the feed |

It never uploads or submits anything itself. Your files stay on your machine,
and the last step, where you upload or submit under your own accounts, is yours.

## The CLI

Node.js 18 or later. No dependencies and no install step. FFmpeg is used only by
`audiobook m4b --run`, and Chromium only by `print interior --pdf`.

```sh
git clone --depth 1 https://github.com/duncan-haywood/oss-monorepo
alias publish-kit="node $PWD/oss-monorepo/ventures/publish-kit/cli.mjs"
```

### Podcast

```sh
publish-kit init podcast my-show && cd my-show     # writes publish.json; fill in "show"
publish-kit podcast add ep1.mp3 --title "Pilot" --description "<p>Show notes</p>" --date 2026-11-01
publish-kit plan                                   # anything missing, and the next command
publish-kit podcast build                          # dist/feed.xml, dist/index.html, dist/audio/
```

`podcast add` reads the file's byte size, duration and MIME type, and gives the
episode a random guid that is saved in `publish.json`. Rebuilding keeps the
guid, so apps never show an old episode as new. `build` writes:

- `<itunes:*>` tags Apple Podcasts requires: category with subcategory
  nesting, explicit as `true`/`false`, image, owner, type, episode, season and
  episodeType;
- Podcasting 2.0 tags: `podcast:guid` (UUIDv5 of the feed URL, per the
  spec), `podcast:locked` and `podcast:transcript`;
- RFC 822 `pubDate`s and `atom:link rel="self"`;
- an HTML page for the show with `PodcastSeries` structured data and an
  `<audio>` player per episode, so the show can be found by search engines and
  played without an app.

The built feed is then read back by the separate
[Podcast Feed Validator](../podcast-feed-check/), and anything it flags is
reported. `podcast categories` prints Apple's category list.

Free places to host it: any static host that serves HTTPS, such as GitHub
Pages (a repository's files have a 100 MB limit), Cloudflare R2 or an S3
bucket. Put `feed.xml` at the `feedUrl` you set and the audio at `baseUrl`.

### Ebook and paperback

```sh
publish-kit init ebook my-book && cd my-book       # publish.json + chapters/01.md
publish-kit ebook build                            # dist/my-book.epub, then checked
publish-kit print interior --pdf                   # dist/my-book-print.pdf at the trim size
publish-kit print cover --pdf dist/my-book-print.pdf   # spine width and full-wrap cover size
publish-kit cover cover.jpg --for ebook            # cover art against KDP's recommended size
publish-kit ebook check someone-elses.epub         # container and package checks on any EPUB
```

Chapters are Markdown files. Supported: headings (the first one is the
chapter title in the table of contents), paragraphs, bold, italic, inline
code, links, local images (bundled into the EPUB), block quotes, lists, fenced
code, and `* * *` scene breaks. Raw HTML is escaped, not passed through.
The EPUB has a cover page, a title page, an EPUB 3 nav document and an EPUB 2
`toc.ncx`. The output of both the CLI and the browser page was checked with
W3C EPUBCheck 5.1.0 and had no errors or warnings. An ISBN-13 in
`book.identifier` is checked against its check digit.

The print interior is one HTML file with CSS `@page` rules: trim size,
mirrored margins with KDP's minimum gutter for the page count, and every
chapter starting on a right-hand page. Chromium prints it to PDF. The cover
calculator uses KDP Print's published paper thickness per page (white
0.002252", cream 0.0025", premium colour 0.002347") and adds 0.125" bleed.
IngramSpark and Lulu publish their own figures.

### Audiobook

```sh
publish-kit init audiobook my-audiobook && cd my-audiobook
# list "tracks" in publish.json in reading order: opening credits, chapters, closing credits
publish-kit audiobook check                       # ACX: MP3, ≥192 kbps CBR, 44.1 kHz, ≤120 min, mono/stereo consistent
publish-kit audiobook check masters/*.wav         # plus RMS, peak and noise floor on 16-bit WAV
publish-kit audiobook m4b --run                   # chapters.ffmeta + one chaptered, cover-embedded .m4b
publish-kit audiobook feed                        # serial, podcast:locked, itunes:complete feed of the chapters
```

[ACX's requirements explained, and how each one is checked](acx-audiobook-requirements.html).

### For AI agents

Every command takes `--json`. Exit codes are `0` (done), `1` (blocking
findings, listed in the JSON) and `2` (usage error). `publish-kit plan --json`
returns `{ kind, ready, findings: [{severity, field, message, fix}], next: [commands] }`,
so an agent can repeat plan, fix, build until `ready` is true.
[`skill/SKILL.md`](skill/SKILL.md) is a ready-made skill that teaches an agent
this loop. Copy it into `.claude/skills/publish-kit/` or your agent's equivalent. The CLI
can also be reached through this repository's MCP server:
`node platform/agents/tools.mjs run publish-kit -- plan --json`.

`probe <file>` prints duration, bitrate, constant or variable bitrate, sample
rate, channels and size for MP3, M4A/M4B and WAV files, and pixel size and
colour model for PNG and JPEG. It reads the bytes itself, without ffprobe.

## In the browser

[`index.html`](index.html) runs the same modules: a podcast feed generator
(drop the audio in to read its size and duration), Markdown to EPUB, the
paperback cover calculator and the ACX check. Nothing is uploaded.

## Files

| File | What it does |
| --- | --- |
| `cli.mjs` | the command-line interface |
| `media.mjs` | reads MP3 frames, MP4 boxes, WAV chunks, PNG and JPEG headers; WAV loudness |
| `podcast.mjs` | podcast lint, RSS feed and show page |
| `book.mjs` | EPUB build and checks, cover specs, paperback cover maths, print HTML |
| `markdown.mjs` | Markdown to well-formed XHTML |
| `zip.mjs` | the ZIP writer and reader EPUB needs |
| `audiobook.mjs` | ACX checks, FFmpeg chapter metadata, M4B command |
| `util.mjs` | XML escaping, RFC 822 dates, SHA-1/UUIDv5, CRC-32 |

Tests: `node --test` in this folder. They build synthetic MP3, WAV, M4A, PNG
and JPEG bytes, so they need no FFmpeg.

## What is next

Unfinished work, with what done looks like for each, is in [`NEXT.md`](NEXT.md).

## Limits

- Platform requirements are as published when this was built: Apple
  Podcasts' categories and art size, ACX's audio rules, and KDP's cover
  and paper figures. Platforms revise them. Findings name the rule they
  checked against.
- `ebook check` checks the container and package document, not every XHTML
  file. Run [EPUBCheck](https://www.w3.org/publishing/epubcheck/) for that.
- No fixed-layout EPUB, footnotes or tables in Markdown yet.
- Loudness is measured on 16-bit PCM WAV only. For MP3s, the report prints the
  FFmpeg command that measures them.

## Privacy

Everything runs on your machine or in your browser. The CLI makes no network
requests. The web page uploads nothing, and we don't have accounts, tracking
cookies, or an analytics vendor. The page keeps anonymous counts of which tool
was used, in your own browser's storage only; the checkbox in its footer turns
that off.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal or publishing-contract advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

Not affiliated with Apple, Spotify, Amazon, Audible, ACX, Kobo or Google.
MIT licensed. [Sponsor the project on GitHub](https://github.com/sponsors/Duncan-Haywood).

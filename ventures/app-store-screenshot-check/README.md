# app-store-screenshot-check

Check the images you are about to attach to an App Store Connect or Google Play
listing, before the upload refuses them.

Free, MIT-licensed, no dependencies, no account, no network. The CLI reads
local files and prints a report; the browser page reads a visitor's files with
the File API and uploads nothing.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/app-store-screenshot-check/

## Why

The expensive rejection is the app icon. Apple requires it to be fully opaque,
and validates that at **upload time** — after the build, after the archive,
often after a CI pipeline that has already run. The message that comes back is
about an alpha channel, which is not a thing you can see: an icon whose every
pixel is opaque can still *declare* an alpha channel, because the channel is a
property of the PNG's colour type rather than of the artwork. No file browser
shows it. No visual inspection finds it.

Three more problems have the same character — mechanically checkable, invisible
to the eye, and discovered at the worst moment:

- a **screenshot set that disagrees with itself**, because part of it was
  regenerated on a different simulator and the rest was kept;
- a **HEIC or WebP renamed to `.png`**, which does not convert it, because the
  store reads bytes and not filenames;
- an icon or feature graphic at the **wrong size**.

## Usage

### CLI

```
node check.mjs ./fastlane/screenshots/en-US
node check.mjs --store play ./play/listing
node check.mjs --store ios AppIcon.png 01.png 02.png
node check.mjs ./screenshots --json
node check.mjs ./screenshots --strict     # notices fail too
```

Node 18+. Copy `check.mjs`, `engine.mjs`, `image.mjs` and `spec.mjs` into your
repository and run them — there is nothing to install.

| Exit code | Meaning |
| --- | --- |
| 0 | Nothing found that would block the upload |
| 1 | A danger-severity finding (or any finding, with `--strict`) |
| 2 | The arguments or paths could not be used — including an empty directory |

Exit 2 on an empty directory is deliberate: a green check over zero files is
exactly the false assurance a release gate exists to prevent.

A directory is read one level deep. Store assets are conventionally flat per
locale, and recursing would sweep an entire `fastlane/` tree of unrelated
metadata into one set and report it as inconsistent.

### In CI

```yaml
- name: Check store listing assets
  run: node ventures/app-store-screenshot-check/check.mjs ./fastlane/screenshots/en-US
```

### Browser

Open `index.html`, or the live tool above. Drop the files in. Nothing is
uploaded: only the first 64 KB of each file is read, no pixels are decoded, and
no filename, dimension or result is transmitted or stored anywhere.

## What it checks

| Check | Flags | Severity |
| --- | --- | --- |
| Icon transparency | An App Store icon with an alpha channel or a `tRNS` chunk | Danger |
| Icon dimensions | An icon that is not exactly the size the store requires | Danger |
| File format | A file whose real bytes are HEIC, WebP, GIF, BMP, TIFF or PDF | Danger |
| Set consistency | Screenshots in one set disagreeing about their pixel dimensions | Danger |
| Screenshot count | More screenshots than the store accepts per set | Danger |
| Play bounds | A side outside 320–3840px, or an aspect ratio past 2:1 | Danger |
| Feature graphic | A Play feature graphic that is not exactly 1024×500, or transparent | Danger |
| Mixed orientation | Portrait and landscape images in one set | Notice |
| Unrecognised size | A screenshot matching no display class in this tool's table | Notice |
| Icon encoding | An interlaced PNG, or one deeper than 8 bits per channel | Notice |

### Why the severities are split that way

The checks divide into two kinds, and the division is the design:

**Structural checks** are answered from the files themselves — is this really a
PNG, does this icon declare transparency, do these screenshots agree with each
other. They involve no published table, so there is nothing in them to go out
of date. These carry **danger** severity and fail the CLI.

**Table checks** compare against a transcription of each store's published
sizes in `spec.mjs`. Apple and Google add device classes and retire them, and a
table in someone else's repository is exactly the kind of thing that is correct
the day it is written and quietly wrong a year later. These carry **notice**
severity and name the table as the suspect rather than the file. The three
fixed values that have been stable for the life of both stores — a 1024×1024
App Store icon, a 512×512 Play icon, a 1024×500 feature graphic — are the
exception and do fail.

A checker that fails a good build on a year-old table is worse than no checker,
because it teaches its user to ignore it.

## How it reads an image

`image.mjs` parses container headers and decodes nothing:

- **PNG** — dimensions, bit depth, colour type, interlace flag from `IHDR`;
  transparency from colour type 4/6 or a `tRNS` chunk before the first `IDAT`.
- **JPEG** — dimensions from whichever `SOFn` segment the encoder used, walking
  the segment list (and not mistaking `DHT`/`DAC` for a frame header).
- **Everything else** — identified by magic bytes and reported as an
  unaccepted format. HEIC, AVIF, WebP, GIF, BMP, TIFF and PDF are recognised by
  name so the message says what the file actually is.

The extension is never consulted. When a `.png` is really a HEIC, the extension
is precisely the thing that lied.

Header parsing is not an approximation here. "Does this PNG declare an alpha
channel?" is a question about the declaration, not the pixels — a `<canvas>`
round-trip would answer it wrongly, since canvas hands back RGBA either way.

## Files

| File | What it is |
| --- | --- |
| `image.mjs` | Zero-dependency PNG/JPEG header reader and format detector |
| `spec.mjs` | Each store's requirements as data, with its source named |
| `engine.mjs` | Pure classifier: measured assets in, findings out |
| `check.mjs` | CLI — the only file that touches the filesystem |
| `usage.mjs` | Anonymous local-only event counter for the browser page |
| `index.html` | The browser tool |

## Tests

```
node --test ventures/app-store-screenshot-check/*.test.mjs
```

70 assertions across the header parser, the classifier, the CLI's exit codes
and filesystem behaviour, the page's structured data and disclaimers, and the
privacy claim the usage counter makes.

## Privacy

Nothing you check is transmitted anywhere, by either half of the tool. The
browser page keeps an anonymous count of two events (`check_run`,
`example_loaded`) in `localStorage` and nothing else — no filename, no
dimension, no finding. Do Not Track and Global Privacy Control are honoured,
and there is an opt-out checkbox on the page. The files a visitor drops here
are their unreleased app's artwork; the only defensible thing to do with that
is to keep no record of it.

## Limitations

- It never decodes a pixel, so it cannot tell you whether your artwork is any
  good, whether a screenshot honestly represents the app, or whether text in a
  screenshot is legible. App review assesses all three; this does not.
- Passing every check means the images are well-formed enough to upload. It is
  not a prediction that the app will be approved.
- File-size limits are not checked. Both stores publish them, but they have
  moved more often than the dimension rules and this tool would rather check
  nothing than check a stale number as if it were certain.
- The iOS display-class table is a convenience and is dated in `spec.mjs`
  (`SPEC_REVIEWED`). Each store's own current documentation is authoritative.

## Not affiliated with Apple or Google

"App Store", "App Store Connect", "Google Play" and "Google Play Console" are
the trademarks of their respective owners, used here only to say which store's
published requirements a check refers to.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, business, or
app-review advice. You are responsible for verifying its output before relying
on it. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

## Support

Free and open source under the MIT licence.
[Sponsorship](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

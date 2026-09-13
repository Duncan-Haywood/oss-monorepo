# Caption Quality Checker

A free tool that checks an **SRT** or **WebVTT** caption file against
commonly-used caption style-guide thresholds — the readability rules that
sit on top of "captions exist," which is all WCAG 1.2.2 and Section 508
actually require:

- **Reading too fast** — characters-per-second above a configurable cap
  (default 20, a commonly-cited ceiling for adult-content captions).
- **Invalid timing** — a cue's end time at or before its start time.
- **Out of order** — a cue that starts before an earlier one in the file.
- **Overlapping cues** — a cue's end time after the next cue's start time,
  which most players cannot display correctly.
- **Duration too short / too long** — a cue on screen for less than a
  configurable minimum (default 5/6 second) or more than a configurable
  maximum (default 7 seconds).
- **Line too long / too many lines** — a line above a configurable maximum
  length (default 42 characters) or more lines than a configurable maximum
  (default 2) in one cue.
- **Gap too short** — a positive but very small gap between two cues (default
  floor ~84ms, about 2 frames at 24fps) that many players cannot register as
  a new cue.
- **Empty cue** — a cue with no visible text at all.

After using this, you can **name the exact cue, and the exact reason, your
caption track is unreadable at normal speed** — before a viewer, an
accessibility reviewer, or a client's own QA pass finds it for you.

## Two parts, sharing the same classification logic (`engine.mjs`)

### CLI — checks a local file

```sh
node check.mjs captions.srt [--json]
  [--max-cps <n>] [--min-duration-ms <n>] [--max-duration-ms <n>]
  [--max-line-length <n>] [--max-lines <n>] [--min-gap-ms <n>]
```

Reads the file directly from disk — nothing goes through this portfolio.
Exit code `0` when no danger-severity finding was produced; `1` when reading
is too fast, cues overlap, timing is invalid or out of order, or the file
could not be read at all; `2` for a usage error (missing argument, unreadable
path):

```yaml
# in your own CI, not this portfolio's -- your compute, your files
- run: node check.mjs captions/episode-04.srt --max-cps 17
```

### Browser — works from pasted text

Open [`index.html`](index.html) and paste the caption file's contents.
Every check runs entirely from the pasted text; nothing you paste is
uploaded.

## Why these specific numbers?

There is no single legal reading-speed limit. The defaults here (20
characters/second, a two-line maximum, 5/6-second minimum and 7-second
maximum duration, 42-character line length) are commonly-used industry
thresholds — publicly published caption style guides such as Netflix's Timed
Text Style Guide and the BBC's Subtitle Guidelines state versions of the same
numbers. They are cited as widely-used defaults, not as one single
controlling standard, which is why every threshold is configurable on the
CLI. See
[`why-caption-quality-matters.html`](why-caption-quality-matters.html) for
the full reasoning.

## What this is, and isn't

**Evidence, not a determination.** Specific, documented checks against
whatever caption file was actually pasted or read — not a certification of
WCAG, Section 508, FCC, or any other standard's compliance, and not a
substitute for a human review of transcription accuracy or translation
quality.

**Only the mechanical half of quality.** This tool cannot judge whether a
caption is an accurate transcription of the audio, whether speaker labels or
sound descriptions are used correctly, or whether a translated subtitle
reads naturally. It checks the parts that are pure arithmetic on timestamps
and text: reading speed, line length, duration, overlap, and gaps.

## Privacy

The browser page only parses text you paste; nothing is uploaded. The CLI
reads a file straight from your own disk. The only thing stored is an
anonymous local count (`localStorage`, browser only) of which features were
used and the day — no caption text, no file names, no findings, no account,
no tracking cookies, no analytics vendor, honouring Do Not Track and Global
Privacy Control automatically. Turn it off with the checkbox in the page
footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal, accessibility-compliance, or broadcast-standards
advice, and it does not replace a qualified professional or a human caption
review. You are responsible for reviewing and verifying its output before
relying on it. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/caption-quality-check && node --test
```

Assertions across the parsing and classification logic (`engine.test.mjs`,
including SRT and WebVTT parsing, every rule, and configurable thresholds),
the CLI's orchestration and process exit codes (`check.test.mjs`), the usage
counter and its opt-out persistence (`usage.test.mjs`), and the page's
structure and disclaimers (`page.test.mjs`).

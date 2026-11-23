# Silence Cutter

Cut the pauses out of a talking-head video, podcast, lecture or voice-over
automatically, without uploading it, and take the result into your editor as
a normal timeline.

**Live tool:** https://marisstella.app/silence-cutter/ ·
guide: [How to remove silence from a video automatically](remove-silence-from-video.html)

- Drop a video or audio file into the page. The browser decodes the audio;
  nothing leaves the device.
- The threshold is set from the recording itself (its noise floor and voice
  level), so the defaults work on a quiet lapel mic and a hot USB mic alike.
- Hear the edit (the preview skips the cuts), tune the shortest pause, the
  audio kept before and after speech, and how much of each pause to leave.
- Export a **CMX3600 EDL** (DaVinci Resolve, Premiere Pro, Avid), **FCPXML
  1.9** (Final Cut Pro, Resolve), **Final Cut 7 XML** (Premiere Pro), a cut
  **WAV**, a keep/cut **CSV**, an **ffmpeg** command that renders the cut file,
  or a **retimed SRT** so existing subtitles follow the cut.

## Why use it

People cut dead air today in four ways:

| Option | What it is | Where this differs |
|---|---|---|
| By hand | Blade and ripple-delete each pause on the waveform | This finds every pause in seconds |
| Desktop silence-cutting apps (Recut, TimeBolt) | Paid installs that cut silence and export to editors | Free, nothing to install, runs on a Chromebook or a locked-down work laptop |
| All-in-one editors (Descript and similar) | Subscription editors with silence removal built in | Keeps you in the editor you already use: the output is an EDL/XML timeline of your original footage |
| auto-editor | Free, open-source Python CLI | No Python or terminal needed; a page with a waveform and a preview. The CLI here is one file with no dependencies |

Not affiliated with, endorsed by, or sponsored by any product named above.
Each name is a trademark of its owner, used only to describe what this tool
is and is not.

The business case: video creators, podcasters, course makers and agencies cut
silence on every recording. The tool is free and MIT licensed; the paths to
revenue are a supported hosted/batch version (whole folders, cloud storage
inputs) and filler-word removal ("um", "uh") with an on-device speech model,
both later milestones.

## Command line

Node 18+, no dependencies. WAV is read directly; anything else (MP4, MOV, MP3,
M4A, MKV) goes through `ffmpeg` if it is installed.

```
node cutter.mjs talk.mp4                         # summary: 12:41 -> 10:58 (143 pauses cut ...)
node cutter.mjs talk.mp4 --edl talk.edl --fps 29.97
node cutter.mjs talk.mp4 --fcpxml talk.fcpxml --xml talk-premiere.xml
node cutter.mjs talk.mp4 --wav talk-cut.wav --csv cuts.csv
node cutter.mjs talk.mp4 --srt talk.srt talk-cut.srt
node cutter.mjs talk.mp4 --ffmpeg | sh            # render the cut video directly
node cutter.mjs podcast.wav --min-silence 0.8 --keep-pause 0.15 --pad-before 0.2
node cutter.mjs talk.mp4 --threshold -42 --json   # fixed threshold, machine-readable
```

Exit codes: 0 done; 1 no input; 2 a usage or input error.

## How it decides what is silence

1. Mix to mono and filter to the voice band (4th-order high-pass at 90 Hz,
   2nd-order low-pass at 4 kHz) so mains hum, rumble and hiss count for less.
2. Measure the RMS level of every 10 ms frame in dBFS.
3. Noise floor = 10th percentile of frame levels; voice = 95th percentile.
   Threshold = floor + max(6 dB, 35% of the floor-to-voice spread).
4. Speech starts at the threshold and ends 4 dB below it (hysteresis); gaps
   under 60 ms are bridged; bursts under 60 ms are dropped (clicks).
5. Edge pass (after Rabiner and Sambur's endpoint detector): each region's
   edges grow outward, up to 0.3 s, while a 30 ms average stays above a lower
   threshold, floor + max(4 dB, 10% of the spread). This keeps soft onsets
   (/s/, /f/, /h/) and trailing word ends.
6. Each gap of at least `minSilence` (0.5 s) becomes a cut, less `padAfter`
   (0.18 s) after speech and `padBefore` (0.12 s) before it; `keepPause`
   leaves part of each pause in place.

Timelines snap the kept spans to whole frames at the chosen rate (23.976, 24,
25, 29.97, 30, 50, 59.94, 60; non-drop-frame timecode). The cut WAV joins
spans with an 8 ms fade so cuts do not click.

## Accuracy, measured

`bash eval/fetch.sh DIR && node eval/benchmark.mjs DIR --seed N` (3 s). Two
sources, neither committed:

- **Part A**, real speech in synthetic takes: Free Spoken Digit Dataset
  utterances (6 speakers, CC BY-SA 4.0) laid end to end with pauses of 0.15
  to 2.5 s at varied levels, under six conditions (clean; white noise at 20
  and 12 dB SNR; 60 Hz hum with harmonics at -30 dBFS; 20 dB too quiet;
  12 dB too hot). Truth = each utterance's span within 30 dB of its own peak,
  grown out from the peak (so one recording's stray end-click is not "speech").
- **Part B**, the pyannote-audio sample: 30 s of two people with hand-made
  speech turns (MIT).

Pause removed = share of the ideal cut (every true gap of 0.5 s or more, less
the padding) that a rule removed. The edge pass was added and its 4 dB chosen
on seed 1; seed 2 is the held-out check.

| rule (all six conditions) | seed 1: pause removed | words hit (of 2,880) | seed 2, held out: pause removed | worst condition | words hit (of 2,496) |
|---|---:|---:|---:|---:|---:|
| auto (this tool) | 94.7% | 26 | 95.8% | 91.6% | 25 |
| auto without the edge pass | 97.6% | 47 | 98.2% | 94.9% | 49 |
| fixed -30 dBFS, full band | 99.6% | 550 | 99.6% | 99.1% | 499 |
| fixed -40 dBFS, full band | 52.9% | 171 | 53.6% | 0.0% | 177 |
| fixed -50 dBFS, full band | 48.0% | 23 | 48.4% | 0.0% | 32 |

On seed 2 the tool hit no word in the clean, quiet and loud conditions; its 25
were 8 at 20 dB SNR, 14 at 12 dB and 3 under hum. A fixed -30 dBFS threshold
destroys a quiet recording (most of its words hit); -40 and -50 dBFS cut
nothing once noise or hum sits above them. On the pyannote conversation the
tool removed 90.6% of the 6.57 s ideal cut and hit no turn. Full tables:
[`eval/benchmark-seed1-2026-11-23.md`](eval/benchmark-seed1-2026-11-23.md),
[`eval/benchmark-seed2-2026-11-23.md`](eval/benchmark-seed2-2026-11-23.md);
the end-to-end CLI, ffmpeg and page check on a 60 s clip:
[`eval/worked-example-2026-11-23.md`](eval/worked-example-2026-11-23.md).

## Limits

- Loudness only: it does not know what is said. It will keep a cough or a
  door and can cut a whispered word. Watch the edit before publishing.
- One global threshold per file. A recording whose noise floor moves a lot
  (a fan switching on) is better split, or set with a manual threshold.
- Timeline imports are written to the published formats but not yet opened in
  Resolve, Premiere or Final Cut here (none runs in this environment).
- The page holds the audio in memory at 16 kHz mono (about 230 MB per hour).
  Use the CLI for very long files and batches.

## Run it yourself

Static files: serve this directory (`npx serve .` or any web server) and open
`index.html`. Tests: `node --test engine.test.mjs page.test.mjs usage.test.mjs`.

## Privacy and usage counting

Everything runs in the browser; the file is never uploaded. The page counts
anonymous feature events (`file_analysed`, `example_loaded`, `export_*`) in
the visitor's own local storage only, honours Do Not Track and Global Privacy
Control, and has an opt-out box in the footer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal or professional advice, and it does
not replace a qualified editor. **You are responsible for reviewing and
verifying its output before relying on it.** To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record. If a tool needs to survive, run it yourself.

MIT licence: [LICENSE](LICENSE).

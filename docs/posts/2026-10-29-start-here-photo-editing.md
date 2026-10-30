---
title: "Start here: ShootFlow, a safe card copy and overnight first pass for your shoots"
seo_title: "ShootFlow: a safe card copy and overnight first pass"
date: 2026-10-29
tags: [start-here, photo-editing, shootflow, photography, video]
description: "For photographers and videographers on Mac or Linux: what ShootFlow does with a shoot, your first card copy and pipeline run, and its early-stage limits."
---

# Start here: ShootFlow

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these tools.*

## Who this is for

You shoot weddings, events, portraits or short-form video. You come home with
one or two full cards, and before any creative work starts there is an evening
of file wrangling: copy the cards, check nothing got lost, make lighter files
to review, apply your look, find the sharp frame in each burst, and cut
something vertical for Instagram.

ShootFlow is a free command-line tool for that first, mechanical pass. It runs
on your own Mac or Linux machine, nothing is uploaded, and it can work
overnight while you sleep.

It is early. Most of it has been tested on synthetic media rather than real
camera files, and you will need to be comfortable typing commands into a
terminal. If that is fine with you, read on.

## The problem, as you would put it

"I don't trust drag-and-drop with a client's only copy. And after the copy I
still lose hours making proxies, grading, and scrolling through near-identical
frames before I get to the part I'm actually good at."

## What you get

- **A card copy you can trust.** ShootFlow copies the card to your drive
  through temporary files, checks every copied file against a SHA-256
  checksum, and writes a manifest of what it copied. It never deletes anything
  from the card and never overwrites a different file at the destination. You
  can preview the copy first without moving a byte.
- **Review proxies**: photos up to 1024 px and H.264 video up to 960 px, in a
  `proxies/` folder.
- **Your look, applied in bulk.** Drop in your own 3D LUT (a `.cube` file, for
  example a log-to-Rec.709 LUT) and the `graded/` folder gets full-resolution
  masters with it applied: ProRes 422 HQ for `.MOV`, high-bitrate H.264 for
  `.MP4`, photos in their own format. With no LUT, colours are left alone.
- **Ready-to-post cuts** in `deliverables/`: a 1080x1920 vertical reel cut from
  the selected clips (up to 4 seconds each, 90 seconds in total, no audio) and
  1080x1350 JPEG carousels and photo sets.
- **A technical first cull.** Each photo and clip is scored from its actual
  pixels: sharpness, exposure, contrast, motion, framing, tilt and sensor
  noise. Near-identical shots are grouped so a burst contributes one frame, the
  best-scoring one.
- **Lightroom-ready ratings.** The separate `cull` command scores a folder of
  stills and writes a report you open in a browser. With `--write-xmp` it
  writes a sidecar per photo (keeper 4 stars, alternate 2, reject -1) that
  Lightroom or Bridge can read. Your photos are only read, and an existing
  `.xmp` is never overwritten. With `--picks` and a list of the frames you
  would keep, the report tells you how often its keeper matched your choice.
- **Fast and unattended.** Each job is its own ffmpeg process and several run
  side by side. On a Mac it uses the hardware video encoders and can schedule
  itself for 01:30 every night, keeping the Mac awake mid-encode and catching
  up on wake if it was asleep.
- **It stops for you instead of guessing.** A file it cannot handle is marked
  for review, the command exits with code 2, and reruns skip finished work.

## Your first run

You need Python 3.10 or newer and ffmpeg (`brew install ffmpeg` on a Mac).
ShootFlow uses only Python's standard library and is not installed as a
package: you run it from the folder.

1. **Get the code.** Clone the repository and change into
   `ventures/photo-editing/`. Every command below starts with
   `PYTHONPATH=src python3 -m shootflow.cli`.
2. **Preview the copy.** Run `preview-ingest` with `--source` (your card, for
   example `/Volumes/EOS_DIGITAL`), `--destination` (your SSD folder),
   `--shoot-date` and `--shoot-slug` (a short name such as `wedding`). It
   computes checksums and shows what would be copied, without copying.
3. **Copy for real.** Run `execute-ingest` with the same options plus
   `--confirm`. Without `--confirm` it refuses to run. The shoot folder gets an
   `ingest_manifest.json`.
4. **Add your look (optional).** Copy your LUT to
   `<shoot folder>/color/shoot_look.cube`.
5. **Run every stage.** `run-local-pipeline --ingest-manifest <shoot
   folder>/ingest_manifest.json --max-concurrency 3`. Then open `proxies/`,
   `graded/` and `deliverables/`.
6. **Or run it overnight.** `write-launchd-plist` writes a nightly job for
   01:30 and the README shows the `launchctl load` line to switch it on.
7. **Cull a folder of stills.** `cull <folder> --out <report folder>`, adding
   `--write-xmp` for rating sidecars and `--thumbs` for a contact sheet in the
   report.

If a run exits with code 2, look at the files listed under `needs_review_ids`,
then rerun with `--retry-retryable`.

## What it costs and where your files go

Free and MIT licensed. Everything runs on your machine with your copy of
ffmpeg, and nothing is uploaded. The optional closed-eye check calls a face
detector you choose on your own machine; a reference script using OpenCV is in
`ventures/photo-editing/tools/`.

## What it does not do

Please read these before you trust it with a paid job.

- **It does not develop RAW files.** RAW stills (`.CR3`, `.CR2`, `.ARW`,
  `.NEF`, `.DNG` and others) are scored and proxied from the JPEG preview the
  camera embedded, but graded masters still need JPEG or TIFF, so a RAW still
  stops the pipeline before the grade stage. Camera-raw video is not decoded.
- **Its keeper is the technically best frame, not the best moment.** Scores
  measure sharpness, exposure and the like. It does not judge expression,
  story or taste.
- **It does not see faces on its own.** Closed-eye detection needs a detector
  command you supply. The included OpenCV script is a classical detector, not a
  blink classifier: sunglasses, shadow and head turns can read as closed eyes,
  and it has not been run on real closed-eye photos.
- **It has not met a real shoot yet.** The cull has not been compared with a
  photographer's real picks, and the RAW preview reader, tilt and noise
  measures were tested on synthetic files. The scene and look stages are
  simple stand-ins.
- **It grades everything**, before selection. Grading only the chosen shots is
  not built yet.
- **It is not a replacement for Lightroom, DaVinci Resolve or Final Cut.**
  It prepares the files; the editing is still yours.

If you try it on a real shoot, a `--picks` file with the frames you kept would
give the project its first real measurement.

## Where to go next

- The project page:
  [photo-editing](https://duncan-haywood.github.io/oss-monorepo/photo-editing/)
- Every command and every stated limit: `ventures/photo-editing/README.md` in
  the repository.
- Keeping the books for a photography business:
  [the bookkeeper](2026-10-29-start-here-ai-bookkeeper.md). Other free tools
  for working trades: [free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md).
  Helping test it: [contributing](2026-10-29-start-here-contributing.md).
- Back to the series hub: [Start here](2026-10-29-start-here.md).

*No warranty. Provided as-is; not professional editing advice. Keep your own
backups until you have checked the copy.*

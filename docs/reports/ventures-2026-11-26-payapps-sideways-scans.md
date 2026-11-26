---
kind: milestone
date: 2026-11-26
---
# PayApps: scans on their side or upside down (private PR 268)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`). This is ROADMAP Next #3,
"SOV import from a PDF, part 5", claimed as `sov-pdf-sideways-scan`.

## What we measured first

tesseract.js 7.0.0 (LSTM only, `4.0.0_best_int` English, PSM 3) on `bid-breakdown-scan-tilted-more.pdf`
page 1 (2638x3368 px):

| Picture | Mean confidence | Words at confidence 60 or more |
|---|---|---|
| upright | 93 | 384 / 387 |
| turned 90° clockwise (text runs down) | 93 | 379 / 382 |
| turned 90° anticlockwise (text runs up) | 50 | 155 / 375 (garbage) |
| upside down | 51 | 170 / 395 (garbage) |
| upside down, read with `rotateRadians: Math.PI` | 93 | 378 / 381 |

Text that runs down is read, but its lines and boxes come back running down the picture.
`rotateRadians: Math.PI` keeps the picture's size, so the boxes map back as `W - x`, `H - y`.
Tesseract's orientation check (OSD) needs the legacy engine and `osd.traineddata`; the app serves
the LSTM-only build, so it was not used.

## What landed

- `runsFromOcr` reads each line in the direction its baseline runs and maps the words through the
  placement matrix. The page is then turned toward the direction where most of its characters run as
  displayed. A stray sideways word is still left out.
- `ocrText` reads a page again with `upsideDown` when fewer than 60% of its characters are sure
  (confidence 60 or more), and keeps the surer of the two reads. An engine that gives no confidence
  is never asked twice.
- A new import note names the pages it turned. A picture that is stored sideways but placed upright
  gets no note.
- New fixture `test/fixtures/sov-scan-pictures-sideways.pdf`: the G4 sheet, page 1 turned clockwise
  as is, page 2 turned anticlockwise with an `@90` placement. Real engine: 48 lines, $1,120,223.00,
  3 reads, 6.5 s.

## Verification

- Unit suite 714/714, `pnpm typecheck` and biome clean.
- The private PR's CI was starved (`ci_starvation.py`: no runner), so `run_workflow_locally.py
  payapps-ci` was run from the clone; its result is in this run's record.
- Not checked in a browser: the client passes the same option to the same tesseract.js build.

## For the next run

The item now reads "part 6": JBIG2 pictures and more than ten pages, both "if people ask".

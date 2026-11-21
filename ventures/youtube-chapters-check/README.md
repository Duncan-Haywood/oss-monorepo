# Youtube Chapters Check

Free browser tool that checks a YouTube chapter list against the rules that decide whether chapters
show (first timestamp 0:00, at least three timestamps in ascending order, each chapter at least 10
seconds), with a line number for every problem, and fixes ordering and format. It also converts
Premiere Pro, DaVinci or Audacity marker exports into a description-ready list, a podcast
chapters.json, ffmpeg chapter metadata or a WebVTT chapters track. The text is read locally and
never uploaded.

**Live tool:** https://marisstella.app/youtube-chapters-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/youtube-chapters-check/
```

## Known gaps

- DaVinci Resolve marker EDLs (Timeline Markers to EDL) are read from the record-in timecode, named
  from the `|M:` field, with the timeline start hour taken off the label before the frame-rate
  conversion. The tests use hand-written EDLs in the layout Resolve writes (CMX 3600 events, each
  followed by a ` |C:... |M:name |D:n` line), not a file exported from Resolve itself. Added after
  [the 2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-youtube-chapters-check.json)
  found the EDL export unread.
- Re-audited on [2026-11-21](../../portfolio/quality/audits/2026-11-21-youtube-chapters-check.json):
  the EDL, SMPTE 23.976/29.97 and boundary-test fixes all hold (11 of 12 seeded mutants caught).
  The same round fixed range lines (`0:00 - 1:30 Intro`), Audacity labels with a decimal comma, a
  note when the last chapter cannot be checked without the video length, the strikes cause in the
  FAQ and the fix-note wording. Not checked: that YouTube shows the chapters for a given channel.

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

# Worked example: the 60 s Silero test clip (2026-11-23)

The guide page (`remove-silence-from-video.html`) quotes this run.

- Audio: `tests/data/test.wav` from github.com/snakers4/silero-vad (MIT), 60 s,
  16 kHz mono speech.
- Video: laid over ffmpeg's `testsrc` colour bars at 640x360, 30 fps:
  `ffmpeg -f lavfi -i testsrc=size=640x360:rate=30 -i test.wav -shortest -c:v libx264 -c:a aac t.mp4`
- `node cutter.mjs t.mp4 --edl t.edl --fcpxml t.fcpxml --xml t.xml --wav t-cut.wav --csv t.csv`:

```
t.mp4: 1:00 -> 0:55 (7 pauses cut, 4.8 s removed, 8%)
noise floor -58.6 dBFS, voice -16.4 dBFS, threshold -43.8 dBFS
```

- First EDL events:

```
001  AX       AA/V  C        00:00:00:00 00:00:02:09 00:00:00:00 00:00:02:09
002  AX       AA/V  C        00:00:02:17 00:00:07:01 00:00:02:09 00:00:06:23
```

- `node cutter.mjs t.mp4 --ffmpeg` then running the printed command: the cut
  MP4 is 55.267 s (ffprobe), the kept frames are 1,658 at 30 fps = 55.27 s;
  the cut WAV is 55.262 s.
- `xmllint --noout` passes on the FCPXML and the Premiere XML.
- The browser page (headless Chromium, the same MP4 dropped in) shows the same
  result: 1:00 to 0:55, 7 pauses, 8%, floor/voice -59/-16 dBFS; its EDL
  download matches, and the WAV export is 5.3 MB. Raising the shortest pause to
  1.0 s leaves 1 cut (0:58). No console errors; no horizontal scroll at 380 px.

Not yet checked: importing the three timeline files into DaVinci Resolve,
Premiere Pro and Final Cut Pro themselves (none runs here). The formats follow
the CMX3600, FCPXML 1.9 and xmeml v4 layouts; an import report from a real
editor is the first thing wanted.

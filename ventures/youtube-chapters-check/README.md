# Youtube Chapters Check

Free browser tool that checks a YouTube chapter list against the rules that decide whether chapters
show (first timestamp 0:00, at least three timestamps in ascending order, each chapter at least 10
seconds), with a line number for every problem, and fixes ordering and format. It also converts
Premiere Pro, DaVinci or Audacity marker exports into a description-ready list, a podcast
chapters.json, ffmpeg chapter metadata or a WebVTT chapters track. The text is read locally and
never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/youtube-chapters-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/youtube-chapters-check/
```

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

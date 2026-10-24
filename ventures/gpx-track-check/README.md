# Gpx Track Check

Free browser tool that checks a GPX track file for what makes Strava, Garmin Connect and Komoot
reject or mis-read it: missing creator, version and namespace, points at 0,0, GPS jumps, timestamps
out of order, tracks with no times, impossible elevations, truncated files and empty segments, each
with its line number. It writes the file back with every provable fix applied and leaves the rest
untouched. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/gpx-track-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/gpx-track-check/*.test.mjs
```

## Check GPX files in CI

`cli.mjs` is the same checker for a terminal or a CI job, with no dependencies
(Node 20 or newer). Files are read from disk and nothing is sent anywhere.

```
node cli.mjs check ride.gpx               # exit 1 if there are errors
node cli.mjs check routes/ --strict       # every .gpx under a folder; warnings fail too
node cli.mjs check ride.gpx --json
node cli.mjs fix ride.gpx                 # writes ride.fixed.gpx (--in-place overwrites)
node cli.mjs thin ride.gpx --max-points=500   # writes ride.thin.gpx, shape kept within the smallest tolerance that fits
```

Exit codes: 0 clean, 1 findings at the failing level, 2 usage or read error.
It applies the same provable fixes as the web page and reports the rest.

## Files

- `index.html`: the tool's page.
- `cli.mjs`: the command-line and CI wrapper around `calc.mjs`.
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

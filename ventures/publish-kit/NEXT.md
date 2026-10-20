# Publish Kit: what's left, for the next agent

Written 2026-10-20 at the end of the session that built this venture (PR
#8726). Everything below is unfinished and has not been started. Each item says what
done looks like. Background: [`docs/reports/2026-10-20-publish-kit.md`](../../docs/reports/2026-10-20-publish-kit.md).

Before you start: `node --test` in this folder (50 tests, no FFmpeg needed),
and `python3 platform/ci/run_venture_tests.py publish-kit podcast-feed-check kdp-royalty-calculator`.

## 1. Move the owner's own projects onto it (highest value)

The owner asked for this tool *for their projects*. Two of them hand-roll
podcast RSS today:

- `ventures/hearth-and-horizon/` (`generate.mjs`, `podcast.json`, `feeds/*.xml`)
- the `writing/` podcast from PR #8711 (open when this was written; check
  whether it merged)

**Done when:** each project's feed is built by `publish-kit podcast build`
(or by importing `podcast.mjs`'s `buildPodcastFeed` from its generator),
**with the existing episode guids kept byte-for-byte**. Changing a guid
re-publishes every episode to every subscriber. Diff the old and new
`feed.xml` and confirm that only additive tags changed (`podcast:guid`,
`podcast:locked`, `itunes:type` and so on). Their tests stay green.

## 2. EPUB features

- Markdown tables (`| a | b |`) and footnotes (`[^1]`, rendered as EPUB 3
  `epub:type="noteref"` / `"footnote"` asides).
- A per-book CSS override exists (`publish.json` → `"css": "book.css"`), but
  it is not documented in the README. Document it.
- **Done when:** a fixture chapter using both builds an EPUB that passes W3C
  EPUBCheck with 0 errors. Download it from
  `https://github.com/w3c/epubcheck/releases/download/v5.1.0/epubcheck-5.1.0.zip`;
  Java is available in cloud sessions. Add tests in `book.test.mjs`.

## 3. Loudness on MP3

ACX's RMS/peak/noise-floor rules are measured on 16-bit WAV only.
`audiobook check` prints an FFmpeg command for MP3s. An optional
`--measure` flag could run `ffmpeg -af astats` when FFmpeg is on the PATH,
parse the result, and feed it into `checkAcx` as `loudness`.
**Done when:** `audiobook check --measure` reports RMS and peak for MP3s, and
skips with a notice when FFmpeg is missing.

## 4. Distribution (off by default, owner flips)

Per `portfolio/distribution/README.md`: an opt-in, dry-run-by-default
`publish-kit podcast submit` that only prints the Podcast Index
`add/byfeedurl` request. Never send it without the user's own API key, and
never under the portfolio's name. The npm package
(`npx publish-kit`) is an owner ask: publishing under the portfolio's
public name needs the owner. Prepare `package.json` with `"bin"` but do not
publish it.

## 5. Found while landing this, not fixed here

- `ventures/ats-resume-checker`: test "byok.mjs is a byte-identical copy of
  the shared client" fails on `main`. Its own message names the fix:
  `cp platform/llm/byok.mjs ventures/ats-resume-checker/byok.mjs`. Diff the
  two first, check other ventures that vendor `byok.mjs`, and run their tests.
- Landing a new venture needs more than `node platform/marketing/regen.mjs`.
  After any merge of `main`, also run
  `node platform/marketing/front-door-tools.mjs --write` (then delete the
  untracked `gitops/prod/front-door-tools/` scratch directory),
  `python3 platform/ci/sync_tree_counts.py`, `python3 gitops/ci/sync_readme_counts.py`
  (when adding a workflow), `node platform/pages/launched.mjs --write`,
  `python3 platform/ci/publish_surface.py --write`, and adjust
  `SWITCHES_IN_THE_CATALOGUE` in `platform/privacy/optout-persistence.test.mjs`
  for a new `usage.mjs`. A fix that adds these steps to `regen.mjs`, or a
  `land-venture` script that runs them all, would save the next venture
  session the three red CI rounds this one had.

# One narration engine: what was measured, and why each default is what it is

2026-10-24. Owner's request: "a better audio rendering system both in efficiency
and quality". This report covers `platform/audio/narrate.py`: what it replaced,
the numbers behind each default, and what is still open.

## What there was

The repository makes spoken audio in three places, and each had its own copy of
the same loop:

| Renderer | Engine | Loudness | MP3 |
|---|---|---|---|
| `platform/pages/podcast_tts.py` (29 episodes) | Kokoro-82M through torch `kokoro` | one-pass `loudnorm` | 24 kHz, 48 kbps |
| `ventures/saints-by-candlelight/render_audio.py` (19 episodes) | Kokoro v1.0 through `kokoro-onnx` | one-pass `loudnorm` | 44.1 kHz, 40 kbps |
| `ventures/hearth-and-horizon/render_audio.py` (24 stories) | Piper, `en_US-ljspeech-high` | one-pass `loudnorm` | 44.1 kHz, 48 kbps |

All three voiced a paragraph at a time, padded it with fixed silence and
re-voiced the whole piece on any edit. None of them cached anything.

## What there is now

`platform/audio/narrate.py`, used by all three scripts:

- text is cut into sentence-sized units (sentences under 40 characters ride
  with a neighbour); abbreviations and dotted acronyms (`Dr.`, `A.I.`) don't
  end a unit;
- each unit's audio is cached under `~/.cache/narrate`, keyed by the sha256 of
  (model, G2P, voice, speed, language, text), stored as float16;
- units the cache lacks are voiced in a process pool, one single-threaded
  onnxruntime session per core, longest unit first;
- the voice's own edge silence is trimmed, every edge gets a 4 ms raised-cosine
  fade, and the gap after a unit depends on its last mark (`.` 0.34 s, `?`
  0.42 s, `,` 0.18 s, all divided by speed);
- mastering is two-pass: measure EBU R128 loudness, apply one fixed gain, then a
  true-peak limiter running at 96 kHz;
- MP3 is mono, constant bitrate, at 32 kHz;
- if `misaki` is installed, it phonemises English. misaki is Kokoro's own
  dictionary-first G2P and the one the torch package uses; espeak-ng is the
  fallback.

## Measurements

All of these ran in this cloud container: 4 cores, 15 GB of RAM, no GPU,
onnxruntime 1.31 on CPU, Kokoro v1.0 fp32 weights. The test texts are real
repository scripts: the podcast episode
`2026-10-21-typeof-localstorage-throws` (2,144 characters, about 2 minutes of
audio), the first 14 blocks of Saints episode 001 (`bm_george`, en-gb, speed
0.9, 282 s), and the first 14 blocks of Hearth story `bench-six` (`af_bella`,
speed 0.95, 227 s). The scripts that produced these numbers were scratch files
and are not committed. Each number is a single run; expect a few percent of
noise.

### Speed

RTF (real-time factor) is wall time divided by audio length; lower is faster.

| Setup | Wall time | Audio | RTF |
|---|---|---|---|
| Old loop: one session, onnxruntime's default threads, a paragraph per call | 37.5 s (+3.2 s model load) | 128.8 s | 0.291 |
| One session, 1 thread | 106.7 s | 128.8 s | 0.829 |
| One session, 2 threads | 60.0 s | 128.8 s | 0.465 |
| **New, 4 workers × 1 thread, cold cache** (includes 4 model loads) | 34.4 s | 137.1 s | **0.251** |
| New, 2 workers × 1 thread, cold cache | 55.9 s | 137.1 s | 0.408 |
| **New, nothing edited** (all 19 units from cache) | **0.03 s** | 137.1 s | n/a |
| **New, one sentence edited** (1 voiced, 18 cached) | **3.0 s** | 137.1 s | n/a |
| End to end: `podcast_tts.py` on `2026-10-24-does-nailer-recoil-slow-a-robot` with misaki, loads and mastering included | 38 s | 131 s | 0.29 |

So:

- **Cold renders are about 14% faster** (0.291 to 0.251). onnxruntime's own
  threading uses four cores less well than four independent sessions, but the
  ceiling is the CPU: four single-thread sessions can't beat 0.829 / 4 = 0.21.
  On a 30-minute Saints episode, where the model loads are a smaller share,
  expect about 0.22 to 0.23.
- **Re-renders are where the time goes away.** Revising a story, fixing one
  pronunciation, or changing a pause no longer re-voices the piece. Before, a
  30-minute Saints episode took about 9 minutes to re-render after any edit at
  the measured 0.29 (`PRODUCTION.md` reports about 15 on earlier sessions);
  now the time scales with the sentences that changed.
- The podcast's old torch path was not timed: its venv is about 6 GB of CUDA
  wheels and wasn't worth installing to measure something being removed. The
  baseline above uses the same weights through kokoro-onnx, which is what Saints
  ran.

Other quantised weights were tried and rejected:

| Model file | RTF, 1 thread | Note |
|---|---|---|
| `kokoro-v1.0.onnx` (fp32, 326 MB) | 0.918 | kept |
| `kokoro-v1.0.fp16.onnx` (177 MB) | 0.754 | 18% faster, but the waveform differs enough (durations shift) that its quality can't be judged against fp32 without listeners |
| `kokoro-v1.0.int8.onnx` (92 MB) | 0.966 | slower than fp32 on this CPU |

### Loudness

The old chain was `highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11`, single pass.
In that mode `loudnorm` keeps adjusting the gain as it goes. "Gain wobble" is
the spread of output-over-input level across 400 ms speech windows (windows
above the 40th percentile of input level, after aligning out the MP3 decoder
delay). With one fixed gain it would be 0, so whatever is left comes from the
limiter, the high-pass and the codec.

| Clip | Chain | Integrated | True peak | LRA | Gain wobble SD | Range |
|---|---|---|---|---|---|---|
| podcast | one-pass `loudnorm` | -17.0 LUFS | -1.0 | 2.2 | 0.72 dB | 6.6 dB |
| podcast | **fixed gain + limiter** | -16.7 LUFS | -1.0 | 2.1 | **0.37 dB** | **2.3 dB** |
| saints | one-pass `loudnorm` | -16.6 LUFS | -1.0 | 1.5 | 0.33 dB | 2.8 dB |
| saints | **fixed gain + limiter** | -16.5 LUFS | -1.0 | 1.6 | **0.20 dB** | **1.6 dB** |
| hearth | one-pass `loudnorm` | -17.1 LUFS | -1.3 | 3.0 | 0.86 dB | 6.1 dB |
| hearth | **fixed gain + limiter** | -16.8 LUFS | -1.0 | 3.1 | **0.47 dB** | **2.8 dB** |

The new chain cuts the gain wobble about in half and lands closer to the
-16 LUFS target. It costs 1.5 to 2.5 s more mastering time per piece, which is
nothing next to synthesis. Both chains overshoot the -1.5 dBTP target by about
half a dB once encoded, because MP3 encoding adds its own peaks.

### Codec

Each clip was normalised and encoded, then decoded and scored against the
uncompressed render. The two metrics are wideband PESQ (ITU-T P.862.2, which
only sees up to 8 kHz; mean over 10 s windows; higher is better) and
log-spectral distance up to 12 kHz (LSD; lower is better).

| Setting | MB/min | PESQ podcast / saints / hearth | LSD podcast / saints / hearth (dB) |
|---|---|---|---|
| 44.1 kHz 40 kbps (Saints before) | 0.30 | 3.87 / 4.00 / 4.09 | 9.75 / 6.96 / 8.89 |
| 44.1 kHz 48 kbps (Hearth before) | 0.36 | 4.23 / 4.29 / 4.30 | 7.36 / 5.06 / 6.69 |
| 24 kHz 48 kbps (podcast before) | 0.36 | 3.88 / 4.10 / 4.06 | 6.74 / 4.24 / 6.31 |
| **32 kHz 40 kbps** (Saints now) | 0.30 | 3.92 / 4.05 / 4.07 | 8.95 / 5.83 / 8.40 |
| **32 kHz 48 kbps** (podcast and Hearth now) | 0.36 | 4.19 / 4.28 / 4.26 | 7.03 / 4.40 / 6.59 |
| 32 kHz 32 kbps | 0.24 | 3.67 / 3.61 / 3.90 | 12.56 / 9.55 / 12.24 |
| Opus 24 kbps (reference only, podcast clip) | 0.17 | 4.33 | 5.54 |

The first podcast-clip sweep covered 22.05, 24, 32 and 44.1 kHz, CBR 32 to
48 kbps and VBR V6 to V9. Its main finding: the MPEG-2 rates (22.05 and
24 kHz, including Kokoro's own 24 kHz) score worse than the MPEG-1 rates
(32 and 44.1 kHz) at every bitrate. The new settings:

- **Podcast: same bytes, clearly better.** PESQ goes up by 0.18 to 0.31 on all
  three clips.
- **Saints: same bytes, a little better.** PESQ is level (+0.05, +0.05,
  -0.02) and LSD is 0.5 to 1.1 dB lower.
- **Hearth: no change** (within ±0.04 PESQ).

Bitrate is not where bytes can be saved. Dropping to 32 kbps costs 0.2 to 0.4
PESQ on every clip. The real byte saver is Opus: 24 kbps beats every MP3 here
at under half the size. But podcast apps don't reliably accept Opus
enclosures, so it isn't the default. Pages serves at most 1 GB, and the three
audio folders already hold 405 MB. If that budget becomes the constraint, the
next step is an Opus copy for the on-page player with the MP3 kept for feeds,
or moving enclosures off Pages (`prompts/creative/prompt-0.md`, "Audio size").

### Pronunciation

misaki against kokoro-onnx's espeak-ng phonemiser, on one line of podcast text:

| Text | espeak-ng | misaki |
|---|---|---|
| "The A.I. **read** 42 PRs" (past tense) | ɹˈiːd (present) | ɹˈɛd (past, from context) |
| "in **2026**" | "two thousand twenty six" | "twenty twenty six" |
| "**localStorage**" | two words | one compound word |

misaki is optional because spaCy, which it needs, didn't build on Python 3.13
here, though it did on 3.12. Install it without the `[en]` extra, as the
docstring says: the extra pulls in `spacy-curated-transformers` and with it
torch, which took the venv from 0.5 GB to 6.0 GB. A plain `kokoro-onnx` venv is
323 MB. The G2P is part of the cache key, so audio from the two phonemisers
never mixes.

## Shipped in the same change

- The podcast episode `2026-10-24-does-nailer-recoil-slow-a-robot` was voiced
  with the old Piper voice, and its script had been edited since, so
  `podcast_tts.py --check` failed on `main`. It is now re-voiced with the new
  engine (Kokoro `af_heart`, misaki), matching the other 28 episodes, and
  `--check` exits 0.
- Hearth & Horizon records new stories with Kokoro (`af_bella`) instead of
  Piper. Its first 24 recordings stay on Piper until someone re-renders them,
  and each story page now names the voice it uses. The FAQ says the same.
- `docs/posts/2026-10-25-real-bounces-found-three-misreads.md` had a
  176-character description, over the 160 that `writing.mjs` allows. That broke
  `podcast.test.mjs` (and the writing build) on `main`. It is shortened to 151.

## Open

- **No listening test.** PESQ and LSD are proxies, and nobody has listened to
  an A/B of the new pauses. A listener comparing the re-voiced nailer episode
  with an older one would settle it.
- **Rendering the missing audio.** Hearth has 17 stories without audio and
  Saints has episodes 20 to 22 text only. They were held back by the 400 MB
  audio-folder line, not by the renderer.
- **Shorts** (`platform/distribution/shorts.mjs`) still call the Piper CLI
  from a workflow. Moving them onto this engine means a Python step in that
  workflow plus a 350 MB model download per run, so it was left as is.

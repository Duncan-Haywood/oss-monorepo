# Listen & Learn Audio: AI audio stories and podcasts for learning by listening

Audio you listen to, to learn and be entertained: graded stories in the
language you're learning, and podcast-style episodes on any topic, built for
when your hands and eyes are busy. Unlike a normal voice assistant, it does
the talking. It doesn't keep asking you questions.

**Listen in your browser:** https://duncan-haywood.github.io/monorepo-projects/listen-and-learn-audio/

Two forms today:

1. **An AI skill for voice mode.** Add [`skill/SKILL.md`](skill/SKILL.md)
   to Claude, or make a custom GPT from
   [`gpt/instructions.md`](gpt/instructions.md), switch on voice mode, and
   say "tell me a story in Spanish, beginner level" or "play an episode
   about volcanoes". Stories, two-host episodes and serials, at your level,
   in any language the assistant speaks. It runs on your own assistant plan.
2. **A browser player.** Five short graded stories (CEFR A1-A2) in Spanish,
   French, German and Italian, read aloud a line at a time by your device's
   own voices: target language then English, English then target, or
   immersion only, with optional pauses to repeat aloud (shadowing).

The stories in [`stories.mjs`](stories.mjs) were written for this project.
They are read by text-to-speech, so quality depends on the voices your device
has installed.

## Roadmap

- **v1:** more stories per language and level; an installable web app;
  stories pre-rendered to audio files so they play with the screen locked
  and from headphone controls (the Web Speech API stops when a phone
  sleeps, but an `<audio>` element with Media Session does not).
- **v2:** part of the iOS-first app shared with
  [Hands-Free Language Coach](../hands-free-language-coach/): a "listen"
  tab next to "practise", CarPlay audio, background playback.
- **v3:** new episodes generated on demand on the listener's own API key
  (text model plus text-to-speech), never paid for by us per listener.

## Privacy

Everything runs in your browser with your device's own voices. Nothing is
uploaded, and there are no accounts, tracking cookies or analytics vendor.
We count anonymous events in your browser only (`story_started`,
`story_finished`); the footer has an off switch, and Do Not Track / Global
Privacy Control turn it off. The AI skill runs inside your assistant, under
its provider's privacy terms.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not professional language instruction,
and its stories and translations may contain mistakes; it does not replace
a qualified teacher. **You are responsible for reviewing and verifying its
output before relying on it.** To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Development

```
node --test              # stories.mjs and usage.mjs
python3 -m http.server   # then open http://localhost:8000/
```

MIT licensed. [Sponsor on GitHub](https://github.com/sponsors/Duncan-Haywood).

# Hands-Free Language Coach: voice-only language learning app

Learn a language with your ears and voice only, while you drive, walk, cook
or commute. It works like a language game (streaks, XP, levels, spaced
review, sharing with friends), but every step is spoken and you answer out
loud. No tapping, no reading, no screen.

**Try it in your browser:** https://duncan-haywood.github.io/monorepo-projects/hands-free-language-coach/

It ships in three forms, cheapest first:

1. **A skill for AI voice assistants (available now).** Add it to Claude
   ([`skill/SKILL.md`](skill/SKILL.md)) or make a custom GPT from
   [`gpt/instructions.md`](gpt/instructions.md), turn on voice mode, and say
   "start my language lesson". Any language the assistant speaks, with
   drills, role-play conversations and short stories. It runs on your own
   assistant subscription, so it costs us nothing per learner.
2. **A browser prototype (available now).** `index.html`: a scored,
   hands-free phrase drill in Spanish, French, German, Italian and
   Brazilian Portuguese, using the browser's own speech synthesis and
   recognition. Progress stays in your browser.
3. **A native iOS app, then Android (planned).** See the roadmap below.

## How a session works

Press Start once. The coach says the English meaning, then the phrase in
the language you're learning (twice in the assistant skill), and listens.
Your browser's speech recogniser transcribes you, and the coach compares the
words with the target, ignoring accents and punctuation:

- understood: +10 XP and the phrase moves up a review box;
- close: one more try (+4 XP);
- missed twice: it comes back first next session (+1 XP).

Say **repeat**, **skip** or **stop** at any time, in English or in the
language you're learning. One finished session a day keeps your streak.

The score checks whether a speech recogniser understood you. It is not a
phonetic assessment by a teacher.

## Roadmap

| Stage | What | Cost per learner to us |
|---|---|---|
| v0 (shipped) | Assistant skill + browser drill | $0 |
| v1 | Installable web app (PWA): offline phrase packs, more languages, longer packs by level, Media Session controls for headphones | $0 |
| v2 | iOS app: on-device speech (`SFSpeechRecognizer` on-device mode, `AVSpeechSynthesizer`), background audio so it runs with the screen locked, CarPlay audio, Siri Shortcut "start my lesson" | $0 (on-device) |
| v3 | Open AI conversation on the learner's own API key (see the API-key switch below), friends' leagues, Android | the learner's key |

**The API-key switch** ([`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md)
section 3): drills, review, streaks and packs work fully with no key.
Free-form AI conversation needs a speech-to-speech model, which costs money
per minute, so it is unlocked by the learner's own key (or by using the
assistant skill on their existing ChatGPT or Claude plan) rather than
paid for by us.

**Social, without a server:** v0 shares a streak card through the system
share sheet. Leagues need shared state, so they wait for v3 and will be
opt-in and nickname-only.

## Safety while driving

Start the session before setting off, mount the phone, and never look at
or touch it while moving. Follow your local laws on phone use in vehicles.
Say "stop" whenever the road needs your attention. The browser prototype
needs the page open with the screen on; the native app is what removes that.

## Privacy

Your progress (XP, streak, which phrases you know) is stored only in your
browser. The page uploads nothing to us and has no accounts, tracking
cookies or analytics vendor. Speech recognition is done by your browser,
and some browsers (Chrome, for example) send audio to their own speech
service to transcribe it. We count anonymous events in your browser only
(`session_started`, `session_finished`, `streak_shared`); the page footer
has an off switch, and Do Not Track / Global Privacy Control turn it off.
The assistant skill runs inside your assistant, under its provider's
privacy terms.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not professional language instruction
or a certified assessment, and it does not replace a qualified teacher.
**You are responsible for reviewing and verifying its output before relying
on it**, and for using it safely and lawfully, including while driving. To
the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Development

Plain ES modules, no dependencies.

```
node --test          # drill.mjs and usage.mjs
python3 -m http.server   # then open http://localhost:8000/ (speech needs a real browser)
```

`drill.mjs` holds the phrase packs, grading, command parsing, spaced review
and streak logic; `index.html` wires them to the Web Speech API.

Related: [Listen & Learn Audio](../listen-and-learn-audio/), AI stories and
podcasts you listen to in the language you're learning.

MIT licensed. [Sponsor on GitHub](https://github.com/sponsors/Duncan-Haywood).

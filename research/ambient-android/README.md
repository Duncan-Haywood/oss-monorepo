# ambient-android: the testable core of an always-on listening service, and an unbuilt Android shell

Track 2 (ambient AI assistant), milestone 4. Produced with AI assistance. **The Android app is
not built, not installed and not run.** What is verified is a small pure-Kotlin core: audio
re-framing, an energy-gate voice detector, an utterance segmenter and a headset route policy.
No lab from `prompt.md` is built on; there is no lab tag.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-android/

## Motivation

`PROJECTS.md` asks for a Kotlin foreground service with microphone access, Bluetooth headset
routing, on-device voice detection and streaming to the pipeline, built if the Android SDK
installs and otherwise shipped as sources and unit tests. The SDK was not usable here, so the
decision logic lives in a plain-JVM module (`core/`) that has no Android imports, and the
Android-specific part (`app/`) is a thin sketch around it.

## Builds on

- Android developer documentation for foreground services of type `microphone`, `AudioRecord`
  and `AudioManager.getDevices` (API names written from memory, not re-checked against the
  docs; this is why `app/` is marked unbuilt).
- Silero VAD (MIT) is the intended learned detector; `EnergyVad` is only a placeholder that
  gates on frame RMS and fires on any loud noise. It is not compared with Silero here.
- `ambient-pipeline` (this repository) for the downstream stages the segments would feed.

## Method

- `Chunker`: re-frames reads of arbitrary length into fixed frames (30 ms at 16 kHz in the app).
- `EnergyVad`: RMS threshold plus a hangover of N frames.
- `Segmenter`: buffers frames only while speech is active, plus a pre-roll before onset; emits
  one utterance per speech burst, cut at a maximum length. Silence is never kept or emitted.
- `selectRoute`: prefers BLE audio, then SCO, then wired. If a headset the user was using drops,
  it returns `null` (the service stops) rather than silently switching to the phone mic, unless
  the caller opts in. This is a design choice of mine, not a requirement from any source.
- `app/`: `ListenService` (foreground service, persistent notification, `AudioRecord` loop)
  and a manifest. The notification is deliberately visible; nothing here hides recording.

## Reproduce

Owner machine with network: `cd research/ambient-android && gradle :core:test` (Kotlin 2.0.21,
`kotlin("test")`, JUnit platform). The `app/` module has no Gradle file; create an Android
Studio project and add `app/src/main` to it.

In the cloud container Maven Central answered HTTP 429, so the Gradle build could not resolve
the Kotlin plugin. Instead I compiled `core/` and the tests with the Kotlin 2.0.21 compiler jar
bundled in Gradle's `lib/` and ran them with a throwaway shim of the three `kotlin.test`
functions used, outside the repository, and a reflection runner:

```
7 tests, 0 failed   (chunker remainder, VAD hangover, segmenter pre-roll, long-utterance cut,
                     silence never emitted, route preference, headset-drop pause)
```

These tests check logic on synthetic square-wave frames. They say nothing about real speech,
real microphones, battery or latency. No timing or power numbers exist for this project.

## Limitations

- `app/` has never been compiled; expect API errors. Android 14+ foreground-service rules,
  Bluetooth SCO/LE routing (`setCommunicationDevice`) and the runtime permission flow are not
  implemented; `routes()` only lists inputs and does not select one.
- Nothing is streamed to a recogniser; the hand-off is a TODO.
- `EnergyVad` has not been tested against noise, music or crosstalk.
- iOS is not started (it needs the owner's Mac).

## Consent and privacy

Audio is processed on the device and no raw audio is stored. Recording law differs: US federal
law needs one party's consent, but some states, California among them, need everyone's.
Whoever runs this must follow the rules where they are. The service shows a persistent
notification and does not try to defeat the OS microphone indicator.

## Owner steps

Install Android Studio and the SDK; create the project; build and install on a test phone;
pair a Bluetooth headset. No hardware is needed beyond a phone and headset the owner already has.

## Next steps

Build `app/` and fix API errors; wire a Silero VAD ONNX model and whisper.cpp through JNI;
measure battery and latency on a device; then `ambient-wearable`.

## Outside dependencies

Android SDK and a device (not available here), Kotlin/Gradle plugin download (rate-limited
here), and a speech recogniser (not wired).

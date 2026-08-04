# Technical architecture

## Device responsibilities

**Apple Watch** uses Core Motion during an explicit workout-style session,
buffers timestamped accelerometer/gyroscope samples, marks candidate motion
windows, and transfers batches through WatchConnectivity. It never decides a
biomechanical fault alone.

**iPhone** owns the session clock, AVFoundation rolling video buffer, Vision
body-pose extraction, motion/video alignment, Core ML inference, local encrypted
metadata, review UI, export/delete, audio session, and speech output.

`RangeCoachCore` owns deterministic sensor validation, swing-event detection,
confidence gates, metric contracts, and the "one cue" policy. Platform adapters
must keep AVFoundation, Core Motion, Vision, WatchConnectivity, Speech, and
AVAudioSession out of the core module.

## Session pipeline

```text
Watch motion batch ----> clock alignment ----\
                                             +--> fused swing window --> metrics
iPhone video buffer --> pose + impact hint --/                         --> cue policy
                                                                          |
                                                      local review <-----+--> audio
```

Each artifact carries session ID, swing ID, monotonic capture time, source,
model/rule version, and confidence. Wall-clock time is display metadata only.
Clock offset and uncertainty are recalculated periodically; a window with
uncertain alignment may be saved for review but cannot receive a fused cue.

## Failure and degradation rules

- No Watch: show camera-only mode and omit motion-derived fields.
- No camera/poor pose: retain Watch timing if opted in, but suppress pose cues.
- Thermal pressure: lower preview/analysis rate before ending capture; announce it.
- Low storage: stop retaining new video before existing session data is at risk.
- Audio unavailable: show/haptic one cue; never play a backlog into later swings.
- Model crash/timeout: save raw local window only if the user enabled recording;
  mark analysis unavailable and keep the session recoverable.

## Verification before device beta

- Unit and property tests for time ordering, thresholds, confidence, cue priority,
  handedness transforms, units, and malformed/partial inputs.
- Recorded-fixture contract tests for Watch batches, pose frames, and model versions.
- Physical-device integration tests for clock drift, Bluetooth interruption,
  backgrounding, phone calls, thermal pressure, storage exhaustion, and deletion.
- UI tests on supported iPhone sizes plus VoiceOver/Dynamic Type/manual range use.
- A labeled false-positive/false-negative benchmark split by relevant conditions.

The current repository contains only the tested core scaffold. None of the
device-integration evidence above exists yet, so the product is not releasable.

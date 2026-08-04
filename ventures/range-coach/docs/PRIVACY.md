# Privacy and safety contract

## Data inventory and defaults

| Data | Purpose | Default location | Default retention |
| --- | --- | --- | --- |
| Swing video (no ambient audio) | Review and on-device analysis | iPhone app container | Auto-delete after 30 days; user may keep or delete sooner |
| Watch motion | Detect and align swings | Watch buffer, then iPhone | Watch copy removed after acknowledged transfer; iPhone follows session |
| Pose/derived metrics | Feedback and progress | iPhone app container | Follows session |
| Spoken command transcript | Session control | On device where supported | Not retained |
| Product telemetry | Measure setup/capture success | Off in prototype | No collection until a versioned schema, owner, purpose, consent, 30-day maximum retention, and deletion path exist |

The first build records video without ambient audio. Optional push-to-talk voice
commands may use the microphone and on-device speech recognition, discard audio
and transcripts immediately after command recognition, and are visually obvious;
the live coach itself is speech output and needs no microphone. Camera framing
guidance must minimize bystanders, and exports warn when another person appears.

The first build has no account and no cloud backend. Export uses the system
share sheet and requires an explicit session selection. Future cloud sync,
coach sharing, or model improvement requires a separate threat model, consent
flow, access/deletion implementation, retention schedule, and owner approval.

## Permission rules

Explain camera, microphone, motion/fitness, Bluetooth/nearby-device, speech, and
notification access at the moment each is needed. Denial must preserve a useful
degraded mode where technically possible. Recording state is continuously
visible on both devices; no covert or background capture.

## Safety language

Feedback is practice guidance, not medical advice or a guarantee of performance.
The coach should never tell a user to swing through pain, ignore fatigue, or
continue in an unsafe environment. Low-confidence evidence produces a setup cue,
not a confident swing diagnosis.

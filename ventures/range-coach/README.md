# Range Coach

Range Coach is an iPhone-first golf practice companion for the driving range.
It pairs a fixed iPhone camera with Apple Watch motion data, detects each swing,
and gives one short coaching cue over the golfer's earphones before the next
ball. After the session, the golfer can review synchronized video, swing phases,
and confidence-labeled observations.

This is a prototype, not a launch-ready coaching or ball-tracking product. The
shared Swift coaching engine targets iOS 17, watchOS 10, and macOS 14. A full,
matching Xcode toolchain is required to build, sign, test, and device-test it.

## Product principles

- Coach the next repetition, not a biomechanical textbook: one cue per swing.
- Say when evidence is weak. No confident diagnosis from a blocked camera,
  loose Watch, practice waggle, or incomplete recording.
- Default to local processing and local storage. Video, voice, and motion leave
  the device only after an explicit export or opt-in cloud feature.
- Never claim launch-monitor precision from a phone camera alone. Estimated
  ball start line or outcome must show its confidence and may be unavailable.
- The golfer controls capture with large controls, voice, or Watch gestures and
  can pause, review, export, or delete a session at any time.

## First complete product slice

1. Mount the iPhone face-on or down-the-line and run framing/lighting checks.
2. Start the range session from iPhone or Watch.
3. Keep a rolling local video buffer while the Watch streams timestamped motion.
4. Detect a probable swing, retain a short video window, and align impact.
5. Run on-device body-pose and motion analysis.
6. Speak one short cue through connected earphones; suppress low-confidence cues.
7. Review swings and delete one swing or the entire session.

Ball flight, club identification, conversational coaching, remote human-coach
sharing, and cloud model training are later experiments—not hidden MVP scope.

## Repository map

- `Sources/RangeCoachCore` — platform-independent swing detection and cue policy.
- `Tests/RangeCoachCoreTests` — success, boundary, false-positive, and confidence tests.
- `docs/PRODUCT.md` — users, jobs, scope, acceptance criteria, and learning plan.
- `docs/ARCHITECTURE.md` — iPhone/Watch/audio/video design and failure handling.
- `docs/PRIVACY.md` — data inventory, defaults, retention, and consent boundaries.

## Verify

```sh
swift test --package-path ventures/range-coach
```

The current host has mismatched Swift compiler/SDK patch versions, so this
command presently fails while linking the package manifest, before compiling
project source. This is an environment blocker, not passing verification.

## Next build step

Install/select full Xcode, create an iOS app and paired watchOS app that import
`RangeCoachCore`, then prove timestamp synchronization and swing-window capture
on physical devices before adding pose-based coaching.

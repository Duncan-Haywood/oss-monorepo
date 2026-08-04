# Product brief

## Primary user and moment

A recreational golfer practicing alone at a driving range, already wearing an
Apple Watch and earphones, who wants useful feedback without touching the phone
between shots. Secondary users are teaching professionals reviewing an exported
session; coach collaboration is not part of the first slice.

## Core job

"While I hit a bucket of balls, notice repeatable swing issues and give me one
trustworthy adjustment I can try on the next ball."

## MVP outcomes

- Setup to first recorded swing in under two minutes.
- At least 90% of full swings captured in supported placement/lighting.
- Fewer than 5% of waggles, practice motions, or dropped-device events retained
  as confident swings in the labeled pilot.
- A cue starts within 1.5 seconds of the detected swing end at p95 on supported
  devices, without interrupting an active swing.
- Every metric and cue retains provenance (Watch, camera, or fused) and confidence.
- Deleting a session removes its local video, motion, derived metrics, and index.

These are experiment thresholds, not current performance claims.

## Deliberate non-goals for v1

- Exact club-head speed, carry distance, spin, or launch angle without external
  calibrated hardware.
- Medical, injury-prevention, or professional biomechanical diagnosis.
- Always-listening cloud voice, autonomous model training, social feeds, or
  public leaderboards.
- Background recording outside an explicitly active range session.

## Critical acceptance journeys

1. **Happy path:** camera and Watch permissions granted, framing passes, ten
   swings are captured, cues play, review aligns motion/video, session persists.
2. **No Watch:** camera-only mode is clearly labeled and never invents Watch metrics.
3. **Poor framing:** analysis pauses, explains the fix, and resumes without losing
   already recorded swings.
4. **Disconnected Watch/earphones:** capture continues safely; the current cue
   displays once and no spoken cues are queued for later playback.
5. **False motion:** waggle, club pickup, walking, and dropping the Watch do not
   create confident coaching events.
6. **Interruption:** phone call, app backgrounding, thermal pressure, low storage,
   and low battery end or degrade capture explicitly and recover predictably.
7. **Privacy:** deny each permission independently; export only chosen sessions;
   delete one swing and delete all data; verify no orphaned media or telemetry.
8. **Accessibility:** VoiceOver, Dynamic Type, high contrast, reduced motion,
   large range-safe controls, and no color-only confidence signal.

## Learning plan

Run a concierge pilot before optimizing models: 15 golfers, at least 500 labeled
swings, face-on and down-the-line, multiple skin tones/clothing/lighting/device
positions, left- and right-handed swings, and a teaching professional reviewing
whether each confident cue is materially helpful or wrong. Record sample size
and uncertainty; do not generalize from the pilot population.

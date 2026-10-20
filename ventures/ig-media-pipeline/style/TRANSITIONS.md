# Transitions

How shots join in a reel. The transition director reads this guide with the measurements of every
cut, so edit it to change the house style.

## Kinds

These are the exact spellings; a plan carries them as `kind`, `duration_s`, `params`, `reason`.

- Rendered by `igmp.aitx` (`aitx.SUPPORTED`): `morph`, `depth_parallax_through`, `generative`,
  `whip`, `zoom_through`, `match_dissolve`, `luma_dip`, `flash`, `speed_ramp_cut`.
- The renderer's own xfade moves: `cut`, `crossfade`, `whip-left`, `whip-right`, `zoom-in`,
  `dip-black`. The director may name them where the matching aitx kind was on offer: `crossfade` for
  a `match_dissolve`, `whip-left`/`whip-right` for a `whip` the same way (the picture slides left: the
  camera swings right), `zoom-in` for a `zoom_through`, and `dip-black` for a dark `luma_dip`.
- `params`: `direction` (whip: the way the camera swings), `focus_a` / `focus_b` (subject points,
  `[x, y]` in 0..1), `color` (`dark` or `light` for a dip, `warm` or `white` for a flash), `strength`
  (1 is the tuned default), `prompt` and `seed` (generative), and `allow_fallback`.

## Only at full quality

An AI transition is used only when its real backend is installed. A weaker stand-in for the same
effect looks worse than a simpler transition done well.

- `morph` and `speed_ramp_cut` need RIFE. Without it a morph becomes a `match_dissolve` and a ramp
  becomes a straight cut. ffmpeg's own interpolation smears ridgelines and leaves block artefacts.
- `depth_parallax_through` needs Depth Anything. Without it the move becomes a `zoom_through`; the
  no-model depth guess tears on star fields.
- `generative` needs its model downloaded and switched on. Without it the move becomes
  `depth_parallax_through`, and failing that a `zoom_through`.
- The director is only offered what will render at full quality.
- `allow_fallback` (per transition, or `aitx_allow_fallback` in the config) accepts the weaker
  backends anyway.

## The default is a cut

Most cuts in a good reel are straight cuts on the beat. A cut is invisible when it lands on the
music and the next shot answers the last one: a new place, a closer look, the same motion carried
on. An effect transition draws attention to itself. Use it where the reel has a moment to mark.

- At most two or three effect transitions in 15 seconds, on the strongest beats (bar lines) or at a
  change of chapter: a new place, day into night, the arrival somewhere.
- Never the same effect on two cuts in a row. Two whips in a row read as a template.
- At most one AI hero transition (morph, parallax-through, generative) in a short reel. It is the
  reel's signature moment, so place it at the turn of the story, not in the hook.
- The hook (the first second) wants a cut or a whip, never a slow dissolve.
- Durations sit on the beat grid: a whip is a fraction of a beat; a dissolve or a morph is about a
  beat; a parallax move is about a bar at a slow tempo.

## Each transition

**cut**: any time. Best when shots differ in scale (wide, then detail) or carry motion across the
cut. Weak between two near-identical framings (a jump cut), which a match dissolve or a morph fixes.

**whip** (0.27 to 0.5 s): a fast pan blurred by motion out of one shot and into the next. It works
when the outgoing shot is already moving: a pan along a coastline, a 360 clip turning, a drone
sideways move. Keep the direction of the motion; a whip against it looks like a mistake. Good for
energy on a downbeat and between places. Poor on night skies (the blur smears stars into streaks of
nothing) and on slow, calm footage.

**zoom_through** (0.33 to 0.67 s): pushes into the outgoing subject and comes out of the incoming
one. It fits a still that is already pushing in, and moves from wide to detail ("the valley, then
the hut in it"). Strong on a downbeat. Poor when either frame has no clear subject, and on faces.

**match_dissolve** (0.4 to 0.8 s): a dissolve with both subjects locked together: horizon to
horizon, the moon to a street lamp, one peak to another. It needs a real visual rhyme. It suits
calm moments and time passing (the same view at golden hour, then blue hour). Without a rhyme it is
just a dissolve, which reads as dated, so prefer a cut.

**luma_dip** (0.5 to 1 s): the outgoing shot sinks through its shadows into a soft dark gradient,
and the next shot rises out of it brightest-first. Made for day into night: the stars and city
lights arrive before the rest of the sky. The light variant does the reverse for bright scenes. It
needs a real change of brightness; between two similar exposures it looks like a fade.

**flash** (0.27 to 0.53 s): a warm light leak (or a white flash) with the cut hidden under its peak.
For dark into bright (night into sunrise), golden-hour sets, and festive or summer energy. Use it
sparingly: once per reel at most. Poor on cool, moody and night-sky sets, where the warmth clashes.

**speed_ramp_cut** (0.4 to 0.8 s): live video slows from full speed to about 40% into a cut on the
downbeat. Good on motion with a peak: a wave breaking, a jump, a car passing, a bird taking off.
Pointless on stills and on footage that barely moves.

**morph** (AI frame interpolation, 0.4 to 0.8 s): flows one frame into the other with optical flow
(RIFE). Magic between frames that nearly match: the same ridge from two spots, a timelapse sky into
the next one, a 360 clip into a still of the same scene. Below about 0.6 similarity it melts into
mush; then use a match dissolve or a cut. It is an AI hero: once per reel.

**depth_parallax_through** (AI depth, 0.8 to 1.3 s): both frames become 2.5D scenes; the outgoing
one dollies in with near things moving faster than far ones, crosses at speed, and the incoming one
settles out of its own dolly. It gives stills the depth of a drone shot. Best on landscapes with
clear layers (a foreground rock, a lake, ridges, sky) and on a night sky over a silhouette. Weak on
flat subjects (a wall, a plate of food) and busy crowds. It is an AI hero: once per reel, on a
chapter change.

**generative** (AI video generation, about 1 s, off unless enabled): a generated in-between that
starts on the outgoing frame and ends on the incoming one. Only for the single hero moment of a
reel, when nothing else could join the two shots, and only if the result is checked. It is slow,
lower resolution than the footage, and can invent things that were not there.

## Footage notes

- **Night sky** (Milky Way, stars, aurora): cuts and dips, slow dissolves between exposures of the
  same sky; parallax over a silhouette. Avoid whips, zooms and flashes: motion blur and bright
  overlays destroy stars.
- **Landscapes** (A7RV stills): parallax-through and zoom-through give stills motion; a match
  dissolve for the same view at another hour.
- **360 clips** (X5): their motion is a gift: whip in the direction of the turn.
- **Gimbal and handheld video** (Pocket 3, Osmo): whips and speed ramps on movement; cuts on calm.
- **Timelapses**: dissolves and morphs between sequences of the same sky; cut into a timelapse on a
  downbeat rather than dissolving into its first frame.

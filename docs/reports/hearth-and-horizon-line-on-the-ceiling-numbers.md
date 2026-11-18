# The Line on the Ceiling: the numbers behind the story

Working notes for the Hearth & Horizon story *The Line on the Ceiling*
(BIBLE.md "Next up", proposed 2026-11-17). Written before the draft so the
dialogue can be checked against one model. All figures are estimates under
stated assumptions; the story is fiction.

## Humidity

Magnus formula (a = 17.62, b = 243.12 °C), room at 20 °C:

| room RH | dew point | surface temp at which surface RH reaches 80% (mould threshold) |
|---|---|---|
| 60% | 12.0 °C | 15.4 °C |
| 50% | 9.3 °C | 12.6 °C |
| 45% | 7.7 °C | 11.0 °C |

With 0 °C outside, a surface must stay above 15.4 °C at 60% RH: a
temperature factor fRsi = (15.4 - 0) / (20 - 0) = 0.77, close to the 0.75
critical fRsi in UK guidance for dwellings (BRE IP 1/06).

## The beam as a fin (rough, one-dimensional)

Assumed: a 152 x 89 x 16 universal beam (area 20.3 cm², surface 0.525 m² per
metre), steel k = 50 W/m·K (mineral wool about 0.035, ratio about 1,400).
It passes through 100 mm of new internal mineral-wool insulation; on the
masonry side of the insulation the solid brick is now cold, assumed 2 °C
with 0 °C outside. Inside, the back-span sits in the ceiling zone, coupled
to the 20 °C room with an effective h of 3 to 8 W/m²·K (unknown; both
bracket it).

- Bar through the insulation: kA/L = 0.1015 / 0.1 = 1.0 W/K.
- Inside back-span as an infinite fin: G = sqrt(hPkA) = 0.40 to 0.65 W/K,
  decay length sqrt(kA/hP) = 0.25 to 0.16 m.
- Heat flow 5.2 to 7.2 W; steel at the inner face of the insulation about
  7 to 9 °C, below the 12.0 °C dew point.
- Steel below 15.4 °C for the first 0.14 to 0.26 m from the wall; below
  12.0 °C for the first 0.05 to 0.12 m.

So the mould line is about the flange width (9 cm) and runs about 15 to 25 cm
in from the wall, darkest at the wall where it is wet. A real assessment
would use a 2-D or 3-D numerical model (BR 497 conventions); this is a
bracket, said as one in the story.

## Why it did not happen before

Before the retrofit the solid brick was warm on its inner face (U about 1.7,
inner surface about 15.6 °C at 0 °C outside) and old sash windows kept the
room nearer 45% RH. The retrofit made the masonry cold and the room
airtight, so the beam got colder and the air wetter at once.

## Fixes in the story

1. Bleach and anti-mould paint (fails: the cause is the temperature).
2. Wrap the beam's back-span in insulation for about 0.6 m from the wall,
   so the plaster no longer touches cold steel (the steel stays cold).
3. A humidity-controlled extract fan and trickle vents to hold about 50% RH
   (threshold surface temperature falls to 12.6 °C).
4. A structural thermal break at the wall: the proper fix, needs the porch
   propped and an engineer; left for the summer.

## Dates (2049)

Easter 18 April 2049; Ash Wednesday 3 March; Candlemas Tuesday 2 February;
Saint Joseph Friday 19 March; Annunciation Thursday 25 March. Insulation
fitted from Monday 14 September 2048.

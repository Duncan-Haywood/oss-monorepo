# Open Tennis Robots: the hopper and feed, as a checked CAD model

Agent report, 2026-10-21. Venture: `ventures/open-tennis-robots` (flagship 9).

## What landed

The feeder's CAD package (`cad/otr_cad`, build123d) now models the part the
earlier version listed as missing: how balls get from storage to the wheels.

- A storage tub on a laser shelf that falls 12 degrees toward an outlet, on four
  2040 posts bolted to the deck.
- A 600 mm smooth-bore hose from the outlet to a column on the launcher head.
- Printed floor, roof-and-column and a **shuttle** between the head plates. The
  shuttle's pocket holds one ball; a linear actuator slides it 95 mm to the
  wheels, and its solid rear shuts the column while it moves.
- New checks: shuttle taller than one ball and shorter than two; column clear of
  the top wheel; stroke reaches the wheels' first contact point (ball centre
  37 mm behind the wheel axis); tub capacity (125 balls against 120 wanted);
  hose chord falls at least 30 degrees at every elevation; hose bend radius at
  the closest pose; shuttle fully advanced clears the head; every printed pilot
  hole meets a hole in both head plates.

`python3.13 -m unittest tests.test_cad` (26 tests, 95 s) passes and the
committed package is a byte-identical rebuild.

## What the model found

1. **Gravity alone cannot feed a head that tilts nose-up.** The head tilts to
   +45 degrees, where a ball would have to roll uphill. That is why the feed is a
   shuttle that pushes, not a gate at the hopper as `hardware/feeder-catcher.md`
   first described.
2. **The hose end swings about 450 mm.** The column's socket sits 430 mm above
   the pivot, so tilting the head moves it far. The 600 mm cut length only just
   absorbs it (bend radius 171 mm against a 150 mm limit).
3. **The shuttle's open front is not a gate at negative elevation.** A ball can
   roll to the wheels without a stroke. A front retainer is the next job.
4. The hopper's mass sits at the rear, so it is not credited against tipping in
   the wind-ballast figure (15 kg; crediting the hopper posts would have shown 6 kg and
   hidden the need).

## Limits

Nothing is built. The hose bend check models the hose as a circular arc and
ignores its end directions. Ball-rolling slope (30 degrees) and hose dimensions
are assumptions, not measurements. The agitator, actuator brackets and post
bracing are not drawn.

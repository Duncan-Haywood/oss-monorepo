---
title: "How to lay out a stair: risers, stringers, stairwell headroom, landings, winders and guards"
seo_title: "Stair layout: risers, stringers, headroom and guards"
date: 2026-11-28
tags: [for-customers, wall-framing-takeoff, construction, framing, stairs, estimating]
description: "Lay out a house stair from one number, the total rise: risers, stringers, stairwell opening, landing, winders, guards and the order, with every sum shown."
---

*Written by an AI agent working in this repository. Every figure below is the free stair engine's
output on a typed example, re-run on 2026-11-28 against `ventures/wall-framing-takeoff/stairs.mjs`.
The limits are the model residential code's usual ones, held as typed defaults: the edition your
jurisdiction adopted, your engineer and your building department decide what is actually
required. An estimating and layout aid, not engineering advice, and no stair has yet been built
from it and compared.*

A stair is the part of a house frame where a small layout error turns into a trip hazard or a
failed inspection, and it is also the part a lumber list most often gets wrong: the stringers are
long boards, the stairwell opening has to be framed before the stair exists, and the guard is a
pile of small pieces nobody counts until the day.

The free [stair stringer calculator](../../ventures/wall-framing-takeoff/stair-stringer-calculator.html)
works it out from the total rise, and the full [wall framing takeoff](../../ventures/wall-framing-takeoff/)
adds the stair to the same lumber order as the walls and floors. Everything runs in your browser;
your plan is never uploaded. This guide collects what the engine does, the sums it uses and the
worked examples from its tests in one place. (It replaces 57 short update notes written
as each check was added; their old links now lead here.)

## How many risers does a stair need?

Measure the total rise from finished floor to finished floor, then divide by the largest riser you
may use and round up. The model residential code's limit is 7-3/4 in, and every riser in a flight
must be within 3/8 in of the others, so the engine makes them all equal.

For a 9 ft (108 in) rise: 108 / 7.75 = 13.94, so **14 risers of 7-11/16 in**. There is one tread
fewer than risers, **13 treads**, because the top "tread" is the upper floor. At a 10 in tread the
total run is 10 ft 10 in and the stair climbs at 37.6 degrees.

If you leave the tread blank the engine picks one from the comfort rule, 2 x riser + tread of about
25 in, never under the 10 in minimum. It warns when 2R + T falls outside 24 to 25.5 in, the range
that feels natural underfoot; this stair is 25.43 in.

## Why is the first riser cut shorter?

The stringer is notched before the treads go on, so every step is measured to the top of the tread
above it except the first, which sits on the floor. Cut the bottom of the stringer one tread
thickness short: with 1-1/2 in treads the first riser is cut **6-3/16 in**, and it becomes 7-11/16 in
once the tread is on, like the others.

## How long is a stair stringer, and how many do I need?

The stringer runs the pitch line from the first nose to the top nose, plus what the plumb cut at the
top and the level cut at the foot take along the board. The engine takes a conservative bound (the
full board depth projected on the slope at each end) and then picks the shortest board on your
stock list that holds it. The 9 ft stair needs stringers **14 ft 11-15/16 in** long, so 16 ft
2x12s; if no listed board is long enough the layout is refused, not shortened.

Stringers go at both edges of the stair and no farther apart than you ask (16 in unless typed), with
three at the least. A 36 in stair gets **4 stringers 11-1/2 in apart**; a 60 in stair at 16 in gets 5.

How far a tread can span between them depends on its thickness. The engine uses the common figures
and notes when the spacing is too wide:

| Tread thickness | Usual most between stringers |
|---|---|
| under 1-1/4 in | 12 in |
| under 1-1/2 in | 16 in |
| 1-1/2 in (2x) and thicker | 24 in |

A 60 in stair with 1 in treads and stringers asked at 24 in spans 19-1/2 in, so the note says to
tighten the spacing or use thicker treads.

## How much wood is left under the notches?

A notched stringer is only as strong as the board left under the notches, the throat. Its depth is
the board depth less R x T / sqrt(R² + T²). For 7-11/16 in risers and 10 in treads on a 2x12
(11-1/4 in actual) that leaves **5-1/8 in**, above the usual 3-1/2 in minimum. Most stair tables
stop at the riser and tread; the engine checks the throat on every layout and suggests a deeper
board, a shorter tread or a centre support when it is too thin.

## How long must a stairwell opening be for headroom?

Headroom, 6 ft 8 in (80 in) at the edge of the opening, decides the stairwell, so frame the floor
opening before the stair. The nose line drops R / T for every inch you move down the stair, and the
floor above hangs its own thickness below its surface, so the opening must be at least
(80 + floor thickness) x T / R long.

With a 12-1/2 in floor system: (80 + 12.5) x 10 / 7.6875 = **9 ft 11-15/16 in**. A 10 ft opening
just clears; a 9 ft one leaves under 6 ft 8 in, and if you type the opening length the engine says
by how much. The opening's tail joists, header and trimmers are counted in the floor takeoff, with
their hangers in the [framing nails, hangers and ties guide](2026-11-27-framing-nails-hangers-and-ties-for-a-house.md).

## When does a stair need a landing?

The model residential code (IRC R311.7.3) allows a flight to rise **12 ft 7 in (151 in)** between
floor levels or landings. The engine used 147 in until 2026-11-04, which matched no code; the
commercial code (IBC 1011.8) uses 12 ft, and the limit is typed, so set 144 or whatever your book
says. A 151 in stair is one flight; 152 in is told it needs a landing.

A 160 in (13 ft 4 in) stair splits at half the rise unless you move it: two flights of **11 risers
of 7-1/4 in** and 10 treads each, with a 36 x 36 in landing framed from four 2x8 joists, two rims and
four 2x12 deck boards. The stairwell opening is checked against the upper flight only.

## How big are the posts and footings under a stair landing?

A free-standing landing stands on posts around its edge (at most 96 in apart unless typed). A
corner post carries a quarter of a bay and a mid-edge post half of one, at 40 psf live plus 10 psf
dead unless you type your own. Type the soil's bearing capacity from a soil report or your local
book (there is no default) and the heaviest post sets the footing:

| Landing | Posts | Heaviest post | Area on 1,500 psf | Footing |
|---|---|---|---|---|
| 36 x 36 in | 4 | 112.5 lb | 10.8 sq in | 4 in round or square |
| 48 x 120 in, posts at most 60 in apart | 6 | 500 lb | 48 sq in | 8 in round or 7 in square |

Those footings are far below the frost depth and the minimum diameter most codes ask for, so read
them as a lower bound that tells you when the soil, not the minimum, governs. With a stringer check
on the stair, the larger flight's reaction is added along the edge it bears on.

The posts get two checks. Slenderness: a solid sawn column is held to 50 times its least face
(NDS), so a 4x4 tops out at 175 in and a 6x6 at 275 in. Strength: type the post's design
compression (fc) and minimum modulus (Emin) and the engine computes the NDS column stability factor;
a 4x4, 60 in tall, at fc 1,000 psi and Emin 400,000 psi gives Cp 0.728 and about 8,900 lb of
capacity against the 500 lb post above. Landing joists can be checked the same way: a 2x8 at 16 in
over 10 ft at 40 + 10 psf gives 761 psi in bending and 0.18 in of live deflection against 0.33 in
allowed. Bracing, uplift, lateral load and the stringer bolts are not checked.

## Is my notched stringer strong enough?

The engine ships no allowable stresses, because they depend on species, grade and the adjustments
your code applies; a default would be a quiet claim of adequacy it cannot back. Type live and dead
load, Fb, Fv and E from your lumber table or your engineer, and it treats the worst interior
stringer as a simple beam over the run, with the throat as its depth. It reports bending, shear,
deflection (span/240 unless typed) and the end reaction, and solves the throat depth each check
needs.

On the 9 ft stair at 40 psf live, 10 dead, Fb 900, Fv 180 and E 1,600,000 psi (made-up values), the
5-1/8 in throat **fails in bending, 1,276 of 900 psi**: it needs at least 6.12 in. That is the point
of the check: it tells you to add a mid-flight support or a closer spacing before you build. Add
Fc-perp and it also gives the shortest bearing at the support (0.41 in at 425 psi, against the
3-1/2 in assumed). When the stringer is notched where it bears, it applies the NDS notched-member
shear form, (2/3) Fv b dn (dn / d); a 9-1/4 in board with 3 in left allows 175 lb against a 278 lb
reaction and warns to keep full depth at the bearing or hang the stringer. (Re-running these figures for this guide turned up a bug: until 2026-11-28 the
notched-support field was refused on every real stair, and a stringer check missing one value blanked
the stairs card instead of saying which value was missing. Both are fixed, with a test.)

The flight's total top reaction (stringers times the per-stringer reaction) can be hung on the
stairwell header it lands on, as a point load at mid-span, and the trimmer beside the opening then
sees the larger end reaction. On the full takeoff page that is one select on the floor card.

## Will a stair tread hold 300 pounds?

The code asks a tread to carry a concentrated load at mid-span. The engine takes one board carrying
it alone between two stringers: M = PL/4, deflection PL³/48EI against L/240. A 2x12 tread over a
16 in span under 300 lb gives 284 psi in bending and 0.005 in of deflection against 0.067 in
allowed. A 1 x 5-1/2 in deck board over the same span gives 1,309 psi and fails a typed 1,000 psi.

## Open risers and the 4 inch sphere

An open-riser stair must not let a 4 in sphere pass between treads. The engine checks the vertical
gap, riser less tread thickness, which is slightly conservative on a sloped stair. On the 9 ft stair
with 1-1/2 in treads that is **6-3/16 in**, so it says to add risers (solid or slats) or use a much
thicker tread. Some codes relax the rule for a stair rising 30 in or less, and the note says so.

## How tight can a winder stair turn?

A winder turns a corner with wedge-shaped treads instead of a landing. The code asks for at least
6 in of depth at the narrow end and 10 in measured 12 in out from the narrow side. Depth at a radius
is the radius times the angle in radians, so three 30 degree treads meeting at a point have no depth
at all; they need an inner radius of at least 6 / 0.5236 = **11.5 in**, and four 22.5 degree treads
need **15.3 in**.

Two more things it checks. A tread is cut with a straight edge, not an arc, and a straight edge
reads 2r sin(angle / 2), a little less: 11.5 in passes by arc (6.0 in) and reads 5.95 in across. And
the walkline depth must stay within 3/8 in of the straight treads above and below: three 30 degree
treads round a 20 in radius are 16.76 in deep at the walkline, 6.76 in more than a 10 in tread, so
they fail. For framing it counts one radial support under every tread edge (three treads need four
supports as long as the stair is wide) and the boards to cut them from, with saw kerf if you type it.

## Does a spiral stair pass code?

Spiral stairs get a looser rule set: 26 in clear width, a tread at least 6-3/4 in deep 12 in from
the narrow edge, risers up to 9-1/2 in. A 108 in rise, 60 in across, a 4 in pole and 12 treads per
turn gives 12 risers of 9 in, 28 in clear and a tread **7.33 in** deep at the walkline: it passes.
At 16 treads per turn the tread drops to 5.50 in and fails, and the calculator says 13 per turn is
the most that pass. Its headroom test is a simplification.

## How many balusters does a stair guard need?

Type the number of guarded sides and the engine lays out the guard: posts no more than 72 in apart
along the slope, balusters spaced so a 4 in sphere cannot pass (measured horizontally, the cautious
way), a 36 in guard and a handrail 34 to 38 in above the nose line.

The 9 ft stair has about 164 in of slope, over 72 in, so each side gets 3 spans and 4 posts. 130 in
of run over 3 spans, less a 3-1/2 in post, leaves 39.8 in clear, which takes **7 balusters a span,
21 a side, 42 in all, at 3-11/16 in clear**. The rails run parallel to the stair, so every baluster
is the same length, 30-3/16 in at the long point. Four 2x4 rails of 13 ft 11-11/16 in join the
lumber order, and the handrail is 15 ft 6-3/16 in (the pitch, 12 in past the top and a tread past the
bottom) on 5 brackets at most 48 in apart. A landing's open end or side gets the same treatment:
on a 36 in edge, 6 balusters at 3-3/8 in clear.

A guard post must resist a concentrated load at the top. Taken as a cantilever, a 3-1/2 x 3-1/2 in
post with 200 lb at 36 in sees 1,008 psi, which passes a typed 1,200 psi; a 1-1/2 x 3-1/2 in member
loaded on its weak face sees 5,486 psi and fails. In a real stair the bolted or notched connection
almost always governs before the post does, and that is not checked.

## What goes on the stair order, and what does a stair cost?

Everything above joins the same cutting-stock order as the walls: stringers, 13 tread boards 3 ft
long (a 2x12 covers 11 in of tread and nosing), riser boards if you name a size (2x8 risers on the
9 ft stair take two per riser, 28 boards; 2x10s take 14), guard rails and the handrail. Hardware is
counted, not designed: one top connector and one foot anchor per stringer, 4 and 4 here, with the
size and fasteners left to the engineer or the maker's table.

In the budget, stair carpenters usually quote by the riser, so a `laborStairRiser` rate multiplies
the riser count of every stair in the plan (both flights of a landing stair, and a deck's stair):
14 risers at a typed 40 is 560. The handrail is priced by the foot, and balusters, posts and
brackets by the each. No prices ship with the tool; an unpriced line is listed and left out of
the total.

A deck stair starts from the deck height: a deck 36 in above grade needs 5 risers of 7.2 in, and on
the page it is one select in the deck card.

## How it was checked, and what it is not

Every figure here is a hand computation that the tests in `ventures/wall-framing-takeoff/`
(`stairs.test.mjs`, `floor.test.mjs`, `budget.test.mjs`) check exactly, and the page's checks are
clicked through in headless Chromium. A seeded fuzz test throws 400 random flights at the engine and
requires each to be refused with a reason or to have equal risers within the limit that add up to
the rise, treads of at least 10 in, at least three stringers no farther apart than asked and a board
long enough for each. Hostile inputs (a post spacing of a billionth of an inch, numbers typed as
text, a tread a billion inches thick) are refused with a reason rather than answered.

It is not a stair design. The limits are typed defaults from the model code, not your edition; the
strength checks use values you type and simple-beam statics, with no notched-stringer test data
behind them; connections, uplift and lateral loads are not checked. No real stair has been built
from it and compared yet. If you build stairs and would share a real one's layout, that comparison
is the most useful next step for this tool.

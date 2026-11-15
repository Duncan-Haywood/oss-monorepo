---
title: "The Wall Down the Middle: a story about a dance floor that was strong and still bounced"
seo_title: "Why a strong dance floor bounces: a science fiction story"
date: 2026-11-15
tags: [fiction, hearth-and-horizon, engineering, structure, vibration, timber]
description: "A new Hearth & Horizon story: a parish hall floor passes its load check, then bounces at a céilí. Slowing the band makes it worse."
---

[The Wall Down the Middle](../../ventures/hearth-and-horizon/stories/the-wall-down-the-middle.md)
is a new story on Hearth & Horizon, the science fiction shelf. An AI wrote
it. It runs about 3,900 words of story plus a closing note that shows every
sum. It is text only, because the creative audio folders are at 474 MB and
runs stop adding MP3s once they pass 400 MB.

**Why this one.** The bible's only open Hearth & Horizon proposal was a
parish hall floor that bounces at a céilí, and no open pull request was
writing it. Saints by Candlelight already had an episode in flight (PR #16352).

**The trap.** In 2051 a 1956 hall in an invented County Clare village gets a
new floor: glulam joists 90 × 360 mm at 400 mm centres, spanning the whole
8 m width in one run so the dug-out crawl space can carry heat-pump ducts.
The diocese's buildings assistant checks it two ways and both pass:

- **Static:** at an imposed load of 5 kN/m² the joists use about half their
  bending strength and sag 29 mm, inside L/250 (32 mm).
- **Dynamic:** the floor's natural frequency is 10.9 Hz, above the roughly
  8.4 Hz that guidance has asked of dance floors.

The second check is the mistake. The frequency of a joist goes as
√(stiffness / moving mass), and 64 dancers at 75 kg add 37 kg/m², nearly as
much again as the floor weighs. With them on it the floor rings at **8.3 Hz**.
One set of eight, the January trial, only brings it to 10.4 Hz, which is why
the floor felt lovely in rehearsal.

**How a 2-steps-a-second dance reaches 8 Hz.** Nobody steps eight times a
second. But a stamp is not a sine wave: its force has the beat and whole
multiples of it. In the battering figures the heels land twice a step, so a
reel at 2.2 steps a second hits the floor 4.4 times a second, and the second
harmonic of that is 8.8 Hz, close enough to 8.3 to drive it. The tea urn
walks along the trestle.

**The failed fix is the interesting one.** The assistant says "play slower",
because it sounds like less energy. The band slows to 2.05 steps a second.
Heels at 4.1, second harmonic 8.2 Hz: dead on the floor. The second night
is worse, and an 81-year-old dancer sits out feeling seasick. Slowing a
forcing frequency can move it onto a resonance instead of away from it.

**The rejected fix.** Doubling the joists doubles stiffness but adds mass,
so the loaded frequency only rises to about 10 Hz, which a heel at 5 a second
reaches: a fast polka at 2.5 steps a second, the Tuesday class's own Kerry-set
pace. The engineer says no.

**The right fix was there in 1956.** Frequency falls with the square of the
span. The old floor sat on a low block sleeper wall down the middle, 4 m and
4 m, and the refurbishment knocked it out. A steel 152 × 89 UB on seven posts
at 2 m puts it back: 33 Hz on a rigid support, about 20 Hz once the beam's
own give is counted by Dunkerley's rule, far above anything a dancer's heel
can reach.

**What the story does not claim.** The response accelerations are given as
ranges from a one-mode estimate with stated assumptions (force harmonic 5 to
12% of body weight, coordination 0.5 to 0.8, damping 4 to 8%), not as a
measurement. The comfort limits are given as ranges because guides differ.
It is not structural advice: a floor that bounces under dancing needs a
structural engineer.

**A change from the proposal.** The bible proposed a dance at about two steps
a second sitting *near the floor's natural frequency*. Working the numbers
first showed that cannot happen to a floor that passes the static check: if
the full design load sags it no more than L/250, the dancers' mass alone
leaves it near 8 Hz or above. So the beat reaches the floor through the
second harmonic of the heels instead, which turned out to be the better
story: it is what makes the slower band worse.

Next up on the shelf: a proposal for a hill-town church whose one stone
stair empties far slower after Midnight Mass than its width says, because
the handshakes are at the bottom.

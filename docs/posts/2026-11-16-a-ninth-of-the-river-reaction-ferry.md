---
title: "A Ninth of the River: a story about a ferry pushed across by the current, and what low water does to it"
seo_title: "How low water slows a current-driven reaction ferry: a story"
date: 2026-11-16
tags: [fiction, hearth-and-horizon, ferry, river, physics, croatia]
description: "A new Hearth & Horizon story: at a third of May's current the push on a reaction ferry is a ninth, and the crossing goes from 5 minutes to 14."
---

[A Ninth of the River](../../ventures/hearth-and-horizon/stories/a-ninth-of-the-river.md)
is a new story on Hearth & Horizon, the science fiction shelf. An AI wrote
it. It runs about 4,000 words of story plus a closing note with every sum.
It is text only: the creative audio folders hold 577 MB, and runs stop
adding MP3s once they pass 400 MB.

**Why this one.** The previous science fiction run left the proposal in the
series bible: a cable ferry with no engine, pushed across a river by the
current, planned for a feast-day pilgrimage from its usual crossing time. No
open pull request was writing it.

**The setting.** In 2052 an invented village on the Sava, in Croatia's
Lonjsko Polje floodplain, reopens the chapel across the river for the feast
of the Mala Gospa (the Nativity of Mary, 8 September). The parish assistant
plans 360 pilgrims across on the skela, a reaction ferry: a steel pontoon on
a wire, set at 35° to the current so the river pushes it sideways. It takes
the crossing time from five years of the ferry's tracker data: a median of
5 minutes 5 seconds. That gives 148 people an hour and the last boat at
9:54.

**What the median measured.** Of 2,140 logged crossings, 96 were in
September. The ferryman runs every day until the river drops and only when
he must after that. So the median measured his timetable, not the river.

**Why a third of the current costs more than three times.** Every force the
water puts on the hull goes with the square of its speed. At 0.35 m/s
against May's 1.05, the push is a ninth: about 180 N from a standstill
instead of 1,630. In mid-river that matters less than it sounds, because
the hull's drag also goes with the square of its own speed, so the crossing
speed scales with the current. But a fixed resistance, from the block
rolling on the wire, the lines and the wire's sag (50 N in the model), does
not shrink. Near the banks, where the water is slower still, it wins, and
the ferryman poles the first and last 25 metres. The full crossing takes 14
minutes, 71 people an hour, and five hours for the pilgrimage.

**The failed fix.** The textbook picture says the crossing speed is the
current times the tangent of the angle, so 50° should be 70% faster than
35° and the crossing should drop to 8.2 minutes. It drops to 11.8. A blunt
pontoon is not a wing: turn it steeper and the water runs past it faster
end-on, so the drag along it grows. With the model's constants the best
angle is about 61°, and that is only 50% better than 35° in mid-river, not
the 160% the tangent promises. At the banks the starting push goes with
sin θ cos θ, which is 0.470 at 35° and 0.492 at 50°, so the angle barely
helps where the time is lost.

**The "no", and the fix.** The organiser asks for fifty a trip; the plate
on the rail says forty, and the ferryman explains why. Sixty young pilgrims
offer to walk ten kilometres round by the bridge. Then an angler offers his
trolling motor, rated at 55 lb (about 245 N; the story uses 180 N moving).
Against May's river it is a tenth of the push and saves 45 seconds. Against
September's river it is as strong as the whole current, and the crossing
falls to 8 minutes: 110 people an hour, 300 over by 9:41. The model never
runs the motor's batteries below half. The statue of the Mala Gospa crosses
last, without the motor, at the river's own speed.

**The model, in one line.** Push across the pontoon ½ρ·9 m²·V²·sin α,
drag along it ½ρ·2.7 m²·V²·cos α (lumped, assumed), 50 N fixed, current
falling as 1 − s⁴ towards the banks, poling 120 N, motor 180 N, integrated
in 10 cm steps across 110 m. The note lists every result the dialogue uses.

**What a reader can take from it.** A force that goes with the square of a
speed punishes low flow far more than the ratio suggests. A fixed push,
small next to a strong flow, can match a weak one completely. And a median
from a log only describes the times something was logged.

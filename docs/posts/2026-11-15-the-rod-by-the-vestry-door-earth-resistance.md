---
title: "The Rod by the Vestry Door: a story about a lightning earth that read 573 ohms"
seo_title: "Lightning earth resistance and a church spire: a science fiction story"
date: 2026-11-15
tags: [fiction, hearth-and-horizon, engineering, lightning-protection, earthing, electrical]
description: "A new Hearth & Horizon story: a stolen copper conductor is replaced with aluminium, and the new earth rod in dry rubble reads 573 ohms against the 10 asked for."
---

[The Rod by the Vestry Door](../../ventures/hearth-and-horizon/stories/the-rod-by-the-vestry-door.md)
is a new story on Hearth & Horizon, the science fiction shelf. An AI wrote
it. It runs about 5,500 words with its closing note. It is text only,
because the creative audio folders are at 474 MB and runs stop adding MP3s
above 400 MB.

**Why this one.** `platform/ci/creative_due.py` drew Hearth & Horizon for
this session, and the shelf's one open proposal in the bible was a church's
lightning earth. No open pull request was writing it.

**The trap.** In Lent 2047 thieves strip the copper down-conductor off a
Victorian spire in an invented North Yorkshire village. The insurer's capped
payout won't cover copper, so the diocese's buildings assistant specifies
aluminium tape, 25 by 3 mm. That is 75 mm², above the 70 mm² that
BS EN 62305 asks of aluminium, so the conductor is fine. It also moves the
route to the corner the street lamp lights, to put off the next thief, with
a new earth rod by the vestry door. Under the vestry is builder's rubble from
a school demolished in 1960. The rod stops at 1.2 m. Nobody measures it.

**The numbers.** Dwight's single-rod formula, R = ρ/(2πL)·(ln(4L/a) − 1),
with an estimated 800 Ω·m for dry rubble fill, gives 573 Ω for that rod. The
standard recommends about 10. A second rod 1.5 m away only brings it to
327 Ω, because two close rods share the same ground. A line of rods 2.4 m
apart would need about a hundred to reach 10 Ω, and the wall has room for
nine. At a 30 kA stroke, 573 Ω means a rise of 17 MV on paper. In practice
the current would never get there. It would jump to the nearest thing earthed
some other way: the bell's chime motor or the organ blower 60 cm behind the
vestry wall, both earthed through the mains. Wet clay by the churchyard's
old field drain, at an estimated 30 Ω·m, gives 12.6 Ω for a 2.4 m rod, 6.7
for two and 4.7 for three. The third rod is there for a dry August, when
doubling the clay's resistivity gives 9.4. As an estimate, a 38 m spire there
is struck about once in 50 to 160 years.

**The reasonable "no".** The obvious answer is rods in the wet north
churchyard. The parish priest refuses, because the headstones came out in
the seventies and the people under them did not. The sacristan, 83, held an
umbrella for the tester every September for years. She remembers that he
lifted two iron lids by the drain, and that nobody was ever buried along it
because you can't dig a grave in a drain. The lids were turfed over in 2034.
The thieves cut the old tape at the turf and never knew the rods went further.
The fix is more rods in the right ground, a measured reading, and a
bimetallic plate at a test joint above the grass. Before that plate, the
builder had clamped aluminium to brass in a wet pit, and it was already
white with corrosion after seven weeks. The tester then says the other half
out loud: a good earth still leaves 141 kV on the bottom of the tape, so the
chime motor and the blower are bonded and the board gets surge protection.

**Checked before merging.** Every resistance, voltage and strike estimate
in the closing note was recomputed in Python from the formulas it names.
That included the mutual resistance between rods, solved as a small
equal-voltage system rather than guessed. The weekday of every date was
checked too, along with Easter 2047 (14 April, so 6 March falls in the
first week of Lent) and the sacristan's age. An adversarial reread caught
three slips. The vestry was first placed on the north-east edge of the
graveyard, which contradicted the lit south-east route. A line credited the
standard with a minimum rod length the story never used. And the organ
blower was winding down at the Angelus with no one having played it. The
bible's Hearth & Horizon list was empty after this story, so the run added
a next proposal: a culvert sized from an old rainfall table.

---
title: "Ridge beam, ridge board or trusses for a small shed: what the numbers say"
date: 2026-10-30
tags: [shed-designer, framing, structure, cost]
description: "Site-built trusses with OSB gussets, priced against a ridge beam and a ridge board. The ridge board still wins on cost; trusses win on short boards."
---

A builder walking through the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) with an owner pointed at the ridge beam. It was the most loaded member in the default 8x12, at 79% of its capacity. It also needs two 14 ft boards, which are awkward to haul. The question was whether a different roof structure does the job for less.

So the designer now frames a third roof: **site-built trusses**. Each truss is two top chords, a bottom chord across the walls, and 7/16" OSB gussets glued and nailed on both faces. You build them flat on the floor deck in a jig and stand them up. No ridge member, and no temporary ridge props.

**How they are checked.** Each truss is treated as pin-jointed, the way a span table treats a rafter pair and its tie:

- the outward thrust at each heel is wL²/8h;
- the top chord takes bending plus the compression along it (NDS 3.9.2);
- the bottom chord takes that thrust in tension, plus bending under the attic load: 10 psf, or 20 psf if you store things up there (IRC Table R301.5);
- the gusset nails are counted from the NDS yield limit equations. The nail is the 1-1/2" x 0.148" connector nail already on the list, through 7/16" OSB (NDS Table 12.3.3B gives OSB a bearing strength of 4,650 psi) into spruce-pine-fir. That works out to 92.5 lb a nail with snow.

On the 8x12 at 6/12 the thrust is 374 lb, so each heel gets 6 nails into each chord (3 a face).

**A king post only when it earns its place.** A 2x4 bottom chord spans 8 ft on its own under a 10 psf attic, at 66% of capacity with the thrust included. So 8 ft wide sheds get no king post. That leaves out a member and two gussets per truss, and leaves the middle of the attic clear. The 10x12 and 12x16 presets need one, and so does any shed with storage on the chords.

**What it costs.** Each preset was priced three ways at the same pitch, with notched (birdsmouth) rafter seats for the beam and the board, at the starting Home Depot prices, before tax:

| Design | Ridge beam | Ridge board and ties | Trusses |
| --- | --- | --- | --- |
| 8x12 default, 4/12 | $2,853.20 | **$2,830.18** | $2,891.24 |
| 8x12 classic, 6/12 | $3,368.91 | **$3,250.97** | $3,270.09 |
| 8x10, 6/12 | $3,116.35 | **$3,016.82** | $3,040.21 |
| 8x8, 8/12 | $2,580.47 | **$2,547.58** | $2,585.34 |
| 10x12, 6/12 | $3,768.36 (beam fails) | **$3,692.52** | $3,747.68 |
| 12x16, 5/12 | $4,765.39 (beam fails) | **$4,700.48** | $4,731.27 |

The plain answer: **a ridge board with rafter ties is the cheapest roof on every preset**, by $19 to $61 over trusses. Trusses carry 2 to 3 sheets of OSB for gussets, and on the wider sheds a king post per truss. The labour estimate adds 1 to 4-1/2 hours, mostly for cutting and nailing gussets. Trusses beat the ridge beam on the 8x10, the classic 8x12 and the two presets where the 2-ply beam fails its check. They lose to it by $38 on the default and $5 on the 8x8.

One thing the table does show: the default 8x12 seats its rafters on variable-pitch connectors ($6.39 each). Notching them instead saves $173 under its ridge beam (hangers stay, connectors go) and $81 under a ridge board, and the simplicity search already offers that change.

**So why trusses?**

- **Short boards.** With only 8 and 10 ft boards ticked, the ridge-beam design warns that it needs a 12 ft beam in one piece. The truss design builds from what you have: no roof member is longer than the shed is wide, apart from the sub-fascia, which splices.
- **Built on the ground.** You assemble trusses on the floor deck in a jig and lift each one up. There is no ridge to prop at full height while you set rafters in pairs from a ladder. Our labour estimate doesn't credit that, and a one-person build might.
- **Attic storage.** Sizing the bottom chords for storage is the next step (a 20 psf attic), with a deck on top.

**The catch: the roof gets taller.** A truss's top chords sit on its bottom chord, so the whole roof rises by that chord's depth: about 4" on the default 8x12 against its connector seats, 5" against notched ones. The eave siding has to reach up to the soffit, and on the default that tips the long walls from 4x8 to 4x9 panels. That $35 is already in the table. If your peak limit is tight, it matters.

The choice is under "Roof structure", and "Options made for you" now prices all three. The usual caveat holds: these are screening checks, not an engineer's design, and the plans are not engineered or code-checked.

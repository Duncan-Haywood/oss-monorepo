---
title: "Tennis feeder: a 3 mm printed wedge puts the hopper shelf on its posts' whole ends"
seo_title: "Tennis feeder: printed wedges under a sloped hopper shelf"
date: 2026-11-21
tags: [open-tennis-robots, cad, hardware]
description: "The feeder's hopper shelf falls 12 degrees but its posts were cut square: the shelf sat on one edge, its screws 12 degrees off the bores. Wedges fix both."
---

The open tennis-ball feeder keeps its balls in a tub on an aluminium shelf.
The shelf falls 12 degrees toward the net so the balls roll to the outlet.
Four 2040 extrusion posts hold it up, 1.8 to 1.9 m long, and they were cut
square. The model let that pass, and the assembly guide said "shim each
post's rear edge to the shelf's slope". Two things were wrong with that.

**The shelf sat on one edge.** A post is 20 mm deep along the slope, so a
square top touches a 12 degree shelf along its net-side edge only. At the
rear edge the gap is 20 x tan 12 = 4.25 mm. The weight of a full tub of 125
balls went into a line contact, and the shim was left to whoever built it.

**The screws could not go in.** A laser cuts holes square to the plate, so
the shelf's two M5s per post ran 12 degrees off the post's vertical tapped
bores. Such a screw does not start in its thread. Forced in, it bends as it
pulls the shelf down onto the edge.

## What changed

- **A printed wedge on each post.** It is 20 x 40 mm, 3.0 mm thick at the net
  side and 7.25 mm at the rear, with two holes over the post's core bores. The
  posts are now cut 3 mm shorter. In the tests each wedge is pushed 0.2 mm
  into the shelf and 0.2 mm into its post. The overlap both ways is the whole
  end less the holes, so the shelf bears on the post's full end.
- **The screws go in vertical.** The shelf's post holes grow from 5.5 to
  6.6 mm. A vertical M5 through a 5 mm plate at 12 degrees needs 6.17 mm,
  and the rest is play. A printed taper washer under each head, 1.5 to
  4.05 mm thick, squares the head to the screw.
- **A longer screw.** Down the screw's axis the stack is washer 2.78 mm,
  shelf 5.11 mm and wedge 5.13 mm, 13.0 mm in all. The old M5 x 16 would have
  had 3 mm of thread in the post. The BOM now lists M5 x 25, which puts 12 mm
  into the 15 mm tapped bore. The assembly guide checks this joint like its
  other 25, from the CAD: it measures what lies under the head and fails the
  build if the screw is too short or too long for the thread.

New checks run on every build, and each has a test that makes it fire: the
wedge's thin end is at least three printed walls thick, the washer's thin side
at least one, the hole lets the vertical screw through, and the washer keeps
2 mm of seat round the hole. One more covers sliding. The tub pushes the
shelf down the wedges' slope with tan 12 = 0.21 of its weight, which is under
an assumed 0.3 friction for PETG on aluminium. So friction holds the shelf,
and the screws are not bent by it.

## Why not mitre the posts

A post cut at 12 degrees would also meet the shelf fully. But its tapped bore
would still point 12 degrees away from a screw square to the shelf. And it is
easier to get a square cut to length and a small print right than an angled
cut. The wedge fixes the contact and the screw angle in one part.

## What is not known

The friction figure is assumed. So is how much PETG creeps under a full tub
for a season. Print the wedges solid, and check that the screws are still
tight after the first weeks. Nobody has built a feeder yet. The whole
manufacturing package, the DXFs and STLs these parts come from included, is
in the repository under
[`ventures/open-tennis-robots/manufacturing/feeder`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots/manufacturing/feeder).
The reasoning is in the CAD's README, under "Hopper post wedges".

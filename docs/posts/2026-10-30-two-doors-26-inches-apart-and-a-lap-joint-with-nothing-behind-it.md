---
title: "Two doors 26 inches apart, and a lap joint with nothing behind it"
date: 2026-10-30
tags: [shed-designer, siding, framing]
description: "A fuzz test found a shed where no legal lap-siding joint existed: two doors left no stud between their casings. The tool now frames one there."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) checks every lap-siding butt joint for wood behind both plank ends. Its fuzz test builds thousands of random sheds and runs every check on each. Today, on seed 27311, design #591 failed that check.

The shed was 8x24 with fiber cement lap, studs at 24" and a 12 ft haul limit. It had two front doors, 45" and 49" wide, only 26" apart. The bottom courses run under both thresholds and are notched by both doors. A 24 ft run of 12 ft planks needs a joint somewhere between 142" and 264". With the casings counted, the only stretch not cut by a door was 193-1/2" to 212-1/2", and no layout stud fell in it: the studs at 192" and 216" sit beside the doors, under their casings. No legal plan existed, so the layout had placed a joint with nothing behind it.

A carpenter would add a stud between the doors, and now the tool does the same. When a course finds no stud in reach, the layout names the spot that gives the longest legal plank and clears every opening and casing. The framing puts a full-height stud there, and the face is laid out again. On #591 that is one 2x6 at about 203". The build notes say why it is there, and every joint on the shed lands on wood. A test pins the design, and it checks that an ordinary wall gets no extra stud.

**Also fixed: the colour of a site-built door in 3D.** A door you build on site is skinned with the siding cut from its own opening, so it takes the siding's paint. When the door colour was left at its default, "stained", the 3D view drew it as brown stained wood even on a shed in white lap siding. The HOA packet had the same mistake earlier today. The 3D view, the pictures and the packet now agree: a site-built door is drawn in the siding's finish and a bought door in its factory white, unless you pick a door colour. 38 of the stored pictures were redrawn.

The tool is a planning aid, not an engineered or code-checked design.

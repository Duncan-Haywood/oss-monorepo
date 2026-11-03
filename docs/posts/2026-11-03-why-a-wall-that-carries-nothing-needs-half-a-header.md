---
title: "Why a wall that carries nothing needs half a header"
seo_title: "Non-bearing wall headers: single ply framing takeoff"
date: 2026-11-03
tags: [construction, framing, open-source, lumber]
description: "Interior partitions that carry no roof or floor don't need a doubled header. The wall framing takeoff can now price them with one ply, and says it did."
---

A doubled 2x header over every door is the default in framing takeoffs, including ours. On a partition that holds up nothing, that is lumber and time spent on a load that isn't there.

The wall-framing-takeoff engine now accepts `bearing: false` on a wall. Each opening in it gets one header ply (unless you type `headerPlies` yourself), the header-spacer note is dropped, and a note lists which openings were framed this way. A test frames a 2x6-header door in a 12 ft wall: two members by default, one with the flag, and the note appears only with the flag.

The limit matters more than the saving. The tool cannot tell whether a wall is non-bearing. A partition under a floor joist or a point load is not one. The flag is a typed fact from you or your engineer, and the note says so. It is not on the page yet, and no real plan has been run through it.

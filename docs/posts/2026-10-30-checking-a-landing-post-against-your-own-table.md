---
title: "Checking a stair landing post against your own span table"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs, decks]
description: "The takeoff now compares the heaviest landing post's load with a capacity you type from your own post table, instead of guessing a post size."
---

A free-standing stair landing needs posts, and the size of a post depends on the local code book and species of lumber. The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) will not guess one. It already counted the posts and sized the footings from a typed soil bearing.

New today: type `postCapacity` (pounds, from your own post table) under `landing`, and the takeoff compares it with the heaviest post's load. A 48 by 120 in landing with posts 60 in apart puts half of a 20 sq ft bay at 50 psf on an edge post: 500 lb. A 600 lb post holds; a 400 lb one is flagged as over, with the numbers printed.

It is hand-computed and tested only on that case. The flights' ends and the guard are not added to the load, so treat a pass as a lower bound and check a real design with a professional.

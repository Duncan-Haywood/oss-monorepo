---
title: "Does a saw cut change how many boards a winder's supports need?"
date: 2026-11-08
tags: [construction, stairs, wall-framing-takeoff]
description: "Winder support board counts now allow for saw kerf, which can add a board when pieces just fit."
---

The winder support board count assumed zero saw kerf, so three 32 in supports fit a 96 in board exactly. A real blade removes about 1/8 in per cut, so the third piece is short by a quarter inch.

`winders.supportKerf` (inches, 0 to 1/2, default 0) now enters the count: n pieces need n x width + (n - 1) x kerf. Six 32 in supports take two boards with no kerf and three with 1/8 in kerf. Hand-arithmetic tests only; no real winder stair has been checked.

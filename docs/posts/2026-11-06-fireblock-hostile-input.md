---
date: 2026-11-06
title: "Fireblocking quantities: three ways a bad wall broke the counter"
tags: [wall-framing-takeoff, fireblocking, construction]
description: "The wall framing takeoff fireblocking counter used to crash, return NaN or hang on a bad wall; it now refuses bad input with a reason and has a fuzz test."
---

The fireblocking counter in the wall-framing takeoff, added earlier today,
trusted every wall it was handed. Poking it by hand found three defects: a null
wall or member threw a raw TypeError, a member with a NaN height gave a NaN
count of block rows, and one 1e9-inch member made the row loop run until the
test timed out. It now refuses each with a plain reason. A seeded test adds 300
invented walls and recounts rows, blocks, footage, boards and cost by hand.

Invented walls only; the cavity limit is still the figure you type, and no
inspector's real plan has been checked.

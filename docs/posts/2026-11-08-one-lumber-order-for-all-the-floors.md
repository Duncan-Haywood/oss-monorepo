---
title: "One lumber order for every floor of the house"
date: 2026-11-08
tags: [construction, framing, open-source]
description: "wall-framing-takeoff --stack orders several floors' plans together; on three invented floors it saved 0.1% of the cost, and that small number is the finding."
---

The Schultz house was framed one floor at a time, so each floor bought its own boards. `--stack=2nd.json,3rd.json` now merges more plan files into the first and runs a single cutting-stock order: wall ids get the file name in front, tee laps follow, lumber lists are united, and a floor with a different stud spacing, kerf or plate lap is refused.

The question was whether offcuts from one floor's boards fill another floor's short pieces. On three invented floors cut from the example house, ordering apart cost 6845.48 (720 boards) and stacked cost 6838.32 (713 boards). That is 0.1%. Each floor already wastes under 0.5% of its lumber, so there is almost nothing left to recover; the real gain is one order to place and check, not a cheaper one.

Limits: invented floors, not the Schultz ones (that run needs the IFC fetch and the WASM build, and is next), and no framer's takeoff was compared. Code and tests: `ventures/wall-framing-takeoff/stackfloors.mjs`.

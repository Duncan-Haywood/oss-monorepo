---
title: "A shed wall with too many ways to join its plates"
date: 2026-10-31
tags: [shed-designer, framing, testing]
description: "A junk-input fuzz test found a 40 ft shed wall whose top-plate joints took the shed designer minutes to choose. The search is now bounded."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) joins its wall plates the way the code asks. The double top plate's two layers break at least 24" apart (IRC R602.3.2), on stud centres, with nothing longer than the board you can haul. When the quick split doesn't manage that, it searches: for each way to break the top plate, it looks for a cap-plate split that clears it.

That search limited its dead ends but not its answers. A 40 ft wall with 12 ft boards and studs at 16" has more ways to break its top plate than the tool can try. One run of the fuzz test feeds the designer junk values as a saved file or a broken link might, and one of those inputs set the shed's length to "1e3". The designer clamps that to 40 ft, as it should. The design also asked for a window wider than its wall, which the framing leaves out, and then the plate search ran for minutes. The fuzz run hung for over half an hour.

The search now tries the first 300 top-plate splits and keeps the quick split if none of them works. The checks still report a joint that is off the framing or too close to the one above. The junk design builds and passes every check in under 4 seconds. A test pins it with a 90-second limit, and the old code was still running when it was stopped at 200 seconds. Four 1,500-design fuzz seeds now run to the end and pass.

The tool is a planning aid, not an engineered or code-checked design.

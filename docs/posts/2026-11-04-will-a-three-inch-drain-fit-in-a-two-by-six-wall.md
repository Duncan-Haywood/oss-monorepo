---
title: "Will a 3-inch drain fit in a 2x6 wall?"
date: 2026-11-04
description: "The wall-framing takeoff now checks pipe and cable holes against the stud drilling limits. A 3-inch drain does not fit a single 2x6 stud."
tags: [wall-framing-takeoff, construction, plumbing]
---

# Will a 3-inch drain fit in a 2x6 wall?

No, not through a single stud, and the new `--drilling` check says why.

Residential code limits how much of a stud you may bore out. The commonly
stated rule: a hole up to 40% of the stud width in a bearing wall, up to 60% if
the wall is non-bearing or the bored studs are doubled, and never closer than
5/8 inch to an edge. A 2x6 is 5-1/2 inches wide, so a single bearing stud takes
a 2.2 inch hole and a doubled one takes 3.3 inches.

A 3 inch DWV pipe is 3.5 inches across. With 1/8 inch of clearance the hole is
3-5/8 inches: too big for a single 2x6, too big for a doubled one. It needs a
2x8, or a chase (a furred-out plumbing wall), which is why toilet walls are
usually framed that way. The same arithmetic says a 2 inch drain fits a doubled
2x6 but not a single bearing stud.

Give the takeoff a list of runs in the plan, each with a wall, a hole or notch
size (or a pipe size), and it reports the share of the stud used, the limit, and
the smallest stud that works or what to do if none does:

```
node cli.mjs plan.json --drilling
```

The limits are typed values you can change for your code edition; the tests are
hand arithmetic on invented walls, and no plumber has compared it with a real
house yet. Source: `ventures/wall-framing-takeoff/drilling.mjs`.

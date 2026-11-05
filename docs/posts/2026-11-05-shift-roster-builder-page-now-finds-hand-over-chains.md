---
title: When nobody can cover the shift, the roster page now shows who can hand over
date: 2026-11-05
description: "Shift Roster Builder's cover finder lists chains of hand-overs when no one is free to take a called-out shift outright."
tags: [shift-roster-builder, scheduling]
---

# When nobody can cover the shift, the roster page now shows who can hand over
A call-out is easy when someone free can take the shift. It is harder when everyone free is at their hour cap or overlaps. The command-line tool already searched chains of hand-overs (A takes the shift, gives up one of theirs, B takes that), fewest shifts moved first. Since today the page's "Shift to cover" box shows the same chains, but only when no one can take the shift outright.

Checked in headless Chromium on a hand-built three-person week: for the long Monday shift, Ben takes it from Ana and Cy takes Ben's short shift, two shifts moved. The sample café week has open shifts with no chain at all, and the page shows nothing extra there. Every person's week is re-checked against the hard rules; the pay change is shown. Tested on hand-built weeks, not a real team.

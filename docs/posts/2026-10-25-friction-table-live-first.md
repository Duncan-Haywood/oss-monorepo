---
title: "Our documentation-friction report now lists live faults first"
date: 2026-10-25
description: "promptctl.py measure now ranks documentation friction by live recent reports, so a run looking for a fresh fault finds one at once."
tags: [process, documentation, measurement]
---

Every agent run here may log which instruction cost it time. `promptctl.py measure` ranks those reports by file, and
for weeks the ranking used the all-time count. Three files with 250 to 300 old reports sat on top, so a run looking
for a fresh fault needed several calls to find one (at least eight runs said so).

The table now sorts by reports that are recent and not already superseded by a change to the file, and prints that
count beside the total. The all-time count only breaks ties. A small, current fault now outranks a large, mostly
fixed pile. The change is 15 lines in one script, and the prompt tests and validation still pass.

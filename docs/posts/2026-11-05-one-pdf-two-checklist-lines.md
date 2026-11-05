---
title: "One PDF, two checklist lines: what a permit preflight should not count twice"
date: 2026-11-05
tags: [construction, permits, permit-packet-preflight]
description: "A combined plan-set PDF can satisfy several permit checklist lines at once; the preflight now flags a file matched twice and weak name matches instead of counting it clean."
---

Permit packets often arrive as one combined plan set. A name matcher that lets
that single file satisfy "Foundation plan", "Floor plans" and "Elevations"
reports a clean packet whether or not each sheet is inside. The permit packet
preflight now assigns checklist lines to files by best score first, flags any
file that also matches a second line ("is it a combined set?"), and marks weak
name matches. It still reads file names only, and the six tests use made-up
names. City checklists are not built in: the city sites did not resolve from
this session, so the next step is a real, dated checklist from one city.

Try it: https://marisstella.app/permit-packet-preflight/

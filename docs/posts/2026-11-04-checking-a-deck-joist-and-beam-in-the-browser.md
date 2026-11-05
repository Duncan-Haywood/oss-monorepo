---
title: "Checking a deck joist and beam without leaving the page"
date: 2026-11-04
description: "The wall-framing takeoff page's deck card now takes your joist and beam figures and prints bending, shear and deflection for both."
tags: [wall-framing-takeoff, deck]
---

# Checking a deck joist and beam without leaving the page

A deck takeoff tells you how many joists and what beam to buy. It does not tell
you whether they are big enough for the span you drew. The engine behind the
wall-framing takeoff has done that check from the command line since 1 November:
one joist as a beam on the ledger and the dropped beam with the cantilever past
it, and the longest bay of the beam as a simple span.

This week the deck card on the page got two fields for it. You type dead load,
live load, allowable bending, shear and modulus of elasticity (and a deflection
ratio if your code is not L/360). The page prints bending, shear and deflection
against those numbers and says "passes" or "FAILS".

Two things worth knowing. The allowable stresses are yours: they depend on
species, grade, wet service and treatment, so the tool ships none and will not
guess. And it is a screening check. Notches, holes, hangers, the ledger
connection and the beam's overhang past the end posts are listed as yours to
settle with the engineer or building department.

Try it: add a deck on the takeoff page, fill both fields, and change the beam from
2x8 to 2x10 to watch the deflection line move. The engine is MIT licensed in the
repository; the arithmetic is covered by hand-statics tests, not by a real
permitted deck, and a real one is the next thing wanted.

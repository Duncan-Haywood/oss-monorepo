---
title: "\"Make it darker\" now picks from what your factory actually stocks"
seo_title: "Colour edits limited to a factory's stock colours"
date: 2026-11-24
tags: [clothing-design-studio, manufacturing, colour]
description: "The clothing studio's colour edits now pick from the supplier's stock list and price dyeing to order: 46 of 112 edits stay stocked, up from 11."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/)
takes colour feedback the way designers give it: "make it darker", "tone it
down", "a bit warmer". Last week those edits learned to move the colour in
CIELAB and snap to a named colour nearby. The names came from the studio's own
catalogue of 50 garment colours.

A factory doesn't have 50 colours. A mill or blank maker keeps a short card of
shades it has dyed and on the shelf. Any other colour is **dyed to order**: a
lab dip first, then a minimum dye lot, often hundreds of metres. So "make it
darker" could quietly push a small first run into a dye lot it can't fill, and
the cost sheet never showed it.

## What changed

The supplier sheet, where the designer types their factory's prices, now
also lists **stock colours per fabric** and a **custom colour** price: the dye
set-up and the minimum lot in metres. With a list in place:

- colour edits pick among the stocked colours for the garment's fabric. If the
  exact move lands on none of them, the studio looks a little further for a
  stocked colour that still goes the asked way, and then says what dyeing the
  exact shade would cost instead;
- naming an unstocked colour ("make it dusty pink") says it is dyed to order and
  names the nearest stocked one;
- the cost gets a **Custom colour dye** line: the set-up over the run, plus the
  unused part of the dye lot at the fabric price, and the run size at which the
  run fills the lot;
- swatches the factory doesn't stock are drawn dashed.

## What it does, measured

Take the 16 colours the example sheet stocks on cotton jersey and seven plain
edits each (112). Picking from the whole catalogue, **11 of 112** edits landed
on a colour this factory stocks. Picking from the sheet, **46 of 112**, and none
moved the wrong way.

The first version was looser and had 70 of 112 stocked, but some picks were
wrong: charcoal "lighter" became olive and brown "lighter" became red. Those are
stocked colours, but they aren't what the designer asked for. The wider search
now keeps a grey grey, keeps the hue within 20 degrees, and moves lightness only
when lightness was asked for. That costs 24 edits that are now offered as a
dyed shade instead, which is the honest answer when nothing on the shelf fits.

With the example figures (a 120 set-up and a 300 m lot at 5 a metre), a dyed
shade on 100 tees adds 9.72 a garment. From 232 pieces the run fills the lot
and only the set-up is left, 0.40 a garment at 300. **Those figures and the
stock list are placeholders, not a real mill's.** Put in your own factory's
colour card and the same rules run on it.

## Try it

Open the studio, expand "Supplier sheet", and type your factory's stock
colours for the fabric: catalogue names, or your own name with a hex code
("bottle green #1d4a33"). Then say "make it lighter". The sheet exports and
imports as CSV with the new `colour` and `dye` rows. Everything runs in your
browser and nothing is uploaded.

Code and the check: `ventures/clothing-design-studio/` (`suppliers.mjs`,
`costing.mjs` `customDye`, `eval/stock-colour-edits.mjs`).

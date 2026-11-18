---
title: "Free DXF nesting in the browser, with a gap you can check"
seo_title: "Free DXF nesting in the browser, gap checked"
date: 2026-11-18
description: "A new free tool nests irregular DXF parts on sheets, puts washers inside flange bores, and proves every gap twice: once by construction, once by measurement."
tags: [dxf-nesting, manufacturing, algorithms, launch]
---

# Free DXF nesting in the browser, with a gap you can check

*Written by an AI agent working in this repository.*

A small laser or plasma shop that gets a job as a folder of DXF files has two choices for laying the parts out on sheets: a nesting licence that costs thousands, or an afternoon of dragging parts around in CAD. The portfolio already priced laser jobs, but only by fitting one rectangle in a grid. [DXF Nesting](https://marisstella.app/dxf-nesting/) is the missing step: load the files, set quantities, sheet size, gap and edge margin, and download the nested sheets as DXF.

## How it places parts

Each part is drawn onto a fine grid at every allowed turn. The drawing is *conservative*: a cell counts as busy if the outline passes through it or its centre is inside the metal, so the busy cells always cover the whole part, and the holes stay empty. A placed part then reserves its cells plus a border of k = ceil((gap + 2 x arc tolerance) / cell) cells. Two busy cells k + 1 apart are at least k cells apart in distance, and the real arcs stay within the tolerance of their chords, so every gap the tool produces is at least the gap you asked for. That holds by construction, before any testing.

Because holes stay empty, small parts drop into big parts' cut-outs without special handling. In the worked example (72 made-up mild steel parts on a 2500 x 1250 mm sheet, 5 mm gap), the 80 mm washers land inside the 110 mm flange bores and the gussets turn 180 degrees to pair up. All 72 fit on one sheet, using 1,912 mm of its length, with 59.5 m of cut and 206 pierces.

## Checking it a second way

A guarantee from a proof is only as good as the code that carries it out. So a separate routine with no grid re-transforms every part's edges and measures the distance between every pair of placed outlines, segment by segment. Seeding a bug into the reserved border (dropping the tolerance term) makes the test suite fail, which is the point of having two checks.

The DXF reader was checked against another implementation too. Three files were written with the ezdxf library, with bulged polylines, an ellipse hole, a spline outline and a block inserted rotated, scaled and mirrored. The tool's part areas match ezdxf's within 0.05% on all six parts. One surprise: ezdxf's own periodic closed spline flattens outside its valid knot range, giving a 290 x 400 curve from a 110 x 90 control hull. That case was left out of the comparison rather than fitted to.

## What it is not

It is a greedy nester: largest parts first, each at the spot that keeps the used length of the sheet shortest. Commercial nesters with search usually fit a few percent more. It does no lead-ins, common-line cutting or kerf compensation, which are the CAM's job. To make the shortfall visible, the page prints the area bound: the parts' total area divided by a sheet's usable area, the fewest sheets any nester could use.

If it proves useful, the next steps are a local search that moves parts between the last two sheets, and a quote page that prices a nest from its cut length, pierces and sheets.

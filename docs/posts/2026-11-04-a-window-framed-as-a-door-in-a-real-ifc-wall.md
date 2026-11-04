---
title: "A real wood-framed IFC wall showed our takeoff framing a window as a door"
seo_title: "IFC wall framing takeoff: window read as a door"
date: 2026-11-04
tags: [wall-framing-takeoff, ifc, construction, bugs]
description: "We ran a small wood-framed IFC wall through our framing takeoff. The model was read exactly, but the page lost every opening height and sill."
---

The wall-framing takeoff has a Rust IFC reader that runs in the browser as
WebAssembly. Until now it had been run on two real models, a Revit duplex and
an ArchiCAD house, and neither is wood framed. This week we found a third: a
small public teaching file, one 12 ft wall, a 3.5 in frame between two 1/2 in
panels, with a 32 x 80 in opening at the floor and a 36 x 48 in opening with a
32 in sill. (We did not copy the file into the repository: its licence is
unstated.)

The engine read the wall exactly: 144 in long, both openings at the right
offsets and widths, sill and height included. The page then threw most of it
away. It passes the engine's output to the DXF reader, and a DXF line carries a
place and a width only. The model draws both openings as bare voids, so both
landed on the door layer, and both were framed as 82.5 in doors. The window
got a door's king and jack studs and a header over a door's height, with no
sill plate. Nothing warned about it beyond a note that heights were defaults.

The fix is small: the page now builds an `openingSize` lookup from the engine's
own JSON (`openingSizes` in `ifcwasm.mjs`), so each opening keeps its height and
its header height (sill plus height), and a void with a sill over 2 in is
framed as a window. On the real file the openings now come out as Door 1 at 80
in and Window 1, 48 in tall with its head at 80 in. The unit test uses the same
dimensions; removing the kind override makes it fail.

What this does not show: the file is one wall with no corners, so it says
nothing about joins in a wood-framed house. Its wall has no body geometry, so
wall height is still the page default. A real permitted US house model remains
the open item.

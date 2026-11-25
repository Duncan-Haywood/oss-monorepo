# Third-party data in this venture

ShootFlow is FSL-1.1-MIT licensed (LICENSE). One generated file carries data from another project under its own licence:

## site/nikon-af-grids.mjs

- **Nikon AF point positions** per camera body, converted to fractions of the frame by
  `tools/nikon_af_grids.py` from the `focus_points/nikon/*.txt` files of the Focus-Points Lightroom plugin,
  https://github.com/FocusPointsLrC/Focus-Points (commit named in the file's header). Original work
  (c) Whizzbang Inc; ongoing maintenance and modifications (c) Karsten Gieselmann; each body's map was
  measured by the contributor named in its `by` field. Licensed under the Apache License, Version 2.0
  (https://www.apache.org/licenses/LICENSE-2.0). Changes made here: pixel coordinates divided by each
  body's stated frame size, and, for the 153-point bodies, the 98 points the plugin does not list placed
  by linear interpolation between listed neighbours (flagged in the data).
- **Point numbers to names** (which bit or number means which grid point) as documented in ExifTool's
  `lib/Image/ExifTool/Nikon.pm` by Phil Harvey (https://exiftool.org). Only these number-to-name facts are
  used; no ExifTool code is included.

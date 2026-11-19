---
title: "Phocus .fff files scale red and blue but keep the old white balance"
seo_title: "Hasselblad Phocus .fff: reading the white balance right"
date: 2026-11-18
tags: [photo-editing, raw, hasselblad, file-formats]
description: "ShootFlow now develops Hasselblad Phocus .fff files. Newer exports scale red and blue but keep the old neutral, and the data shows which files did it."
---

Hasselblad's Phocus software writes `.fff` files when it tethers a camera or
exports a shot. ShootFlow already read the camera's own 3FR files. Since today
it develops `.fff` files too, with no profile in most cases. Getting the colour
right took more than reading the sensor.

**The sensor data was the easy part.** A `.fff` is a 3FR written big-endian,
always in Hasselblad's lossless compression. raw.pixls.us (CC0) has eleven
`.fff` files from nine bodies, from a CFV-50 back to a 100 MP X2D. On all
eleven, every one of 713.7 M sensor values matches LibRaw 0.22. So do the
colour filter layout and the stored white balance. The existing reader needed
no change to decode them.

**Then two files turned out to be the same shot.** raw.pixls.us has an X2D frame
as both `B0000079.3FR` and `Job_0079.fff`, and a CFV-50c frame as both a 3FR and
an `.fff`. Their green values are identical. Red and blue are not. In the
`.fff`, every red value above black is 1.028 times the 3FR's, and every blue
value 1.014 times. Those are exactly the gains in the file's AnalogBalance tag.
The white-balance neutral, though, was copied from the 3FR digit for digit.

The DNG specification reads that neutral as a grey in the gained values. Taken
that way, a grey wall in the `.fff` comes out slightly warm, 0.008 to 0.017 off
in chromaticity from the same frame developed from its 3FR. LibRaw takes the
neutral that way too. ShootFlow scales the neutral by the same gains, and each
`.fff` then develops to its own 3FR's colour within 0.0001.

**Not every `.fff` does this.** The first version scaled every file, and the
check against LibRaw moved four older files from agreeing to four places to
0.03 apart. Nothing in the tags tells the two kinds apart, but the data does.
Multiply whole numbers by 1.028 and about one value in 36 can no longer occur,
so the histogram has gaps. A gain applied before the values were digitised
leaves none. On six files, from Phocus 3.6.9 on the CFV-50c, the X1D II, H6D and
X2D, each colour's share of empty values matches its gain to 0.001. The H4D-50
has the tag and no gaps at all. Four older files have gaps of other sizes, from
some other step. ShootFlow now scales the neutral only when every colour shows
the gaps its gain predicts. Where it doesn't, it uses the neutral as written,
and it says which in the develop notes.

**Two smaller fixes.** Five files carry no colour matrix. For the CFV-50c and
X2D, ShootFlow uses the matrix those bodies write into their own 3FRs. The
H4D-40 and H6D-100c have no public 3FR, so their files still need the camera's
`.dcp`. And Phocus writes only the series in the camera-name tag: "Hasselblad
H4D" covers both the H4D-40 and the H4D-50, which have different sensors. The
Model tag names the body, so ShootFlow uses it when it extends that name.

The checks, rows and the empty-value table are in the
[evaluation record](../../ventures/photo-editing/eval/hasselblad-fff-reader-2026-11-18.md).
The [format page](https://marisstella.app/photo-editing/camera-raw-formats.html)
lists every format and body checked.

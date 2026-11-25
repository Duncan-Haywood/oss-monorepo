---
title: "Getting iPhone HEIC photos into a pay application's PDF backup packet"
seo_title: "iPhone HEIC photos in a PDF pay app backup packet"
date: 2026-11-25
tags: [ventures, construction, pay-applications, photos]
description: "How PayApps gets iPhone HEIC job photos into a PDF backup packet, shrinks large photos and keeps the time each photo was taken."
---

A subcontractor's monthly pay application often goes to the GC as one PDF:
the G702-style summary, the continuation sheet, then the backup. That means
stored-material invoices, certified payroll, insurance certificates and job
photos. PayApps, the pay-application product we are building for specialty
subs, builds that PDF from the files attached to the application. It is
still in development and not yet for sale.

Photos were the weak spot. Since iOS 11, an iPhone saves photos as HEIC
by default. A PDF can't hold a HEIC image directly. Our packet builder has
no dependencies and takes PDFs, JPEGs and PNGs, so a HEIC from the job site
ended up on the packet's index page as "send separately". WebP images,
which come out of some Android apps and web downloads, had the same problem.

## What changed

The upload form now converts HEIC and WebP photos to JPEG in the browser,
before anything is sent, whenever the browser can decode them:

- **Safari decodes HEIC**, on the iPhone and on a Mac. Chrome and Firefox
  don't, so a HEIC attached from those browsers is uploaded unchanged, and
  the packet's note now says to attach it again from Safari.
- **Every current browser decodes WebP.**
- The JPEG keeps the file name, with `.jpg` in place of the old extension,
  and keeps the file's time. The decoder applies the photo's EXIF
  orientation, so the picture comes out upright. Transparent areas become
  white, as they would on paper.
- Photos over 12 megapixels are scaled down to 12 (4032 × 3024's area).
  iOS Safari won't draw a canvas larger than about 16.7 megapixels; it
  draws nothing instead. A 24 or 48 megapixel frame saved as a JPEG can
  also go past the 15 MB file limit.
- Nothing is sent to a server for the conversion.

The camera model and GPS inside the file are not carried over. Since a later
update (below), the time the photo was taken is. When you need the original
as evidence, send it separately.

## How it was checked

We had no iPhone for this run. In Chromium we checked:

- a real 1200 × 800 WebP came out as a JPEG with its colours intact and
  its transparent corner turned white;
- the packet's own JPEG reader read that JPEG;
- a 5000 × 4000 WebP was scaled to 3903 × 3123;
- HEIC bytes that Chromium can't decode came back as the original file.

The ten new unit tests cover the same paths with a stand-in decoder. Safari's
HEIC path has not been checked on a real phone yet, and we'll say so until it
has.

## If your software doesn't convert

On an iPhone, Settings > Camera > Formats > **Most Compatible** makes the
camera save JPEG from then on. Photos already taken stay HEIC. Sharing them
by mail, or choosing them in a web form that asks for JPEG, usually converts
them.

## Update: shrinking large photos, keeping when they were taken

A phone's 12-megapixel JPEG is usually 2.5 to 5 MB. PayApps' free plan
holds 250 MB of files, which is only about 60 photos at that size. Each one
also takes seconds to upload over a weak signal on site, and a 48-megapixel
shot can exceed the 15 MB file limit.

So the upload form now shrinks large photos in the browser before sending
them:

- **What gets shrunk:** a JPEG over 1 MB is redrawn with its long side at
  2560 pixels. That is still over 250 dpi across a letter page, more than a
  printed packet needs. The smaller copy is sent only if it saves at least
  a fifth of the size. HEIC and WebP photos that are being converted anyway
  are drawn at the same size.
- **What is left alone:** PNGs, because they are often screenshots or
  drawings, where JPEG blurs the text.
- **What the photo keeps:** the time it was taken. A browser's canvas
  writes a JPEG with no metadata at all, and for a job photo, *when* is
  often the point. So PayApps reads the original's EXIF capture time
  (date, time and the camera's UTC offset) and writes it into the smaller
  file.
- **What the photo loses:** location and camera details, left out on
  purpose, so the packet you send a GC carries no GPS data. When the
  location matters as evidence, untick the box (below) and send the
  original.
- **Turning it off:** a checkbox, "Make large photos smaller before upload",
  is on by default and remembered in that browser. Untick it when a photo
  has to go up at full size.

How it was checked: in Chromium, a 4032 × 3024 test JPEG of 7 MB came out
upright at 1920 × 2560 and 1.8 MB. It was written by Pillow, a separate
image library, with the phone's "rotate 90°" orientation tag. The test
image is noise, which compresses worst, so real photos come out smaller.
Pillow then read the date, time and offset back from the smaller file and
found no GPS, camera model or orientation tag. As with HEIC, this has not
yet been tried on a real phone.

## Update: converted HEIC and WebP photos keep when they were taken

The shrink step above kept the capture time for JPEGs only. A HEIC from an
iPhone, the most common job photo of all, still lost it on the way to JPEG.
Now it keeps it too.

The difficulty is that each format hides its metadata somewhere else:

- **JPEG** keeps EXIF in a segment near the start of the file.
- **WebP** keeps it in a chunk named `EXIF` inside the file's RIFF container.
- **HEIC** keeps it as a separate *item* in the file. A table of contents
  (the `iinf` box) says which item is the EXIF, and a second table (`iloc`)
  says where its bytes are, sometimes split into pieces. Those bytes start
  with a number saying where the EXIF proper begins.

PayApps reads all three in the browser, with no image library, takes the
date, time and UTC offset, and writes them into the JPEG it uploads. As
before, GPS and camera details are left out, and the upload note now says
"with the time it was taken kept".

How it was checked: the test HEIC was written by libheif, the open-source
HEIF library, not by our code, and the test WebP by Pillow. Both read back
2026:11:24 16:42:30, UTC−8. In Chromium, the real browser decoder turned
the WebP into a JPEG carrying that time. Chromium can't decode HEIC, so the
HEIC side is checked in unit tests only, along with truncated and corrupted
files that must not crash the upload. Not yet tried on a real iPhone.

This post was written with AI assistance.

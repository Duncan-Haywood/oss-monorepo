---
title: "Getting iPhone HEIC photos into a pay application's PDF backup packet"
seo_title: "iPhone HEIC photos in a PDF pay app backup packet"
date: 2026-11-25
tags: [ventures, construction, pay-applications, photos]
description: "Why an iPhone's HEIC job photos fall out of a PDF backup packet, and how PayApps now converts HEIC and WebP to JPEG in the browser before upload."
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

The camera metadata inside the file (camera model, GPS, capture time) is not
carried over. When you need the original as evidence, send it separately.

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

This post was written with AI assistance.

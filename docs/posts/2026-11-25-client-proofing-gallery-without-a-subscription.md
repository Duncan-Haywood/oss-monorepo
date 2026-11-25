---
title: "Send clients proofs to pick from, straight from the cull, with no gallery subscription"
seo_title: "Client proofing gallery from your cull, no subscription"
date: 2026-11-25
tags: [photo-editing, culling, client-proofing, photographers]
description: "ShootFlow's free cull page now exports your picks as watermarked web JPEGs plus an offline gallery the client hearts; their list comes back as colour labels."
---

Most photographers who shoot for clients do the same three steps after a
session: cull the card, export web-size proofs, and put them somewhere the
client can say which ones they want. The last step is usually a proofing
gallery service, and those are monthly bills: on their own pricing pages
today, [Pixieset](https://pixieset.com/pricing/) runs from free (3 GB) to $50 a
month and [ShootProof](https://www.shootproof.com/pricing/) from a free plan to
about $60 a month.

[ShootFlow's cull page](https://marisstella.app/photo-editing/cull.html) now
does the middle step and a no-frills version of the last one, in the browser,
with nothing uploaded.

## What it does

Rate your picks as usual (1 to 5 stars, or a colour label). Open **Send the
picks to your client (proofing set)** under the download buttons, choose which
frames go (one star and up, three and up, the Green label…), a long edge
(1,600, 2,048 or 3,000 px), an optional watermark and a title, and download.

The zip holds:

- `photos/IMG_0412.jpg` and so on: proofs made from the JPEG the camera stored
  inside each raw, upright, with your watermark bottom right. They keep the
  raw's file stem, so a name the client sends back points at exactly one frame.
- `index.html`: a gallery page with no server and no network calls. The client
  unzips it, opens it on a phone or computer, taps a heart on the photos they
  want, and presses **Copy my list** (or downloads `favourites.txt`).

Paste their reply into the cull page and those frames get a colour label
(Purple by default). **Show › Colour labelled** lists them, and the XMP
sidecars carry the label into Lightroom, Capture One or darktable.

Clients don't always send the list the gallery made, so the reader also takes
raw names, stems, numbered and bulleted lists, comma lists and bare frame
numbers like "0412". If a number fits two frames (IMG_0412 and DSC_0412), it
says so and leaves both alone rather than guessing.

## How it was checked

Nine unit tests cover which frames go, the file names, sizes, the watermark
position, escaping in the gallery (a file name containing `</script>` cannot
break the page) and the list reader. In headless Chromium, three rated test
frames became 2048x1365, 1365x2048 and 2048x1365 proofs, the gallery loaded all
three from the unzipped folder, two hearts came back as two labels, and the
console showed no errors. The run is in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-proofing-set-2026-11-25.md).

What hasn't been tested yet: a real client's reply, a real raw card through
this step, and Safari or the iOS Files app opening the unzipped gallery (pages
opened from files store data differently there, so hearts may not survive a
reload).

## Where this is going

The offline set stays free. A zip still has to be sent, and the client still
has to paste a list back. The paid version we plan is the same gallery behind
a private link, with hearts synced straight into your cull, expiry dates and
your logo. It's written down in the repository's
[business model file](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/portfolio/monetization/models.yaml),
priced below the gallery services above because it has no store or website
builder. It isn't built yet, and nobody has paid for it. If you try the free
set on a real shoot, how your client got on with it is the most useful thing
we could hear.

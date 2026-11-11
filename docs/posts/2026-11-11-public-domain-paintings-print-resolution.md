---
title: "Will that museum painting print sharp on a t-shirt?"
seo_title: "Public-domain paintings for clothing: find one and check print resolution"
date: 2026-11-11
tags: [clothing-design-studio, tools, design]
description: "A free page searches two museum open-access collections and tells you whether each painting has enough pixels for your print size and method."
---

A designer planning a line of shirts printed with classical and devotional
paintings has two questions before anything else: may I use this image, and is
it big enough? The Clothing Design Studio answered neither; it listed some
museum links.

The new `artwork.html` page searches the Art Institute of Chicago and The
Metropolitan Museum of Art, both of which release photographs of public-domain
works for reuse, and shows only works the museum itself flags as public domain.
Each result gets a print check at the width and method you choose.

The arithmetic is short. Pixels per inch is the image width in pixels divided
by the printed width in inches. A 25 cm chest print is 9.84 inches, so:

- 2953 pixels wide gives 300 ppi, the figure printers usually ask for with
  direct-to-garment, DTF and sublimation;
- 1686 pixels (a common web-size museum image) gives 171 ppi: fine at arm's
  length, soft up close;
- 1400 pixels gives 142 ppi, under the usual floor of 150.

Raised inks (high-density and puff) get a higher floor of 200 on the page,
because the relief exaggerates every ragged edge. Embroidery gets a lower one,
since a digitiser redraws the artwork as stitches anyway. For a halftone
screen, the image should give at least 1.5 times the ruling.

That last 1400 figure mattered inside the studio too: it stores a 1400-pixel
preview of every uploaded image so designs fit in the browser's storage. The
studio now keeps the original file's size beside the preview and says in the
method note whether the width you picked is sharp, acceptable or too big for
the file.

What is not checked: from the session that built this, the network proxy
refused both museum APIs, so the page was tested against their documented
response shapes and in a headless browser with the APIs mocked, not against a
live search. The public-domain flag is the museum's; read each image's terms
before printing. The pixel figures are common print-shop guidance, and your
printer's own file spec wins.

[Try it](https://marisstella.app/clothing-design-studio/artwork.html) ·
[Source (MIT)](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/clothing-design-studio)

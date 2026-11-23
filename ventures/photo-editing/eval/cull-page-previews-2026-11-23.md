# Cull page previews on 65 public raws (2026-11-23)

What `site/rawpreview.mjs` (the parser behind `site/cull.html`) finds in each
file of the public sample set github.com/drewnoakes/metadata-extractor-images
(folders arw cr2 cr3 dng nef orf pef raf rw2 srw nrw; sparse clone, 1.1 GB).

## How it was run

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 cr3 dng nef orf pef raf rw2 srw nrw)
    node eval/cull-page-previews.mjs mei OUT > report.tsv
    python3 eval/cull-page-previews-decode.py OUT      # Pillow 13 in a venv

Then the page itself in Chromium (Playwright, 1280 x 900): all 65 files set on
the file input, a rating, a reject, a 5-star green label, the large view, 100%
zoom, the sidecar ZIP and the CSV downloaded; then a 390 px wide viewport.

## Results

- **A preview in 61 of 65.** Misses: `dng/bigtiff.dng` and `dng/bigtiff_be.dng`
  (BigTIFF, magic 43, not read), `dng/LG Nexus 5X.dng` (a phone DNG with no
  JPEG inside; metadata read), `rw2/Issue 419.rw2` (a 368-byte truncated file).
- **All 61 decode** in Pillow at exactly the width and height the parser read
  from the JPEG frame header: `decoded 61, failed 0`.
- **39 of 61 are 2,000 px wide or more**; every CR3 (6000 × 4000 from the
  first track), the CR2s from the 600D on, every NEF from the D200 on, Pentax
  K-1 II (7360), Samsung NX and the Sony A7 IV (7008). Older Sony (1616),
  Fujifilm (1920) and Panasonic (1920) store smaller previews.
- **Olympus**: 14 bodies read through the maker note's CameraSettings IFD,
  including the OM System header (`OM SYSTEM\0`, IFD at +16) that the TG-7 and
  OM-1 use. Four 2005-2008 compacts (C5050Z, C8080, SP350, SP500UZ) fall back
  to the byte scan and give 160 × 120 thumbnails; their older maker note was
  not traced.
- Four `nef/Issue 247-*.nef` files are JPEGs with a .nef name; detected as JPEG.
- Parse time: 0.1-1.2 ms per file once read, 15-26 ms where the byte scan runs.
- **Browser**: 65 files read, thumbnails and detail scores made, in 4.7 and 5.4 s
  (two runs); 12 portrait frames, all upright (orientation 6 and 8 applied by
  canvas; RAF previews carry their own tag, which the browser applies, so the
  page does not rotate them again). No page errors. The sidecar ZIP unzipped to
  one `.xmp` per marked file with `xmp:Rating="3"`, `"-1"` and
  `"5" xmp:Label="Green"`. At 390 px the page is 390 px wide (no sideways
  scroll, after capping select widths).

Not checked: Lightroom, Capture One or darktable actually importing the
sidecars (no licence here; the fields are the ones Adobe's XMP spec and
darktable's sidecar format define), Safari and Firefox, and a real card of
several hundred files.

## Per file

| file | format | preview | source | parse ms |
| --- | --- | --- | --- | --- |
| arw/Sony DSLR-A500.arw | ARW | 1616×1080 | IFD0 JPEGInterchangeFormat | 1.2 |
| arw/Sony ILCE-5000 (A5000).arw | ARW | 1616×1080 | IFD0 JPEGInterchangeFormat | 0.4 |
| arw/Sony ILCE-7M3 (A7M3).arw | ARW | 1616×1080 | IFD0 JPEGInterchangeFormat | 0.3 |
| arw/Sony ILCE-7M4 (A7M4).ARW | ARW | 7008×4672 | IFD4 JPEGInterchangeFormat | 0.4 |
| arw/Sony NEX-5N.arw | ARW | 1616×1080 | IFD0 JPEGInterchangeFormat | 1.4 |
| arw/Sony NEX-7.arw | ARW | 1616×1080 | IFD0 JPEGInterchangeFormat | 0.1 |
| cr2/Canon EOS 350D.CR2 | CR2 | 1536×1024 | IFD0 strip | 0.1 |
| cr2/Canon EOS 600D.CR2 | CR2 | 5184×3456 | IFD0 strip | 0.2 |
| cr2/Canon EOS 70D.cr2 | CR2 | 5472×3648 | IFD0 strip | 0.1 |
| cr2/Canon EOS 7D.cr2 | CR2 | 5184×3456 | IFD0 strip | 0.2 |
| cr3/Canon EOS R3.cr3 | CR3 | 6000×4000 | CR3 track | 2.2 |
| cr3/IMG_0036.CR3 | CR3 | 6000×4000 | CR3 track | 0.3 |
| cr3/IMG_0041.CR3 | CR3 | 6000×4000 | CR3 track | 0.2 |
| cr3/_MG_0039.CR3 | CR3 | 6000×4000 | CR3 track | 0.2 |
| cr3/_MG_0045.CR3 | CR3 | 6000×4000 | CR3 track | 0.3 |
| dng/DJI Phantom 4 (1).dng | DNG | 960×720 | SubIFD strip | 0.2 |
| dng/DJI Phantom 4 (2).dng | DNG | 960×720 | SubIFD strip | 0.4 |
| dng/LG Nexus 5X.dng | DNG | none | NONE | 71.1 |
| dng/Leica T (Typ 701).dng | DNG | 720×480 | IFD0 strip | 0.2 |
| dng/Leica X VARIO (Typ 107).dng | DNG | 720×480 | IFD0 strip | 1.6 |
| dng/Pentax QS1.dng | DNG | 4000×3000 | SubIFD strip | 0.2 |
| dng/bigtiff.dng |  | none | NONE | 0.0 |
| dng/bigtiff_be.dng |  | none | NONE | 0.0 |
| nef/Issue 247-1.nef | JPEG | 2000×3008 | file | 0.1 |
| nef/Issue 247-2.nef | JPEG | 2000×3008 | file | 0.1 |
| nef/Issue 247-3.nef | JPEG | 2000×3008 | file | 0.1 |
| nef/Issue 247-4.nef | JPEG | 2000×3008 | file | 0.0 |
| nef/Nikon 800E.nef | NEF | 7360×4912 | SubIFD JPEGInterchangeFormat | 0.1 |
| nef/Nikon D300.nef | NEF | 4288×2848 | SubIFD JPEGInterchangeFormat | 0.2 |
| nef/Nikon D5100.nef | NEF | 4928×3264 | SubIFD JPEGInterchangeFormat | 0.1 |
| nef/Nikon D70.nef | NEF | 2000×3008 | SubIFD JPEGInterchangeFormat | 0.1 |
| nef/Nikon D810.nef | NEF | 7360×4912 | SubIFD JPEGInterchangeFormat | 0.1 |
| nef/Nikon D90.nef | NEF | 4288×2848 | SubIFD JPEGInterchangeFormat | 0.1 |
| nef/NikonD200.nef | NEF | 3872×2592 | SubIFD JPEGInterchangeFormat | 0.1 |
| orf/OM System TG-7.ORF | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/OM Sytem OM-1.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus C5050Z.orf | ORF | 160×120 | scan | 21.6 |
| orf/Olympus C8080.orf | ORF | 160×120 | scan | 26.4 |
| orf/Olympus E-M10.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus E-M5.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus E-PL7.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus E-PM1.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus E30.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus E410.orf | ORF | 1600×1200 | Olympus maker note | 0.1 |
| orf/Olympus E600.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus PEN E-P3.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus Pen E-PL1.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus SP350.orf | ORF | 160×120 | scan | 23.7 |
| orf/Olympus SP500UZ.orf | ORF | 160×120 | scan | 17.8 |
| orf/Olympus TG-4.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus TG-6.ORF | ORF | 3200×2400 | Olympus maker note | 0.1 |
| orf/Olympus XZ1.orf | ORF | 3200×2400 | Olympus maker note | 0.1 |
| pef/Pentax K-1 Mark II.pef | PEF | 7360×4912 | IFD3 JPEGInterchangeFormat | 0.2 |
| raf/FujiFilm EX-2.raf | RAF | 1920×1280 | RAF header | 0.2 |
| raf/FujiFilm FinePix S5500.raf | RAF | 1280×960 | RAF header | 0.1 |
| raf/Fujifilm X-E1.raf | RAF | 1920×1280 | RAF header | 0.1 |
| rw2/Issue 419.rw2 | RW2 | none | NONE | 0.1 |
| rw2/Panasonic DMC-GF1.rw2 | RW2 | 1920×1440 | RW2 JpgFromRaw | 0.1 |
| rw2/Panasonic DMC-GF3.rw2 | RW2 | 1920×1280 | RW2 JpgFromRaw | 0.1 |
| rw2/Panasonic DMC-GF7.rw2 | RW2 | 1920×1440 | RW2 JpgFromRaw | 0.1 |
| rw2/Panasonic Lumix DMC-LX7.rw2 | RW2 | 1920×1440 | RW2 JpgFromRaw | 0.1 |
| srw/Samsung EK-GN120 (Galaxy NX).srw | SRW | 5472×3648 | SubIFD JPEGInterchangeFormat | 0.1 |
| srw/Samsung NX1.srw | SRW | 6480×4320 | SubIFD JPEGInterchangeFormat | 0.1 |
| srw/Samsung NX20.srw | SRW | 5472×3648 | SubIFD JPEGInterchangeFormat | 0.1 |
| srw/Samsung NX3000.srw | SRW | 5472×3648 | SubIFD JPEGInterchangeFormat | 0.1 |

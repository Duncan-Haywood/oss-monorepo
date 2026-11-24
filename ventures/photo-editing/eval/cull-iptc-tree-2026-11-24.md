# Cull page: keyword trees and code replacements (2026-11-24)

What landed: in `site/iptc.mjs`, keyword paths (`Sport > Ice hockey` or
`Sport|Ice hockey`) written as `lr:hierarchicalSubject` with every level in
`dc:subject` (`keywordBags`), and code replacements (`parseCodes`,
`expandCodes`: a `code<TAB>text` or `code=text` list, `\23\` in any field
or keyword box). In `site/cull.html`: a code list box, a "Load code list"
button, the code list kept in the browser and in the saved template, and
loading a captioned .xmp keeps the code list already typed. Check script:
`eval/cull-iptc-tree-page.mjs` (headless Chromium).

## Check 1: unit tests

```
node --test site/iptc.test.mjs
# pass 12
# fail 0
```

The three new tests: paths split into the two bags and read back as paths;
paths merged into a Lightroom sidecar that already has a tree, with the old
`Events|Wedding` entry left as written and `Events|wedding` not added twice;
codes in fields and in a frame's own keywords, an unknown `\99\` kept, a
code's text using `{year}`.

## Check 2: the page in Chromium, read back by ExifTool 12.76

Two NEFs from metadata-extractor-images (D810, D300) and a Lightroom-style
sidecar for the D810 carrying `dc:subject` [Events, Wedding] and
`lr:hierarchicalSubject` [Events|Wedding], `crs:Exposure2012` +0.35. Code
list loaded from a file with a byte-order mark and a `#` comment line
(`23 Jane Roe`, `7 John Doe`, `lds Leeds Rhinos`, tab-separated). Template:
headline `\23\ scores for \LDS\`, caption
`\23\ of \lds\ on {monthname} {day}, {year}; \99\ is not a code.`, keywords
`Sport > Rugby league, People|Players|\23\, {year}`. D300: `K` with
`People > Players > \7\, \lds\`, rated 4. D810 rated 5.

```
exiftool -j -G1 -XMP-dc:Subject -XMP-lr:HierarchicalSubject -XMP-dc:Description -XMP-photoshop:Headline -XMP-xmp:Rating -XMP-crs:Exposure2012 out/*.xmp
"Nikon D300.xmp":
  Subject ["Sport","Rugby league","People","Players","Jane Roe",2008,"John Doe","Leeds Rhinos"]
  HierarchicalSubject ["Sport|Rugby league","People|Players|Jane Roe","People|Players|John Doe"]
  Description "Jane Roe of Leeds Rhinos on March 6, 2008; \99\ is not a code."
  Headline "Jane Roe scores for Leeds Rhinos", Rating 4
"Nikon D810.xmp":
  Subject ["Events","Wedding","Sport","Rugby league","People","Players","Jane Roe",2015]
  HierarchicalSubject ["Events|Wedding","Sport|Rugby league","People|Players|Jane Roe"]
  Description "Jane Roe of Leeds Rhinos on May 13, 2015; \99\ is not a code."
  Headline "Jane Roe scores for Leeds Rhinos", Rating 5, Exposure2012 "+0.35"
```

`exiftool -validate -warning -a` reports OK on both files. Page status:
"Loaded 3 codes from roster.txt."; "2 sidecars in the zip, 1 of them your
own with only the rating, label and IPTC fields changed; 2 carry IPTC
captions or keywords." Loading the written D810 sidecar back as a template
fills the keyword box with `Events|Wedding, Sport|Rugby league,
People|Players|Jane Roe, 2015` (paths, then the flat words no path names)
and keeps the code list. The code list came back after a reload. No page
errors.

Regression: `eval/cull-iptc-page.mjs` (flat keywords only) gives the same
status line as on 2026-11-24 and its sidecars carry no `lr:` property. At
390 px wide the page has no horizontal scroll with the form open.

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set nef)
python3 -m http.server 8765 -d site &
node eval/cull-iptc-tree-page.mjs http://localhost:8765/cull.html mei WORK
exiftool -j -G1 -XMP-dc:Subject -XMP-lr:HierarchicalSubject -XMP-dc:Description -XMP-photoshop:Headline WORK/out/*.xmp
exiftool -validate -warning -a WORK/out/*.xmp
```

## What is not known

- Whether Lightroom Classic builds the tree from these sidecars on Read
  Metadata from Files. The bag is the one Lightroom writes, but only ExifTool
  read it here. Lightroom also writes parent levels into `dc:subject` only
  when a parent keyword's "Include on Export" is set (the default); this page
  always writes them.
- Photo Mechanic's code replacement files have more options than this
  (several columns per code, other delimiters); only one text per code and
  the backslash delimiter are supported.

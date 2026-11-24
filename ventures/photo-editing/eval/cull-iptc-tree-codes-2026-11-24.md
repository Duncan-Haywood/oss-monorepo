# Cull page: keyword trees, code replacements and per-frame captions (2026-11-24)

What landed, on top of eval/cull-iptc-2026-11-24.md:

- **Keyword trees.** A keyword typed `Sport|Ice hockey` or `Sport > Ice hockey`
  (a `>` with spaces round it) is a path. Every level goes into `dc:subject`,
  and the path into `lr:hierarchicalSubject`, Lightroom's keyword tree, which
  digiKam, darktable and ExifTool also read. When a sidecar gets any path, that
  bag also lists the flat keywords that are no level of a path, so a reader that
  builds keywords from the tree alone loses none. Into an existing sidecar the
  tree is merged: existing paths kept, no duplicate (case ignored). A
  "Load from a captioned .xmp" template now comes back with the paths.
- **Code replacements** (Photo Mechanic's term): a list of `code<TAB>text`
  lines (or `code=text`), typed or loaded from a tab-separated .txt; `\23\` in
  any template box, a frame's own keywords or its caption becomes the text,
  `\23#2\` the second column. Exact match first, then case ignored; an
  unknown code stays as typed. Kept in the browser and in the saved template
  JSON (`codes`).
- **A frame's own caption** with `C`: it replaces the template's caption, or
  fills `{caption}` in it (filled in one pass, so the frame's text is not
  expanded twice). Persisted with the frame's marks; the CSV gains a
  `caption` column.

## Check 1: unit tests

```
node --test site/iptc.test.mjs
# pass 12
# fail 0
```

The three new tests: `keywordTree` (levels, paths, `>` without spaces stays one
keyword), `mergeIptc` writing and re-merging a tree into a Lightroom-style
sidecar (one `lr:hierarchicalSubject`, existing keywords kept, develop setting
untouched, no tree when every keyword is flat), and codes in fields, frame
keywords and frame captions (`#2` columns, unknown codes, `{caption}`).

## Check 2: the page in Chromium, read back by ExifTool 12.76

`node eval/cull-iptc-tree-page.mjs` with three NEFs from
metadata-extractor-images (D810, D300, D5100) and, for the D810, a
Lightroom-style sidecar already holding `Places|Yorkshire` in its tree,
"landscape" flat, rating 2, `crs:Exposure2012`, `crs:CropTop`. Codes
`23<TAB>Jane Roe (Northfield Owls, 23)<TAB>Roe` and `NO=Northfield Owls`
(made-up names). Template: keywords `Sport|Ice hockey, \NO\, {year}`, headline
`\NO\ at home`, caption `{caption} Shot on {camera}, {monthname} {day}, {year}.`
D300: `K` `\23#2\, Sport > Ice hockey > Final`, `C` `\23\ scores for \NO\.`,
rated 4. D810 rated 5.

```
exiftool -j -G1 -a -XMP-dc:Subject -XMP-lr:HierarchicalSubject -XMP-dc:Description -XMP-photoshop:Headline ... out/*.xmp
"Nikon D300.xmp":
  Subject ["Sport","Ice hockey","Northfield Owls",2008,"Roe","Final"]
  HierarchicalSubject ["Sport|Ice hockey","Sport|Ice hockey|Final","Northfield Owls",2008,"Roe"]
  Description "Jane Roe (Northfield Owls, 23) scores for Northfield Owls. Shot on NIKON D300, March 6, 2008."
  Headline "Northfield Owls at home", Rights "© 2008 Jane Doe", Rating 4
"Nikon D810.xmp":
  Subject ["landscape","Places","Yorkshire","Sport","Ice hockey","Northfield Owls",2015]
  HierarchicalSubject ["Places|Yorkshire","landscape","Sport|Ice hockey","Northfield Owls",2015]
  Description "Shot on NIKON D810, May 13, 2015." (no frame caption: {caption} drops out)
  Title "Old", Rating 5, Exposure2012 "+0.35", CropTop 0.05
exiftool -validate -warning -a out/*.xmp: OK, OK
```

Page status line "on: 5 fields go into every sidecar · 2 codes"; no page
errors; after a reload the template and the codes came back. The unmarked
D5100 got no sidecar ("only frames I rated").

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set nef)
python3 -m http.server 8765 -d site &
node eval/cull-iptc-tree-page.mjs http://localhost:8765/cull.html mei WORK
exiftool -j -G1 -a -XMP-dc:Subject -XMP-lr:HierarchicalSubject -XMP-dc:Description WORK/out/*.xmp
```

## Open

- An import into Lightroom Classic (does it build the tree from
  `lr:hierarchicalSubject` as written here, with ancestor paths listed beside
  the leaf path?), Capture One and digiKam. ExifTool is still the only reader
  checked.
- Photo Mechanic's own code-replacement files use more conventions (comment
  lines, other delimiters set in its preferences); only tab and `=` are read.

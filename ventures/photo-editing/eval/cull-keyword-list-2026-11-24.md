# Cull page: a Lightroom / Photo Mechanic keyword list (2026-11-24)

What landed, on top of eval/cull-iptc-tree-codes-2026-11-24.md:

- **Load a keyword list.** The text file Lightroom Classic writes with
  Metadata › Export Keywords (one keyword per line, a tab per level,
  `[brackets]` for a keyword with "Include on Export" off, `{braces}` for a
  synonym), which Photo Mechanic's Structured Keywords also read and write.
  `site/keywordlist.mjs` parses it (BOM, CRLF, a space-indented file with no
  tabs, a line indented past its parent and a `|` inside a name are read and
  noted, not refused).
- **Typed keywords resolve to their paths.** With a list loaded, "Ice hockey"
  or its synonym "hockey" is written as `Sport|Ice hockey`; a typed tail
  `Football > Final` picks `Sport|Football|Final`. Into `dc:subject` go the
  exported levels plus the keyword's synonyms; `[People]` stays out of
  `dc:subject` but in the `lr:hierarchicalSubject` path, so the tree survives.
  These are this module's rules, chosen to match Lightroom's per-keyword
  defaults (export containing keywords, export synonyms); Lightroom itself was
  not run.
- **Names it cannot place are listed, not guessed.** A name under two parents
  ("Final") and a name the list lacks ("Gretzky") are written as typed and
  named in the preview line and in the status after the download, so a typo
  shows before the sidecars go out.
- **Keywords used, for Lightroom.** A button writes every keyword the sidecars
  would carry as a keyword list in the same layout (brackets and synonyms kept
  for names from the loaded list; ambiguous names left out, since importing
  them would add a third top-level copy), for Metadata › Import Keywords.
- The list is kept in the browser (localStorage) between visits.

## Check 1: unit tests

```
node --test site/keywordlist.test.mjs site/iptc.test.mjs
# pass 24
# fail 0
```

`site/keywordlist.test.mjs` (5 tests): levels, brackets and synonyms from a
BOM + CRLF file; the notes for an orphan synonym, an over-indented line and a
`|` in a name; space indents; resolution of names, synonyms, tails, an unknown
and an ambiguous name; a resolved frame merged into a sidecar (the `dc:subject`
and `lr:hierarchicalSubject` bags, no `People` in `dc:subject`, existing
keyword kept); and the written list equal, byte for byte, to the loaded one
after a round trip.

## Check 2: the page in Chromium, read back by ExifTool 12.76

`node eval/cull-keyword-list-page.mjs` with the D810 and D300 NEFs from
metadata-extractor-images and a 10-keyword list (raw output:
eval/cull-keyword-list-2026-11-24.json). Template keyword `hockey`; D300 `K`
`Jane Roe, Leodis, Final, Gretzky`, rated 4; D810 `K` `Football > Final`,
rated 5.

```
status after load: Keyword list: 10 keywords from lightroom-keywords.txt, 3 synonyms, 1 not exported.
status after download: 2 sidecars in the zip; 2 carry IPTC captions or keywords; keywords not in
  lightroom-keywords.txt: Gretzky; under two parents, written as typed (type the path to choose):
  Final (Sport|Ice hockey|Final or Sport|Football|Final).

exiftool -j -G1 -a -XMP-dc:Subject -XMP-lr:HierarchicalSubject out/*.xmp
"Nikon D300.xmp":
  Subject ["Sport","Ice hockey","Jane Roe","Places","Yorkshire","Leeds","Final","Gretzky","hockey","Jane","Leodis"]
  HierarchicalSubject ["Sport|Ice hockey","People|Jane Roe","Places|Yorkshire|Leeds","Final","Gretzky"]
"Nikon D810.xmp":
  Subject ["Sport","Ice hockey","Football","Final","hockey"]
  HierarchicalSubject ["Sport|Ice hockey","Sport|Football|Final"]
exiftool -validate -warning -a out/*.xmp: OK, OK
```

Keywords used (shootflow-keywords.txt): `Sport / Ice hockey {hockey} /
Football / Final`, `[People] / Jane Roe {Jane}`, `Places / Yorkshire / Leeds
{Leodis}`, `Gretzky` (tab indented). After a reload the list came back; no page
errors.

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set nef)
python3 -m http.server 8765 -d site &
node eval/cull-keyword-list-page.mjs http://localhost:8765/cull.html mei WORK
exiftool -j -G1 -a -XMP-dc:Subject -XMP-lr:HierarchicalSubject WORK/out/*.xmp
```

## Open

- Lightroom Classic itself: Import Keywords on the written list, and Read
  Metadata from Files on the sidecars (does it attach "Sport|Ice hockey" to
  the existing keyword rather than a new one, and leave `[People]` unexported?).
  Needs a Lightroom install, which a cloud session has not.
- A real desk's list (thousands of keywords, the IPTC Media Topics or a
  stock agency's vocabulary) for load time and how often a typed name is
  ambiguous.
- Autocomplete from the list while typing with `K` (it uses the browser's
  prompt box today).

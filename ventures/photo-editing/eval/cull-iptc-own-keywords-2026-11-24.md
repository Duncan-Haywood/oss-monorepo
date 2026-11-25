# Cull page: a sidecar's own flat keywords are no longer read as paths (2026-11-24)

The bug (in PR #18557's keyword trees): `mergeIptc` ran every keyword already
in a dropped sidecar's `dc:subject` through the path parser. A flat keyword
someone typed in Lightroom or Bridge as `Before > After` (or `AC|DC`) came
back as a tree node `Before|After`, plus the new keywords "Before" and
"After", and a `|` landed in `dc:subject`. The cull page promises that the
keywords in your own sidecar are kept.

The fix (`site/iptc.mjs`): only `lr:hierarchicalSubject` entries and the new
keywords are parsed for paths. The `dc:subject` entries already there are
kept exactly as written, spacing included, and when a tree is written they
go into it as top-level entries. A new test,
"mergeIptc keeps a sidecar's own flat keywords as written", in
`site/iptc.test.mjs`.

## Check 1: unit tests

```
node --test site/*.test.mjs
# pass 69
# fail 0
```

## Check 2: the page in Chromium, before and after, read back by ExifTool 12.76

`eval/cull-iptc-tree-page.mjs` now gives its Lightroom-style D810 sidecar one
more flat keyword, `Before &gt; After`. Same run, same files. Only
`site/iptc.mjs` was swapped between the two runs.

```
exiftool -j -XMP-dc:Subject -XMP-lr:HierarchicalSubject "out/Nikon D810.xmp"
main (fc10861ac):
  Subject ["landscape","Places","Yorkshire","Before|After","Before","After","Sport","Ice hockey","Northfield Owls",2015]
  HierarchicalSubject ["Places|Yorkshire","landscape","Before|After","Sport|Ice hockey","Northfield Owls",2015]
fixed:
  Subject ["landscape","Places","Yorkshire","Before > After","Sport","Ice hockey","Northfield Owls",2015]
  HierarchicalSubject ["Places|Yorkshire","landscape","Sport|Ice hockey","Before > After","Northfield Owls",2015]
```

Page status is the same in both runs, there are no page errors, and
`exiftool -validate -warning -a` reports OK on both sidecars.

## Reproduce

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
(cd mei && git sparse-checkout set nef)
python3 -m http.server 8765 -d site &
node eval/cull-iptc-tree-page.mjs http://localhost:8765/cull.html mei WORK
exiftool -j -XMP-dc:Subject -XMP-lr:HierarchicalSubject "WORK/out/Nikon D810.xmp"
```

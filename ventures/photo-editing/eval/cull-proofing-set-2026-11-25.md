# Client proofing set from the cull page, 2026-11-25

What: `site/proofing.mjs` and its wiring in `site/cull.html` turn the rated
frames into a zip of web-size JPEGs plus an offline `index.html` gallery; the
client's copied list, pasted back, colour-labels those frames.

## Unit tests

`node --test site/proofing.test.mjs`: 9 pass, 0 fail. They cover which frames
go (rating floor, label, rejected and preview-less frames left out, numeric
name order), proof names (shared stems get `-2`, `-3`; unsafe characters
replaced), sizes (long edge capped, never enlarged), the watermark layout,
the gallery (every text escaped, a `</script>` in a file name cannot close the
page's script, no outside URL, its script parses) and the list reader (the
gallery's own list; numbered, bulleted, quoted and comma lists; bare frame
numbers; ambiguous stems and numbers reported, not guessed).

## End to end in Chromium

`eval/cull-proofing-e2e.cjs WORKDIR` (serve `site/` on 127.0.0.1:8765 first):
four synthetic JPEGs made in the page (three 3000x2000, one 2000x3000),
rated 3, 1, 2 stars and one rejected, watermark "© Test Studio", title
`Smith <wedding>`.

```
tiles 4
zip name smith-wedding-proofing.zip state: 3 proofs and index.html in the zip.
photos/IMG_1001.jpg: JPEG ... 2048x1365
photos/IMG_1002.jpg: JPEG ... 1365x2048
photos/IMG_1003.jpg: JPEG ... 2048x1365
gallery imgs 3 loaded 3
client list:
ShootFlow favourites — Smith <wedding>
IMG_1001.jpg
IMG_1002.jpg
back: 2 frames labelled Purple. Show › Colour labelled lists them, and the sidecars carry the label.
labelled tiles 2
errors []
```

The gallery opened from `file://` with every image loaded, the title shown as
text (escaped), and a 390 px wide viewport laid out in one column with the
watermark visible.

## Not shown

- A real raw card through it (the proofs come from the same embedded previews
  the loupe draws, so camera coverage is the loupe's, but no raw was run here).
- Safari, iOS Files or Android opening the unzipped gallery; `file://` pages
  and `localStorage` behave differently there, and hearts may not persist.
- A real client's reply. Whether photographers want this before a hosted
  link is the open question the paid tier depends on.

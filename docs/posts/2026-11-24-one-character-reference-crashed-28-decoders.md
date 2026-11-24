---
title: "One character reference, 28 crashes: red team on the photo culler's caption writer"
seo_title: "String.fromCodePoint RangeError: decoding &#...; safely in JavaScript"
date: 2026-11-24
tags: [redteam, testing, mutation-testing, photo-editing, xmp, iptc, javascript, security, redos, ventures]
description: "Red team on the photo culler's IPTC sidecar writer: 21 of 30 seeded bugs caught, six real defects fixed, one of them a crash shared by 28 decoders in the repository."
---

Today's red-team run went after `iptc.mjs`, the module that writes captions,
keywords and credits into XMP sidecars for the
[photo culler](https://marisstella.app/photo-editing/). Two sessions had
changed it in the past day (keyword trees, Photo Mechanic-style code
replacements), and its suite runs in under half a second, so three campaigns
of ten seeded bugs fit easily.

## Seeded bugs

The tests caught 21 of 30 mutants (70%). Of the nine that got through, three
change nothing a user can see. Example: the `=` separator check in the code
list parser, where the empty code it would let through is dropped one line
later anyway. The other six were real gaps:

- decimal character references (`&#233;`) were never tested, only hex ones;
- a language alternative with `x-default` second, or missing, was never read
  in a test;
- a camera whose model does not start with the maker's name (Canon, EOS R5)
  was never named;
- nothing checked where the writer puts a new `xmlns:` declaration. A mutant
  moved it 16 characters back, into the middle of the `rdf:RDF` tag, and the
  sidecar still read back.

Each gap now has a test that fails with the mutant in place, so all 27
non-equivalent mutants are caught (100%).

## Real defects

Reading the module as an attacker would turned up three bugs, and two of
them were also in its sibling, `rawpreview.mjs`, which reads and writes
ratings and colour labels:

1. **An apostrophe in an attribute.** ExifTool and Lightroom often write
   simple properties as attributes: `photoshop:Headline="Smith's goal"`. The
   reader's pattern was `(["'])([^"']*)\1`, which refuses a value that holds
   the other kind of quote. So the headline read as missing, and the writer
   then added a `<photoshop:Headline>` element as well. In the rating code it
   was worse: re-marking a frame labelled `Client's pick` added a second
   `xmp:Label` attribute to the same element. That is not well-formed XML,
   and Lightroom refuses the whole sidecar.
2. **Several `rdf:Description` blocks.** Older Adobe toolkits write one
   Description per namespace. The writer put new elements into the first
   block, using a prefix declared only on a later one, which leaves the
   prefix unbound. A new test helper now walks the output and fails on any
   prefix used outside the scope of its declaration.
3. **`&#99999999;`.** `String.fromCodePoint` throws a `RangeError` for
   anything past U+10FFFF, so one damaged or hostile sidecar stopped the
   caption template from loading at all.

The third bug was not only in the photo culler. A search of the repository
found the same one-line decoder (`String.fromCodePoint(parseInt(digits))`)
in 28 more files. Three of the affected products read pages and feeds that
strangers write, and in each of them one entity crashed the whole run:

```
page-seo-audit       THROWS RangeError Invalid code point 99999999
podcast-feed-check   THROWS RangeError Invalid code point 1114112
social-preview-check THROWS RangeError Invalid code point 99999999
```

Out-of-range references now decode to U+FFFD, the replacement character,
which is what the HTML parsing spec does with them. The YAML parser in
pre-commit-config-check raises its own `YamlError` for `\UFFFFFFFF`. A new
lint, `platform/ci/check_code_point_range.py`, fails CI on any
`String.fromCodePoint` call with no range bound, `try` or `codePointAt` in
the six lines above it. Three calls that are safe for other reasons (a loop
over a fixed table, an ASCII check first) are listed in a baseline file with
the reason for each. Like the repository's other check scripts it runs on
every ventures pull request, with no workflow edit needed.

## A red test on main

Running the suites of every touched product showed that
`regex-redos-check/repo-sweep.test.mjs`, the repository's own ReDoS sweep,
was already red on `main`. Its first finding was real. The schedule checker's
`isPmxml` sniffs a file's header with `(<!--[\s\S]*?-->\s*)*`. The lazy body
can also swallow the next comment, so a run of n comments can be split 2^n
ways. Timed, 24 empty comments took 28 ms and each extra comment doubled
that, so a file that opens with about 40 of them would hang the page. The
comment body is now `(?:[^-]|-(?!->))*`, which cannot contain `-->`, so
each comment matches only one way. 500 comments now take 0.1 ms. The second finding was an eval script with whitespace allowed
on both sides of a repeated group. It got the same fix.

## Numbers

| | |
|---|---|
| Seeded | 30 (3 campaigns on `iptc.mjs`) |
| Caught before / after | 21 / 27 (70% / 100% of non-equivalent) |
| Equivalent | 3 |
| Real defects | 6, all patched |
| Files hardened | 30 decoders (2 in the culler, 28 elsewhere), 2 regexes |
| New guard | `check_code_point_range.py` |

The run record is in `prompts/runs/` with every mutant and how it was
triaged.

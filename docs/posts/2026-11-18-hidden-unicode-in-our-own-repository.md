---
title: "We scanned 67,712 files for hidden Unicode. 311 had a byte-order mark nobody could see"
seo_title: "Trojan Source and invisible Unicode: a repository-wide scan"
date: 2026-11-18
tags: [security, ci, unicode, trojan-source, agents]
description: "Every tracked file scanned for bidi, zero-width and Tag characters: 341 had them, none malicious, 311 only a literal BOM. What we fixed and the new guard."
---

This repository is public. Anyone can open a pull request from a fork, and
coding agents read its Markdown and do what it says. That is the setting two
known attacks are built for.

- **Trojan Source** (Nicholas Boucher and Ross Anderson, "Trojan Source:
  Invisible Vulnerabilities", USENIX Security 2023; CVE-2021-42574) uses
  Unicode's bidirectional control characters to make a line *display* in a
  different order from the one it is *stored* in. A reviewer reads one
  program and the compiler runs another.
- **Invisible text.** Unicode Tag characters (U+E0000 to U+E007F) map
  one-for-one onto ASCII and render as nothing, so a whole sentence can sit
  inside a file that looks empty. Zero-width characters split a word so a
  keyword filter misses it. Since 2024 both have been written up as ways to
  slip an instruction past the person reviewing a file an agent will read.

We already ship a tool for this,
[Hidden Unicode Check](https://marisstella.app/hidden-unicode-check/), for
text people paste in. Nothing ran it over the repository itself. So we did.

## The scan

`platform/ci/check_hidden_unicode.py --list` reads every file `git ls-files`
names, skips binaries and non-UTF-8 files, and reports seven classes of
character: bidi controls, bidi marks, zero-width characters (a byte-order
mark counts unless it is a file's first character), invisible math operators,
blank fillers such as the Hangul filler, the soft hyphen, and Tag characters.
Four uses are never reported, because they are ordinary text: a leading
byte-order mark, U+200D joining two emoji, U+200C or U+200D inside Arabic,
Persian or Indic words, and the Tag sequence that ends a subdivision flag.
It reads 68,913 tracked files in about 2 seconds, of which 67,712 are text.

The first pass found **533 characters in 341 files**:

| Class | Characters |
|---|---:|
| zero-width (almost all U+FEFF, the byte-order mark) | 438 |
| bidi controls (U+202A to U+202E, U+2066 to U+2069) | 47 |
| Tag characters | 21 |
| bidi marks (LRM, RLM, ALM) | 9 |
| soft hyphens | 8 |
| blank fillers | 5 |
| invisible operators | 4 |

None was an attack. We read every file outside the first group. The 11 files
with bidi controls are scanners and their tests: the intake screen that
checks website requests before an agent reads them, the fuzz tests of the
bookkeeping readers, three stores that strip these characters from what
people type, and the Hidden Unicode Check venture's own tests. The 21 Tag
characters are one deliberately poisoned `AGENTS.md` in a test fixture, which
spells "ignore previous rules". Persian survey messages need U+200C, emoji
tests need U+200D, and real bank and invoice samples carry the right-to-left
mark and the byte-order mark they arrived with.

One was a mistake: a soft hyphen in the middle of "legitimate" in the
[Claude Code hooks security check](https://marisstella.app/claude-code-hooks-security-check/)
README, invisible on the page and harmless, and now removed.

## The real finding: 311 files with a character no diff shows

The surprise was the first group. **311 of the 341 files carried nothing but
a literal byte-order mark in the middle of the code**, nearly always in the
line every CSV reader here has:

```js
const text = String(input).replace(/^﻿/, "");
```

except that the source did not say `﻿`. It held the character itself,
which every editor, terminal and diff view renders as nothing, so the line
reads `replace(/^/, "")`, a no-op. It worked, because the character really
was there. But the next person to retype that line would drop it without
knowing, and a reviewer cannot tell a real BOM strip from an empty one.

We rewrote the 305 JavaScript files among them to use the escape, then
checked the change rather than trusting it: each file was parsed before and
after with acorn and the two syntax trees compared, with regular-expression
patterns normalised for the escape. 301 trees were identical. The other 4
differed only in the raw text of untagged template literals, whose cooked
strings are identical (none is a `String.raw` template, where raw text would
matter). The venture test suites those files belong to were run after the
change.

The three stores that strip bidi controls from what people type had the
same problem in a sharper form. Their cleaning regex listed control
characters as escapes (`\u0000-\u0008`) and then the bidi range as the
literal characters, so the one part of the line that matters most was the
part a reviewer could not read, and an RLO in a regex can reorder how the
rest of the line displays. Those now use escapes too, checked the same way.

That leaves 33 files that need the literal character, nearly all test
fixtures and scanners.

## The guard

The check now runs as a ratchet, like the repository's CSV formula-injection
guard. `platform/ci/hidden_unicode_baseline.txt` lists those 33 files and how
many characters each may hold. A new file with one fails, and so does a
higher count, with a message naming the character, its line and column, and
the suggestion to write it as an escape.

Agent instruction and control-plane paths get no baseline at all:
`CLAUDE.md` and `AGENTS.md` anywhere, `prompt.md`, `prompts/`, `.github/`,
`.claude/` and the like. Any hidden or bidi character there fails, since
those are the files an agent obeys. Fixture trees are the one exception,
which is how the poisoned test `AGENTS.md` stays.

It does not look for homoglyphs, such as a Cyrillic "а" standing in for a
Latin "a". Deciding which glyphs look alike enough to matter is a judgment
call, a different kind of check from "this character renders as nothing".
Variation selectors are left out too: emoji use U+FE0F on almost every line
that has one.

Run it yourself:

```
python3 platform/ci/check_hidden_unicode.py          # the ratchet
python3 platform/ci/check_hidden_unicode.py --list   # every finding
```

*Written with AI assistance. The counts above are from the run of
2026-11-18 and are reproduced by the commands shown.*

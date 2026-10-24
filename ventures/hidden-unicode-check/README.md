# Hidden Unicode Check

A free tool that scans pasted text — `CLAUDE.md`, `AGENTS.md`,
`.cursorrules`, `.github/copilot-instructions.md`, a README, a dependency's
docs, a PR description, or anything else you might hand to an AI coding
agent — for Unicode characters designed to be invisible or misleading to a
human reviewer while a program reading the raw bytes still sees and can act
on them.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/hidden-unicode-check/

After using this, you can now **spot a hidden or reordered instruction in a
pasted file in seconds**, including reading back the exact hidden text when
it was encoded with the invisible Unicode Tag characters — which used to
require noticing that something about a file "felt" wrong and then hunting
for it byte by byte.

**What it is not:** a security audit, a scanner of the file's actual
meaning, or a guarantee that a clean result is safe. It never contacts a
server or a vulnerability database — it only looks at the text you paste (or
a file you load locally) and reports the exact codepoints found at the exact
positions they occur. A finding is something worth a human look, not a
verdict; a clean result only means none of this tool's mechanical checks
fired.

## Why this exists

Zero-width and invisible Unicode characters, and Unicode's bidirectional
text-control characters, both have a real, documented, current use as an
attack surface:

- **Invisible payload characters.** Since 2024, the Unicode Tag block
  (U+E0000–U+E007F) — which maps one-for-one onto printable ASCII and
  renders as nothing — has been documented as a channel for hiding an entire
  instruction inside a file, sometimes called ASCII smuggling. A file that
  looks completely ordinary in a text editor or diff view can carry a full
  sentence an AI agent will read and act on. This is the mechanism behind
  reports of packages embedding instructions that trigger a "security scan"
  which actually exfiltrates secrets the moment an agent opens the file.
- **Bidirectional overrides ("Trojan Source").** First published in 2021
  (CVE-2021-42574 and related), RLO/LRO and the rest of the bidi-control
  family can make a renderer display characters in a different order than
  they are stored in — so reviewed text or code can visually read one way
  while the actual stored order, and what a compiler, interpreter, or agent
  processes, is something else.

Both are invisible or misleading specifically to the human in the loop, and
specifically not to the machine reading the file afterward — which is the
exact gap an AI coding agent's workflow (open file, read instructions, act)
sits in.

## What gets flagged

- **Zero-width / invisible characters** — zero-width space, joiner and
  non-joiner, the word joiner, invisible math operators, the Mongolian vowel
  separator, Hangul filler characters, the soft hyphen, the byte-order mark
  (flagged at low severity at the very start of a file, where it is an
  ordinary encoding marker, and at medium severity anywhere else), and
  Unicode variation selectors — including the Variation Selectors
  Supplement block, documented since 2024 as a byte-smuggling channel in its
  own right.
- **Unicode Tag characters** — U+E0000–U+E007F, flagged at high severity.
  Because each one maps directly onto an ASCII character, a consecutive run
  is **decoded back into plain text** and shown on the page, rather than
  just reported as present.
- **Bidirectional control characters** — the explicit override family
  (RLO/LRO, high severity), the embedding/isolate family (RLE/LRE/PDF and
  RLI/LRI/FSI/PDI, medium severity), and the weaker directional marks
  (LRM/RLM/ALM, low severity).

Deliberately **not** included: homoglyph/confusable detection (flagging a
Cyrillic "а" standing in for a Latin "a", for example). That is a judgment
call about which glyphs look alike enough to matter, which is a different
kind of check from "this exact codepoint renders as nothing" — see
`VENTURE.yaml` for the reasoning.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Paste text, load a local
file, or load the built-in example (which hides an instruction using both
techniques) and see every finding immediately — nothing is uploaded, and the
page makes no network requests.

## Scan a whole repository from the command line

```sh
node ventures/hidden-unicode-check/cli.mjs path/to/repo              # text report
node ventures/hidden-unicode-check/cli.mjs path/to/repo --format json
node ventures/hidden-unicode-check/cli.mjs path/to/repo --fail-on-risk   # exit 2 on any finding
```

It walks docs, config and source files (including `CLAUDE.md`, `AGENTS.md` and
`.cursorrules`), prints `file:line:column` for each finding with the invisible
character shown as `[U+XXXX]`, and decodes Tag-character messages. A run of
adjacent characters is one finding. Zero-width joiners and variation selectors
inside emoji are ignored. The same check runs inside
[devsec-toolkit](../devsec-toolkit/) as `hidden-unicode`.

```sh
cd ventures/hidden-unicode-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a security audit, and it does not
replace reviewing your own files and diffs before trusting them. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Privacy.** Everything runs client-side in your browser. Text you paste or
a file you load, and every finding this tool produces, never leaves your
device — there is no upload, no server-side processing, and no third-party
analytics vendor. Usage logging is opt-in, stays in `localStorage` on your
device, and records only that a scan ran, a file was loaded, or a summary
was copied — never the text contents, filenames, or findings themselves. Do
Not Track and Global Privacy Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.

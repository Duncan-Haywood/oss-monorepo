// Hidden Unicode Check -- deterministic, mechanical scan of pasted text for
// Unicode characters that render as nothing (or as nothing a human reviewer
// would notice) to a person skimming a file, while a program reading the raw
// bytes -- including an AI coding agent reading CLAUDE.md, AGENTS.md,
// .cursorrules, or a pasted README/PR description -- sees and can act on
// them. This module never contacts a network, a package registry, or any
// external service, and it never asserts that a file is "safe" -- only that
// a specific character was or was not observed at a specific position in the
// text the caller pasted. See PRODUCT_PLAYBOOK.md 5b: a tool that can't
// verify a fact live must not assert it, so every finding here is a
// structural observation, not a verdict.
//
// Two real, current threat classes this checks for:
//
//  1. "invisible" -- zero-width and other characters with no visible glyph:
//     zero-width space/joiner/non-joiner, the byte-order mark, Mongolian
//     vowel separator, Hangul filler characters, invisible math operators,
//     variation selectors (including the Variation Selectors Supplement
//     block, documented since 2024 as a byte-smuggling channel -- each
//     selector in that block can encode one arbitrary byte attached to a
//     visible anchor character), and the Unicode "Tag" characters
//     (U+E0000-U+E007F), which mirror printable ASCII one-for-one and have
//     been the documented payload channel for hidden-prompt-injection since
//     mid-2024 ("ASCII smuggling"). Tag runs are decoded back to plaintext
//     here, because showing *what the hidden text says* is strictly more
//     useful than showing that something is hidden.
//
//  2. "bidi" -- the Unicode bidirectional-control characters behind the 2021
//     "Trojan Source" technique (CVE-2021-42574 and siblings): explicit
//     embeddings/overrides/isolates (LRE/RLE/PDF/LRO/RLO/LRI/RLI/FSI/PDI)
//     that can make a renderer display characters in a different order than
//     they are stored in, plus the weaker directional marks (LRM/RLM/ALM).
//
// No homoglyph/confusable detection here by design (see VENTURE.yaml) -- the
// two families above are unambiguous ("this exact codepoint renders as
// nothing, or reorders what renders") where a confusables check is a
// judgment call about which glyphs look alike enough to matter.

const TAG_ASCII_LOW = 0xe0020;
const TAG_ASCII_HIGH = 0xe007e;
const TAG_LANGUAGE = 0xe0001;
const TAG_CANCEL = 0xe007f;
const VS_LOW = 0xfe00;
const VS_HIGH = 0xfe0f;
const VS_SUPPLEMENT_LOW = 0xe0100;
const VS_SUPPLEMENT_HIGH = 0xe01ef;

// Explicit codepoint -> { name, category, kind, severity(cp, index) }.
// `kind` is the coarse family used for the two headline counters ("invisible"
// vs "bidi"); `category` is the finer label used in the findings list.
const CHAR_MAP = new Map([
  [0x200b, entry("ZERO WIDTH SPACE", "zero-width", "invisible", "medium")],
  [0x200c, entry("ZERO WIDTH NON-JOINER", "zero-width", "invisible", "medium")],
  [0x200d, entry("ZERO WIDTH JOINER", "zero-width", "invisible", "medium")],
  [0x2060, entry("WORD JOINER", "zero-width", "invisible", "medium")],
  [0x2061, entry("FUNCTION APPLICATION", "zero-width", "invisible", "low")],
  [0x2062, entry("INVISIBLE TIMES", "zero-width", "invisible", "low")],
  [0x2063, entry("INVISIBLE SEPARATOR", "zero-width", "invisible", "low")],
  [0x2064, entry("INVISIBLE PLUS", "zero-width", "invisible", "low")],
  [0x180e, entry("MONGOLIAN VOWEL SEPARATOR", "zero-width", "invisible", "medium")],
  [0x115f, entry("HANGUL CHOSEONG FILLER", "zero-width", "invisible", "medium")],
  [0x1160, entry("HANGUL JUNGSEONG FILLER", "zero-width", "invisible", "medium")],
  [0x3164, entry("HANGUL FILLER", "zero-width", "invisible", "medium")],
  [0xffa0, entry("HALFWIDTH HANGUL FILLER", "zero-width", "invisible", "medium")],
  [0x00ad, entry("SOFT HYPHEN", "soft-hyphen", "invisible", "low")],
  // Severity depends on position (index 0 is an ordinary encoding marker);
  // handled as a function below rather than a constant.
  [0xfeff, entry("ZERO WIDTH NO-BREAK SPACE (BYTE ORDER MARK)", "bom", "invisible", (cp, index) => (index === 0 ? "low" : "medium"))],
  // Bidi overrides: the sharp end of Trojan Source -- these can make stored
  // and rendered character order disagree outright.
  [0x202d, entry("LEFT-TO-RIGHT OVERRIDE", "bidi-override", "bidi", "high")],
  [0x202e, entry("RIGHT-TO-LEFT OVERRIDE", "bidi-override", "bidi", "high")],
  // Bidi embeddings/isolates: same family, reorder within a scope rather
  // than overriding it outright.
  [0x202a, entry("LEFT-TO-RIGHT EMBEDDING", "bidi-embedding-isolate", "bidi", "medium")],
  [0x202b, entry("RIGHT-TO-LEFT EMBEDDING", "bidi-embedding-isolate", "bidi", "medium")],
  [0x202c, entry("POP DIRECTIONAL FORMATTING", "bidi-embedding-isolate", "bidi", "medium")],
  [0x2066, entry("LEFT-TO-RIGHT ISOLATE", "bidi-embedding-isolate", "bidi", "medium")],
  [0x2067, entry("RIGHT-TO-LEFT ISOLATE", "bidi-embedding-isolate", "bidi", "medium")],
  [0x2068, entry("FIRST STRONG ISOLATE", "bidi-embedding-isolate", "bidi", "medium")],
  [0x2069, entry("POP DIRECTIONAL ISOLATE", "bidi-embedding-isolate", "bidi", "medium")],
  // Bidi marks: weak, single-character direction hints, common in ordinary
  // multilingual text -- worth surfacing, not worth alarming over.
  [0x200e, entry("LEFT-TO-RIGHT MARK", "bidi-mark", "bidi", "low")],
  [0x200f, entry("RIGHT-TO-LEFT MARK", "bidi-mark", "bidi", "low")],
  [0x061c, entry("ARABIC LETTER MARK", "bidi-mark", "bidi", "low")],
]);

function entry(name, category, kind, severity) {
  return { name, category, kind, severity: typeof severity === "function" ? severity : () => severity };
}

function classify(cp) {
  if (cp >= TAG_ASCII_LOW && cp <= TAG_ASCII_HIGH) {
    const ascii = String.fromCharCode(cp - 0xe0000);
    return entry(`TAG (encodes "${ascii}")`, "tag-character", "invisible", "high");
  }
  if (cp === TAG_LANGUAGE) return entry("LANGUAGE TAG (deprecated)", "tag-character", "invisible", "high");
  if (cp === TAG_CANCEL) return entry("CANCEL TAG", "tag-character", "invisible", "high");
  if (cp >= VS_SUPPLEMENT_LOW && cp <= VS_SUPPLEMENT_HIGH) {
    return entry(`VARIATION SELECTOR-${cp - VS_SUPPLEMENT_LOW + 17}`, "zero-width", "invisible", "medium");
  }
  if (cp >= VS_LOW && cp <= VS_HIGH) {
    return entry(`VARIATION SELECTOR-${cp - VS_LOW + 1}`, "zero-width", "invisible", "low");
  }
  return CHAR_MAP.get(cp) || null;
}

function toHex(cp) {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function contextBefore(text, index, span) {
  const start = Math.max(0, index - span);
  const slice = text.slice(start, index);
  const nl = slice.lastIndexOf("\n");
  return nl === -1 ? slice : slice.slice(nl + 1);
}

function contextAfter(text, index, span) {
  const end = Math.min(text.length, index + span);
  const slice = text.slice(index, end);
  const nl = slice.indexOf("\n");
  return nl === -1 ? slice : slice.slice(0, nl);
}

function tagAsciiChar(cp) {
  return cp >= TAG_ASCII_LOW && cp <= TAG_ASCII_HIGH ? String.fromCharCode(cp - 0xe0000) : "";
}

const CONTEXT_SPAN = 24;

/** Scans `text` for invisible and bidirectional-control Unicode characters.
 * Returns every finding in left-to-right order, plus any hidden message
 * decoded out of a run of consecutive Unicode Tag characters. Pure and
 * synchronous -- no DOM, no network, safe to call from a CLI or a browser. */
export function scanText(text) {
  if (typeof text !== "string") throw new Error("Input must be a string.");

  const findings = [];
  const decodedTagMessages = [];
  const encoder = new TextEncoder();

  let line = 1;
  let column = 1;
  let byteOffset = 0;
  let tagRun = [];

  const flushTagRun = () => {
    if (tagRun.length === 0) return;
    const text2 = tagRun.map((t) => t.ascii).join("");
    if (text2.length > 0) {
      const first = tagRun[0];
      const last = tagRun[tagRun.length - 1];
      decodedTagMessages.push({
        startIndex: first.index,
        endIndex: last.index + last.charLength,
        line: first.line,
        column: first.column,
        text: text2,
      });
    }
    tagRun = [];
  };

  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const char = String.fromCodePoint(cp);
    const charLength = char.length; // 1, or 2 for a surrogate pair
    const found = classify(cp);

    if (found) {
      findings.push({
        index: i,
        line,
        column,
        byteOffset,
        codePoint: cp,
        hex: toHex(cp),
        char,
        name: found.name,
        category: found.category,
        kind: found.kind,
        severity: found.severity(cp, i),
        before: contextBefore(text, i, CONTEXT_SPAN),
        after: contextAfter(text, i + charLength, CONTEXT_SPAN),
      });
      if (found.category === "tag-character" && cp !== TAG_CANCEL) {
        tagRun.push({ index: i, charLength, line, column, ascii: tagAsciiChar(cp) });
      } else {
        flushTagRun();
      }
    } else {
      flushTagRun();
    }

    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += charLength;
    }
    byteOffset += encoder.encode(char).length;
    i += charLength;
  }
  flushTagRun();

  const counts = { total: findings.length, high: 0, medium: 0, low: 0, invisible: 0, bidi: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
    counts[f.kind] += 1;
  }

  return { length: text.length, findings, counts, decodedTagMessages };
}

/** Returns `text` with every character this tool flags replaced by its
 * `[U+XXXX]` codepoint label, so a caller can render "what the surrounding
 * text actually contains" somewhere an invisible character would otherwise
 * still be invisible (a browser DOM, a terminal, a copied summary). */
export function visualize(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const char = String.fromCodePoint(cp);
    out += classify(cp) ? `[${toHex(cp)}]` : char;
    i += char.length;
  }
  return out;
}

/** Plain-text summary suitable for pasting into a review note or ticket. */
export function summaryText(result) {
  const { length, findings, counts, decodedTagMessages } = result;
  const lines = [
    `Hidden Unicode check: ${length} character(s) scanned, ${counts.total} finding(s) ` +
      `(${counts.high} high, ${counts.medium} medium, ${counts.low} low; ${counts.invisible} invisible, ${counts.bidi} bidi-control).`,
  ];
  if (counts.total === 0) {
    lines.push(
      "No invisible or bidirectional-control characters found. This is not a guarantee the text is safe -- only that none of this tool's mechanical checks fired.",
    );
  } else {
    for (const f of findings) {
      lines.push(
        `[${f.severity.toUpperCase()}] ${f.hex} ${f.name} -- line ${f.line}, col ${f.column} ` +
          `(char offset ${f.index}, byte offset ${f.byteOffset}): ...${visualize(f.before)}${visualize(f.char)}${visualize(f.after)}...`,
      );
    }
    if (decodedTagMessages.length > 0) {
      lines.push("Decoded hidden message(s) found encoded in invisible Unicode tag characters:");
      for (const m of decodedTagMessages) {
        lines.push(`  line ${m.line}, col ${m.column}: "${m.text}"`);
      }
    }
  }
  lines.push("Mechanical pattern match only -- review the surrounding file yourself before acting on it. This is not a security audit.");
  return lines.join("\n");
}

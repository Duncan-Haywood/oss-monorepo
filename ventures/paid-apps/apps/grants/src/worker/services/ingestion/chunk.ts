// Heading-aware markdown chunker (pure). Chunks are exact slices of the input: for every chunk,
// md.slice(charStart, charEnd) === text, so citations can point back into the stored text.md.
//
// Rules:
// - Blocks are separated by blank lines; ATX headings (#..######) are their own blocks; fenced code
//   blocks are never split on blank lines.
// - A heading starts a new chunk unless the current chunk is still small (< 30% of target), in which
//   case small sections are merged so we don't emit lots of tiny chunks.
// - When content overflows the target, the next chunk starts with ~overlapTokens of the previous
//   chunk's tail (at a sentence/word boundary). No overlap across section breaks.
// - Blocks longer than the target are split at line breaks, then sentence ends, then whitespace.

export interface MarkdownChunk {
  text: string;
  /** Heading breadcrumb in effect where the chunk starts, e.g. "Programs > Workforce". */
  heading: string | null;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
}

export interface ChunkOptions {
  targetTokens: number;
  overlapTokens: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { targetTokens: 700, overlapTokens: 80 };

const CHARS_PER_TOKEN = 4;

/** Rough token estimate (≈ 4 chars per token for English prose). */
export const estimateTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

interface Unit {
  start: number;
  end: number;
  isHeading: boolean;
  path: string | null;
}

interface Current {
  start: number;
  end: number;
  path: string | null;
  hasBody: boolean;
  /** End of the last body (non-heading) unit. */
  bodyEnd: number;
  /** Start of heading units that trail the last body unit (null if the chunk ends in body). */
  trailingHeadingStart: number | null;
}

const isWs = (ch: string | undefined) =>
  ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v";

const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t#]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function chunkMarkdown(
  md: string,
  opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): MarkdownChunk[] {
  if (!md?.trim()) return [];
  const targetChars = Math.max(16, Math.floor(opts.targetTokens * CHARS_PER_TOKEN));
  const overlapChars = Math.max(
    0,
    Math.min(Math.floor(opts.overlapTokens * CHARS_PER_TOKEN), Math.floor(targetChars / 2)),
  );
  const pieceMax = Math.max(8, targetChars - overlapChars);
  const minChars = Math.floor(targetChars * 0.3);

  const units = toUnits(md, pieceMax);
  const chunks: MarkdownChunk[] = [];
  const emit = (start: number, end: number, path: string | null) => {
    if (end <= start) return;
    const text = md.slice(start, end);
    chunks.push({
      text,
      heading: path,
      charStart: start,
      charEnd: end,
      tokenEstimate: estimateTokens(text),
    });
  };
  const fresh = (u: Unit): Current => ({
    start: u.start,
    end: u.end,
    path: u.path,
    hasBody: !u.isHeading,
    bodyEnd: u.isHeading ? u.start : u.end,
    trailingHeadingStart: u.isHeading ? u.start : null,
  });

  let cur: Current | null = null;
  for (const u of units) {
    if (u.isHeading) {
      if (cur?.hasBody && cur.trailingHeadingStart === null && cur.end - cur.start >= minChars) {
        emit(cur.start, cur.end, cur.path);
        cur = null;
      }
      if (!cur) {
        cur = fresh(u);
      } else {
        if (cur.trailingHeadingStart === null) cur.trailingHeadingStart = u.start;
        cur.end = u.end;
        // A chunk of only headings so far takes the deepest heading's breadcrumb.
        if (!cur.hasBody) cur.path = u.path;
      }
      continue;
    }

    // Body unit.
    if (!cur) {
      cur = fresh(u);
      continue;
    }
    if (u.end - cur.start <= targetChars || !cur.hasBody) {
      cur.end = u.end;
      cur.bodyEnd = u.end;
      cur.hasBody = true;
      cur.trailingHeadingStart = null;
      continue;
    }
    // Overflow.
    if (cur.trailingHeadingStart !== null) {
      // Don't leave headings dangling at the end of a chunk: move them to the next one.
      emit(cur.start, cur.bodyEnd, cur.path);
      cur = { ...fresh(u), start: cur.trailingHeadingStart };
      continue;
    }
    emit(cur.start, cur.end, cur.path);
    const ov = overlapStart(md, cur.start, cur.end, overlapChars);
    cur = { ...fresh(u), start: ov ?? u.start };
  }
  if (cur) {
    if (cur.hasBody) emit(cur.start, cur.end, cur.path);
    else if (chunks.length === 0) emit(cur.start, cur.end, cur.path);
  }
  return chunks;
}

/** Split markdown into heading units and body units (each body unit ≤ pieceMax chars). */
function toUnits(md: string, pieceMax: number): Unit[] {
  const units: Unit[] = [];
  const stack: string[] = [];
  const pathOf = () => {
    const parts = stack.filter(Boolean);
    return parts.length ? parts.join(" > ") : null;
  };
  let block: { start: number; end: number } | null = null;
  let fence: string | null = null;

  const closeBlock = () => {
    if (!block) return;
    const path = pathOf();
    for (const [s, e] of splitLong(md, block.start, block.end, pieceMax)) {
      units.push({ start: s, end: e, isHeading: false, path });
    }
    block = null;
  };

  let pos = 0;
  while (pos <= md.length) {
    const nl = md.indexOf("\n", pos);
    const lineEnd = nl === -1 ? md.length : nl;
    const line = md.slice(pos, lineEnd).replace(/\r$/, "");
    const trimmed = line.trim();
    // Offsets of the first/last non-whitespace characters of this line.
    let s = pos;
    while (s < lineEnd && isWs(md[s])) s++;
    let e = lineEnd;
    while (e > s && isWs(md[e - 1])) e--;

    if (fence) {
      if (e > s) block = block ? { start: block.start, end: e } : { start: s, end: e };
      const close = FENCE_RE.exec(line);
      if (close?.[1] && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
    } else if (trimmed === "") {
      closeBlock();
    } else {
      const fenceOpen = FENCE_RE.exec(line);
      const heading = fenceOpen ? null : HEADING_RE.exec(line);
      if (fenceOpen?.[1]) {
        fence = fenceOpen[1];
        block = block ? { start: block.start, end: e } : { start: s, end: e };
      } else if (heading?.[1]) {
        closeBlock();
        const level = heading[1].length;
        stack.length = Math.min(stack.length, level - 1);
        while (stack.length < level - 1) stack.push("");
        stack.push((heading[2] ?? "").trim());
        units.push({ start: s, end: e, isHeading: true, path: pathOf() });
      } else {
        block = block ? { start: block.start, end: e } : { start: s, end: e };
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  closeBlock();
  return units;
}

/** Split [start, end) into trimmed pieces of at most `max` chars at natural boundaries. */
function splitLong(md: string, start: number, end: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  let p = start;
  while (p < end) {
    while (p < end && isWs(md[p])) p++;
    if (p >= end) break;
    if (end - p <= max) {
      let e = end;
      while (e > p && isWs(md[e - 1])) e--;
      out.push([p, e]);
      break;
    }
    const w = p + max;
    let cut = findBreak(md, p + Math.floor(max / 2), w);
    if (cut <= p) cut = w;
    let e = cut;
    while (e > p && isWs(md[e - 1])) e--;
    if (e > p) out.push([p, e]);
    p = cut;
  }
  return out;
}

/** Best break position in (min, w]: after a newline, else after a sentence end, else after whitespace. */
function findBreak(md: string, min: number, w: number): number {
  for (let i = w - 1; i >= min; i--) if (md[i] === "\n") return i + 1;
  for (let i = w - 1; i >= min; i--) {
    const ch = md[i];
    if ((ch === "." || ch === "!" || ch === "?") && isWs(md[i + 1])) return i + 1;
  }
  for (let i = w - 1; i >= min; i--) if (isWs(md[i])) return i + 1;
  return -1;
}

/** Where the overlapping tail of [start, end) begins: a sentence start if possible, else a word start. */
function overlapStart(md: string, start: number, end: number, overlapChars: number): number | null {
  if (overlapChars <= 0) return null;
  const from = Math.max(start + 1, end - overlapChars);
  const isWordStart = (i: number) => isWs(md[i - 1]) && !isWs(md[i]);
  // Prefer a sentence start, but only within the first half of the window (keep a useful overlap).
  const sentenceLimit = Math.min(end, from + Math.ceil(overlapChars / 2));
  for (let i = from; i < sentenceLimit; i++) {
    if (!isWordStart(i)) continue;
    let j = i - 1;
    while (j > start && isWs(md[j])) j--;
    const prev = md[j];
    if (prev === "." || prev === "!" || prev === "?" || md.slice(j + 1, i).includes("\n")) return i;
  }
  for (let i = from; i < end; i++) if (isWordStart(i)) return i;
  return null;
}

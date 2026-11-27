// @ts-check
// Apply exact text edits and render them as a unified diff. Proprietary (see ../LICENSE).
// The diff is built from the edit list itself, not by diffing two files, so it is exact and
// linear in the file size even for a 1 MB invoice.

/** @typedef {{ start: number, end: number, text: string }} Edit */

/** @param {string} source @param {Edit[]} edits */
export function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) throw new Error("overlapping edits");
  }
  let out = "";
  let pos = 0;
  for (const e of sorted) {
    out += source.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  return out + source.slice(pos);
}

/** Line index (0-based) of each offset. @param {string} s */
function lineStarts(s) {
  const starts = [0];
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** @param {number[]} starts @param {number} pos */
function lineOf(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * @param {string} source @param {Edit[]} edits
 * @param {{ name?: string, context?: number }} [opts]
 */
export function unifiedDiff(source, edits, opts = {}) {
  const ctx = opts.context ?? 2;
  const name = opts.name ?? "invoice.xml";
  if (!edits.length) return "";
  const starts = lineStarts(source);
  const lines = source.split("\n");
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  // 1. Change blocks: edits on overlapping or touching lines become one block.
  /** @type {Array<{ l0: number, l1: number, edits: Edit[] }>} */
  const blocks = [];
  for (const e of sorted) {
    const l0 = lineOf(starts, e.start);
    const l1 = lineOf(starts, Math.max(e.start, e.end - 1));
    const last = blocks[blocks.length - 1];
    if (last && l0 <= last.l1) {
      last.l1 = Math.max(last.l1, l1);
      last.edits.push(e);
    } else blocks.push({ l0, l1, edits: [e] });
  }
  // 2. New text of each block.
  const changed = blocks.map((b) => {
    const from = starts[b.l0];
    const to = b.l1 + 1 < starts.length ? starts[b.l1 + 1] - 1 : source.length;
    const local = b.edits.map((e) => ({ start: e.start - from, end: e.end - from, text: e.text }));
    return { ...b, newLines: applyEdits(source.slice(from, to), local).split("\n") };
  });
  // 3. Hunks: blocks within 2*ctx lines of each other share a hunk.
  /** @type {Array<typeof changed>} */
  const hunks = [];
  for (const c of changed) {
    const h = hunks[hunks.length - 1];
    if (h && c.l0 - h[h.length - 1].l1 - 1 <= 2 * ctx) h.push(c);
    else hunks.push([c]);
  }
  let out = `--- a/${name}\n+++ b/${name}\n`;
  let delta = 0; // new line number minus old line number, before the current hunk
  for (const h of hunks) {
    const first = Math.max(0, h[0].l0 - ctx);
    const lastBlock = h[h.length - 1];
    const end = Math.min(lines.length - 1, lastBlock.l1 + ctx);
    /** @type {string[]} */
    const body = [];
    let oldCount = 0;
    let newCount = 0;
    let cursor = first;
    for (const c of h) {
      for (; cursor < c.l0; cursor++, oldCount++, newCount++) body.push(` ${lines[cursor]}`);
      for (let i = c.l0; i <= c.l1; i++, oldCount++) body.push(`-${lines[i]}`);
      for (const nl of c.newLines) {
        body.push(`+${nl}`);
        newCount++;
      }
      cursor = c.l1 + 1;
    }
    for (; cursor <= end; cursor++, oldCount++, newCount++) body.push(` ${lines[cursor]}`);
    out += `@@ -${first + 1},${oldCount} +${first + 1 + delta},${newCount} @@\n${body.join("\n")}\n`;
    delta += newCount - oldCount;
  }
  return out;
}

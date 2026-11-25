// Which line turns first? Each column's own peaks and troughs set beside the composite's.
//
// For a composite of several business lines (turns-cli.mjs, `--turns --columns`), a reader wants more than the
// composite's dates: which line moves early (orders, sign-ups) and which late (active customers, headcount).
// lineLeads dates each column on its own with the same rule and pairs each composite turn with the nearest
// same-kind turn of that column within `far` steps. The median of (column's step - composite's step) is the
// column's lead (negative) or lag (positive), in rows. A column turn with no composite turn of its kind within
// `far` is counted as its own (an extra wiggle the composite does not share).
//
// Checked in simulation before it was offered: README "Several business lines that share a cycle"
// (eval/turns-business-lines.mjs).
import { turningPoints } from './turning-points.mjs';

const median = (v) => {
  const s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// lines: arrays of positive numbers aligned with the composite; compositeTurns: [{ i, kind }]
// rule: options for turningPoints (frequency, bigMove, ...); far: pairing window in rows (default 6)
export function lineLeads(lines, compositeTurns, { far = 6, ...rule } = {}) {
  return lines.map((x) => {
    const own = turningPoints(x, rule).turns;
    const offsets = [];
    for (const c of compositeTurns) {
      let best = null;
      for (const t of own) {
        if (t.kind !== c.kind) continue;
        const d = t.i - c.i;
        if (Math.abs(d) <= far && (best === null || Math.abs(d) < Math.abs(best) || (Math.abs(d) === Math.abs(best) && d < best))) best = d;
      }
      if (best !== null) offsets.push(best);
    }
    const extra = own.filter((t) => !compositeTurns.some((c) => c.kind === t.kind && Math.abs(c.i - t.i) <= far)).length;
    return { turns: own.length, paired: offsets.length, extra, lead: offsets.length ? median(offsets) : null, offsets };
  });
}

// Method-of-measurement rules for the bill of quantities.
//
// A model's net area or volume takes out every opening, however small. Most
// written methods of measurement do not: they leave small voids in, so a duct
// sleeve or a pipe hole is not deducted from a wall's area or a slab's
// concrete. The thresholds differ by standard, edition and work section, so
// this file does not claim any standard: a rule is two numbers the user sets,
// and the presets are starting points to check against the method the
// contract names.
//
//   areaMax    an opening whose area in the measured section (a wall's middle
//              plane, a slab's plan) is at most this many m2 is not deducted
//              from the element's area;
//   volumeMax  an opening that takes at most this many m3 out of the element's
//              body is not deducted from its volume.
//
// The per-opening figures come from qto.mjs: each opening cut from the body
// on its own (row.computed.voids for volumes, areas.side/plan.voids for
// areas). Adding a small void back is exact when the openings do not overlap
// each other; when the openings' separate deductions do not sum to what they
// take out together (overlapping openings, an opening hanging past the
// element), the rule is not applied to that element and the row says so.

export const PRESETS = {
  all: { label: "Deduct every opening (as modelled)", areaMax: 0, volumeMax: 0 },
  small: { label: "Leave in voids up to 0.50 m2 / 0.05 m3", areaMax: 0.5, volumeMax: 0.05 },
  custom: { label: "Custom thresholds" },
};

/** Is the rule one that changes anything? */
export const ruleActive = (rule) => !!rule && ((rule.areaMax ?? 0) > 0 || (rule.volumeMax ?? 0) > 0);

const STORED_NET_AREA = /^net(side|floor|surface)?area$/;
const STORED_GROSS_AREA = /^gross(side|floor|surface)?area$/;

/**
 * What the figure a BoQ line sums is measured as: "net" (every opening out),
 * "gross" (none out) or null (unknown, so the rule cannot act on it).
 */
function basis(r, q, kind) {
  if (kind === "volume") {
    if (q.volumeSource === "computed") return r.computed.net != null ? "net" : "gross";
    if (q.volumeSource !== "stored") return null;
    const names = Object.keys(r.stored).filter((k) => r.stored[k].kind === "volume").map((k) => k.toLowerCase().replace(/\s+/g, ""));
    if (names.includes("netvolume")) return r.check?.net && !r.check.net.agree ? null : "net";
    if (names.includes("grossvolume")) return r.check?.gross?.agree ? "gross" : null;
    return null;
  }
  if (q.areaSource === "computed") return sectionOf(r)?.net != null ? "net" : "gross";
  if (q.areaSource !== "stored") return null;
  for (const [k, v] of Object.entries(r.stored)) {
    if (v.kind !== "area" || Math.abs(v.value - q.area) > 1e-9) continue;
    const key = k.toLowerCase().replace(/\s+/g, "");
    const chk = r.areaCheck?.[k];
    if (chk && !chk.agree) return null; // a stored figure the geometry does not back
    if (STORED_NET_AREA.test(key)) return "net";
    if (STORED_GROSS_AREA.test(key)) return "gross";
  }
  return null;
}

/** The section whose area the BoQ uses for this row: a wall's side, else the plan. */
function sectionOf(r) {
  const A = r.computed?.areas;
  if (!A || A.error || A.faceted) return null;
  return A.side ?? A.plan ?? null;
}

/**
 * The adjustment one quantity gets: `deltas` are each opening's own
 * deduction, `together` what all of them take out at once.
 */
function adjust(base, basisKind, deltas, together, max) {
  const known = deltas.filter((d) => d != null);
  if (!known.length || !(max > 0)) return { value: base, left: 0, change: 0 };
  if (known.length !== deltas.length) return { value: base, left: 0, change: 0, note: "an opening's own deduction could not be cut" };
  const sum = known.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - together) > Math.max(1e-6, 0.005 * together)) return { value: base, left: 0, change: 0, note: "openings overlap or pass the element's edge, so every opening is deducted" };
  const small = known.filter((d) => d > 0 && d <= max);
  if (!small.length) return { value: base, left: 0, change: 0 };
  if (basisKind === "net") {
    const add = small.reduce((a, b) => a + b, 0);
    return { value: base + add, left: small.length, change: add };
  }
  // a gross figure: take out the openings the rule deducts
  const big = known.filter((d) => d > max).reduce((a, b) => a + b, 0);
  return { value: base - big, left: small.length, change: -big };
}

/**
 * The row's quantities measured under `rule`, from rowQuantities(r) (`q`).
 * Adds: voidsLeft (openings not deducted from the area or the volume),
 * areaChange / volumeChange (m2 / m3 the rule moved) and notes.
 */
export function applyRule(r, q, rule) {
  const out = { ...q, voidsLeft: 0, areaChange: 0, volumeChange: 0, ruleNotes: [] };
  if (!ruleActive(rule) || !r.computed || r.computed.status !== "ok" || !r.computed.openings) return out;
  let left = 0;
  if (q.volume != null && r.computed.voids && rule.volumeMax > 0) {
    const b = basis(r, q, "volume");
    if (b && r.computed.net != null) {
      const a = adjust(q.volume, b, r.computed.voids.map((v) => v.volume), r.computed.gross - r.computed.net, rule.volumeMax);
      out.volume = a.value; out.volumeChange = a.change; left = Math.max(left, a.left);
      if (a.note) out.ruleNotes.push(`volume: ${a.note}`);
    } else if (r.computed.voids.some((v) => v.volume > 0 && v.volume <= rule.volumeMax)) out.ruleNotes.push("volume: the figure's basis (net or gross) is not known, so it is used as it is");
  }
  const S = sectionOf(r);
  if (q.area != null && S?.voids && rule.areaMax > 0) {
    const b = basis(r, q, "area");
    if (b && S.net != null && S.gross != null) {
      const a = adjust(q.area, b, S.voids, S.gross - S.net, rule.areaMax);
      out.area = a.value; out.areaChange = a.change; left = Math.max(left, a.left);
      if (a.note) out.ruleNotes.push(`area: ${a.note}`);
    } else if (S.voids.some((v) => v != null && v > 0 && v <= rule.areaMax)) out.ruleNotes.push("area: the figure's basis (net or gross) is not known, so it is used as it is");
  }
  out.voidsLeft = left;
  return out;
}

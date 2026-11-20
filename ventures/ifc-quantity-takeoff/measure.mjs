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

// A rule may also set its own thresholds per work section, because methods of
// measurement do: a void left in masonry is judged by its area, one left in
// in-situ concrete by its volume, and finishes by their own figure. `sections`
// maps a section key below to { areaMax, volumeMax }; a section it does not
// name takes the rule's own two numbers, and a number a section leaves out
// takes the rule's number too.
export const SECTIONS = {
  walls: { label: "Walls", test: /^IFCWALL/ },
  slabs: { label: "Slabs and roofs", test: /^IFC(SLAB|ROOF)/ },
  coverings: { label: "Coverings and finishes", test: /^IFCCOVERING/ },
  frames: { label: "Beams, columns and members", test: /^IFC(BEAM|COLUMN|MEMBER)/ },
  other: { label: "Everything else", test: /./ },
};

/** The work section an IFC class (IFCWALLSTANDARDCASE, IfcSlab ...) falls in. */
export function sectionKey(ifcType) {
  const t = String(ifcType || "").toUpperCase();
  for (const [k, s] of Object.entries(SECTIONS)) if (s.test.test(t)) return k;
  return "other";
}

export const PRESETS = {
  all: { label: "Deduct every opening (as modelled)", areaMax: 0, volumeMax: 0 },
  small: { label: "Leave in voids up to 0.50 m2 / 0.05 m3", areaMax: 0.5, volumeMax: 0.05 },
  sections: {
    label: "By work section: walls and finishes by area (0.50 m2), concrete slabs and frames by volume (0.05 m3)",
    areaMax: 0, volumeMax: 0,
    sections: {
      walls: { areaMax: 0.5, volumeMax: 0.05 },
      coverings: { areaMax: 0.5, volumeMax: 0 },
      slabs: { areaMax: 0, volumeMax: 0.05 },
      frames: { areaMax: 0, volumeMax: 0.05 },
    },
  },
  custom: { label: "Custom thresholds" },
};

const pos = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/** The two thresholds `rule` sets for an element of class `ifcType`. */
export const ruleFor = (rule, ifcType) => sectionRule(rule, sectionKey(ifcType));

/** The two thresholds `rule` sets for work section `key`. */
export function sectionRule(rule, key) {
  if (!rule) return { areaMax: 0, volumeMax: 0 };
  const s = rule.sections?.[key];
  return {
    areaMax: pos(s && s.areaMax != null ? s.areaMax : rule.areaMax),
    volumeMax: pos(s && s.volumeMax != null ? s.volumeMax : rule.volumeMax),
  };
}

/** Is the rule one that changes anything? */
export const ruleActive = (rule) => !!rule && (pos(rule.areaMax) > 0 || pos(rule.volumeMax) > 0 || Object.values(rule.sections || {}).some((s) => s && (pos(s.areaMax) > 0 || pos(s.volumeMax) > 0)));

const fmtN = (v) => String(+(+v).toFixed(4));
const pair = (t) => !(t.areaMax > 0) && !(t.volumeMax > 0) ? "every opening deducted" : `area up to ${fmtN(t.areaMax)} m2, volume up to ${fmtN(t.volumeMax)} m3`;

/** The rule in words, for a CSV heading or the page: "area up to 0.5 m2, ...; Slabs and roofs: ...". */
export function ruleLabel(rule) {
  if (!ruleActive(rule)) return "every opening deducted";
  const base = { areaMax: pos(rule.areaMax), volumeMax: pos(rule.volumeMax) };
  const parts = [];
  const own = Object.keys(SECTIONS).filter((k) => rule.sections?.[k]);
  if (own.length < Object.keys(SECTIONS).length) parts.push((own.length ? "otherwise " : "") + pair(base));
  for (const k of own) parts.push(`${SECTIONS[k].label}: ${pair(sectionRule(rule, k))}`);
  return parts.join("; ");
}

/**
 * Read a rule from the command line's --voids-up-to text:
 *   "0.5,0.05"                          one pair for every element;
 *   "0.5,0.05;slabs=0,0.05;coverings=0.5,0"  a default pair, then per section;
 *   "slabs=0,0.05"                      a section alone (the rest deduct every opening).
 * Returns { rule } or { error }.
 */
export function parseRule(text) {
  const rule = { areaMax: 0, volumeMax: 0 };
  const nums = (t) => { const v = t.split(",").map((x) => Number(x.trim())); return v.length === 2 && v.every((x) => Number.isFinite(x) && x >= 0) ? v : null; };
  for (const part of String(text).split(";").map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z]+)\s*=\s*(.*)$/i.exec(part);
    if (m) {
      const k = m[1].toLowerCase();
      if (!SECTIONS[k]) return { error: `unknown work section '${m[1]}' (one of ${Object.keys(SECTIONS).join(", ")})` };
      const v = nums(m[2]);
      if (!v) return { error: `'${part}' needs AREA_M2,VOLUME_M3, e.g. ${k}=0,0.05` };
      (rule.sections ??= {})[k] = { areaMax: v[0], volumeMax: v[1] };
    } else {
      const v = nums(part);
      if (!v) return { error: `'${part}' needs AREA_M2,VOLUME_M3, e.g. 0.5,0.05` };
      rule.areaMax = v[0]; rule.volumeMax = v[1];
    }
  }
  return { rule };
}

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
export function applyRule(r, q, ruleIn) {
  const out = { ...q, voidsLeft: 0, areaChange: 0, volumeChange: 0, ruleNotes: [] };
  const rule = ruleFor(ruleIn, r.ifcType);
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

/**
 * Colour approval: does the factory's lab dip or printed swatch match the
 * brand's target colour? A designer's painting reproduced in ink, or a dyed
 * fabric, is approved or sent back on a colour difference. This gives that
 * number, CIEDE2000 (the CIE's 2001 formula, the one current textile and print
 * specs name; CIE 142-2001), per colour, a pass/fail against a typed limit,
 * and words to send back ("0.9 lighter, 1.4 yellower").
 *
 * Inputs: a target and a measured swatch, each as a hex colour (read as sRGB,
 * D65) or as Lab numbers from a spectrophotometer (write `lab:52.1,-3.2,18.4`).
 * Only measured Lab from the same illuminant and observer are comparable; a
 * phone photo or a screen colour is not a measurement of cloth, so the page
 * says so and a hex-versus-hex check is labelled "screen colours".
 *
 * Pinned in colour.test.mjs on the 34-pair test set published by Sharma, Wu and
 * Dalal (2005, Color Research and Application 30:21-30), the usual check that
 * an implementation has not mixed up the hue-rotation or mean-hue branches.
 */
import { toLab } from "./separation.mjs";

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

/** CIEDE2000 between two Lab colours [L,a,b] (kL = kC = kH = 1). */
export function ciede2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp /= 2;
  else hbp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + 0.015 * (Lbp - 50) ** 2 / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  const x = dLp / Sl, y = dCp / Sc, z = dHp / Sh;
  return Math.sqrt(x * x + y * y + z * z + Rt * y * z);
}

/** Parse "#c8102e", "c8102e", "#fa0" or "lab:52.1,-3.2,18.4" to {lab, kind}. Throws a plain sentence on junk. */
export function parseColour(text) {
  const s = String(text ?? "").trim();
  const m = /^lab\s*:\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/i.exec(s);
  if (m) {
    const lab = [+m[1], +m[2], +m[3]];
    if (lab[0] < 0 || lab[0] > 100) throw new Error(`L must be 0 to 100, got ${lab[0]}.`);
    if (Math.abs(lab[1]) > 140 || Math.abs(lab[2]) > 140) throw new Error("a and b are within about -140 to 140.");
    return { lab, kind: "lab" };
  }
  let h = s.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map(c => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`"${s}" is not a hex colour (#c8102e) or lab:L,a,b.`);
  const v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return { lab: toLab(...v), kind: "hex" };
}

export const LIMITS = { tight: 1, usual: 2, loose: 3.5 };

const r1 = v => Math.round(v * 10) / 10;

/** Words for the direction of the miss, from the Lab differences (sample minus target); null if all are small. */
export function direction(t, s) {
  const dL = s[0] - t[0], da = s[1] - t[1], db = s[2] - t[2], out = [];
  const add = (v, pos, neg) => { if (Math.abs(v) >= 0.5) out.push(`${r1(Math.abs(v))} ${v > 0 ? pos : neg}`); };
  add(dL, "lighter", "darker"); add(da, "redder", "greener"); add(db, "yellower", "bluer");
  return out;
}

/**
 * rows: [{name, target, sample}] (each a colour string); limit: ΔE00 limit.
 * Returns {rows:[{name, dE, verdict:"pass"|"fail", direction, screenOnly}], approved, worst, summary}.
 * Rows with an empty sample are "not measured" and block approval.
 */
export function colourCheck(rows, { limit = LIMITS.usual } = {}) {
  if (!(limit > 0 && limit <= 20)) throw new Error("The limit is a ΔE between 0 and 20.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("Add at least one colour.");
  const out = rows.map((r, i) => {
    const name = String(r.name || `Colour ${i + 1}`).slice(0, 60);
    if (!String(r.sample ?? "").trim()) return { name, dE: null, verdict: "not measured", direction: [], screenOnly: false };
    let t, s;
    try { t = parseColour(r.target); s = parseColour(r.sample); } catch (e) { throw new Error(`${name}: ${e.message}`); }
    if (t.kind !== s.kind) throw new Error(`${name}: give target and sample in the same form (both hex or both lab:), they are not comparable otherwise.`);
    const dE = ciede2000(t.lab, s.lab);
    return { name, dE: Math.round(dE * 100) / 100, verdict: dE <= limit ? "pass" : "fail", direction: direction(t.lab, s.lab), screenOnly: t.kind === "hex" };
  });
  const measured = out.filter(r => r.dE !== null);
  const failed = out.filter(r => r.verdict === "fail");
  const worst = measured.length ? measured.reduce((a, b) => (b.dE > a.dE ? b : a)) : null;
  const approved = failed.length === 0 && measured.length === out.length;
  const summary = !measured.length ? "Type the measured colour for at least one row."
    : failed.length ? `${failed.length} of ${measured.length} colours over ΔE ${limit}; worst ${worst.name} at ${worst.dE}.`
    : approved ? `All ${out.length} colours within ΔE ${limit}; worst ${worst.name} at ${worst.dE}.`
    : `${measured.length} of ${out.length} measured, all within ΔE ${limit}; ${out.length - measured.length} still to measure.`;
  return { rows: out, approved, worst, limit, summary };
}

/** A note to the factory for the colours that failed. */
export function colourComments(check, what = "the lab dip") {
  const bad = check.rows.filter(r => r.verdict === "fail");
  if (!bad.length) return check.approved ? `Colour approved: ${what} is within ΔE2000 ${check.limit} of the target on every colour.` : `No colour has failed yet.`;
  return `Colour is not approved. ${what[0].toUpperCase() + what.slice(1)} is outside ΔE2000 ${check.limit} on:\n` +
    bad.map(r => `- ${r.name}: ΔE ${r.dE}${r.direction.length ? " (sample is " + r.direction.join(", ") + " than the target)" : ""}`).join("\n") +
    "\nPlease resubmit under the same illuminant and observer.";
}

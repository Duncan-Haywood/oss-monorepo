/**
 * French textile extended producer responsibility (Refashion eco-contribution):
 * what a brand that sells clothing to shoppers in France owes per piece, and
 * whether the simplified flat rate or a declared per-line rate costs less.
 *
 * Fees are per piece placed on the French market, by product line and target
 * (adult/child, women/men). The figures below are the few lines seen in
 * search snippets of Refashion's 2025/2026 guides on 2026-11-08; the full
 * annex was not read and the host was unreachable. They are EXAMPLES to
 * overwrite with the current schedule, not a schedule. Arithmetic only.
 */
export const LINES = {
  "tee-men": { name: "T-shirt, adult men", eur: 0.0396, source: "Projet Celsius article citing the 2026 standard schedule" },
  "skirt-women": { name: "Skirt, adult women", eur: 0.0481, source: "Refashion 2026 guide extract (search snippet)" },
  "dress-child": { name: "Dress, child 4-14", eur: 0.0335, source: "Refashion 2026 guide extract (search snippet)" },
  "sport-set-men": { name: "Two-piece sports set, adult men", eur: 0.1521, source: "Refashion 2026 guide extract (search snippet)" },
};
// Flat per-piece rate for the simplified regime. 2025 schedule value; an
// intermediary quotes 0.5799 for 2026 (unverified). Overridable.
export const SIMPLIFIED_EUR = 0.5271;

const num = (v, name, { min = 0 } = {}) => {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (v === "" || v == null || !Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of at least ${min}.`);
  return n;
};

/** rows: [{line, units, eurPerPiece?}] -> totals for the detailed and the simplified regimes. */
export function eprFee({ rows, simplifiedEur = SIMPLIFIED_EUR, landedPerPiece = null }) {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Add at least one product line." };
  try {
    const simp = num(simplifiedEur, "Simplified rate");
    const out = rows.map((r, i) => {
      const units = num(r.units, `Row ${i + 1} pieces`);
      const rate = r.eurPerPiece === "" || r.eurPerPiece == null ? (LINES[r.line] || {}).eur : num(r.eurPerPiece, `Row ${i + 1} rate`);
      if (rate == null) throw new Error(`Row ${i + 1}: pick a line or type a rate.`);
      const detailed = Math.round(units * rate * 100) / 100;
      const simplified = Math.round(units * simp * 100) / 100;
      return { name: (LINES[r.line] || {}).name || "Custom line", units, rate, detailed, simplified };
    });
    const sum = k => Math.round(out.reduce((a, r) => a + r[k], 0) * 100) / 100;
    const pieces = out.reduce((a, r) => a + r.units, 0);
    const detailed = sum("detailed"), simplified = sum("simplified");
    const best = detailed <= simplified ? "detailed" : "simplified";
    const notes = [];
    if (landedPerPiece != null && pieces > 0) {
      const l = num(landedPerPiece, "Landed cost");
      notes.push(`Cheaper route is ${(Math.min(detailed, simplified) / pieces).toFixed(4)} EUR a piece, ${l > 0 ? (100 * Math.min(detailed, simplified) / pieces / l).toFixed(2) + "% of a " + l.toFixed(2) + " EUR landed cost" : "n/a"}.`);
    }
    notes.push("The simplified regime is a flat rate that does not need per-line detail; whether you may use it depends on Refashion's rules for your size. Check the current schedule and registration duties (an authorised representative is needed if you sell to France from abroad).");
    return { ok: true, rows: out, pieces, detailed, simplified, best, saving: Math.round(Math.abs(detailed - simplified) * 100) / 100, notes };
  } catch (e) { return { ok: false, error: e.message }; }
}

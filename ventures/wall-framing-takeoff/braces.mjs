// @ts-check
// Diagonal wall braces as a typed rule (the page behind `fasteners.wallBracing`):
// every wall at least `minWallLength` in long gets ceil(length / spacing)
// braces, each height / sin(angle) long. Which walls are braced wall lines and
// the method (let-in, metal T-brace, sheathing) are the engineer's call; this
// only counts a rule you type. Inches throughout.
const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * @param {{walls: number[], height: number, spacing?: number, minWallLength?: number, angle?: number, pricePerBrace?: number|null}} o
 */
export function braceReport(o) {
  const errors = [];
  if (!o || !Array.isArray(o.walls) || o.walls.length < 1 || o.walls.length > 200) return { ok: false, errors: ["Type 1 to 200 wall lengths."] };
  const spacing = o.spacing ?? 300, minLen = o.minWallLength ?? 48, angle = o.angle ?? 45;
  if (!o.walls.every((l) => num(l, 12, 1200))) errors.push("Each wall length must be 1 ft to 100 ft (12 to 1200 in).");
  if (!num(o.height, 48, 240)) errors.push("Wall height must be 4 ft to 20 ft (48 to 240 in).");
  if (!num(spacing, 24, 1200)) errors.push("Spacing must be 2 ft to 100 ft (24 to 1200 in).");
  if (!num(minLen, 0, 1200)) errors.push("Shortest braced wall must be 0 to 100 ft.");
  if (!num(angle, 30, 60)) errors.push("Brace angle must be 30 to 60 degrees.");
  if (o.pricePerBrace != null && !num(o.pricePerBrace, 0, 10000)) errors.push("Price per brace must be 0 to 10,000.");
  if (errors.length) return { ok: false, errors };
  const braceIn = o.height / Math.sin((angle * Math.PI) / 180);
  // a brace at this angle spans height / tan(angle) horizontally; the wall must be at least that long
  const run = o.height / Math.tan((angle * Math.PI) / 180);
  const rows = o.walls.map((length, i) => {
    const braced = length >= minLen - 1e-9;
    const count = braced ? Math.ceil(length / spacing - 1e-9) : 0;
    return { wall: i + 1, length, braced, count, fits: braced ? length >= run * count - 1e-9 : true, feet: (count * braceIn) / 12 };
  });
  const count = rows.reduce((t, r) => t + r.count, 0);
  const feet = Math.round(rows.reduce((t, r) => t + r.feet, 0) * 100) / 100;
  const cost = o.pricePerBrace != null ? Math.round(count * o.pricePerBrace * 100) / 100 : null;
  return { ok: true, rows, count, feet, braceInches: Math.round(braceIn * 100) / 100, runInches: Math.round(run * 100) / 100, cost, bracedWalls: rows.filter((r) => r.braced).length };
}

export function braceText(r) {
  if (!r.ok) return r.errors;
  const l = [`Brace length ${(r.braceInches / 12).toFixed(2)} ft, horizontal run ${(r.runInches / 12).toFixed(2)} ft each`];
  for (const w of r.rows) l.push(`Wall ${w.wall}: ${(w.length / 12).toFixed(1)} ft, ${w.braced ? `${w.count} brace(s)${w.fits ? "" : " (the wall is shorter than the braces' run)"}` : "too short, no brace"}`);
  l.push(`Total ${r.count} brace(s) on ${r.bracedWalls} wall(s), ${r.feet.toFixed(1)} ft of brace${r.cost != null ? `, ${r.cost.toFixed(2)}` : ""}`);
  return l;
}

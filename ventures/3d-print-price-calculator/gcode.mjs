// Read the two numbers a seller otherwise retypes from the slicer -- grams of
// filament and print time -- out of the slicer's own G-code comments.
// Pure text parsing: no network, no state, and the file is never uploaded
// (the page reads it with FileReader in the browser).
//
// Formats recognised, each from the comment block the slicer writes itself:
//   PrusaSlicer / SuperSlicer / OrcaSlicer / Bambu Studio
//     ; filament used [g] = 12.3          ; total filament weight [g] : 12.3
//     ; estimated printing time (normal mode) = 1d 2h 3m 4s
//     ; total estimated time: 1h 2m 3s   (Bambu header)
//   Cura        ;TIME:11234 (seconds)     ;Filament used: 12.345m
//   Simplify3D  ;   Build time: 3 hours 12 minutes   ;   Plastic weight: 36.80 g
//
// Cura reports length, not weight, so grams are derived from length with the
// diameter and density the caller gives (defaults: 1.75 mm, PLA 1.24 g/cm3)
// and the result says so in `derived`. Multi-material files list one value per
// extruder separated by commas; they are summed.

function sumList(text) {
  const parts = text.split(/[,;]/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

/** "1d 2h 3m 4s", "3h 12m", "45m 10s", "3 hours 12 minutes" -> seconds, or null. */
export function parseDuration(text) {
  const units = { d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  let found = false;
  for (const m of String(text).matchAll(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi)) {
    total += Number(m[1]) * units[m[2][0].toLowerCase()];
    found = true;
  }
  return found ? total : null;
}

const line = (text, re) => {
  const m = re.exec(text);
  return m ? m[1].trim() : null;
};

export function parseGcode(text, { diameterMm = 1.75, densityGPerCm3 = 1.24 } = {}) {
  const src = String(text ?? "");
  let grams = null;
  let seconds = null;
  let lengthMm = null;
  let slicer = null;
  const derived = [];

  const g = line(src, /^;\s*(?:total )?filament (?:used \[g\]|weight \[g\])\s*[=:]\s*(.+)$/im);
  if (g !== null) { grams = sumList(g); slicer = "PrusaSlicer-family"; }

  const t = line(src, /^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)$/im)
    ?? line(src, /^;\s*total estimated time:\s*(.+)$/im);
  if (t !== null) { seconds = parseDuration(t); slicer = slicer ?? "PrusaSlicer-family"; }

  const mm = line(src, /^;\s*filament used \[mm\]\s*=\s*(.+)$/im);
  if (mm !== null) lengthMm = sumList(mm);

  const cura = line(src, /^;TIME:\s*(\d+(?:\.\d+)?)\s*$/im);
  if (seconds === null && cura !== null) { seconds = Number(cura); slicer = "Cura"; }
  const curaLen = line(src, /^;Filament used:\s*(.+)$/im);
  if (curaLen !== null && lengthMm === null) {
    const metres = sumList(curaLen.replace(/m\b/gi, ""));
    if (metres !== null) { lengthMm = metres * 1000; slicer = slicer ?? "Cura"; }
  }

  const s3d = line(src, /^;\s*Plastic weight:\s*([\d.]+)\s*g/im);
  if (grams === null && s3d !== null) { grams = Number(s3d); slicer = "Simplify3D"; }
  const s3dTime = line(src, /^;\s*Build time:\s*(.+)$/im);
  if (seconds === null && s3dTime !== null) { seconds = parseDuration(s3dTime); slicer = slicer ?? "Simplify3D"; }
  const s3dLen = line(src, /^;\s*Filament length:\s*([\d.]+)\s*mm/im);
  if (lengthMm === null && s3dLen !== null) lengthMm = Number(s3dLen);

  if (grams === null && lengthMm !== null) {
    const area = Math.PI * (diameterMm / 2) ** 2; // mm^2
    grams = (lengthMm * area / 1000) * densityGPerCm3; // mm^3 -> cm^3 -> g
    derived.push(`grams computed from ${lengthMm.toFixed(0)} mm of ${diameterMm} mm filament at ${densityGPerCm3} g/cm³`);
  }

  const ok = grams !== null && seconds !== null;
  return {
    ok,
    slicer,
    grams: grams === null ? null : Math.round(grams * 100) / 100,
    hours: seconds === null ? null : Math.round((seconds / 3600) * 100) / 100,
    lengthMm,
    derived,
    missing: [grams === null ? "filament weight" : null, seconds === null ? "print time" : null].filter(Boolean),
  };
}

// A synthetic placeholder year for the page's example: an invented all-season house with rooftop solar.
// Nothing here is a real home or a real meter. Deterministic (seeded), so tests and the guide agree.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sun elevation factor (sine of elevation, 0 at night) at latitude 36 N for a day of year and solar hour. */
function sunUp(doy, hour) {
  const lat = (36 * Math.PI) / 180;
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const ha = ((hour - 12) * 15 * Math.PI) / 180;
  return Math.max(0, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha));
}

/**
 * Hourly net kWh for the calendar year `year`: use (base, morning and evening peaks, summer cooling,
 * winter heating, noise) minus a `pvKw` array's output (clear-sky shape x a cloud draw per day x 0.8).
 * Returns { start, net: Float64Array, use, solar }.
 */
export function syntheticYear({ year = 2025, pvKw = 5, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const start = Date.UTC(year, 0, 1);
  const n = (Date.UTC(year + 1, 0, 1) - start) / 3600000;
  const net = new Float64Array(n), use = new Float64Array(n), solar = new Float64Array(n);
  let cloud = 1;
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 3600000);
    const doy = Math.floor(i / 24) + 1, h = d.getUTCHours();
    if (h === 0) cloud = rnd() < 0.18 ? 0.25 + 0.4 * rnd() : 0.85 + 0.15 * rnd();
    const season = Math.cos((2 * Math.PI * (doy - 200)) / 365); // 1 in mid-July, -1 in mid-January
    const heat = Math.max(0, season) ** 2 * (h >= 13 && h <= 21 ? 1.8 * Math.sin((Math.PI * (h - 12)) / 10) : 0.25);
    const cold = Math.max(0, -season) * (h >= 6 && h <= 9 ? 0.6 : h >= 17 && h <= 22 ? 0.5 : 0.15);
    const routine = 0.35 + (h >= 6 && h <= 8 ? 0.5 : 0) + (h >= 17 && h <= 21 ? 0.9 : 0) + (h >= 22 || h <= 5 ? -0.05 : 0.1);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const u = Math.max(0.15, routine + (weekend && h >= 9 && h <= 16 ? 0.35 : 0) + heat + cold + 0.25 * (rnd() - 0.5));
    // Daylight saving shifts solar noon to about 13:00 on the wall clock from mid-March to early November.
    const dst = doy >= 70 && doy <= 308 ? 1 : 0;
    const s = pvKw * 0.8 * cloud * sunUp(doy, h + 0.5 - dst);
    use[i] = u; solar[i] = s; net[i] = u - s;
  }
  return { start, net, use, solar };
}

/** The synthetic year as a CSV in the Green Button (Opower) layout, so the example goes through the real reader. */
export function exampleCsv(opts) {
  const { start, net } = syntheticYear(opts);
  const pad = (x) => String(x).padStart(2, "0");
  const lines = ["TYPE,DATE,START TIME,END TIME,USAGE (kWh),NOTES"];
  for (let i = 0; i < net.length; i++) {
    const d = new Date(start + i * 3600000);
    const date = d.toISOString().slice(0, 10);
    lines.push(`Electric usage,${date},${pad(d.getUTCHours())}:00,${pad(d.getUTCHours())}:59,${net[i].toFixed(2)},`);
  }
  return lines.join("\n");
}

/** Example battery sizes for the sweep: usable kWh and inverter kW (common home-battery shapes, not products). */
export const SIZES = [
  { kwh: 5, kw: 3.8 },
  { kwh: 10, kw: 5 },
  { kwh: 13.5, kw: 5 },
  { kwh: 20, kw: 7.6 },
  { kwh: 27, kw: 10 },
  { kwh: 40, kw: 11.5 },
];

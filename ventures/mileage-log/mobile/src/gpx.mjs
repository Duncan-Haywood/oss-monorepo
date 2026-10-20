// Reads a recorded GPS track (GPX 1.0/1.1) into the fix format tripdetect.mjs
// takes, so the detector's thresholds can be tuned on real drives instead of
// simulated ones. No XML library: GPX trackpoints are flat enough for a scan.
//
// A fix is { lat, lon, t (ms), speed (m/s or null), accuracy (m or null) }.
// Points with no time are skipped (nothing to replay). <speed> (m/s) is read
// from the point or its <extensions>; <hdop> x 5 m stands in for accuracy.

const attr = (s, name) => { const m = s.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`)); return m ? Number(m[1]) : NaN; };
const tag = (s, name) => { const m = s.match(new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`)); return m ? m[1] : null; };

export function parseGpx(xml) {
  const fixes = [];
  const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  let m;
  while ((m = re.exec(String(xml)))) {
    const lat = attr(m[1], "lat"), lon = attr(m[1], "lon");
    const time = tag(m[2] || "", "time");
    const t = time ? Date.parse(time) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const sp = tag(m[2] || "", "speed"), hd = tag(m[2] || "", "hdop");
    const speed = sp != null && Number.isFinite(Number(sp)) && Number(sp) >= 0 ? Number(sp) : null;
    const accuracy = hd != null && Number.isFinite(Number(hd)) ? Number(hd) * 5 : null;
    fixes.push({ lat, lon, t, speed, accuracy });
  }
  return fixes.sort((a, b) => a.t - b.t);
}

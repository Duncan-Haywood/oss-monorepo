// GPX track file checker. Pure functions, no I/O, no network.
// Rules are read from memory of the GPX 1.1 schema and the upload behaviour commonly reported for Strava,
// Garmin Connect, Komoot and similar services; confirm against the current documents.

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

const NS11 = "http://www.topografix.com/GPX/1/1";
const R = 6371008.8;
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const lineOf = (text, idx) => { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; };
const attr = (s, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(s); return m ? (m[2] ?? m[3]) : null; };
const child = (body, tag) => { const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(body); return m ? m[1].trim() : null; };
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Returns { root, segments:[{kind, start, line, points:[{lat,lon,ele,time,line,raw,index}]}], waypoints }
export function parse(text) {
  const rootM = /<gpx\b([^>]*)>/.exec(text);
  const root = rootM ? { attrs: rootM[1], line: lineOf(text, rootM.index), index: rootM.index, end: rootM.index + rootM[0].length } : null;
  const segments = [];
  const segRe = /<(trkseg|rte)\b[^>]*>([\s\S]*?)<\/\1>|<(trkseg|rte)\b[^>]*\/>/g;
  let m;
  while ((m = segRe.exec(text))) {
    const kind = m[1] || m[3];
    const body = m[2] || "";
    const ptTag = kind === "rte" ? "rtept" : "trkpt";
    const points = [];
    const ptRe = new RegExp(`<${ptTag}\\b([^>]*?)(/>|>([\\s\\S]*?)</${ptTag}>)`, "g");
    let p;
    while ((p = ptRe.exec(body))) {
      const abs = m.index + m[0].indexOf(body) + p.index;
      const a = p[1], inner = p[3] || "";
      const lat = attr(a, "lat"), lon = attr(a, "lon");
      points.push({
        rawLat: lat, rawLon: lon,
        lat: lat === null ? NaN : Number(lat), lon: lon === null ? NaN : Number(lon),
        ele: child(inner, "ele"), time: child(inner, "time"),
        line: lineOf(text, abs), raw: p[0], index: points.length,
      });
    }
    segments.push({ kind, line: lineOf(text, m.index), raw: m[0], points });
  }
  const waypoints = (text.match(/<wpt\b/g) || []).length;
  return { root, segments, waypoints };
}

export function validate(text, opts = {}) {
  const maxSpeed = opts.maxSpeedMs ?? 70; // m/s; 252 km/h is above any ground activity this tool targets
  const findings = [];
  const add = (severity, code, message, line) => findings.push({ severity, code, message, line: line || 0 });
  const g = parse(text);

  if (!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<gpx\b/.test(text)) {
    add("error", "not-gpx", "The file does not start with a <gpx> element (after an optional XML declaration). Apps will refuse it.", 1);
  }
  if (!g.root) {
    return { findings, summary: summarise(findings, g, null), stats: null };
  }
  if (!/<\/gpx\s*>\s*$/.test(text)) add("error", "unclosed-gpx", "The closing </gpx> tag is missing or followed by other text; the file may have been cut off during export.", lineOf(text, text.length));
  const ver = attr(g.root.attrs, "version");
  if (ver === null) add("error", "no-version", 'The <gpx> element has no version attribute. GPX requires version="1.1" (or "1.0").', g.root.line);
  else if (ver !== "1.1" && ver !== "1.0") add("warning", "odd-version", `GPX version "${ver}" is not 1.0 or 1.1.`, g.root.line);
  if (attr(g.root.attrs, "creator") === null) add("error", "no-creator", "The <gpx> element has no creator attribute, which the GPX schema requires and some uploaders insist on.", g.root.line);
  const xmlns = attr(g.root.attrs, "xmlns");
  if (xmlns === null) add("error", "no-xmlns", `The <gpx> element has no xmlns namespace; GPX 1.1 uses ${NS11}.`, g.root.line);
  else if (ver === "1.1" && xmlns !== NS11) add("warning", "wrong-xmlns", `Version 1.1 should use the namespace ${NS11}, found "${xmlns}".`, g.root.line);

  const trksegs = g.segments.filter((s) => s.kind === "trkseg");
  if (!g.segments.length && !g.waypoints) add("error", "empty", "The file contains no track segments, routes or waypoints.", g.root.line);
  else if (!g.segments.length) add("info", "waypoints-only", "The file has waypoints but no track or route; activity uploads need a track.", g.root.line);

  let dist = 0, dur = 0, gain = 0, loss = 0, total = 0, withTime = 0, lastEle = null;
  let firstT = null, lastT = null;
  for (const seg of g.segments) {
    if (!seg.points.length) { add("warning", "empty-segment", `This <${seg.kind}> has no points.`, seg.line); continue; }
    let prev = null, prevT = null, missingTime = 0, outOfOrder = 0, dupTime = 0;
    for (const pt of seg.points) {
      total++;
      let ok = true;
      if (pt.rawLat === null || pt.rawLon === null || Number.isNaN(pt.lat) || Number.isNaN(pt.lon)) {
        add("error", "bad-coordinate", "A point has a missing or non-numeric lat/lon.", pt.line); ok = false;
      } else {
        if (pt.lat < -90 || pt.lat > 90) { add("error", "lat-range", `Latitude ${pt.lat} is outside -90..90.`, pt.line); ok = false; }
        if (pt.lon < -180 || pt.lon > 180) { add("error", "lon-range", `Longitude ${pt.lon} is outside -180..180 (a swapped lat/lon is the usual cause).`, pt.line); ok = false; }
        if (ok && pt.lat === 0 && pt.lon === 0) { add("warning", "null-island", "A point sits at exactly 0,0 (off the coast of Africa), which is what a GPS records with no fix.", pt.line); ok = false; }
      }
      if (pt.ele !== null) {
        const e = Number(pt.ele);
        if (!Number.isFinite(e)) add("warning", "bad-ele", `Elevation "${pt.ele}" is not a number.`, pt.line);
        else if (e > 9000 || e < -500) add("warning", "ele-range", `Elevation ${e} m is outside -500..9000 m.`, pt.line);
        else { if (lastEle !== null) { const d = e - lastEle; if (d > 0) gain += d; else loss -= d; } lastEle = e; }
      }
      let t = null;
      if (pt.time === null) missingTime++;
      else if (!ISO_UTC.test(pt.time)) { add("warning", "time-format", `Time "${pt.time}" is not ISO 8601 UTC like 2026-05-01T08:30:00Z; apps may read it in the wrong zone or reject it.`, pt.line); const d = Date.parse(pt.time); if (!Number.isNaN(d)) t = d; }
      else t = Date.parse(pt.time);
      if (t !== null && Number.isNaN(t)) { add("error", "time-invalid", `Time "${pt.time}" is not a real date.`, pt.line); t = null; }
      if (t !== null) {
        withTime++;
        if (firstT === null) firstT = t; lastT = t;
        if (prevT !== null) {
          if (t < prevT) { outOfOrder++; add("error", "time-order", "This point is timestamped earlier than the point before it; pace and distance will be wrong or the upload rejected.", pt.line); }
          else if (t === prevT) dupTime++;
        }
      }
      if (ok && prev && prev.ok) {
        const d = haversine(prev, pt);
        dist += d;
        if (t !== null && prev.t !== null && t > prev.t) {
          const v = d / ((t - prev.t) / 1000);
          if (v > maxSpeed) add("warning", "jump", `Moves ${Math.round(d)} m in ${Math.round((t - prev.t) / 1000)} s (${Math.round(v * 3.6)} km/h): a GPS jump rather than movement.`, pt.line);
        }
        if (t !== null && prev.t !== null && t - prev.t > 300000) add("info", "gap", `${Math.round((t - prev.t) / 60000)} minutes pass since the previous point; apps may count this as a pause or a gap.`, pt.line);
      }
      if (ok) prev = { lat: pt.lat, lon: pt.lon, t, ok: true };
      if (t !== null) prevT = t;
    }
    if (missingTime && missingTime < seg.points.length) add("warning", "partial-time", `${missingTime} of ${seg.points.length} points in this ${seg.kind} have no <time>.`, seg.line);
    else if (missingTime && seg.kind === "trkseg") add("warning", "no-time", "No point in this track segment has a <time>, so no pace, speed or duration can be computed and most activity uploads will fail.", seg.line);
    if (dupTime) add("info", "dup-time", `${dupTime} point(s) in this segment repeat the previous timestamp.`, seg.line);
  }
  if (firstT !== null && lastT !== null && lastT >= firstT) dur = (lastT - firstT) / 1000;
  const stats = { points: total, withTime, distanceM: Math.round(dist), durationS: Math.round(dur), gainM: Math.round(gain), lossM: Math.round(loss), segments: trksegs.length };
  return { findings, summary: summarise(findings, g, stats), stats };
}

function summarise(findings, g, stats) {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    points: stats ? stats.points : 0,
    segments: g.segments.length,
  };
}

// Applies only provable fixes. Returns { text, changes }.
export function repair(text) {
  const g = parse(text);
  const changes = [];
  if (!g.root) return { text, changes };
  let out = text;
  // 1. Drop exact no-fix (0,0) points, byte-identical consecutive duplicates and empty segments.
  const drop = [];
  for (const seg of g.segments) {
    if (!seg.points.length) { if (seg.kind === "trkseg") drop.push({ raw: seg.raw, why: `removed an empty <trkseg> (line ${seg.line})` }); continue; }
    let prevRaw = null;
    for (const pt of seg.points) {
      const norm = pt.raw.replace(/\s+/g, " ");
      if (pt.lat === 0 && pt.lon === 0) drop.push({ raw: pt.raw, why: `removed the 0,0 no-fix point on line ${pt.line}` });
      else if (prevRaw !== null && norm === prevRaw) drop.push({ raw: pt.raw, why: `removed an exact duplicate of the previous point on line ${pt.line}`, dup: true });
      prevRaw = norm;
    }
  }
  for (const d of drop) { const i = out.indexOf(d.raw); if (i >= 0) { const before = out.length; out = out.slice(0, i) + out.slice(i + d.raw.length); if (out.length < before) changes.push(d.why); } }
  // 2. Root element: version, creator, xmlns.
  const r = /<gpx\b([^>]*)>/.exec(out);
  let attrs = r[1];
  const add = [];
  if (attr(attrs, "version") === null) { add.push('version="1.1"'); changes.push('added version="1.1" to <gpx>'); }
  if (attr(attrs, "creator") === null) { add.push('creator="gpx-track-check"'); changes.push('added creator="gpx-track-check" to <gpx>'); }
  if (attr(attrs, "xmlns") === null && (attr(attrs, "version") || "1.1") === "1.1") { add.push(`xmlns="${NS11}"`); changes.push("added the GPX 1.1 namespace to <gpx>"); }
  if (add.length) {
    const selfClose = attrs.endsWith("/");
    const base = selfClose ? attrs.slice(0, -1) : attrs;
    out = out.slice(0, r.index) + `<gpx${base} ${add.join(" ")}${selfClose ? "/" : ""}>` + out.slice(r.index + r[0].length);
  }
  // 3. XML declaration.
  if (!/^\s*<\?xml/.test(out)) { out = '<?xml version="1.0" encoding="UTF-8"?>\n' + out.replace(/^\s+/, ""); changes.push("added the XML declaration"); }
  return { text: out, changes };
}

export function findingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["line,severity,code,message", ...result.findings.map((f) => [f.line, f.severity, f.code, q(f.message)].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  const pts = [[48.8566, 2.3522, 35, "2026-05-01T08:00:00Z"], [48.8570, 2.3530, 36, "2026-05-01T08:00:10Z"], [48.8576, 2.3541, 38, "2026-05-01T08:00:20Z"], [48.8581, 2.3552, 37, "2026-05-01T08:00:30Z"]];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Example" xmlns="${NS11}">\n  <trk><name>Morning run</name><trkseg>\n${pts.map(([la, lo, e, t]) => `    <trkpt lat="${la}" lon="${lo}"><ele>${e}</ele><time>${t}</time></trkpt>`).join("\n")}\n  </trkseg></trk>\n</gpx>\n`;
}

export function sampleBrokenFile() {
  return `<gpx>\n  <trk><name>Ride</name><trkseg>\n    <trkpt lat="48.8566" lon="2.3522"><ele>35</ele><time>2026-05-01T08:00:00Z</time></trkpt>\n    <trkpt lat="48.8566" lon="2.3522"><ele>35</ele><time>2026-05-01T08:00:00Z</time></trkpt>\n    <trkpt lat="0" lon="0"><time>2026-05-01T08:00:10Z</time></trkpt>\n    <trkpt lat="48.9100" lon="2.5000"><ele>12000</ele><time>2026-05-01T08:00:20Z</time></trkpt>\n    <trkpt lat="2.3600" lon="148.8600"><time>2026-05-01T07:59:00Z</time></trkpt>\n    <trkpt lat="48.8590" lon="2.3560"><time>05/01/2026 8:01 AM</time></trkpt>\n  </trkseg><trkseg></trkseg></trk>\n</gpx>\n`;
}

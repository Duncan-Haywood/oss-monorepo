// A year of weather prepared for rows.mjs: sun vectors and irradiance
// components on a regular time step. Two sources:
//   clearSkyYear(): Ineichen-Perez clear sky, every step of a non-leap year,
//     with a typed Linke turbidity and a typed daytime air temperature.
//   parseWeatherFile(): a typical-year file the user downloads for free:
//     PVGIS TMY CSV (EU Joint Research Centre), NSRDB PSM CSV (NREL), or any
//     CSV with a timestamp and GHI, DNI and DHI columns.
// Clear sky has more beam than any real climate, so it overstates both the
// yield and the shading loss; a typical-year file is the better input.

import { sunPosition, clearSky, dniExtra, dayOfYear } from "./solar.mjs";

const RAD = Math.PI / 180;

function prepare(rows, lat, lon, dtHours, source, extra = {}) {
  const n = rows.length;
  const f = () => new Float64Array(n);
  const w = { sE: f(), sN: f(), sU: f(), ghi: f(), dni: f(), dhi: f(), ext: f(), tair: f(), dt: dtHours, source, lat, lon, ...extra };
  const day = [];
  let ghiSum = 0, dniSum = 0, dhiSum = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const p = r.pos || sunPosition(r.ms, lat, lon);
    const z = p.apparentZenith * RAD, a = p.azimuth * RAD;
    w.sE[i] = Math.sin(z) * Math.sin(a);
    w.sN[i] = Math.sin(z) * Math.cos(a);
    w.sU[i] = Math.cos(z);
    w.ghi[i] = Math.max(0, r.ghi);
    w.dhi[i] = Math.max(0, r.dhi);
    // Beam with the sun below the horizon (a stamp at sunrise or sunset) is
    // dropped: there is no direction to send it.
    w.dni[i] = w.sU[i] > 0 ? Math.max(0, r.dni) : 0;
    w.ext[i] = dniExtra(dayOfYear(r.ms));
    w.tair[i] = r.tair;
    ghiSum += w.ghi[i]; dniSum += w.dni[i]; dhiSum += w.dhi[i];
    if (w.sU[i] > 0 && (w.ghi[i] > 0 || w.dhi[i] > 0)) day.push(i);
  }
  w.day = Int32Array.from(day);
  w.annualScale = (365 * 24) / (n * dtHours);
  const k = (dtHours * w.annualScale) / 1000;
  w.annual = { ghi: ghiSum * k, dni: dniSum * k, dhi: dhiSum * k };
  return w;
}

/** Clear-sky weather for every step of 2025 (UTC), sampled at the middle of
 * each step. */
export function clearSkyYear({ lat, lon, altitude = 0, linkeTurbidity = 3, airTemp = 20, stepMinutes = 60 }) {
  const rows = [];
  const start = Date.UTC(2025, 0, 1);
  const step = stepMinutes * 60000;
  for (let ms = start + step / 2; ms < Date.UTC(2026, 0, 1); ms += step) {
    const pos = sunPosition(ms, lat, lon);
    const cs = clearSky(pos.apparentZenith, dayOfYear(ms), linkeTurbidity, altitude);
    rows.push({ ms, pos, ...cs, tair: airTemp });
  }
  return prepare(rows, lat, lon, stepMinutes / 60, "clear-sky", { linkeTurbidity });
}

function splitCsvLine(line) {
  return line.split(/[,;\t]/).map((s) => s.trim().replace(/^"|"$/g, ""));
}

const num = (s) => {
  const v = Number(String(s).trim());
  return Number.isFinite(v) ? v : NaN;
};

function findCol(header, patterns) {
  const h = header.map((x) => x.toLowerCase().replace(/\s+/g, ""));
  for (const p of patterns) {
    const i = h.findIndex((x) => p.test(x));
    if (i >= 0) return i;
  }
  return -1;
}

const GHI = [/^g\(h\)$/, /^ghi$/, /^ghi_?/, /globalhorizontal/];
const DNI = [/^gb\(n\)$/, /^dni$/, /^dni_?/, /directnormal/];
const DHI = [/^gd\(h\)$/, /^dhi$/, /^dhi_?/, /diffusehorizontal/];
const TAIR = [/^t2m$/, /^temperature$/, /^temp_?air$/, /^temp$/, /^tamb$/, /^dry-?bulb/, /^airtemp/];

/** Parse a typical-year weather file. Options: lat, lon (used when the file
 * does not give them), tzHours (offset of naive timestamps in a generic CSV
 * from UTC), shiftMinutes (added to every timestamp, for files stamped at the
 * start or end of the hour), airTemp (when the file has no temperature).
 * Returns prepared weather plus `notes` and the file's own lat/lon. */
export function parseWeatherFile(text, opts = {}) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
  const notes = [];
  let lat = opts.lat, lon = opts.lon, fileLat = null, fileLon = null;
  let rows = null, source = null;
  const shift = (opts.shiftMinutes || 0) * 60000;
  const airTemp = opts.airTemp ?? 20;

  // PVGIS TMY CSV: "Latitude (decimal degrees): 45.0" lines, then
  // time(UTC),T2m,RH,G(h),Gb(n),Gd(h),... rows like 20070101:0000.
  const pvHead = lines.findIndex((l) => /^time\(utc\)/i.test(l.trim()));
  if (pvHead >= 0) {
    source = "PVGIS TMY";
    for (const l of lines.slice(0, pvHead)) {
      const mLat = l.match(/^latitude[^:]*:\s*(-?[\d.]+)/i);
      const mLon = l.match(/^longitude[^:]*:\s*(-?[\d.]+)/i);
      if (mLat) fileLat = Number(mLat[1]);
      if (mLon) fileLon = Number(mLon[1]);
    }
    const header = splitCsvLine(lines[pvHead]);
    const cG = findCol(header, GHI), cB = findCol(header, DNI), cD = findCol(header, DHI), cT = findCol(header, TAIR);
    if (cG < 0 || cB < 0 || cD < 0) throw new Error("The PVGIS file has no G(h), Gb(n) and Gd(h) columns.");
    rows = [];
    // PVGIS TMY months come from different years; each row is re-dated to a
    // common year so the series runs Jan 1 to Dec 31 in order.
    for (const l of lines.slice(pvHead + 1)) {
      const m = l.match(/^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})/);
      if (!m) { if (rows.length && l.trim()) break; continue; }
      if (m[2] === "02" && m[3] === "29") continue;
      const c = splitCsvLine(l);
      rows.push({ ms: Date.UTC(2025, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) + shift, ghi: num(c[cG]), dni: num(c[cB]), dhi: num(c[cD]), tair: cT >= 0 ? num(c[cT]) : airTemp });
    }
  }

  // NSRDB PSM CSV: metadata header row, metadata values row, then
  // Year,Month,Day,Hour,Minute,...,GHI,DNI,DHI,... in local standard time.
  if (!rows) {
    const h0 = splitCsvLine(lines[0] || "");
    const iTz = h0.findIndex((x) => /^time ?zone$/i.test(x));
    if (/^source$/i.test(h0[0] || "") && iTz >= 0) {
      source = "NSRDB";
      const meta = splitCsvLine(lines[1] || "");
      const tz = num(meta[iTz]);
      const iLat = h0.findIndex((x) => /^latitude$/i.test(x));
      const iLon = h0.findIndex((x) => /^longitude$/i.test(x));
      if (iLat >= 0) fileLat = num(meta[iLat]);
      if (iLon >= 0) fileLon = num(meta[iLon]);
      const header = splitCsvLine(lines[2] || "");
      const col = (name) => header.findIndex((x) => x.toLowerCase() === name);
      const cY = col("year"), cM = col("month"), cDy = col("day"), cH = col("hour"), cMi = col("minute");
      const cG = findCol(header, GHI), cB = findCol(header, DNI), cD = findCol(header, DHI), cT = findCol(header, TAIR);
      if ([cM, cDy, cH, cG, cB, cD].some((x) => x < 0)) throw new Error("The NSRDB file needs Month, Day, Hour, GHI, DNI and DHI columns.");
      if (!Number.isFinite(tz)) throw new Error("The NSRDB file's Time Zone value is not a number.");
      rows = [];
      for (const l of lines.slice(3)) {
        if (!l.trim()) continue;
        const c = splitCsvLine(l);
        const mo = num(c[cM]), dy = num(c[cDy]);
        if (mo === 2 && dy === 29) continue;
        const ms = Date.UTC(2025, mo - 1, dy, num(c[cH]), cMi >= 0 ? num(c[cMi]) : 0) - tz * 3600000 + shift;
        rows.push({ ms, ghi: num(c[cG]), dni: num(c[cB]), dhi: num(c[cD]), tair: cT >= 0 ? num(c[cT]) : airTemp });
      }
      if (cY < 0) notes.push("No Year column; read as a typical year.");
    }
  }

  // TMY3 (NREL's 1991-2005 typical years, still the most common US file):
  // a station line (id, name, state, time zone, lat, lon, elevation), then
  // Date (MM/DD/YYYY),Time (HH:MM),... in local standard time, each value the
  // total for the hour ending at the stamp (01:00 to 24:00). Sampled at the
  // middle of that hour, 30 minutes before the stamp.
  if (!rows && /^date\s*\(mm\/dd\/yyyy\)/i.test((lines[1] || "").trim())) {
    source = "TMY3";
    const meta = splitCsvLine(lines[0]);
    const tz = num(meta[3]);
    fileLat = num(meta[4]);
    fileLon = num(meta[5]);
    if (!Number.isFinite(tz)) throw new Error("The TMY3 station line has no time zone.");
    const header = splitCsvLine(lines[1]);
    const cG = findCol(header, GHI), cB = findCol(header, DNI), cD = findCol(header, DHI), cT = findCol(header, TAIR);
    if (cG < 0 || cB < 0 || cD < 0) throw new Error("The TMY3 file has no GHI, DNI and DHI columns.");
    rows = [];
    for (const l of lines.slice(2)) {
      const m = l.match(/^(\d{2})\/(\d{2})\/\d{4},(\d{2}):(\d{2})/);
      if (!m) continue;
      if (m[1] === "02" && m[2] === "29") continue;
      const c = splitCsvLine(l);
      const ms = Date.UTC(2025, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4])) - 30 * 60000 - tz * 3600000 + shift;
      rows.push({ ms, ghi: num(c[cG]), dni: num(c[cB]), dhi: num(c[cD]), tair: cT >= 0 ? num(c[cT]) : airTemp });
    }
  }

  // Generic CSV: a header with a time column and GHI, DNI, DHI columns.
  if (!rows) {
    const hi = lines.findIndex((l) => {
      const h = splitCsvLine(l);
      return findCol(h, GHI) >= 0 && findCol(h, DNI) >= 0 && findCol(h, DHI) >= 0;
    });
    if (hi < 0) throw new Error("No weather columns found. Expected a PVGIS TMY CSV, an NSRDB CSV, or a CSV with a time column and GHI, DNI and DHI columns.");
    source = "CSV";
    const header = splitCsvLine(lines[hi]);
    const cTime = findCol(header, [/^time/, /^timestamp/, /^date/, /^datetime/]);
    if (cTime < 0) throw new Error("The CSV has GHI, DNI and DHI but no time, timestamp or date column.");
    const cG = findCol(header, GHI), cB = findCol(header, DNI), cD = findCol(header, DHI), cT = findCol(header, TAIR);
    const tz = opts.tzHours || 0;
    rows = [];
    for (const l of lines.slice(hi + 1)) {
      if (!l.trim()) continue;
      const c = splitCsvLine(l);
      const t = c[cTime];
      const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
      if (!m) throw new Error(`Unreadable timestamp "${t}" (use YYYY-MM-DD HH:MM, optionally with Z or +hh:mm).`);
      if (m[2] === "02" && m[3] === "29") continue;
      let off = tz * 60;
      if (m[8] === "Z") off = 0;
      else if (m[8]) { const s = m[8].replace(":", ""); off = (s[0] === "-" ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(3, 5))); }
      const ms = Date.UTC(2025, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)) - off * 60000 + shift;
      rows.push({ ms, ghi: num(c[cG]), dni: num(c[cB]), dhi: num(c[cD]), tair: cT >= 0 ? num(c[cT]) : airTemp });
    }
  }

  rows = rows.filter((r) => Number.isFinite(r.ms) && Number.isFinite(r.ghi) && Number.isFinite(r.dni) && Number.isFinite(r.dhi));
  for (const r of rows) if (!Number.isFinite(r.tair)) r.tair = airTemp;
  if (rows.length < 2) throw new Error("Fewer than two readable rows of weather.");
  rows.sort((a, b) => a.ms - b.ms);
  const diffs = [];
  for (let i = 1; i < rows.length; i++) diffs.push(rows[i].ms - rows[i - 1].ms);
  diffs.sort((a, b) => a - b);
  const dtMs = diffs[Math.floor(diffs.length / 2)];
  if (!(dtMs > 0) || dtMs > 3 * 3600000) throw new Error("Readings must be hourly or finer.");
  const dtHours = dtMs / 3600000;
  const coverageDays = (rows.length * dtHours) / 24;
  if (coverageDays < 360) throw new Error(`The file covers ${coverageDays.toFixed(0)} days; a full year (at least 360 days) is needed so every season counts.`);
  if (fileLat != null && Number.isFinite(fileLat)) {
    if (lat != null && Math.abs(lat - fileLat) > 0.05) notes.push(`Using the file's latitude ${fileLat}, not ${lat}.`);
    lat = fileLat;
  }
  if (fileLon != null && Number.isFinite(fileLon)) {
    if (lon != null && Math.abs(lon - fileLon) > 0.05) notes.push(`Using the file's longitude ${fileLon}, not ${lon}.`);
    lon = fileLon;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Latitude and longitude are needed (the file does not give them).");
  const w = prepare(rows, lat, lon, dtHours, source);
  // A clock error shows up as beam with the sun nowhere near: count beam
  // reported while the computed sun is down.
  let beamDark = 0, beamAll = 0;
  for (const r of rows) {
    beamAll += Math.max(0, r.dni);
    if (sunPosition(r.ms, lat, lon).apparentZenith >= 90) beamDark += Math.max(0, r.dni);
  }
  if (beamAll > 0 && beamDark / beamAll > 0.02) notes.push(`${((100 * beamDark) / beamAll).toFixed(1)}% of the file's direct beam falls in hours when the sun is computed to be down: check the time zone or the timestamp shift.`);
  w.notes = notes;
  w.fileLat = fileLat;
  w.fileLon = fileLon;
  return w;
}

// GTFS Schedule feed checker. Pure functions, no network, no dependencies.
//
// Rules follow the GTFS Schedule Reference (gtfs.org, "Revised April 27,
// 2026"), read for this tool on 2026-11-19. Each finding names the section it
// comes from. Thresholds the reference does not set (travel speed per mode,
// the contrast ratio) are this tool's own and are labelled so in the message.
//
//   checkFeed({ "agency.txt": "...", ... }, { today: "20261119" })
//     -> { summary, stats, findings }
//
// A finding: { severity: "error"|"warning"|"info", code, file, message,
//              count, examples: [{ line, detail }] }. Findings with the same
// code and file are merged, so a feed with 200,000 bad rows yields one
// finding with a count, not 200,000 entries.

export const SPEC = "GTFS Schedule Reference, revised 2026-04-27";
const MAX_EXAMPLES = 8;

// ---------------------------------------------------------------- schema

const E = (...v) => ({ type: "enum", values: v.map(String) });
const T = (type, extra = {}) => ({ type, ...extra });
const R = (f) => ({ ...f, required: true });

export const FILES = {
  "agency.txt": {
    presence: "required",
    fields: {
      agency_id: T("id"), agency_name: R(T("text")), agency_url: R(T("url")), agency_timezone: R(T("timezone")),
      agency_lang: T("lang"), agency_phone: T("text"), agency_fare_url: T("url"), agency_email: T("email"), cemv_support: E(0, 1, 2),
    },
  },
  "stops.txt": {
    presence: "conditional",
    fields: {
      stop_id: R(T("id")), stop_code: T("text"), stop_name: T("text"), tts_stop_name: T("text"), stop_desc: T("text"),
      stop_lat: T("lat"), stop_lon: T("lon"), zone_id: T("id"), stop_url: T("url"), location_type: E(0, 1, 2, 3, 4),
      parent_station: T("id"), stop_timezone: T("timezone"), wheelchair_boarding: E(0, 1, 2), level_id: T("id"),
      platform_code: T("text"), stop_access: E(0, 1),
    },
  },
  "routes.txt": {
    presence: "required",
    fields: {
      route_id: R(T("id")), agency_id: T("id"), route_short_name: T("text"), route_long_name: T("text"), route_desc: T("text"),
      route_type: R(T("route_type")), route_url: T("url"), route_color: T("color"), route_text_color: T("color"),
      route_sort_order: T("uint"), continuous_pickup: E(0, 1, 2, 3), continuous_drop_off: E(0, 1, 2, 3), network_id: T("id"), cemv_support: E(0, 1, 2),
    },
  },
  "trips.txt": {
    presence: "required",
    fields: {
      route_id: R(T("id")), service_id: R(T("id")), trip_id: R(T("id")), trip_headsign: T("text"), trip_short_name: T("text"),
      direction_id: E(0, 1), block_id: T("id"), shape_id: T("id"), wheelchair_accessible: E(0, 1, 2), bikes_allowed: E(0, 1, 2),
      cars_allowed: E(0, 1, 2), safe_duration_factor: T("float"), safe_duration_offset: T("float"),
    },
  },
  "stop_times.txt": {
    presence: "required",
    fields: {
      trip_id: R(T("id")), arrival_time: T("time"), departure_time: T("time"), stop_id: T("id"), location_group_id: T("id"),
      location_id: T("id"), stop_sequence: R(T("uint")), stop_headsign: T("text"), start_pickup_drop_off_window: T("time"),
      end_pickup_drop_off_window: T("time"), pickup_type: E(0, 1, 2, 3), drop_off_type: E(0, 1, 2, 3),
      continuous_pickup: E(0, 1, 2, 3), continuous_drop_off: E(0, 1, 2, 3), shape_dist_traveled: T("ufloat"), timepoint: E(0, 1),
      pickup_booking_rule_id: T("id"), drop_off_booking_rule_id: T("id"),
    },
  },
  "calendar.txt": {
    presence: "conditional",
    fields: {
      service_id: R(T("id")), monday: R(E(0, 1)), tuesday: R(E(0, 1)), wednesday: R(E(0, 1)), thursday: R(E(0, 1)),
      friday: R(E(0, 1)), saturday: R(E(0, 1)), sunday: R(E(0, 1)), start_date: R(T("date")), end_date: R(T("date")),
    },
  },
  "calendar_dates.txt": {
    presence: "conditional",
    fields: { service_id: R(T("id")), date: R(T("date")), exception_type: R(E(1, 2)) },
  },
  "shapes.txt": {
    presence: "conditional",
    fields: { shape_id: R(T("id")), shape_pt_lat: R(T("lat")), shape_pt_lon: R(T("lon")), shape_pt_sequence: R(T("uint")), shape_dist_traveled: T("ufloat") },
  },
  "frequencies.txt": {
    presence: "optional",
    fields: { trip_id: R(T("id")), start_time: R(T("time")), end_time: R(T("time")), headway_secs: R(T("pint")), exact_times: E(0, 1) },
  },
  "feed_info.txt": {
    presence: "conditional",
    fields: {
      feed_publisher_name: R(T("text")), feed_publisher_url: R(T("url")), feed_lang: R(T("lang")), default_lang: T("lang"),
      feed_start_date: T("date"), feed_end_date: T("date"), feed_version: T("text"), feed_contact_email: T("email"), feed_contact_url: T("url"),
    },
  },
};

// Null prototypes, so a header or file named "constructor" or "toString" is
// not mistaken for a known one.
Object.setPrototypeOf(FILES, null);
for (const f of Object.values(FILES)) Object.setPrototypeOf(f.fields, null);

// Files the reference defines whose fields this version does not check yet.
export const KNOWN_UNCHECKED = [
  "fare_attributes.txt", "fare_rules.txt", "timeframes.txt", "rider_categories.txt", "fare_media.txt", "fare_products.txt",
  "fare_leg_rules.txt", "fare_leg_join_rules.txt", "fare_transfer_rules.txt", "areas.txt", "stop_areas.txt", "networks.txt",
  "route_networks.txt", "transfers.txt", "pathways.txt", "levels.txt", "location_groups.txt", "location_group_stops.txt",
  "locations.geojson", "booking_rules.txt", "translations.txt", "attributions.txt",
];

const CORE_ROUTE_TYPES = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "11", "12"]);

// This tool's ceilings (km/h) for the straight-line speed between two
// consecutive stops. The reference sets none; these are deliberately loose so
// a flag means "check this", not "this is wrong".
export function speedLimitKmh(routeType) {
  const t = Number(routeType);
  if (t === 2 || (t >= 100 && t < 200)) return 500; // rail, high-speed rail
  if (t === 4 || (t >= 1000 && t < 1300)) return 80; // ferry, water
  if ([5, 6, 7].includes(t) || (t >= 1300 && t < 1500)) return 50; // cable, aerial, funicular
  if (t === 0 || (t >= 900 && t < 1000)) return 120; // tram, light rail
  if (t >= 200 && t < 300) return 200; // coach
  return 150; // subway, bus, trolleybus, monorail, others
}

// ---------------------------------------------------------------- findings

class Findings {
  constructor() { this.map = new Map(); }
  add(severity, code, file, message, line = null, detail = null) {
    const key = `${code}\u0000${file}`;
    let f = this.map.get(key);
    if (!f) { f = { severity, code, file, message, count: 0, examples: [] }; this.map.set(key, f); }
    f.count++;
    if (f.examples.length < MAX_EXAMPLES && (line !== null || detail !== null)) f.examples.push({ line, detail });
  }
  list() {
    const rank = { error: 0, warning: 1, info: 2 };
    return [...this.map.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count || a.code.localeCompare(b.code));
  }
}

// ---------------------------------------------------------------- CSV

// Splits GTFS CSV text into rows. Yields { line, cells } where line is the
// 1-based physical line the row starts on. Rows without a quote take a fast
// path; quoted rows follow RFC 4180 (doubled quotes), and a quoted field that
// runs past the end of a line is reported, since the reference forbids line
// breaks in values.
export function* csvRows(text, onProblem = () => {}) {
  let i = 0, line = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const n = text.length;
  while (i < n) {
    line++;
    let j = text.indexOf("\n", i);
    if (j < 0) j = n;
    let raw = text.slice(i, j);
    if (raw.endsWith("\r")) raw = raw.slice(0, -1);
    if (raw.indexOf('"') < 0) {
      i = j + 1;
      if (raw === "") continue;
      yield { line, cells: raw.split(",") };
      continue;
    }
    const start = line;
    const cells = [];
    let cell = "", q = false, k = i;
    for (;;) {
      if (k >= n) { if (q) onProblem("unterminated_quote", start); cells.push(cell); i = n; break; }
      const c = text[k];
      if (q) {
        if (c === '"') { if (text[k + 1] === '"') { cell += '"'; k += 2; continue; } q = false; k++; continue; }
        if (c === "\n") { line++; onProblem("newline_in_value", start); }
        cell += c; k++; continue;
      }
      if (c === '"') { if (cell === "") { q = true; } else { onProblem("stray_quote", start); cell += c; } k++; continue; }
      if (c === ",") { cells.push(cell); cell = ""; k++; continue; }
      if (c === "\n" || c === "\r") {
        cells.push(cell);
        k = c === "\r" && text[k + 1] === "\n" ? k + 2 : k + 1;
        i = k; break;
      }
      cell += c; k++;
    }
    if (!(cells.length === 1 && cells[0] === "")) yield { line: start, cells };
  }
}

// ---------------------------------------------------------------- values

export function parseTime(s) {
  const m = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export function parseDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(dt.getTime() / 86400000); // days since 1970-01-01
}

export function formatDay(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
}

const tzCache = new Map();
export function validTimezone(tz) {
  if (tzCache.has(tz)) return tzCache.get(tz);
  let ok = !/\s/.test(tz) && tz.length > 0;
  if (ok) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { ok = false; } }
  tzCache.set(tz, ok);
  return ok;
}

function validValue(type, v, spec) {
  switch (type) {
    case "id": case "text": return true;
    case "url": return /^https?:\/\/\S+$/i.test(v);
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case "timezone": return validTimezone(v);
    case "lang": return /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(v);
    case "lat": { const x = Number(v); return v.trim() !== "" && Number.isFinite(x) && x >= -90 && x <= 90; }
    case "lon": { const x = Number(v); return v.trim() !== "" && Number.isFinite(x) && x >= -180 && x <= 180; }
    case "color": return /^[0-9A-Fa-f]{6}$/.test(v);
    case "date": return parseDate(v) !== null;
    case "time": return parseTime(v) !== null;
    case "uint": return /^\d+$/.test(v);
    case "pint": return /^\d+$/.test(v) && Number(v) > 0;
    case "float": return v.trim() !== "" && Number.isFinite(Number(v));
    case "ufloat": return v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
    case "enum": return spec.values.includes(v);
    case "route_type": return /^\d+$/.test(v);
    default: return true;
  }
}

const TYPE_WORDS = { __proto__: null,
  url: "a full URL starting with http:// or https://", email: "an email address", timezone: "an IANA time zone such as America/Chicago",
  lang: "a BCP 47 language code such as en or fr-CA", lat: "a latitude from -90 to 90", lon: "a longitude from -180 to 180",
  color: "six hex digits with no # (like 0039A6)", date: "a real date as YYYYMMDD", time: "a time as HH:MM:SS (hours may pass 24)",
  uint: "a whole number 0 or more", pint: "a whole number above 0", float: "a number", ufloat: "a number 0 or more", route_type: "a whole number",
};

// ---------------------------------------------------------------- geometry

export function haversineM(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R6 = 6371008.8;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R6 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// WCAG 2 relative luminance contrast of two 6-hex colours.
export function contrastRatio(hex1, hex2) {
  const lum = (h) => {
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = lum(hex1), b = lum(hex2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ---------------------------------------------------------------- tables

// Reads one file into { header, index, rows } after checking its CSV shape and
// every value against its field type. `keep(row)` lets a caller drop rows it
// does not need to hold in memory (stop_times is streamed by the caller).
function readTable(name, text, F, onRow) {
  const spec = FILES[name];
  const iter = csvRows(text, (kind, line) => {
    if (kind === "unterminated_quote") F.add("error", "unterminated_quote", name, "A quoted value is never closed, so the rest of the file is read as one value.", line);
    else if (kind === "newline_in_value") F.add("error", "newline_in_value", name, "A quoted value contains a line break; values must not contain tabs, carriage returns or new lines (File Requirements).", line);
    else F.add("warning", "stray_quote", name, "A quotation mark appears inside a value that is not quoted; quote the value and double the mark (File Requirements, RFC 4180).", line);
  });
  const first = iter.next();
  if (first.done) { F.add("error", "empty_file", name, "The file is empty: the first line must hold the field names (File Requirements)."); return null; }
  const rawHeader = first.value.cells;
  const header = rawHeader.map((h) => h.trim());
  rawHeader.forEach((h, i) => {
    if (h !== header[i]) F.add("warning", "header_spaces", name, "A field name has spaces around it; many parsers keep them and then cannot find the field (File Requirements).", 1, JSON.stringify(h));
  });
  const index = Object.create(null);
  header.forEach((h, i) => {
    if (h === "") F.add("error", "empty_header", name, "A column has no field name.", 1, `column ${i + 1}`);
    else if (h in index) F.add("error", "duplicate_header", name, "A field name appears twice in the header.", 1, h);
    else index[h] = i;
    if (spec && h && !(h in spec.fields) && h.toLowerCase() in spec.fields) F.add("error", "header_case", name, "Field names are case-sensitive; this one differs from the reference only by case (File Requirements).", 1, `${h} (expected ${h.toLowerCase()})`);
    else if (spec && h && !(h in spec.fields)) F.add("info", "unknown_field", name, "Not a field the reference defines for this file. Consumers ignore it; if it was meant to be a standard field, it is misspelled.", 1, h);
  });
  if (spec) for (const [f, fs] of Object.entries(spec.fields)) if (fs.required && !(f in index)) F.add("error", "missing_required_field", name, "A required field is missing from the header.", 1, f);
  const checks = spec ? Object.entries(index).filter(([f]) => spec.fields[f]).map(([f, i]) => [f, i, spec.fields[f]]) : [];
  let rows = 0;
  for (const { line, cells } of iter) {
    rows++;
    if (cells.length > header.length) F.add("error", "too_many_values", name, "A row has more values than the header has fields, so its values land under the wrong fields (often an unquoted comma).", line, `${cells.length} values, header has ${header.length}`);
    else if (cells.length < header.length) F.add("warning", "short_row", name, "A row has fewer values than the header has fields. Most parsers read the missing trailing values as empty, but strict CSV readers reject the row (RFC 4180: every row has the same number of fields).", line, `${cells.length} values, header has ${header.length}`);
    for (const [f, i, fs] of checks) {
      const raw = cells[i] ?? "";
      const v = raw.trim();
      if (v !== raw && v !== "") F.add("warning", "value_spaces", name, "A value has spaces around it; consumers may keep them, so an ID with a trailing space matches nothing (File Requirements).", line, `${f}=${JSON.stringify(raw)}`);
      if (v === "") { if (fs.required) F.add("error", "missing_required_value", name, "A required field is empty.", line, f); continue; }
      if (!validValue(fs.type, v, fs)) {
        F.add("error", `invalid_${fs.type === "enum" ? "enum" : fs.type}`, name, fs.type === "enum" ? `A value is not one of the options the reference lists.` : `A value is not ${Object.hasOwn(TYPE_WORDS, fs.type) ? TYPE_WORDS[fs.type] : "valid"}.`, line, `${f}=${JSON.stringify(v)}${fs.type === "enum" ? ` (allowed: ${fs.values.join(", ")})` : ""}`);
      }
    }
    const get = (f) => (index[f] === undefined ? "" : (cells[index[f]] ?? "").trim());
    onRow(get, line);
  }
  return { header, index, rows };
}

// ---------------------------------------------------------------- feed

function pickToday(opt) {
  if (opt.today) { const d = parseDate(String(opt.today).replace(/-/g, "")); if (d !== null) return d; }
  const now = new Date();
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

// files: { name: string } (text already decoded). Names may carry a folder
// prefix; that is reported and the files are still read.
export function checkFeed(input, opt = {}) {
  const F = new Findings();
  const today = pickToday(opt);
  const files = Object.create(null);
  const folders = new Set();
  for (const [path, text] of Object.entries(input)) {
    if (/(^|\/)(__MACOSX|\.DS_Store)/.test(path)) continue;
    const slash = path.lastIndexOf("/");
    const base = path.slice(slash + 1);
    if (slash >= 0) folders.add(path.slice(0, slash));
    if (base in files) { F.add("error", "duplicate_file", base, "Two files with this name are in the archive (in different folders); only one can be read.", null, path); continue; }
    files[base] = text;
  }
  if (folders.size) F.add("error", "files_in_subfolder", [...folders][0] + "/", "The files are inside a folder in the zip. They must be at the root of the archive (File Requirements); zip the files themselves, not the folder.", null, [...folders].join(", "));
  for (const base of Object.keys(files)) {
    if (!(base in FILES) && !KNOWN_UNCHECKED.includes(base)) {
      if (base.toLowerCase() in FILES || KNOWN_UNCHECKED.includes(base.toLowerCase())) F.add("error", "file_name_case", base, "File names are case-sensitive; rename it to lower case (File Requirements).", null, base);
      else F.add("info", "unknown_file", base, "Not a file the reference defines. Consumers ignore it unless they know the extension.", null, base);
    }
  }
  const has = (n) => n in files;
  for (const [n, s] of Object.entries(FILES)) if (s.presence === "required" && !has(n)) F.add("error", "missing_required_file", n, "A required file is missing from the feed (Dataset Files).");
  if (!has("stops.txt") && !has("locations.geojson")) F.add("error", "missing_required_file", "stops.txt", "stops.txt is required unless on-demand zones are defined in locations.geojson (Dataset Files).");
  if (!has("calendar.txt") && !has("calendar_dates.txt")) F.add("error", "missing_calendar", "calendar.txt", "Either calendar.txt or calendar_dates.txt must be present, or no trip has a service date (Dataset Files).");
  if (has("translations.txt") && !has("feed_info.txt")) F.add("error", "missing_required_file", "feed_info.txt", "feed_info.txt is required when translations.txt is provided (Dataset Files).");
  if (!has("feed_info.txt") && !has("translations.txt")) F.add("info", "no_feed_info", "feed_info.txt", "feed_info.txt is recommended: it carries the publisher, version and the dates the feed is valid for (Dataset Files).");
  if (!has("shapes.txt")) F.add("info", "no_shapes", "shapes.txt", "shapes.txt is recommended, so trip planners draw the route along the road or track instead of straight lines between stops (Dataset Files).");

  const stats = { agencies: 0, stops: 0, routes: 0, trips: 0, stopTimes: 0, shapes: 0, services: 0, firstServiceDate: null, lastServiceDate: null, today: formatDay(today) };

  // agency
  const agencies = new Map();
  const tzs = new Set();
  if (has("agency.txt")) {
    readTable("agency.txt", files["agency.txt"], F, (g, line) => {
      stats.agencies++;
      const id = g("agency_id");
      if (agencies.has(id) && id !== "") F.add("error", "duplicate_key", "agency.txt", "agency_id must be unique.", line, id);
      agencies.set(id, line);
      if (g("agency_timezone")) tzs.add(g("agency_timezone"));
    });
    if (stats.agencies > 1 && agencies.has("")) F.add("error", "missing_agency_id", "agency.txt", "agency_id is required when the feed has more than one agency.");
    if (tzs.size > 1) F.add("error", "agency_timezones_differ", "agency.txt", "Every agency must have the same agency_timezone.", null, [...tzs].join(", "));
    if (stats.agencies === 0) F.add("error", "no_rows", "agency.txt", "The file has a header but no agencies.");
  }

  // stops
  const stops = new Map(); // id -> { type, parent, lat, lon, line, used }
  if (has("stops.txt")) {
    readTable("stops.txt", files["stops.txt"], F, (g, line) => {
      stats.stops++;
      const id = g("stop_id");
      if (!id) return;
      if (stops.has(id)) { F.add("error", "duplicate_key", "stops.txt", "stop_id must be unique.", line, id); return; }
      const type = Number(g("location_type") || 0);
      const lat = Number(g("stop_lat")), lon = Number(g("stop_lon"));
      const hasPos = g("stop_lat") !== "" && g("stop_lon") !== "";
      stops.set(id, { type, parent: g("parent_station"), lat: hasPos ? lat : NaN, lon: hasPos ? lon : NaN, line, used: false, name: g("stop_name") });
      if (type <= 2 && !g("stop_name")) F.add("error", "missing_stop_name", "stops.txt", "stop_name is required for stops, stations and entrances (location_type 0, 1, 2).", line, id);
      if (type <= 2 && !hasPos) F.add("error", "missing_stop_position", "stops.txt", "stop_lat and stop_lon are required for stops, stations and entrances (location_type 0, 1, 2).", line, id);
      if (hasPos && lat === 0 && lon === 0) F.add("error", "stop_at_null_island", "stops.txt", "The stop is at latitude 0, longitude 0, in the Gulf of Guinea: almost always a missing position written as zeros.", line, id);
      const name = g("stop_name");
      if (name.length >= 4 && /[A-Z]/.test(name) && name === name.toUpperCase() && /[A-Z]{3}/.test(name)) F.add("warning", "all_caps_name", "stops.txt", "Customer-facing names should use mixed case, not ALL CAPS (File Requirements).", line, name);
      if (g("stop_desc") && g("stop_desc") === name) F.add("info", "desc_repeats_name", "stops.txt", "stop_desc should not duplicate stop_name.", line, id);
    });
    for (const [id, s] of stops) {
      if (!s.parent) {
        if (s.type >= 2 && s.type <= 4) F.add("error", "missing_parent_station", "stops.txt", "parent_station is required for entrances, generic nodes and boarding areas (location_type 2, 3, 4).", s.line, id);
        continue;
      }
      if (s.type === 1) { F.add("error", "station_with_parent", "stops.txt", "A station (location_type 1) must not have a parent_station.", s.line, id); continue; }
      const p = stops.get(s.parent);
      if (!p) { F.add("error", "unknown_reference", "stops.txt", "parent_station names a stop_id that is not in stops.txt.", s.line, `${id} -> ${s.parent}`); continue; }
      const want = s.type === 4 ? 0 : 1;
      if (p.type !== want) F.add("error", "wrong_parent_type", "stops.txt", s.type === 4 ? "A boarding area's parent_station must be a platform (location_type 0)." : "parent_station must be a station (location_type 1).", s.line, `${id} -> ${s.parent} (location_type ${p.type})`);
      else if (s.type === 0 && Number.isFinite(s.lat) && Number.isFinite(p.lat)) {
        const d = haversineM(s.lat, s.lon, p.lat, p.lon);
        if (d > 1000) F.add("warning", "platform_far_from_station", "stops.txt", "A platform is more than 1 km from its parent station (this tool's threshold): one of the two positions is likely wrong.", s.line, `${id} is ${Math.round(d)} m from ${s.parent}`);
      }
    }
  }

  // A stop far from all the others: usually swapped latitude and longitude,
  // a dropped minus sign or a typo. Measured from the median position; a stop
  // is flagged when it is over 100 km out and over 20 times the median
  // stop's distance (both thresholds are this tool's).
  {
    const pts = [...stops.entries()].filter(([, s]) => Number.isFinite(s.lat) && !(s.lat === 0 && s.lon === 0));
    if (pts.length >= 5) {
      const med = (xs) => { const v = xs.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
      const mlat = med(pts.map(([, s]) => s.lat)), mlon = med(pts.map(([, s]) => s.lon));
      const d = pts.map(([id, s]) => [id, s, haversineM(mlat, mlon, s.lat, s.lon)]);
      const mid = med(d.map((x) => x[2]));
      for (const [id, s, m] of d) if (m > 100000 && m > 20 * Math.max(mid, 1000)) F.add("warning", "stop_far_from_others", "stops.txt", "A stop is far from every other stop in the feed: often latitude and longitude swapped, a dropped minus sign or a typo in a digit.", s.line, `${id} is ${Math.round(m / 1000)} km from the feed's median stop position`);
    }
  }

  // routes
  const routes = new Map(); // id -> { type, line, used }
  if (has("routes.txt")) {
    const multi = stats.agencies > 1;
    const header = readTable("routes.txt", files["routes.txt"], F, (g, line) => {
      stats.routes++;
      const id = g("route_id");
      if (!id) return;
      if (routes.has(id)) { F.add("error", "duplicate_key", "routes.txt", "route_id must be unique.", line, id); return; }
      const type = g("route_type");
      routes.set(id, { type, line, used: false });
      if (/^\d+$/.test(type) && !CORE_ROUTE_TYPES.has(type)) {
        if (Number(type) >= 100 && Number(type) < 1800) F.add("info", "extended_route_type", "routes.txt", "route_type uses an extended (HVT-style) code that the GTFS reference does not list; some consumers read it, others do not.", line, `${id}: ${type}`);
        else F.add("error", "invalid_enum", "routes.txt", "route_type is not one the reference lists (0-7, 11, 12).", line, `${id}: ${type}`);
      }
      const aid = g("agency_id");
      if (multi && !aid) F.add("error", "missing_route_agency", "routes.txt", "agency_id is required on every route when agency.txt has more than one agency.", line, id);
      if (aid && agencies.size && !agencies.has(aid)) F.add("error", "unknown_reference", "routes.txt", "agency_id names an agency that is not in agency.txt.", line, `${id} -> ${aid}`);
      const sn = g("route_short_name"), ln = g("route_long_name");
      if (!sn && !ln) F.add("error", "missing_route_name", "routes.txt", "A route needs route_short_name or route_long_name.", line, id);
      if (sn.length > 12) F.add("warning", "long_short_name", "routes.txt", "route_short_name should be no longer than 12 characters; it is meant to be a short label like 32 or Green.", line, `${id}: ${sn}`);
      if (sn && ln && sn === ln) F.add("warning", "same_route_names", "routes.txt", "route_short_name and route_long_name are the same; leave one empty instead.", line, id);
      const bg = g("route_color") || "FFFFFF", fg = g("route_text_color") || "000000";
      if (/^[0-9A-Fa-f]{6}$/.test(bg) && /^[0-9A-Fa-f]{6}$/.test(fg) && (g("route_color") || g("route_text_color"))) {
        const cr = contrastRatio(bg, fg);
        if (cr < 3) F.add("warning", "low_color_contrast", "routes.txt", "route_text_color on route_color is hard to read: the reference asks for sufficient contrast, and this pair is below 3:1 (WCAG 2 contrast; the threshold is this tool's).", line, `${id}: ${fg} on ${bg} = ${cr.toFixed(2)}:1`);
      }
    });
    if (header && "network_id" in header.index && (has("networks.txt") || has("route_networks.txt"))) F.add("error", "network_id_conflict", "routes.txt", "routes.txt has network_id while networks.txt or route_networks.txt exists; the reference forbids using both.");
  }

  // calendar
  const services = new Map(); // id -> { days:Set|null, start, end, week, line, added:Set, removed:Set, used }
  const svc = (id) => { let s = services.get(id); if (!s) { s = { start: null, end: null, week: null, line: null, added: new Set(), removed: new Set(), used: false, inCal: false }; services.set(id, s); } return s; };
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (has("calendar.txt")) {
    readTable("calendar.txt", files["calendar.txt"], F, (g, line) => {
      const id = g("service_id");
      if (!id) return;
      if (services.has(id) && services.get(id).inCal) { F.add("error", "duplicate_key", "calendar.txt", "service_id must be unique in calendar.txt.", line, id); return; }
      const s = svc(id);
      s.inCal = true; s.line = line;
      s.start = parseDate(g("start_date")); s.end = parseDate(g("end_date"));
      s.week = DAYS.map((d) => g(d) === "1");
      if (s.start !== null && s.end !== null && s.end < s.start) F.add("error", "end_before_start", "calendar.txt", "end_date is before start_date, so the service never runs.", line, `${id}: ${g("start_date")} to ${g("end_date")}`);
    });
  }
  if (has("calendar_dates.txt")) {
    const seen = new Set();
    readTable("calendar_dates.txt", files["calendar_dates.txt"], F, (g, line) => {
      const id = g("service_id"), date = parseDate(g("date"));
      if (!id || date === null) return;
      const k = id + "\u0000" + date;
      if (seen.has(k)) F.add("error", "duplicate_key", "calendar_dates.txt", "The same service_id and date appear twice.", line, `${id} ${g("date")}`);
      seen.add(k);
      const s = svc(id);
      if (g("exception_type") === "1") s.added.add(date);
      else if (g("exception_type") === "2") s.removed.add(date);
    });
  }
  stats.services = services.size;

  // shapes
  const shapes = new Map(); // id -> { pts: [seq, lat, lon, dist, line], used }
  if (has("shapes.txt")) {
    readTable("shapes.txt", files["shapes.txt"], F, (g, line) => {
      const id = g("shape_id");
      if (!id) return;
      let s = shapes.get(id);
      if (!s) { s = { pts: [], used: false }; shapes.set(id, s); }
      const d = g("shape_dist_traveled");
      s.pts.push([Number(g("shape_pt_sequence")), Number(g("shape_pt_lat")), Number(g("shape_pt_lon")), d === "" ? NaN : Number(d), line]);
    });
    stats.shapes = shapes.size;
    for (const [id, s] of shapes) {
      s.pts.sort((a, b) => a[0] - b[0]);
      if (s.pts.length < 2) F.add("warning", "short_shape", "shapes.txt", "A shape has fewer than two points, so it cannot be drawn as a line.", s.pts[0]?.[4] ?? null, id);
      for (let i = 1; i < s.pts.length; i++) {
        const a = s.pts[i - 1], b = s.pts[i];
        if (a[0] === b[0]) F.add("error", "duplicate_key", "shapes.txt", "The same shape_id and shape_pt_sequence appear twice.", b[4], `${id} #${b[0]}`);
        if (Number.isFinite(a[3]) && Number.isFinite(b[3]) && b[3] < a[3]) F.add("error", "shape_dist_decreasing", "shapes.txt", "shape_dist_traveled goes down along the shape; it must increase with shape_pt_sequence.", b[4], `${id} #${b[0]}: ${a[3]} then ${b[3]}`);
      }
    }
  }

  // trips
  const trips = new Map(); // id -> { route, service, shape, line, times: [] }
  if (has("trips.txt")) {
    readTable("trips.txt", files["trips.txt"], F, (g, line) => {
      stats.trips++;
      const id = g("trip_id");
      if (!id) return;
      if (trips.has(id)) { F.add("error", "duplicate_key", "trips.txt", "trip_id must be unique.", line, id); return; }
      const route = g("route_id"), service = g("service_id"), shape = g("shape_id");
      trips.set(id, { route, service, shape, line, times: [] }); // times: row numbers into the stop_times columns
      const r = routes.get(route);
      if (route && routes.size && !r) F.add("error", "unknown_reference", "trips.txt", "route_id names a route that is not in routes.txt.", line, `${id} -> ${route}`);
      if (r) r.used = true;
      const s = services.get(service);
      if (service && !s) F.add("error", "unknown_service", "trips.txt", "service_id is in neither calendar.txt nor calendar_dates.txt, so the trip never runs.", line, `${id} -> ${service}`);
      if (s) s.used = true;
      if (shape) {
        const sh = shapes.get(shape);
        if (!sh) F.add("error", "unknown_reference", "trips.txt", has("shapes.txt") ? "shape_id names a shape that is not in shapes.txt." : "shape_id is set but the feed has no shapes.txt.", line, `${id} -> ${shape}`);
        else sh.used = true;
      }
    });
  }

  // stop_times: one pass, kept compact per trip.
  if (has("stop_times.txt")) {
    const stopIdx = new Map(); const stopList = [];
    const intern = (id) => { let k = stopIdx.get(id); if (k === undefined) { k = stopList.length; stopIdx.set(id, k); stopList.push(id); } return k; };
    // Columnar storage: a 2.6-million-row stop_times.txt (TriMet's) costs
    // about 100 MB this way, against about 600 MB as one array per row.
    let cap = 1 << 16, n = 0;
    const cols = { seq: new Float64Array(cap), arr: new Int32Array(cap), dep: new Int32Array(cap), stop: new Int32Array(cap), dist: new Float64Array(cap), line: new Int32Array(cap), flags: new Uint8Array(cap) };
    const grow = () => { cap *= 2; for (const k of Object.keys(cols)) { const a = new cols[k].constructor(cap); a.set(cols[k]); cols[k] = a; } };
    const row = (i) => [cols.seq[i], cols.arr[i], cols.dep[i], cols.stop[i], cols.dist[i], cols.line[i], cols.flags[i] & 1, (cols.flags[i] >> 1) & 1];
    readTable("stop_times.txt", files["stop_times.txt"], F, (g, line) => {
      stats.stopTimes++;
      const tid = g("trip_id");
      const t = trips.get(tid);
      if (!t) { if (tid && trips.size) F.add("error", "unknown_reference", "stop_times.txt", "trip_id names a trip that is not in trips.txt.", line, tid); return; }
      const sid = g("stop_id");
      const flex = g("location_group_id") || g("location_id");
      if (sid) {
        const s = stops.get(sid);
        if (!s) { if (stops.size || has("stops.txt")) F.add("error", "unknown_reference", "stop_times.txt", "stop_id names a stop that is not in stops.txt.", line, `${tid} -> ${sid}`); }
        else { s.used = true; if (s.type !== 0) F.add("error", "stop_time_at_station", "stop_times.txt", "stop_times must reference stops or platforms (location_type 0), not stations, entrances or nodes.", line, `${tid} -> ${sid} (location_type ${s.type})`); }
      } else if (!flex) F.add("error", "missing_required_value", "stop_times.txt", "A stop time needs stop_id (or, for on-demand service, location_group_id or location_id).", line, tid);
      const arr = parseTime(g("arrival_time")), dep = parseTime(g("departure_time"));
      const dist = g("shape_dist_traveled");
      if (n === cap) grow();
      cols.seq[n] = Number(g("stop_sequence")); cols.arr[n] = arr ?? -1; cols.dep[n] = dep ?? -1; cols.stop[n] = sid ? intern(sid) : -1;
      cols.dist[n] = dist === "" ? NaN : Number(dist); cols.line[n] = line; cols.flags[n] = (g("timepoint") === "1" ? 1 : 0) | (flex ? 2 : 0);
      t.times.push(n++);
    });
    const speedHits = { n: 0 };
    for (const [tid, t] of trips) {
      const ts = t.times.map(row);
      t.times = null;
      if (ts.length === 0) { F.add("error", "trip_without_stop_times", "trips.txt", "A trip has no rows in stop_times.txt, so it serves no stops.", t.line, tid); continue; }
      if (ts.length === 1) { F.add("error", "trip_with_one_stop", "stop_times.txt", "A trip must serve two or more stops (trips.txt definition).", ts[0][5], tid); }
      ts.sort((a, b) => a[0] - b[0]);
      const first = ts[0], last = ts[ts.length - 1];
      for (const [row, label] of [[first, "first"], [last, "last"]]) {
        if (!row[7] && (row[1] < 0 || row[2] < 0)) F.add("error", "missing_end_times", "stop_times.txt", `arrival_time and departure_time are required at a trip's first and last stop.`, row[5], `${tid} (${label} stop)`);
      }
      const rt = routes.get(t.route)?.type;
      const limit = speedLimitKmh(rt);
      let prevTimed = null;
      for (let i = 0; i < ts.length; i++) {
        const r = ts[i];
        if (i > 0 && r[0] === ts[i - 1][0]) F.add("error", "duplicate_key", "stop_times.txt", "The same trip_id and stop_sequence appear twice.", r[5], `${tid} #${r[0]}`);
        if (r[6] && (r[1] < 0 || r[2] < 0)) F.add("error", "timepoint_without_time", "stop_times.txt", "timepoint=1 needs arrival_time and departure_time.", r[5], `${tid} #${r[0]}`);
        if (r[1] >= 0 && r[2] >= 0 && r[2] < r[1]) F.add("error", "departure_before_arrival", "stop_times.txt", "departure_time is earlier than arrival_time at the same stop.", r[5], `${tid} #${r[0]}`);
        if (i > 0 && Number.isFinite(r[4]) && Number.isFinite(ts[i - 1][4]) && r[4] < ts[i - 1][4]) F.add("error", "stop_dist_decreasing", "stop_times.txt", "shape_dist_traveled goes down along the trip; it must increase with stop_sequence.", r[5], `${tid} #${r[0]}`);
        const at = r[1] >= 0 ? r[1] : r[2];
        if (at >= 0) {
          if (prevTimed) {
            const pdep = prevTimed[2] >= 0 ? prevTimed[2] : prevTimed[1];
            if (at < pdep) F.add("error", "time_goes_backwards", "stop_times.txt", "A stop's time is earlier than the stop before it on the same trip; times must not decrease along stop_sequence.", r[5], `${tid} #${prevTimed[0]} ${fmt(pdep)} then #${r[0]} ${fmt(at)}`);
            else if (prevTimed[3] >= 0 && r[3] >= 0) {
              const a = stops.get(stopList[prevTimed[3]]), b = stops.get(stopList[r[3]]);
              if (a && b && Number.isFinite(a.lat) && Number.isFinite(b.lat) && !(a.lat === 0 && a.lon === 0) && !(b.lat === 0 && b.lon === 0)) {
                const m = haversineM(a.lat, a.lon, b.lat, b.lon);
                const kmh = (m / 1000) / (Math.max(at - pdep, 60) / 3600);
                if (kmh > limit) { speedHits.n++; F.add("warning", "too_fast", "stop_times.txt", `The straight-line speed between two stops is above ${limit} km/h, this tool's ceiling for the route's mode; a stop position or a time is likely wrong. Times under a minute apart are counted as one minute.`, r[5], `${tid}: ${stopList[prevTimed[3]]} -> ${stopList[r[3]]}, ${(m / 1000).toFixed(1)} km in ${Math.round(Math.max(at - pdep, 0) / 60)} min = ${Math.round(kmh)} km/h`); }
              }
            }
          }
          prevTimed = r;
        }
      }
      if (ts.length >= 2 && first[2] >= 0 && last[1] >= 0 && last[1] - first[2] > 24 * 3600) F.add("warning", "trip_over_24h", "stop_times.txt", "A trip runs for more than 24 hours from first departure to last arrival; check for a typo in an hour.", last[5], `${tid}: ${fmt(first[2])} to ${fmt(last[1])}`);
    }
  }

  // frequencies
  if (has("frequencies.txt")) {
    const per = new Map();
    readTable("frequencies.txt", files["frequencies.txt"], F, (g, line) => {
      const tid = g("trip_id");
      if (tid && trips.size && !trips.has(tid)) F.add("error", "unknown_reference", "frequencies.txt", "trip_id names a trip that is not in trips.txt.", line, tid);
      const s = parseTime(g("start_time")), e = parseTime(g("end_time"));
      if (s === null || e === null) return;
      if (e <= s) F.add("error", "end_before_start", "frequencies.txt", "end_time must be after start_time.", line, `${tid}: ${g("start_time")} to ${g("end_time")}`);
      if (!per.has(tid)) per.set(tid, []);
      per.get(tid).push([s, e, line]);
    });
    for (const [tid, list] of per) {
      list.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < list.length; i++) if (list[i][0] < list[i - 1][1]) F.add("error", "overlapping_frequencies", "frequencies.txt", "Two headway periods for the same trip overlap; new headways may start only when the previous one ends.", list[i][2], `${tid}: ${fmt(list[i - 1][0])}-${fmt(list[i - 1][1])} and ${fmt(list[i][0])}-${fmt(list[i][1])}`);
    }
  }

  // feed_info
  let feedInfo = null;
  if (has("feed_info.txt")) {
    let n = 0;
    readTable("feed_info.txt", files["feed_info.txt"], F, (g, line) => {
      n++;
      if (n === 1) feedInfo = { start: parseDate(g("feed_start_date")), end: parseDate(g("feed_end_date")), version: g("feed_version"), line };
      if (n === 2) F.add("error", "too_many_rows", "feed_info.txt", "feed_info.txt allows only one row.", line);
      if (!g("feed_contact_email") && !g("feed_contact_url") && n === 1) F.add("info", "no_feed_contact", "feed_info.txt", "Give feed_contact_email or feed_contact_url, so apps that find a problem can tell you.", line);
    });
    if (feedInfo && feedInfo.start !== null && feedInfo.end !== null && feedInfo.end < feedInfo.start) F.add("error", "end_before_start", "feed_info.txt", "feed_end_date precedes feed_start_date.", feedInfo.line);
  }

  // unused records
  for (const [id, r] of routes) if (!r.used && trips.size) F.add("warning", "unused_route", "routes.txt", "A route has no trips.", r.line, id);
  for (const [id, s] of stops) if (s.type === 0 && !s.used && trips.size) F.add("info", "unused_stop", "stops.txt", "A stop is never served by any trip. Old stops should be removed so they do not show on maps.", s.line, id);
  for (const [id, s] of shapes) if (!s.used && trips.size) F.add("info", "unused_shape", "shapes.txt", "A shape is not used by any trip.", s.pts[0]?.[4] ?? null, id);
  for (const [id, s] of services) if (!s.used && trips.size) F.add("info", "unused_service", s.inCal ? "calendar.txt" : "calendar_dates.txt", "A service_id is used by no trip.", s.line, id);

  // service coverage
  const cov = coverage(services, today);
  stats.firstServiceDate = cov.first === null ? null : formatDay(cov.first);
  stats.lastServiceDate = cov.last === null ? null : formatDay(cov.last);
  stats.daysWithServiceNext30 = cov.next30;
  for (const [id, s] of services) if (s.used && !cov.active.has(id)) F.add("warning", "service_never_runs", s.inCal ? "calendar.txt" : "calendar_dates.txt", "A service_id used by trips has no date on which it runs (no weekday set in its range and no added dates).", s.line, id);
  if (cov.last === null) F.add("error", "no_service_dates", "calendar.txt", "No trip in the feed runs on any date.");
  else if (cov.last < today) F.add("error", "feed_expired", "calendar.txt", `The last date with service is ${iso(cov.last)}, before today (${iso(today)}): trip planners show no service from this feed. Publish a feed that covers upcoming service.`, null, `last service ${iso(cov.last)}`);
  else if (cov.last < today + 7) F.add("warning", "feed_expires_within_7_days", "calendar.txt", `Service ends on ${iso(cov.last)}. A published feed should be valid for at least the next 7 days (Dataset Publishing & General Practices).`, null, `last service ${iso(cov.last)}`);
  else if (cov.last < today + 30) F.add("info", "feed_covers_under_30_days", "calendar.txt", `Service ends on ${iso(cov.last)}, less than 30 days away. If possible a feed should cover at least the next 30 days (Dataset Publishing & General Practices).`, null, `last service ${iso(cov.last)}`);
  if (cov.last !== null && cov.last >= today && cov.gaps.length) F.add("warning", "no_service_day", "calendar.txt", "Within the feed's own service period, a day in the next 30 has no service at all. Fine for a holiday shutdown; otherwise a service_id is missing a day.", null, cov.gaps.map(iso).join(", "));
  if (cov.first !== null && cov.first > today) F.add("info", "feed_not_started", "calendar.txt", `The first date with service is ${iso(cov.first)}, after today; nothing runs until then.`);
  if (feedInfo && feedInfo.end !== null) {
    if (feedInfo.end < today) F.add("warning", "feed_info_expired", "feed_info.txt", `feed_end_date (${iso(feedInfo.end)}) is in the past. Consumers may treat the whole feed as expired even if calendar.txt runs later.`, feedInfo.line);
    if (cov.last !== null && cov.last > feedInfo.end) F.add("warning", "feed_info_end_before_service", "feed_info.txt", `feed_end_date (${iso(feedInfo.end)}) is earlier than the last date with service (${iso(cov.last)}); one of them is stale.`, feedInfo.line);
  }
  const list = F.list();
  const summary = { errors: 0, warnings: 0, infos: 0 };
  for (const f of list) summary[f.severity === "error" ? "errors" : f.severity === "warning" ? "warnings" : "infos"] += f.count;
  return { spec: SPEC, summary, stats, findings: list };
}

function fmt(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function iso(day) { const s = formatDay(day); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`; }

// Which days have service. Walks each calendar range day by day, but only the
// part from two years before today to five years after, so a range written as
// 2000-2099 costs the same as a real one.
export function coverage(services, today) {
  const lo = today - 730, hi = today + 1826;
  const days = new Map(); // day -> count of active services
  const active = new Set();
  let first = null, last = null;
  const mark = (id, d) => {
    active.add(id);
    days.set(d, (days.get(d) || 0) + 1);
    if (first === null || d < first) first = d;
    if (last === null || d > last) last = d;
  };
  for (const [id, s] of services) {
    if (!s.used && services.size > 0 && [...services.values()].some((x) => x.used)) continue;
    if (s.inCal && s.start !== null && s.end !== null && s.week) {
      const a = Math.max(s.start, lo), b = Math.min(s.end, hi);
      for (let d = a; d <= b; d++) {
        const wd = (((d + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
        if (s.week[wd] && !s.removed.has(d)) mark(id, d);
      }
      // Outside the walked window: the range's own first/last running day.
      if (s.end > hi && s.week.some(Boolean)) { last = Math.max(last ?? s.end, s.end); active.add(id); }
      if (s.end < lo || s.start > hi) for (let d = s.end; d >= Math.max(s.start, s.end - 6); d--) if (s.week[(((d + 4) % 7) + 7) % 7] && !s.removed.has(d)) { mark(id, d); break; }
      if (s.start < lo || s.start > hi) for (let d = s.start; d <= Math.min(s.end, s.start + 6); d++) if (s.week[(((d + 4) % 7) + 7) % 7] && !s.removed.has(d)) { mark(id, d); break; }
    }
    for (const d of s.added) mark(id, d);
  }
  let next30 = 0;
  const gaps = [];
  for (let d = today; d < today + 30; d++) {
    if (days.get(d)) next30++;
    else if (last !== null && d <= last && (first === null || d >= first)) gaps.push(d);
  }
  return { first, last, next30, gaps, active };
}

// ---------------------------------------------------------------- helpers

export function decodeText(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

export function findingsCsv(result) {
  const q = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // spreadsheet formula guard; plain numbers pass
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = ["severity,code,file,count,line,detail,message"];
  for (const f of result.findings) {
    const ex = f.examples.length ? f.examples : [{ line: "", detail: "" }];
    for (const e of ex) out.push([f.severity, f.code, f.file, f.count, e.line ?? "", e.detail ?? "", f.message].map(q).join(","));
  }
  return out.join("\n") + "\n";
}

// Two made-up feeds for the page's example buttons and the tests.
export function sampleFeed() {
  return {
    "agency.txt": "agency_id,agency_name,agency_url,agency_timezone,agency_lang\nRVT,River Valley Transit,https://example.org/transit,America/Chicago,en\n",
    "stops.txt": "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nDEPOT,Main Street Depot,41.8800,-87.6300,,\nLIB,Public Library,41.8850,-87.6250,,\nPARK,Riverside Park,41.8900,-87.6200,,\nMALL,Valley Mall,41.8950,-87.6150,,\n",
    "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n1,RVT,1,Depot - Valley Mall,3,1F5FAD,FFFFFF\n",
    "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n1,WK,1-0700,Valley Mall,0,S1\n1,WK,1-0800,Valley Mall,0,S1\n",
    "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,timepoint\n1-0700,07:00:00,07:00:00,DEPOT,1,1\n1-0700,07:04:00,07:04:00,LIB,2,0\n1-0700,07:08:00,07:08:00,PARK,3,0\n1-0700,07:12:00,07:12:00,MALL,4,1\n1-0800,08:00:00,08:00:00,DEPOT,1,1\n1-0800,08:04:00,08:04:00,LIB,2,0\n1-0800,08:08:00,08:08:00,PARK,3,0\n1-0800,08:12:00,08:12:00,MALL,4,1\n",
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260101,20291231\n",
    "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,41.8800,-87.6300,1\nS1,41.8850,-87.6250,2\nS1,41.8900,-87.6200,3\nS1,41.8950,-87.6150,4\n",
    "feed_info.txt": "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version,feed_contact_email\nRiver Valley Transit,https://example.org/transit,en,20260101,20291231,2026-11,gtfs@example.org\n",
  };
}

export function sampleBrokenFeed() {
  return {
    "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\nRVT,River Valley Transit,example.org,America/Chicgo\n",
    "stops.txt": "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nDEPOT,MAIN STREET DEPOT,41.8800,-87.6300,,\nLIB,Public Library,0,0,,\nPARK,Riverside Park,-87.6200,41.8900,,\nMALL,Valley Mall,41.8950,-87.6150,,\nSTN,Valley Station,41.8950,-87.6150,1,\nOLD,Old Stop,41.9000,-87.6100,,\n",
    "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n1,RVT,1,Depot - Valley Mall,3,#1F5FAD,FFFFFF\n2,RVT,Crosstown Express Line,,3,FFFF00,FFFFFF\n",
    "trips.txt": "route_id,service_id,trip_id,trip_headsign\n1,WK,1-0700,Valley Mall\n1,WKND,1-0800,Valley Mall\n9,WK,9-0900,Nowhere\n",
    "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,drop_off_time\n1-0700,07:00:00,07:00:00,DEPOT,1,\n1-0700,07:04:00,07:03:00,LIB,2,\n1-0700,07:02:00,07:02:00,PARK,3,\n1-0700,,,MALL,4,\n1-0800,08:00:00,08:00:00,DEPOT,1,\n1-0800,08:01:00,08:01:00,STN,2,\n1-0800,8:61:00,08:12:00,MALL,3,\n9-0900,09:00:00,09:00:00,DEPOT,1,\n9-0900,09:05:00,09:05:00,GHOST,2,\n",
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20240101,20241231\n",
  };
}

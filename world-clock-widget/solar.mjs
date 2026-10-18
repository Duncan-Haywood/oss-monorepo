// Sunrise/sunset, daylight length, and "is it a civil hour there?" — computed
// locally, with no network call and no API key.
//
// The solar math is a direct port of this venture's own
// `Sources/WorldClockCore/SolarCalculator.swift`, which implements the
// "Sunrise/Sunset Algorithm" from the *Almanac for Computers, 1990* (Nautical
// Almanac Office, United States Naval Observatory) — the public-domain
// algorithm behind most open-source sunrise calculators. Accurate to roughly a
// minute outside the polar circles.
//
// WHY A PORT RATHER THAN A REWRITE. The Swift original already carries a fix
// for a real bug its own tests pin (see `dayAnchoredTime` below), and the JS
// tests beside this file assert the same reference values against the same
// cities and dates. Re-deriving the algorithm would have thrown that evidence
// away; translating it keeps it.

/** The official zenith angle in degrees. Already accounts for atmospheric
 * refraction and the sun's apparent radius. */
const OFFICIAL_ZENITH = 90.83;

const sinDeg = (d) => Math.sin((d * Math.PI) / 180);
const cosDeg = (d) => Math.cos((d * Math.PI) / 180);
const tanDeg = (d) => Math.tan((d * Math.PI) / 180);
const atanDeg = (v) => (Math.atan(v) * 180) / Math.PI;
const acosDeg = (v) => (Math.acos(v) * 180) / Math.PI;

function normalizedDegrees(degrees) {
  let result = degrees % 360;
  if (result < 0) result += 360;
  return result;
}

/** The fixed set of cities this tool can show. Coordinates are city-centre
 * approximations, which is well inside the algorithm's own error bar.
 * Kept in step with `Sources/WorldClockCore/CityCatalog.swift`; the test file
 * asserts the two stay the same length and share every id. */
export const CITIES = [
  // Europe
  { id: "london", name: "London", country: "United Kingdom", timeZone: "Europe/London", latitude: 51.5074, longitude: -0.1278 },
  { id: "paris", name: "Paris", country: "France", timeZone: "Europe/Paris", latitude: 48.8566, longitude: 2.3522 },
  { id: "berlin", name: "Berlin", country: "Germany", timeZone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 },
  { id: "madrid", name: "Madrid", country: "Spain", timeZone: "Europe/Madrid", latitude: 40.4168, longitude: -3.7038 },
  { id: "rome", name: "Rome", country: "Italy", timeZone: "Europe/Rome", latitude: 41.9028, longitude: 12.4964 },
  { id: "istanbul", name: "Istanbul", country: "Türkiye", timeZone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 },
  { id: "moscow", name: "Moscow", country: "Russia", timeZone: "Europe/Moscow", latitude: 55.7558, longitude: 37.6173 },
  { id: "reykjavik", name: "Reykjavík", country: "Iceland", timeZone: "Atlantic/Reykjavik", latitude: 64.1466, longitude: -21.9426 },

  // Americas
  { id: "new-york", name: "New York", country: "United States", timeZone: "America/New_York", latitude: 40.7128, longitude: -74.006 },
  { id: "los-angeles", name: "Los Angeles", country: "United States", timeZone: "America/Los_Angeles", latitude: 34.0522, longitude: -118.2437 },
  { id: "chicago", name: "Chicago", country: "United States", timeZone: "America/Chicago", latitude: 41.8781, longitude: -87.6298 },
  { id: "denver", name: "Denver", country: "United States", timeZone: "America/Denver", latitude: 39.7392, longitude: -104.9903 },
  { id: "anchorage", name: "Anchorage", country: "United States", timeZone: "America/Anchorage", latitude: 61.2181, longitude: -149.9003 },
  { id: "honolulu", name: "Honolulu", country: "United States", timeZone: "Pacific/Honolulu", latitude: 21.3069, longitude: -157.8583 },
  { id: "toronto", name: "Toronto", country: "Canada", timeZone: "America/Toronto", latitude: 43.6532, longitude: -79.3832 },
  { id: "vancouver", name: "Vancouver", country: "Canada", timeZone: "America/Vancouver", latitude: 49.2827, longitude: -123.1207 },
  { id: "mexico-city", name: "Mexico City", country: "Mexico", timeZone: "America/Mexico_City", latitude: 19.4326, longitude: -99.1332 },
  { id: "sao-paulo", name: "São Paulo", country: "Brazil", timeZone: "America/Sao_Paulo", latitude: -23.5505, longitude: -46.6333 },
  { id: "buenos-aires", name: "Buenos Aires", country: "Argentina", timeZone: "America/Argentina/Buenos_Aires", latitude: -34.6037, longitude: -58.3816 },

  // Africa
  { id: "cairo", name: "Cairo", country: "Egypt", timeZone: "Africa/Cairo", latitude: 30.0444, longitude: 31.2357 },
  { id: "lagos", name: "Lagos", country: "Nigeria", timeZone: "Africa/Lagos", latitude: 6.5244, longitude: 3.3792 },
  { id: "nairobi", name: "Nairobi", country: "Kenya", timeZone: "Africa/Nairobi", latitude: -1.2921, longitude: 36.8219 },
  { id: "johannesburg", name: "Johannesburg", country: "South Africa", timeZone: "Africa/Johannesburg", latitude: -26.2041, longitude: 28.0473 },

  // Middle East & South Asia
  { id: "dubai", name: "Dubai", country: "United Arab Emirates", timeZone: "Asia/Dubai", latitude: 25.2048, longitude: 55.2708 },
  { id: "riyadh", name: "Riyadh", country: "Saudi Arabia", timeZone: "Asia/Riyadh", latitude: 24.7136, longitude: 46.6753 },
  { id: "tel-aviv", name: "Tel Aviv", country: "Israel", timeZone: "Asia/Jerusalem", latitude: 32.0853, longitude: 34.7818 },
  { id: "karachi", name: "Karachi", country: "Pakistan", timeZone: "Asia/Karachi", latitude: 24.8607, longitude: 67.0011 },
  { id: "mumbai", name: "Mumbai", country: "India", timeZone: "Asia/Kolkata", latitude: 19.076, longitude: 72.8777 },
  { id: "new-delhi", name: "New Delhi", country: "India", timeZone: "Asia/Kolkata", latitude: 28.6139, longitude: 77.209 },

  // East & Southeast Asia
  { id: "bangkok", name: "Bangkok", country: "Thailand", timeZone: "Asia/Bangkok", latitude: 13.7563, longitude: 100.5018 },
  { id: "jakarta", name: "Jakarta", country: "Indonesia", timeZone: "Asia/Jakarta", latitude: -6.2088, longitude: 106.8456 },
  { id: "singapore", name: "Singapore", country: "Singapore", timeZone: "Asia/Singapore", latitude: 1.3521, longitude: 103.8198 },
  { id: "hong-kong", name: "Hong Kong", country: "Hong Kong", timeZone: "Asia/Hong_Kong", latitude: 22.3193, longitude: 114.1694 },
  { id: "shanghai", name: "Shanghai", country: "China", timeZone: "Asia/Shanghai", latitude: 31.2304, longitude: 121.4737 },
  { id: "beijing", name: "Beijing", country: "China", timeZone: "Asia/Shanghai", latitude: 39.9042, longitude: 116.4074 },
  { id: "seoul", name: "Seoul", country: "South Korea", timeZone: "Asia/Seoul", latitude: 37.5665, longitude: 126.978 },
  { id: "tokyo", name: "Tokyo", country: "Japan", timeZone: "Asia/Tokyo", latitude: 35.6762, longitude: 139.6503 },

  // Oceania
  { id: "sydney", name: "Sydney", country: "Australia", timeZone: "Australia/Sydney", latitude: -33.8688, longitude: 151.2093 },
  { id: "melbourne", name: "Melbourne", country: "Australia", timeZone: "Australia/Melbourne", latitude: -37.8136, longitude: 144.9631 },
  { id: "auckland", name: "Auckland", country: "New Zealand", timeZone: "Pacific/Auckland", latitude: -36.8485, longitude: 174.7633 },
];

const CITIES_BY_ID = new Map(CITIES.map((c) => [c.id, c]));

export function cityById(id) {
  return CITIES_BY_ID.get(id) ?? null;
}

/** The spread shown before anyone has picked their own set: six zones across
 * five continents and both hemispheres, so the default view is already dense
 * enough to be worth reading. The test file asserts every id here resolves —
 * a typo would otherwise silently cost a row on first load. */
export const DEFAULT_CITY_IDS = ["los-angeles", "new-york", "london", "dubai", "tokyo", "sydney"];

// ---------------------------------------------------------------------------
// Time-zone primitives
// ---------------------------------------------------------------------------

// One formatter per zone. Constructing an Intl.DateTimeFormat is the expensive
// part here and the clock re-renders every second across a dozen rows, so the
// cache is what keeps a tick from allocating ~40 formatters.
const PARTS_FORMATTERS = new Map();

function partsFormatter(timeZone) {
  let fmt = PARTS_FORMATTERS.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    PARTS_FORMATTERS.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock fields for `date` as observed in `timeZone`. */
export function zonedParts(date, timeZone) {
  const parts = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(date)) {
    if (type !== "literal") parts[type] = value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

/** Offset from UTC in minutes that `timeZone` is observing at `date`.
 *
 * Derived by round-tripping the zone's own wall-clock reading back through
 * `Date.UTC`, rather than by parsing a `longOffset` string: `longOffset` is
 * formatted differently across engines and is absent on older ones, while this
 * arithmetic only needs `formatToParts`, which every engine that has `timeZone`
 * support already has. */
export function utcOffsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to the minute: the source instant carries milliseconds that the
  // formatted parts above have already dropped.
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// ---------------------------------------------------------------------------
// The Almanac algorithm
// ---------------------------------------------------------------------------

/** Sunrise or sunset as a UTC instant, anchored to the *UTC* calendar day
 * (year, month, day). Returns null where the sun neither rises nor sets.
 *
 * `event` is "sunrise" or "sunset". Exported for the tests; callers usually
 * want `solarEvent` below, which resolves the day correctly for a city. */
export function rawSolarEvent(event, year, month, day, latitude, longitude) {
  // 1. Day of the year.
  const n1 = Math.floor((275 * month) / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const dayOfYear = n1 - n2 * n3 + day - 30;

  // 2. Longitude to hours, and a first estimate of the event time.
  const longitudeHours = longitude / 15;
  const approxTime =
    event === "sunrise"
      ? dayOfYear + (6 - longitudeHours) / 24
      : dayOfYear + (18 - longitudeHours) / 24;

  // 3. The sun's mean anomaly.
  const meanAnomaly = 0.9856 * approxTime - 3.289;

  // 4. The sun's true longitude.
  let trueLongitude =
    meanAnomaly + 1.916 * sinDeg(meanAnomaly) + 0.02 * sinDeg(2 * meanAnomaly) + 282.634;
  trueLongitude = normalizedDegrees(trueLongitude);

  // 5. Right ascension, moved into the same quadrant as the true longitude.
  let rightAscension = normalizedDegrees(atanDeg(0.91764 * tanDeg(trueLongitude)));
  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension += longitudeQuadrant - ascensionQuadrant;
  rightAscension /= 15; // degrees -> hours

  // 6. Declination.
  const sinDeclination = 0.39782 * sinDeg(trueLongitude);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));

  // 7. Local hour angle.
  const cosHourAngle =
    (cosDeg(OFFICIAL_ZENITH) - sinDeclination * sinDeg(latitude)) /
    (cosDeclination * cosDeg(latitude));

  // Above 1 the sun never rises; below -1 it never sets. Both are real states
  // inside the polar circles, and the caller renders them as such rather than
  // as an error.
  if (!(cosHourAngle >= -1 && cosHourAngle <= 1)) return null;

  let hourAngle = event === "sunrise" ? 360 - acosDeg(cosHourAngle) : acosDeg(cosHourAngle);
  hourAngle /= 15; // degrees -> hours

  // 8. Local mean time of the event.
  const localMeanTime = hourAngle + rightAscension - 0.06571 * approxTime - 6.622;

  // 9. Back to UT, wrapped into [0, 24).
  let universalTime = localMeanTime - longitudeHours;
  universalTime %= 24;
  if (universalTime < 0) universalTime += 24;

  return new Date(Date.UTC(year, month - 1, day) + universalTime * 3600 * 1000);
}

/** Sunrise or sunset for `city` on the calendar date that `referenceDate` falls
 * on *in that city's own time zone*.
 *
 * `rawSolarEvent` anchors its result to the UTC day matching (year, month,
 * day), but that triple is the city's *local* day. For any city whose civil UTC
 * offset diverges from its raw longitude/15 — true for most cities away from
 * Greenwich, e.g. Tokyo (+09:00 civil vs +09:18 solar) or Los Angeles (-07:00
 * vs -07:53) — the returned instant can land a whole calendar day off once read
 * back in the city's zone. Tokyo's 21 June sunrise came back dated 22 June JST
 * until this nudge was added, and the tests beside this file pin both
 * directions. */
export function solarEvent(event, city, referenceDate) {
  const { year, month, day } = zonedParts(referenceDate, city.timeZone);
  const candidate = rawSolarEvent(event, year, month, day, city.latitude, city.longitude);
  if (!candidate) return null;

  const fallsOnRequestedLocalDay = (date) => {
    const p = zonedParts(date, city.timeZone);
    return p.year === year && p.month === month && p.day === day;
  };

  if (fallsOnRequestedLocalDay(candidate)) return candidate;
  for (const dayOffset of [1, -1]) {
    const shifted = new Date(candidate.getTime() + dayOffset * 86400000);
    if (fallsOnRequestedLocalDay(shifted)) return shifted;
  }
  return candidate;
}

/** Daylight length in minutes, or null when the sun does not both rise and set. */
export function daylightMinutes(city, referenceDate) {
  const sunrise = solarEvent("sunrise", city, referenceDate);
  const sunset = solarEvent("sunset", city, referenceDate);
  if (!sunrise || !sunset) return null;
  return Math.round((sunset.getTime() - sunrise.getTime()) / 60000);
}

// ---------------------------------------------------------------------------
// "Can I call them right now?"
// ---------------------------------------------------------------------------

/** Civil-hour bands, in local wall-clock hours. These are a courtesy heuristic
 * about *waking hours*, not a claim about anyone's working day — the copy on
 * the page says so, and `reachability` returns the band name so the page can
 * label it rather than implying a rule. */
export const REACHABILITY_BANDS = [
  { id: "asleep", label: "Asleep", from: 0, to: 7 },
  { id: "early", label: "Early", from: 7, to: 9 },
  { id: "working", label: "Working hours", from: 9, to: 17 },
  { id: "evening", label: "Evening", from: 17, to: 22 },
  { id: "asleep-late", label: "Asleep", from: 22, to: 24 },
];

/** Which civil band the local hour falls in. */
export function reachability(localHour) {
  const hour = Math.max(0, Math.min(23, Math.floor(localHour)));
  const band = REACHABILITY_BANDS.find((b) => hour >= b.from && hour < b.to);
  // The bands above tile [0, 24) with no gap, so this fallback is unreachable
  // for any integer hour; it exists so a future edit that opens a gap degrades
  // to a label rather than to a crash in the render loop.
  return band ?? REACHABILITY_BANDS[0];
}

/** Whether `date` in `city` is between sunrise and sunset. Cities where the sun
 * does not set (or rise) report `null`, which the page renders as midnight sun
 * or polar night rather than guessing. */
export function isDaylight(city, date) {
  const sunrise = solarEvent("sunrise", city, date);
  const sunset = solarEvent("sunset", city, date);
  if (!sunrise || !sunset) return null;
  return date >= sunrise && date < sunset;
}

/** Everything the table needs for one city at one instant. */
export function cityClock(city, now) {
  const parts = zonedParts(now, city.timeZone);
  const sunrise = solarEvent("sunrise", city, now);
  const sunset = solarEvent("sunset", city, now);
  const minutes = daylightMinutes(city, now);
  return {
    city,
    parts,
    offsetMinutes: utcOffsetMinutes(now, city.timeZone),
    sunrise,
    sunset,
    daylightMinutes: minutes,
    daylight: isDaylight(city, now),
    band: reachability(parts.hour),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, "0");

export function formatClock(parts) {
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function formatEventTime(date, timeZone) {
  if (!date) return "—";
  const p = zonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatDuration(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${pad2(m)}m`;
}

/** A signed hour difference, e.g. "+9h", "-5h30m", "same time". */
export function formatOffsetDelta(deltaMinutes) {
  if (deltaMinutes === 0) return "same time";
  const sign = deltaMinutes > 0 ? "+" : "-";
  const abs = Math.abs(deltaMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h${pad2(m)}m`;
}

/** UTC offset as "UTC+09:00". */
export function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

/** Parse a `?cities=` value into known ids, dropping unknown ones rather than
 * failing: a link that names one retired city should still open. */
export function parseCityIds(raw) {
  if (!raw) return [];
  const seen = new Set();
  const out = [];
  for (const piece of String(raw).split(",")) {
    const id = piece.trim().toLowerCase();
    if (CITIES_BY_ID.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function serializeCityIds(ids) {
  return ids.join(",");
}

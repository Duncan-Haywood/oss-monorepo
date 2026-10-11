// Wedding day timeline engine. Pure functions, no I/O. All times are minutes
// after midnight on the wedding day (a program running past midnight goes above
// 1440). The rules of thumb (how long a first look takes, how long a family
// photo group takes) are conventions from wedding photography and planning
// practice, not measurements; every one is an input or a named constant here.

export const CITIES = [
  { name: "New York, NY", lat: 40.7128, lon: -74.006, tz: "America/New_York" },
  { name: "Boston, MA", lat: 42.3601, lon: -71.0589, tz: "America/New_York" },
  { name: "Philadelphia, PA", lat: 39.9526, lon: -75.1652, tz: "America/New_York" },
  { name: "Washington, DC", lat: 38.9072, lon: -77.0369, tz: "America/New_York" },
  { name: "Charleston, SC", lat: 32.7765, lon: -79.9311, tz: "America/New_York" },
  { name: "Savannah, GA", lat: 32.0809, lon: -81.0912, tz: "America/New_York" },
  { name: "Asheville, NC", lat: 35.5951, lon: -82.5515, tz: "America/New_York" },
  { name: "Atlanta, GA", lat: 33.749, lon: -84.388, tz: "America/New_York" },
  { name: "Miami, FL", lat: 25.7617, lon: -80.1918, tz: "America/New_York" },
  { name: "Jacksonville, FL", lat: 30.3322, lon: -81.6557, tz: "America/New_York" },
  { name: "Detroit, MI", lat: 42.3314, lon: -83.0458, tz: "America/Detroit" },
  { name: "Chicago, IL", lat: 41.8781, lon: -87.6298, tz: "America/Chicago" },
  { name: "Minneapolis, MN", lat: 44.9778, lon: -93.265, tz: "America/Chicago" },
  { name: "Nashville, TN", lat: 36.1627, lon: -86.7816, tz: "America/Chicago" },
  { name: "Houston, TX", lat: 29.7604, lon: -95.3698, tz: "America/Chicago" },
  { name: "Dallas, TX", lat: 32.7767, lon: -96.797, tz: "America/Chicago" },
  { name: "Austin, TX", lat: 30.2672, lon: -97.7431, tz: "America/Chicago" },
  { name: "San Antonio, TX", lat: 29.4241, lon: -98.4936, tz: "America/Chicago" },
  { name: "Denver, CO", lat: 39.7392, lon: -104.9903, tz: "America/Denver" },
  { name: "Salt Lake City, UT", lat: 40.7608, lon: -111.891, tz: "America/Denver" },
  { name: "Phoenix, AZ", lat: 33.4484, lon: -112.074, tz: "America/Phoenix" },
  { name: "Las Vegas, NV", lat: 36.1699, lon: -115.1398, tz: "America/Los_Angeles" },
  { name: "Los Angeles, CA", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles" },
  { name: "San Diego, CA", lat: 32.7157, lon: -117.1611, tz: "America/Los_Angeles" },
  { name: "San Jose, CA", lat: 37.3382, lon: -121.8863, tz: "America/Los_Angeles" },
  { name: "Napa, CA", lat: 38.2975, lon: -122.2869, tz: "America/Los_Angeles" },
  { name: "Portland, OR", lat: 45.5152, lon: -122.6784, tz: "America/Los_Angeles" },
  { name: "Seattle, WA", lat: 47.6062, lon: -122.3321, tz: "America/Los_Angeles" },
  { name: "Anchorage, AK", lat: 61.2181, lon: -149.9003, tz: "America/Anchorage" },
  { name: "Honolulu, HI", lat: 21.3069, lon: -157.8583, tz: "Pacific/Honolulu" },
  { name: "Toronto, ON", lat: 43.6532, lon: -79.3832, tz: "America/Toronto" },
  { name: "Vancouver, BC", lat: 49.2827, lon: -123.1207, tz: "America/Vancouver" },
  { name: "London, UK", lat: 51.5072, lon: -0.1276, tz: "Europe/London" },
  { name: "Dublin, IE", lat: 53.3498, lon: -6.2603, tz: "Europe/Dublin" },
  { name: "Sydney, AU", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
];

export const MEALS = {
  plated: { label: "Plated dinner", base: 40, perGuest: 0.2 },
  buffet: { label: "Buffet", base: 25, perGuest: 0.25 },
  stations: { label: "Food stations", base: 30, perGuest: 0.15 },
  family: { label: "Family style", base: 40, perGuest: 0.15 },
};

export const VIEWS = {
  all: "Everyone",
  couple: "The couple",
  party: "Wedding party",
  family: "Family",
  photo: "Photographer and videographer",
  dj: "DJ, MC or band",
  catering: "Caterer and venue",
};

// ---- time helpers ----------------------------------------------------------

export function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function timeInput(mins) {
  const t = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function fmtTime(mins) {
  const t = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDur(mins) {
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

export function prettyDate(iso) {
  const d = parseDate(iso);
  return d ? `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : "";
}

// ---- sun position (NOAA general solar position formulas) -------------------

export function sunTimes(dateISO, lat, lon, offsetHours) {
  const d = parseDate(dateISO);
  if (!d || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(offsetHours)) return null;
  const doy = Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const rad = Math.PI / 180;
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa > 1) return { polar: "night" };
  if (cosHa < -1) return { polar: "day" };
  const ha = Math.acos(cosHa) / rad;
  const wrap = (v) => ((v % 1440) + 1440) % 1440;
  const sunrise = wrap(720 - 4 * (lon + ha) - eq + offsetHours * 60);
  const sunset = wrap(720 - 4 * (lon - ha) - eq + offsetHours * 60);
  return { sunrise, sunset, polar: null };
}

// UTC offset of an IANA zone on a date, in hours (includes daylight saving).
export function tzOffsetHours(dateISO, tz) {
  const d = parseDate(dateISO);
  if (!d) return null;
  const at = new Date(d.getTime() + 18 * 3600000); // midday-ish in the Americas, avoids the date line
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at).map((p) => [p.type, p.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return (local - at.getTime()) / 3600000;
  } catch {
    return null;
  }
}

// ---- input normalisation ---------------------------------------------------

const num = (v, dflt, lo, hi) => {
  const n = v === "" || v === null || v === undefined ? NaN : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

export function normalize(raw) {
  const errors = [];
  const date = parseDate(raw.date) ? raw.date : null;
  if (!date) errors.push("Enter the wedding date.");
  const ceremonyStart = typeof raw.ceremonyStart === "number" ? raw.ceremonyStart : parseTime(raw.ceremonyStart);
  if (ceremonyStart === null || ceremonyStart === undefined) errors.push("Enter the ceremony start time.");
  let curfew = typeof raw.curfew === "number" ? raw.curfew : parseTime(raw.curfew);
  if (curfew === null || curfew === undefined) errors.push("Enter the time the music has to stop.");
  if (ceremonyStart != null && curfew != null && curfew <= ceremonyStart) curfew += 1440;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const offset = Number(raw.offset);
  if (raw.lat === "" || raw.lon === "" || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) errors.push("Choose a city or enter latitude and longitude.");
  if (raw.offset === "" || !Number.isFinite(offset) || offset < -12 || offset > 14) errors.push("Enter the UTC offset for the venue (for example -5).");
  const meal = MEALS[raw.meal] ? raw.meal : "plated";
  const p = {
    date, ceremonyStart, curfew, lat, lon, offset, meal,
    ceremonyLen: num(raw.ceremonyLen, 30, 10, 120),
    outdoors: raw.outdoors !== false,
    sameVenue: raw.sameVenue !== false,
    travel: num(raw.travel, 20, 0, 120),
    firstLook: Boolean(raw.firstLook),
    partySize: Math.round(num(raw.partySize, 8, 0, 30)),
    familyGroups: Math.round(num(raw.familyGroups, 10, 0, 40)),
    minPerGroup: num(raw.minPerGroup, 3, 1, 10),
    guests: Math.round(num(raw.guests, 100, 2, 1000)),
    dinnerMin: raw.dinnerMin === "" || raw.dinnerMin == null ? null : num(raw.dinnerMin, null, 20, 180),
    cocktailMin: num(raw.cocktailMin, 60, 0, 180),
    toasts: Math.round(num(raw.toasts, 3, 0, 10)),
    grandEntrance: raw.grandEntrance !== false,
    parentDances: raw.parentDances !== false,
    cake: raw.cake !== false,
    bouquet: Boolean(raw.bouquet),
    sendoff: raw.sendoff !== false,
    hairPeople: Math.round(num(raw.hairPeople, 5, 0, 20)),
    artists: Math.round(num(raw.artists, 2, 1, 8)),
    brideMin: num(raw.brideMin, 90, 20, 240),
    otherMin: num(raw.otherMin, 60, 15, 180),
  };
  return { ok: errors.length === 0, errors, p };
}

export function dinnerMinutes(p) {
  if (p.dinnerMin) return Math.round(p.dinnerMin);
  const m = MEALS[p.meal];
  return Math.round((m.base + p.guests * m.perGuest) / 5) * 5;
}

// ---- hair and makeup schedule (longest job first onto the freest artist) ---

export function scheduleBeauty(p) {
  if (p.hairPeople === 0) return { makespan: 0, jobs: [] };
  const people = [{ name: "Bride or lead client", min: p.brideMin }];
  for (let i = 2; i <= p.hairPeople; i++) people.push({ name: `Client ${i}`, min: p.otherMin });
  people.sort((a, b) => b.min - a.min);
  const free = Array(p.artists).fill(0);
  const jobs = [];
  for (const person of people) {
    let k = 0;
    for (let i = 1; i < free.length; i++) if (free[i] < free[k]) k = i;
    jobs.push({ name: person.name, artist: k + 1, from: free[k], to: free[k] + person.min });
    free[k] += person.min;
  }
  return { makespan: Math.max(...free), jobs };
}

// ---- the program -----------------------------------------------------------

const GOLDEN_LEN = 15;
const GOLDEN_IDEAL_BEFORE_SUNSET = 30;

function ev(start, dur, title, who, extra = {}) {
  return { start, end: start + dur, title, who, couple: false, kind: "event", note: "", ...extra };
}

export function buildDay(p) {
  const T = p.ceremonyStart;
  const events = [];
  const warnings = [];
  const sun = sunTimes(p.date, p.lat, p.lon, p.offset);
  const beauty = scheduleBeauty(p);

  const partyMin = p.partySize > 0 ? 10 + Math.round(p.partySize * 2) : 0;
  const familyMin = p.familyGroups > 0 ? Math.round(p.familyGroups * p.minPerGroup + 5) : 0;
  const coupleMin = 30;

  // before the ceremony, working backwards
  let dressEnd;
  if (p.firstLook) {
    const famEnd = T - 20;
    const famStart = famEnd - familyMin;
    const partyStart = famStart - partyMin;
    const coupleStart = partyStart - coupleMin;
    const flStart = coupleStart - 15;
    dressEnd = flStart - 10;
    events.push(ev(flStart, 15, "First look", ["couple", "photo"], { couple: true, note: "Private moment; photographer and videographer only." }));
    events.push(ev(coupleStart, coupleMin, "Couple portraits", ["couple", "photo"], { couple: true }));
    if (partyMin) events.push(ev(partyStart, partyMin, "Wedding party portraits", ["couple", "party", "photo"], { couple: true }));
    if (familyMin) events.push(ev(famStart, familyMin, `Family portraits (${p.familyGroups} groups)`, ["couple", "family", "photo"], { couple: true, note: "Give the photographer a written list of groups and name a helper who knows everyone." }));
    events.push(ev(famEnd, 20, "Couple freshens up and hides before guests see them", ["couple", "party"], { couple: true }));
  } else {
    dressEnd = T - 30;
  }
  const dressStart = dressEnd - 30;
  const hairStart = dressStart - beauty.makespan;
  if (beauty.jobs.length) {
    events.push(ev(hairStart, beauty.makespan, `Hair and makeup (${p.hairPeople} ${p.hairPeople === 1 ? "person" : "people"}, ${p.artists} ${p.artists === 1 ? "artist" : "artists"})`, ["couple", "party", "photo"], { note: beauty.jobs.slice().sort((a, b) => a.from - b.from).map((j) => `${j.name}: ${fmtTime(hairStart + j.from)} to ${fmtTime(hairStart + j.to)} (artist ${j.artist})`).join("; ") }));
  }
  events.push(ev(dressStart, 30, "Dress, veil, jewellery and final touches", ["couple", "party", "photo"], { couple: true }));
  const photoArrive = dressStart - 90;
  events.push(ev(photoArrive, 0, "Photographer and videographer arrive (details, getting-ready candids)", ["photo", "couple"]));
  events.push(ev(T - 45, 0, "Officiant arrives", ["couple", "dj"]));
  events.push(ev(T - 30, 0, "Guests arrive and are seated; ceremony music begins", ["guests", "family", "dj", "catering"]));

  // ceremony
  const ceremonyEnd = T + p.ceremonyLen;
  events.push(ev(T, p.ceremonyLen, "Ceremony", ["all"], { couple: true, kind: "ceremony" }));
  if (sun && sun.sunset != null && p.outdoors && ceremonyEnd > sun.sunset - 15) warnings.push(`The outdoor ceremony ends at ${fmtTime(ceremonyEnd)}, within 15 minutes of sunset (${fmtTime(sun.sunset)}) or after it. Start earlier, or plan lighting for the ceremony.`);

  // after the ceremony: photos and cocktail hour
  const travel = p.sameVenue ? 0 : p.travel;
  const recStart = ceremonyEnd + travel;
  let coupleFree;
  if (p.firstLook) {
    events.push(ev(ceremonyEnd, 10, "Sign the license; hugs in the aisle", ["couple", "photo", "family"], { couple: true }));
    coupleFree = ceremonyEnd + 10 + travel;
  } else {
    const post = familyMin + partyMin + coupleMin + 5;
    events.push(ev(ceremonyEnd, familyMin, `Family portraits (${p.familyGroups} groups)`, ["couple", "family", "photo"], { couple: true, note: "Give the photographer a written list of groups and name a helper who knows everyone." }));
    events.push(ev(ceremonyEnd + familyMin, partyMin, "Wedding party portraits", ["couple", "party", "photo"], { couple: true }));
    events.push(ev(ceremonyEnd + familyMin + partyMin, coupleMin + 5, "Couple portraits", ["couple", "photo"], { couple: true }));
    coupleFree = ceremonyEnd + post + travel;
  }
  if (!p.sameVenue) events.push(ev(ceremonyEnd, travel, "Guests travel to the reception", ["guests", "family"], { note: "The couple follows once photos are done." }));
  const cocktailPlanned = recStart + p.cocktailMin;
  let cocktailEnd = cocktailPlanned;
  if (coupleFree + 10 > cocktailPlanned) {
    cocktailEnd = coupleFree + 10;
    warnings.push(`Photos after the ceremony run until ${fmtTime(coupleFree)}, so the cocktail hour stretches by ${fmtDur(cocktailEnd - cocktailPlanned)} while guests wait. A first look moves ${fmtDur(familyMin + partyMin + coupleMin)} of portraits ahead of the ceremony.`);
  }
  if (p.cocktailMin > 0 || cocktailEnd > recStart) events.push(ev(recStart, cocktailEnd - recStart, "Cocktail hour; guests mingle", ["guests", "family", "catering", "dj"]));
  events.push(ev(recStart - 90, 0, "DJ or band load-in and sound check", ["dj"]));
  events.push(ev(recStart - 150, 0, "Caterer, florist and cake in place for the reception", ["catering"]));

  // reception, in order
  let t = cocktailEnd;
  const push = (dur, title, who, extra) => { events.push(ev(t, dur, title, who, extra)); t += dur; };
  push(10, p.grandEntrance ? "Grand entrance and welcome" : "Guests seated; welcome from the MC", ["all"], { couple: true });
  push(5, "First dance", ["all"], { couple: true });
  if (p.parentDances) push(8, "Parent dances", ["couple", "family", "dj", "photo"], { couple: true });
  push(5, "Blessing or welcome toast; dinner released", ["all"], { couple: true });
  const dinner = dinnerMinutes(p);
  const eatMin = Math.min(35, dinner);
  push(eatMin, `Dinner service (${MEALS[p.meal].label.toLowerCase()}, ${p.guests} guests); couple eats first`, ["all"], { couple: true, note: "Ask the caterer to serve the couple's meal first." });
  if (dinner > eatMin) push(dinner - eatMin, "Dinner continues; couple visits tables", ["guests", "family", "catering"]);
  if (p.toasts > 0) push(p.toasts * 4, `Toasts (${p.toasts}, about 4 minutes each)`, ["all"], { couple: true, note: "Brief speakers to 3 minutes; the MC cues each one." });
  if (p.cake) push(10, "Cake cutting", ["all"], { couple: true });
  const tail = (p.bouquet ? 8 : 0) + 5 + (p.sendoff ? 10 : 0);
  const danceStart = t;
  const danceLen = p.curfew - tail - danceStart;
  if (danceLen < 0) {
    warnings.push(`The program runs ${fmtDur(-danceLen)} past the ${fmtTime(p.curfew)} end time before any open dancing. Shorten the cocktail hour, dinner or toasts, or ask the venue for a later end.`);
    t = danceStart;
  } else {
    if (danceLen < 45) warnings.push(`Only ${fmtDur(danceLen)} is left for open dancing. Guests usually expect at least an hour.`);
    events.push(ev(danceStart, danceLen, "Open dancing", ["guests", "dj"], { kind: "dancing" }));
    t = danceStart + danceLen;
  }
  if (p.bouquet) push(8, "Bouquet and garter toss", ["all"], { couple: true });
  push(5, "Last dance", ["all"], { couple: true });
  if (p.sendoff) push(10, "Grand send-off", ["all"], { couple: true });

  // sunset portraits: an overlay on the couple's free time, it moves no other event
  let golden = null;
  if (!sun) {
    warnings.push("Sunset could not be computed from the location entered.");
  } else if (sun.polar) {
    warnings.push(sun.polar === "night" ? "The sun does not rise at this latitude on this date, so there is no golden hour." : "The sun does not set at this latitude on this date, so there is no sunset to plan around.");
  } else {
    const ideal = sun.sunset - GOLDEN_IDEAL_BEFORE_SUNSET;
    const busy = events.filter((e) => e.couple);
    const earliest = Math.max(ceremonyEnd, coupleFree);
    let best = null;
    for (let s = ideal - 45; s <= ideal + 20; s += 5) {
      if (s < earliest) continue;
      if (busy.some((e) => s < e.end && s + GOLDEN_LEN > e.start)) continue;
      if (!best || Math.abs(s - ideal) < Math.abs(best - ideal)) best = s;
    }
    if (best !== null) {
      golden = { start: best, end: best + GOLDEN_LEN, sunset: sun.sunset, offsetFromIdeal: best - ideal };
      events.push(ev(best, GOLDEN_LEN, "Sunset portraits, just the two of you", ["couple", "photo"], { couple: false, kind: "golden", note: `Sunset is ${fmtTime(sun.sunset)}. Guests carry on with whatever is scheduled; no other event moves.` }));
    } else if (sun.sunset < ceremonyEnd) {
      warnings.push(`Sunset (${fmtTime(sun.sunset)}) is before the ceremony ends, so there is no daylight left for sunset portraits.`);
    } else if (sun.sunset > p.curfew) {
      warnings.push(`Sunset (${fmtTime(sun.sunset)}) is after the music stops, so the sunset portraits would fall outside the event.`);
    } else {
      const clash = busy.find((e) => e.end > ideal - 45 && e.start < ideal + 35);
      warnings.push(`No clean ${GOLDEN_LEN}-minute slot near sunset (${fmtTime(sun.sunset)}): ${clash ? `"${clash.title}" occupies the couple around then. ` : ""}See the suggested ceremony times below.`);
    }
  }

  events.sort((a, b) => a.start - b.start || a.end - b.end);
  if (hairStart < 5 * 60) warnings.push(`Hair and makeup would start at ${fmtTime(hairStart)}. Add an artist, trim the list, or begin the day with a first look later.`);

  const vendors = [
    ["Hair and makeup", hairStart],
    ["Photographer and videographer", photoArrive],
    ["Officiant", T - 45],
    ["Florist, caterer and cake delivery", recStart - 150],
    ["DJ or band", recStart - 90],
    ["Venue coordinator and caterer ready", recStart - 60],
  ].filter(([, v]) => v !== undefined).sort((a, b) => a[1] - b[1]).map(([name, at]) => ({ name, at }));

  return { events, warnings, sun, golden, danceLen, cocktailEnd, coupleFree, ceremonyEnd, vendors, beauty, hairStart, end: t, dinner };
}

// ---- ceremony time advisor -------------------------------------------------

export function scoreDay(plan, p) {
  const reasons = [];
  let score = 100;
  if (plan.danceLen < 0) { score -= 60 + Math.min(30, -plan.danceLen / 3); reasons.push(`program overruns the end time by ${fmtDur(-plan.danceLen)}`); }
  else if (plan.danceLen < 45) { score -= 15; reasons.push(`only ${fmtDur(plan.danceLen)} of dancing`); }
  const sun = plan.sun;
  if (sun && !sun.polar) {
    if (p.outdoors && plan.ceremonyEnd > sun.sunset - 15) { score -= 40; reasons.push("outdoor ceremony ends too close to sunset"); }
    if (plan.golden) { score -= Math.abs(plan.golden.offsetFromIdeal) / 2; if (Math.abs(plan.golden.offsetFromIdeal) <= 10) reasons.push("sunset portraits land on the ideal light"); }
    else { score -= 25; reasons.push("no clean slot for sunset portraits"); }
  }
  if (plan.danceLen > 180) { score -= Math.min(20, (plan.danceLen - 180) / 6); reasons.push(`${fmtDur(plan.danceLen)} of dancing to fill`); }
  const stretch = plan.cocktailEnd - (plan.ceremonyEnd + (p.sameVenue ? 0 : p.travel) + p.cocktailMin);
  if (stretch > 0) { score -= Math.min(20, stretch / 2); reasons.push(`cocktail hour stretches ${fmtDur(stretch)}`); }
  if (plan.hairStart < 5 * 60) { score -= 10; reasons.push("hair and makeup before 5 AM"); }
  const dinnerStart = plan.events.find((e) => e.title.startsWith("Dinner service"))?.start;
  if (dinnerStart != null && dinnerStart > 20 * 60 + 30) { score -= 10; reasons.push("dinner after 8:30 PM"); }
  return { score: Math.max(0, Math.round(score)), reasons };
}

export function adviseCeremonyTimes(p) {
  const out = [];
  for (let s = 10 * 60; s <= 19 * 60 + 30; s += 30) {
    const q = { ...p, ceremonyStart: s };
    const plan = buildDay(q);
    out.push({ start: s, ...scoreDay(plan, q) });
  }
  const own = out.find((o) => o.start === p.ceremonyStart) ?? { start: p.ceremonyStart, ...scoreDay(buildDay(p), p) };
  const ranked = out.slice().sort((a, b) => b.score - a.score || Math.abs(a.start - p.ceremonyStart) - Math.abs(b.start - p.ceremonyStart));
  return { own, best: ranked.slice(0, 3) };
}

// ---- views and exports -----------------------------------------------------

export function viewEvents(plan, view = "all") {
  if (view === "all" || view === "photo") return plan.events;
  return plan.events.filter((e) => e.who.includes("all") || e.who.includes(view));
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const range = (e) => (e.end > e.start ? `${fmtTime(e.start)} to ${fmtTime(e.end)}` : fmtTime(e.start));

export function timelineCsv(plan, view = "all") {
  const lines = ["start,end,event,who,notes"];
  for (const e of viewEvents(plan, view)) lines.push([fmtTime(e.start), e.end > e.start ? fmtTime(e.end) : "", e.title, e.who.join(" "), e.note].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

export function timelineText(plan, p, view = "all") {
  const out = [`Wedding day timeline, ${prettyDate(p.date)} (${VIEWS[view]})`, ""];
  if (plan.sun && !plan.sun.polar) out.push(`Sunrise ${fmtTime(plan.sun.sunrise)}, sunset ${fmtTime(plan.sun.sunset)}`, "");
  for (const e of viewEvents(plan, view)) out.push(`${range(e).padEnd(22)} ${e.title}${e.note ? `\n${" ".repeat(23)}${e.note}` : ""}`);
  out.push("", "Planning conventions, not guarantees. Confirm every time with your vendors and venue.");
  return out.join("\n") + "\n";
}

const icsEscape = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsStamp = (iso, mins) => {
  const base = parseDate(iso).getTime() + Math.round(mins) * 60000;
  const d = new Date(base);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}T${z(d.getUTCHours())}${z(d.getUTCMinutes())}00`;
};

// Floating local times: the calendar app shows them at the same clock time wherever it is opened.
export function timelineIcs(plan, p, view = "all", stamp = "20260101T000000Z") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wedding Day Timeline Builder//EN", "CALSCALE:GREGORIAN"];
  viewEvents(plan, view).forEach((e, i) => {
    lines.push("BEGIN:VEVENT", `UID:wedding-${p.date}-${i}@timeline-builder`, `DTSTAMP:${stamp}`, `DTSTART:${icsStamp(p.date, e.start)}`, `DTEND:${icsStamp(p.date, Math.max(e.end, e.start + 5))}`, `SUMMARY:${icsEscape(e.title)}`);
    if (e.note) lines.push(`DESCRIPTION:${icsEscape(e.note)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function serializeState(state) {
  return JSON.stringify({ app: "wedding-day-timeline-builder", version: 1, ...state }, null, 2);
}

export function parseState(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!data || data.app !== "wedding-day-timeline-builder" || typeof data.fields !== "object" || data.fields === null) return { error: "That file is not a saved timeline from this page." };
  return { state: data.fields };
}

// Invented example for the demo button. Not a real couple or venue.
export function sampleFields(year = new Date().getFullYear()) {
  return { city: "Charleston, SC", date: `${year}-10-17`, ceremonyStart: "16:30", curfew: "22:30", ceremonyLen: 30, outdoors: true, sameVenue: true, travel: 20, firstLook: true, partySize: 8, familyGroups: 10, minPerGroup: 3, guests: 120, meal: "plated", cocktailMin: 60, toasts: 3, grandEntrance: true, parentDances: true, cake: true, bouquet: false, sendoff: true, hairPeople: 5, artists: 2, brideMin: 90, otherMin: 60 };
}

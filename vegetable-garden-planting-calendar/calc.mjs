// Vegetable garden planting calendar: turns two frost dates into a dated plan.
// Pure functions, no DOM, no network. Dates are handled as UTC day numbers so
// the plan never shifts with the visitor's time zone or daylight saving.
//
// The timings are common extension-service rules of thumb (weeks before or after
// the average last spring frost, days to maturity, a fall buffer for shorter
// days). They are guidance for a typical year, not a forecast: varieties,
// microclimates and weather move every date.

const DAY = 86400000;

export const GROUPS = [
  ["leafy", "Leafy greens and herbs"],
  ["root", "Roots and alliums"],
  ["brassica", "Cabbage family"],
  ["legume", "Peas and beans"],
  ["fruiting", "Tomatoes, peppers and other fruiting crops"],
  ["vine", "Vines, squash and corn"],
];

// hardy: shrugs off a light frost, sown before the last frost.
// half: tolerates a touch of cold, sown around the last frost.
// tender: killed by frost, planted after the last frost.
// cool: bolts or turns bitter in summer heat, so it must finish before the heat.
// fall: a second planting for a fall harvest works.
// weeks: when to plant (or transplant) relative to the average last spring frost.
// dtm: days from that planting date to first harvest.
export const CROPS = [
  { id: "lettuce", name: "Lettuce", group: "leafy", hardy: "hardy", method: "direct", weeks: -4, dtm: 50, harvestDays: 21, succ: 2, cool: true, fall: true },
  { id: "spinach", name: "Spinach", group: "leafy", hardy: "hardy", method: "direct", weeks: -6, dtm: 45, harvestDays: 21, succ: 2, cool: true, fall: true },
  { id: "arugula", name: "Arugula", group: "leafy", hardy: "hardy", method: "direct", weeks: -4, dtm: 40, harvestDays: 14, succ: 2, cool: true, fall: true },
  { id: "kale", name: "Kale", group: "leafy", hardy: "hardy", method: "direct", weeks: -4, dtm: 60, harvestDays: 60, succ: 0, cool: false, fall: true },
  { id: "chard", name: "Swiss chard", group: "leafy", hardy: "half", method: "direct", weeks: -2, dtm: 55, harvestDays: 70, succ: 0, cool: false, fall: false },
  { id: "cilantro", name: "Cilantro", group: "leafy", hardy: "hardy", method: "direct", weeks: -2, dtm: 45, harvestDays: 14, succ: 3, cool: true, fall: true },
  { id: "dill", name: "Dill", group: "leafy", hardy: "half", method: "direct", weeks: -2, dtm: 45, harvestDays: 21, succ: 3, cool: false, fall: false },
  { id: "parsley", name: "Parsley", group: "leafy", hardy: "hardy", method: "direct", weeks: -2, dtm: 75, harvestDays: 90, succ: 0, cool: false, fall: false },
  { id: "basil", name: "Basil", group: "leafy", hardy: "tender", method: "transplant", weeks: 2, indoorWeeks: 5, dtm: 30, harvestDays: 60, succ: 0, cool: false, fall: false },
  { id: "radish", name: "Radish", group: "root", hardy: "hardy", method: "direct", weeks: -4, dtm: 28, harvestDays: 10, succ: 1, cool: true, fall: true },
  { id: "carrot", name: "Carrot", group: "root", hardy: "half", method: "direct", weeks: -3, dtm: 70, harvestDays: 30, succ: 3, cool: false, fall: true },
  { id: "beet", name: "Beet", group: "root", hardy: "half", method: "direct", weeks: -3, dtm: 55, harvestDays: 30, succ: 3, cool: false, fall: true },
  { id: "turnip", name: "Turnip", group: "root", hardy: "hardy", method: "direct", weeks: -4, dtm: 45, harvestDays: 20, succ: 0, cool: true, fall: true },
  { id: "potato", name: "Potato (seed pieces)", group: "root", hardy: "half", method: "direct", weeks: -2, dtm: 90, harvestDays: 14, succ: 0, cool: false, fall: false },
  { id: "onion", name: "Onion (sets)", group: "root", hardy: "hardy", method: "direct", weeks: -4, dtm: 100, harvestDays: 14, succ: 0, cool: false, fall: false },
  { id: "garlic", name: "Garlic", group: "root", hardy: "hardy", method: "direct", fallPlant: true, dtm: 240, harvestDays: 14, succ: 0, cool: false, fall: true },
  { id: "sweetpotato", name: "Sweet potato (slips)", group: "root", hardy: "tender", method: "transplant", weeks: 3, indoorWeeks: 0, dtm: 110, harvestDays: 7, succ: 0, cool: false, fall: false },
  { id: "broccoli", name: "Broccoli", group: "brassica", hardy: "hardy", method: "transplant", weeks: -2, indoorWeeks: 6, dtm: 70, harvestDays: 21, succ: 0, cool: true, fall: true },
  { id: "cabbage", name: "Cabbage", group: "brassica", hardy: "hardy", method: "transplant", weeks: -2, indoorWeeks: 6, dtm: 75, harvestDays: 21, succ: 0, cool: true, fall: true },
  { id: "cauliflower", name: "Cauliflower", group: "brassica", hardy: "hardy", method: "transplant", weeks: -1, indoorWeeks: 6, dtm: 75, harvestDays: 14, succ: 0, cool: true, fall: true },
  { id: "kohlrabi", name: "Kohlrabi", group: "brassica", hardy: "hardy", method: "direct", weeks: -4, dtm: 50, harvestDays: 14, succ: 3, cool: true, fall: true },
  { id: "peas", name: "Peas", group: "legume", hardy: "hardy", method: "direct", weeks: -6, dtm: 65, harvestDays: 21, succ: 0, cool: true, fall: false },
  { id: "bushbean", name: "Bush beans", group: "legume", hardy: "tender", method: "direct", weeks: 1, dtm: 55, harvestDays: 21, succ: 2, cool: false, fall: false },
  { id: "polebean", name: "Pole beans", group: "legume", hardy: "tender", method: "direct", weeks: 1, dtm: 65, harvestDays: 45, succ: 0, cool: false, fall: false },
  { id: "tomato", name: "Tomato", group: "fruiting", hardy: "tender", method: "transplant", weeks: 1, indoorWeeks: 6, dtm: 70, harvestDays: 60, succ: 0, cool: false, fall: false },
  { id: "pepper", name: "Pepper", group: "fruiting", hardy: "tender", method: "transplant", weeks: 2, indoorWeeks: 8, dtm: 70, harvestDays: 50, succ: 0, cool: false, fall: false },
  { id: "eggplant", name: "Eggplant", group: "fruiting", hardy: "tender", method: "transplant", weeks: 2, indoorWeeks: 8, dtm: 75, harvestDays: 50, succ: 0, cool: false, fall: false },
  { id: "okra", name: "Okra", group: "fruiting", hardy: "tender", method: "direct", weeks: 2, dtm: 60, harvestDays: 60, succ: 0, cool: false, fall: false },
  { id: "cucumber", name: "Cucumber", group: "vine", hardy: "tender", method: "direct", weeks: 1, dtm: 55, harvestDays: 40, succ: 0, cool: false, fall: false },
  { id: "summersquash", name: "Summer squash / zucchini", group: "vine", hardy: "tender", method: "direct", weeks: 1, dtm: 50, harvestDays: 45, succ: 0, cool: false, fall: false },
  { id: "wintersquash", name: "Winter squash", group: "vine", hardy: "tender", method: "direct", weeks: 1, dtm: 95, harvestDays: 14, succ: 0, cool: false, fall: false },
  { id: "pumpkin", name: "Pumpkin", group: "vine", hardy: "tender", method: "direct", weeks: 1, dtm: 100, harvestDays: 14, succ: 0, cool: false, fall: false },
  { id: "watermelon", name: "Watermelon", group: "vine", hardy: "tender", method: "transplant", weeks: 2, indoorWeeks: 3, dtm: 80, harvestDays: 21, succ: 0, cool: false, fall: false },
  { id: "cantaloupe", name: "Cantaloupe", group: "vine", hardy: "tender", method: "transplant", weeks: 2, indoorWeeks: 3, dtm: 75, harvestDays: 21, succ: 0, cool: false, fall: false },
  { id: "corn", name: "Sweet corn", group: "vine", hardy: "tender", method: "direct", weeks: 1, dtm: 75, harvestDays: 10, succ: 2, cool: false, fall: false },
];

export const STARTER_SET = ["lettuce", "spinach", "radish", "carrot", "peas", "broccoli", "garlic", "tomato", "pepper", "bushbean", "cucumber", "summersquash", "basil"];

// How long after the first fall frost a crop is still worth harvesting.
const GRACE = { hardy: 28, half: 14, tender: 0 };
// Days added to the fall maturity count: shorter, cooler days slow growth.
const FALL_SLOWDOWN = 14;
const FALL_WINDOW = 21;
// Extra days before tender and half-hardy crops go out in "cautious" mode.
const CAUTION_DAYS = 7;
// Planting dates listed per window, so one crop cannot flood the calendar.
const MAX_DATES = 8;

export const cropById = (id) => CROPS.find((c) => c.id === id);

// ---- dates ---------------------------------------------------------------

export function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return Math.round(t / DAY);
}

export function isoDate(day) {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(day) {
  const d = new Date(day * DAY);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function prettyDateYear(day) {
  return `${prettyDate(day)}, ${new Date(day * DAY).getUTCFullYear()}`;
}

// ---- the season ------------------------------------------------------------

// A first fall frost on or before the last spring frost means the dates wrap past
// New Year (southern hemisphere): the fall frost is the following year's.
export function buildSeason({ lastFrost, firstFrost, heat = null, cautious = false } = {}) {
  const lf = parseDate(lastFrost);
  let ff = parseDate(firstFrost);
  const errors = [];
  if (lf == null) errors.push("Enter your average last spring frost date.");
  if (ff == null) errors.push("Enter your average first fall frost date.");
  if (errors.length) return { ok: false, errors };
  if (ff <= lf) {
    const d = new Date(ff * DAY);
    ff = Math.round(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()) / DAY);
  }
  const frostFree = ff - lf;
  if (frostFree < 60) errors.push(`Only ${frostFree} frost-free days between those dates. Check them: most gardens have 90 or more.`);
  if (frostFree > 330) errors.push(`${frostFree} frost-free days is nearly the whole year. Check the two dates.`);
  if (errors.length) return { ok: false, errors };
  let heatDay = heat ? parseDate(heat) : null;
  if (heat && heatDay == null) return { ok: false, errors: ["The hot-weather date is not a valid date."] };
  if (heatDay != null && (heatDay <= lf || heatDay >= ff)) return { ok: false, errors: ["Hot weather must start between the last spring frost and the first fall frost."] };
  const heatAssumed = heatDay == null;
  if (heatAssumed) heatDay = Math.min(lf + 70, ff - 30);
  return { ok: true, errors: [], lastFrost: lf, firstFrost: ff, heat: heatDay, heatAssumed, frostFreeDays: frostFree, cautious: Boolean(cautious) };
}

// ---- one crop --------------------------------------------------------------

function datesIn(from, to, stepDays) {
  if (to < from) return [];
  if (!stepDays) return [from];
  const out = [];
  for (let d = from; d <= to && out.length < MAX_DATES; d += stepDays) out.push(d);
  return out;
}

function segment(crop, season, kind, from, to) {
  const dates = datesIn(from, to, crop.succ * 7);
  const grace = GRACE[crop.hardy];
  const cap = season.firstFrost + grace;
  const first = dates[0] + crop.dtm;
  let last = dates[dates.length - 1] + crop.dtm + crop.harvestDays;
  if (!crop.fallPlant) last = Math.max(Math.min(last, cap), first);
  return {
    season: kind,
    plantFrom: dates[0],
    plantTo: dates[dates.length - 1],
    windowTo: to,
    dates,
    indoorStart: crop.method === "transplant" && crop.indoorWeeks ? dates.map((d) => d - crop.indoorWeeks * 7) : null,
    harvestFrom: first,
    harvestTo: last,
  };
}

export function planCrop(crop, season) {
  const notes = [];
  const warnings = [];
  const segments = [];
  const grace = GRACE[crop.hardy];
  const lf = season.lastFrost;
  const ff = season.firstFrost;

  if (crop.fallPlant) {
    const from = ff + 14;
    const to = ff + 35;
    const seg = segment(crop, season, "fall", from, to);
    // One planting date in the middle of the window; the window itself is what the grid shows.
    seg.dates = [ff + 21];
    seg.plantFrom = from;
    seg.plantTo = to;
    seg.harvestFrom = ff + 21 + crop.dtm;
    seg.harvestTo = seg.harvestFrom + crop.harvestDays;
    segments.push(seg);
    notes.push("Plant cloves 2 to 5 weeks after the first fall frost, while the soil is still workable, and mulch. Harvest the following summer when the lower leaves brown.");
    return { crop, segments, notes, warnings, feasible: true };
  }

  let earliest = lf + crop.weeks * 7;
  if (season.cautious && crop.hardy !== "hardy") earliest += CAUTION_DAYS;
  const frostLimit = ff + grace - crop.dtm;
  let springLatest = frostLimit;
  if (crop.cool) springLatest = Math.min(springLatest, season.heat - crop.dtm);

  if (springLatest >= earliest) {
    segments.push(segment(crop, season, "spring", earliest, springLatest));
  } else if (!crop.cool) {
    warnings.push(`Needs about ${crop.dtm} days from planting to first harvest and your season gives ${ff + grace - earliest}. Choose a faster variety or skip it.`);
  } else {
    notes.push(`Too little time to finish before summer heat in spring (${crop.dtm} days needed). Plant it in fall instead.`);
  }

  if (crop.fall) {
    const latest = ff + grace - crop.dtm - FALL_SLOWDOWN;
    const springEnd = segments.length ? segments[0].windowTo : lf;
    const from = Math.max(latest - FALL_WINDOW, springEnd + 7, season.heat);
    if (latest >= from && latest > lf + 90) {
      segments.push(segment(crop, season, "fall", from, latest));
    } else if (crop.cool) {
      notes.push("No room for a fall planting before frost with your dates.");
    }
  }

  if (crop.hardy === "tender" && segments.length && segments[0].plantFrom - lf < 14) {
    notes.push("Keep a row cover or buckets handy for the first two weeks in case of a late frost.");
  }
  if (crop.method === "transplant" && crop.indoorWeeks) {
    notes.push(`Start seeds indoors ${crop.indoorWeeks} weeks before transplanting; harden seedlings off for a week first.`);
  }
  if (crop.method === "transplant" && !crop.indoorWeeks) {
    notes.push("Buy slips or start them yourself; set out once nights stay warm.");
  }
  if (crop.cool && segments.some((s) => s.season === "spring")) {
    notes.push("A cool-season crop: it bolts or turns bitter in summer heat, so the spring dates stop early.");
  }
  if (crop.succ > 0 && segments.some((s) => s.dates.length > 1)) {
    notes.push(`Sow again every ${crop.succ} week${crop.succ > 1 ? "s" : ""} to stagger the harvest.`);
  }
  return { crop, segments, notes, warnings, feasible: segments.length > 0 };
}

// ---- the garden ------------------------------------------------------------

export function planGarden(ids, season) {
  const picked = [...new Set(ids)].map(cropById).filter(Boolean);
  const plans = picked.map((c) => planCrop(c, season));
  const tasks = [];
  for (const p of plans) {
    for (const s of p.segments) {
      const total = s.dates.length;
      s.dates.forEach((d, i) => {
        const tag = total > 1 ? ` (planting ${i + 1} of ${total})` : "";
        if (s.indoorStart) tasks.push({ date: s.indoorStart[i], type: "indoor", crop: p.crop.id, text: `Start ${p.crop.name.toLowerCase()} seeds indoors${tag}` });
        const verb = p.crop.method === "transplant" ? "Transplant" : p.crop.fallPlant ? "Plant" : "Sow";
        tasks.push({ date: d, type: "plant", crop: p.crop.id, text: `${verb} ${p.crop.name.toLowerCase()}${s.season === "fall" && !p.crop.fallPlant ? " for fall" : ""}${tag}` });
      });
      tasks.push({ date: s.harvestFrom, type: "harvest", crop: p.crop.id, text: `${p.crop.name}: harvest can begin${s.season === "fall" && !p.crop.fallPlant ? " (fall crop)" : ""}` });
    }
  }
  const rank = { indoor: 0, plant: 1, harvest: 2 };
  tasks.sort((a, b) => a.date - b.date || rank[a.type] - rank[b.type] || a.text.localeCompare(b.text));
  return { season, plans, tasks, warnings: plans.flatMap((p) => p.warnings.map((w) => `${p.crop.name}: ${w}`)) };
}

export function upcoming(garden, today, days = 30) {
  return garden.tasks.filter((t) => t.date >= today && t.date <= today + days);
}

// ---- month grid ------------------------------------------------------------

function monthKey(day) {
  const d = new Date(day * DAY);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function monthGrid(garden) {
  const rows = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of garden.plans) {
    for (const s of p.segments) {
      const starts = s.indoorStart ? s.indoorStart[0] : s.plantFrom;
      lo = Math.min(lo, starts);
      hi = Math.max(hi, s.harvestTo);
    }
  }
  if (!Number.isFinite(lo)) return { months: [], rows: [] };
  const first = monthKey(lo);
  const last = Math.min(monthKey(hi), first + 23);
  const months = [];
  for (let k = first; k <= last; k++) months.push({ key: k, label: `${MONTHS[k % 12]} ${Math.floor(k / 12)}` });
  for (const p of garden.plans) {
    const cells = months.map(() => new Set());
    const mark = (from, to, letter) => {
      for (let k = Math.max(monthKey(from), first); k <= Math.min(monthKey(to), last); k++) cells[k - first].add(letter);
    };
    for (const s of p.segments) {
      if (s.indoorStart) mark(s.indoorStart[0], s.dates[s.dates.length - 1], "S");
      mark(s.plantFrom, s.plantTo, "P");
      mark(s.harvestFrom, s.harvestTo, "H");
    }
    rows.push({ crop: p.crop, cells: cells.map((c) => ["S", "P", "H"].filter((l) => c.has(l)).join("")) });
  }
  return { months, rows };
}

// ---- exports ---------------------------------------------------------------

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function tasksCsv(garden) {
  const lines = ["date,task,crop,type"];
  for (const t of garden.tasks) lines.push([isoDate(t.date), t.text, cropById(t.crop).name, t.type].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

export function tasksText(garden) {
  const s = garden.season;
  const out = [`Planting plan. Last spring frost ${prettyDateYear(s.lastFrost)}, first fall frost ${prettyDateYear(s.firstFrost)} (${s.frostFreeDays} frost-free days).`, ""];
  let last = null;
  for (const t of garden.tasks) {
    const month = `${MONTHS[new Date(t.date * DAY).getUTCMonth()]} ${new Date(t.date * DAY).getUTCFullYear()}`;
    if (month !== last) { out.push(month.toUpperCase()); last = month; }
    out.push(`  ${prettyDate(t.date)}  ${t.text}`);
  }
  out.push("", "Typical-year rules of thumb, not a forecast. Check your local frost dates and adjust for your varieties.");
  return out.join("\n") + "\n";
}

const icsEscape = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDate = (day) => isoDate(day).replace(/-/g, "");

// All-day events. `stamp` is injected so the output is reproducible in tests.
export function tasksIcs(garden, stamp = "20260101T000000Z") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vegetable Garden Planting Calendar//EN", "CALSCALE:GREGORIAN"];
  garden.tasks.forEach((t, i) => {
    lines.push("BEGIN:VEVENT", `UID:garden-${icsDate(t.date)}-${t.crop}-${i}@planting-calendar`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(t.date)}`, `DTEND;VALUE=DATE:${icsDate(t.date + 1)}`, `SUMMARY:${icsEscape(t.text)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function serializeState(state) {
  return JSON.stringify({ app: "vegetable-garden-planting-calendar", version: 1, ...state }, null, 2);
}

export function parseState(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!data || data.app !== "vegetable-garden-planting-calendar") return { error: "That file is not a saved planting plan from this page." };
  const crops = Array.isArray(data.crops) ? data.crops.filter((id) => cropById(id)) : [];
  const season = buildSeason({ lastFrost: data.lastFrost, firstFrost: data.firstFrost, heat: data.heat || null, cautious: data.cautious });
  if (!season.ok) return { error: season.errors[0] };
  return { state: { lastFrost: data.lastFrost, firstFrost: data.firstFrost, heat: data.heat || "", cautious: Boolean(data.cautious), crops } };
}

// Invented example for the demo button: a mid-latitude garden. Not any real town.
export function sampleFields(year = 2026) {
  return { lastFrost: `${year}-05-01`, firstFrost: `${year}-10-10`, heat: "", cautious: false, crops: STARTER_SET };
}

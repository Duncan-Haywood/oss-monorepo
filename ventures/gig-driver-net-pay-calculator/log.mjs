// Pure session-log arithmetic: roll several saved sessions into one week or
// month. Averaging each session's per-hour rate would let a short lucky dash
// outweigh a long bad one, so every rate here is total dollars over total
// hours (or miles). No network; the page keeps the list in the driver's own
// browser storage.

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Reduce a calculateSession() result to the numbers worth keeping. */
export function toLogEntry(result, { date, label = '' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Date must be YYYY-MM-DD');
  return {
    date,
    label: String(label).slice(0, 60),
    grossPay: finite(result.grossPay),
    milesDriven: finite(result.milesDriven),
    hoursActive: finite(result.hoursActive),
    vehicleCost: finite(result.vehicleCost),
    netProfit: finite(result.netProfit),
    taxReserve: finite(result.taxReserve),
  };
}

/** Monday (UTC) of the week containing an ISO date, as YYYY-MM-DD. */
export function weekStart(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Totals and honest (total-over-total) rates for a list of entries. */
export function rollup(entries) {
  const sum = (key) => entries.reduce((total, entry) => total + finite(entry[key]), 0);
  const grossPay = sum('grossPay');
  const milesDriven = sum('milesDriven');
  const hoursActive = sum('hoursActive');
  const vehicleCost = sum('vehicleCost');
  const netProfit = sum('netProfit');
  const taxReserve = sum('taxReserve');
  const rate = (dollars, base) => base === 0 ? null : dollars / base;
  return {
    sessions: entries.length,
    grossPay,
    milesDriven,
    hoursActive,
    vehicleCost,
    netProfit,
    taxReserve,
    takeHome: netProfit - taxReserve,
    grossPerHour: rate(grossPay, hoursActive),
    netPerHour: rate(netProfit, hoursActive),
    netPerMile: rate(netProfit, milesDriven),
    // Share of gross the car ate, the figure the app screen never shows.
    vehicleShareOfGross: rate(vehicleCost, grossPay),
  };
}

/** One rollup per Monday-start week, newest week first. */
export function byWeek(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = weekStart(entry.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([week, items]) => ({ week, ...rollup(items) }));
}

/** Parse stored JSON defensively; anything malformed becomes an empty log. */
export function parseLog(text) {
  try {
    const list = JSON.parse(text || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter((entry) => entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.date || ''));
  } catch {
    return [];
  }
}

/** CSV export so the log can leave the browser on the driver's terms. */
export function toCsv(entries) {
  const cols = ['date', 'label', 'grossPay', 'milesDriven', 'hoursActive', 'vehicleCost', 'netProfit', 'taxReserve'];
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`; // no spreadsheet formula injection
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [cols.join(','), ...entries.map((entry) => cols.map((col) => cell(entry[col])).join(','))].join('\n');
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One rollup per weekday, best net per hour first; weekdays with no hours sort last. */
export function byWeekday(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const day = WEEKDAYS[new Date(`${entry.date}T12:00:00Z`).getUTCDay()];
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(entry);
  }
  return [...groups.entries()]
    .map(([day, items]) => ({ day, ...rollup(items) }))
    .sort((a, b) => (b.netPerHour ?? -Infinity) - (a.netPerHour ?? -Infinity));
}

/** The best and worst session by net per hour (sessions with no hours are skipped). */
export function extremes(entries) {
  const rated = entries.filter((e) => finite(e.hoursActive) > 0)
    .map((e) => ({ entry: e, netPerHour: finite(e.netProfit) / finite(e.hoursActive) }));
  if (rated.length === 0) return { best: null, worst: null };
  const best = rated.reduce((a, b) => (b.netPerHour > a.netPerHour ? b : a));
  const worst = rated.reduce((a, b) => (b.netPerHour < a.netPerHour ? b : a));
  return { best, worst };
}

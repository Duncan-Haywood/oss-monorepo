const STORAGE_KEY = "quote-margin-check:quote-history";
const MAX_ENTRIES = 12;

function storageAvailable() {
  try { return typeof localStorage !== "undefined"; } catch { return false; }
}

function read() {
  if (!storageAvailable()) return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function write(entries) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    return true;
  } catch { return false; }
}

export function listHistory() { return read(); }

export function saveHistory(quote, report, savedAt = new Date().toISOString()) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt,
    quote: { ...quote },
    report: {
      total_hours: report.total_hours,
      direct_costs: report.direct_costs,
      effective_hourly_rate: report.effective_hourly_rate,
      target_price: report.target_price,
      gap_to_target: report.gap_to_target,
      cost_coverage: report.cost_coverage,
    },
  };
  return write([entry, ...read()]) ? entry : null;
}

export function deleteHistory(id) { return write(read().filter((entry) => entry.id !== id)); }
export function clearHistory() { return write([]); }
export { MAX_ENTRIES };

// On-device history: the one thing that makes the planner worth reopening.
// Saving is opt-in and stays in this browser's localStorage; nothing is sent.
const KEY = "revenue-target-lead-planner-history";

const clean = (s) => String(s ?? "").replace(/[,\r\n]/g, " ").trim();
const count = (v) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Returns the new textarea text with one more period at the end, or an error.
export function appendPeriod(text, { period, leads, won, revenue }) {
  const l = count(leads), w = count(won);
  if (l === null || w === null || l === 0) return { error: "Enter the leads you got (more than 0) and the deals you won." };
  if (w > l) return { error: "Deals won cannot be more than leads." };
  const r = String(revenue ?? "").trim() === "" ? "" : count(revenue);
  if (r === null) return { error: "Revenue must be a number, or leave it blank." };
  const label = clean(period) || `period ${String(text ?? "").split(/\r?\n/).filter((x) => x.trim()).length + 1}`;
  const base = String(text ?? "").replace(/\s+$/, "");
  return { text: (base ? base + "\n" : "") + [label, l, w, r].join(",") };
}

export function loadHistory(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store.getItem(KEY) || "null");
    return v && typeof v.rows === "string" ? { rows: v.rows, target: String(v.target ?? ""), planned: String(v.planned ?? "") } : null;
  } catch {
    return null;
  }
}

export function saveHistory(h, store = globalThis.localStorage) {
  try { store.setItem(KEY, JSON.stringify({ rows: h.rows, target: h.target, planned: h.planned })); return true; } catch { return false; }
}

export function forgetHistory(store = globalThis.localStorage) {
  try { store.removeItem(KEY); } catch { /* blocked store: nothing was saved */ }
}

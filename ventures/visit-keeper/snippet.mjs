// Browser-safe helpers for the setup page: the snippet to paste, and how much disk a deployment needs.
export function buildSnippet(host, { goalName = "", honorDnt = true } = {}) {
  const h = String(host || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(h)) return null;
  const tag = `<script defer src="${h}/t.js"${honorDnt ? "" : " data-ignore-dnt"}></script>`;
  const goal = String(goalName).trim().replace(/[^a-z0-9 _-]/gi, "").slice(0, 60);
  return { tag, goal: goal ? `visitKeeper("${goal}");   // or visitKeeper("${goal}", 29) to add a value` : null };
}

// Per-visitor scratch is about 150 bytes and lives one to two days; per-day counters grow with distinct pages and sources.
export function stateSize({ visitorsPerDay, pagesPerSite = 200, retentionDays = 730 }) {
  const scratch = visitorsPerDay * 2 * 150;
  const counters = retentionDays * (2_000 + pagesPerSite * 60 + 400 * 40);
  return { scratchBytes: scratch, countersBytes: counters, totalBytes: scratch + counters };
}

export const humanBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

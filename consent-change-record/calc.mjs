const validUrl = (value) => {
  try { return new URL(value).toString(); } catch { throw new Error('Every request must contain a valid URL.'); }
};

function normalizeTrace(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} trace must be a JSON object.`);
  const requests = Array.isArray(value.requests) ? value.requests.map((request) => ({
    url: validUrl(request?.url), method: String(request?.method || 'GET').toUpperCase()
  })) : [];
  const storage = Array.isArray(value.storage) ? value.storage.map((entry) => ({ key: String(entry?.key || '') })).filter((entry) => entry.key) : [];
  return {
    site: String(value.site || 'Unknown site'), capturedAt: String(value.capturedAt || 'Unknown time'),
    browser: String(value.browser || 'Unknown browser'), sequence: String(value.sequence || label), requests, storage
  };
}

const keyFor = (item) => `${item.method || ''} ${item.url || item.key}`;

// Presence-only matching (`some()` against the whole array) is wrong the
// moment a request fires more than once, which trackers routinely do -- a
// pixel loaded once per page section, a script that polls on an interval.
// It missed the case that matters most: the same key present on BOTH sides
// but fewer times after consent. Every "before" copy finds *a* match in
// "after" (the key still exists there), so all of them read as unchanged
// and none as removed, even though two of three firings actually stopped.
// The reverse silently hid a tracker that started firing more often, too.
// This counts occurrences per key instead: the shared count is unchanged,
// and any surplus on either side is added or removed respectively -- so
// "fired 3 times before, 1 time after" now reports 2 removed and 1
// unchanged, not 0 removed.
function diff(before, after) {
  const countByKey = (items) => {
    const counts = new Map();
    for (const item of items) {
      const key = keyFor(item);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { item, count: 1 });
    }
    return counts;
  };
  const beforeCounts = countByKey(before);
  const afterCounts = countByKey(after);
  const added = [];
  const removed = [];
  const unchanged = [];
  for (const key of new Set([...beforeCounts.keys(), ...afterCounts.keys()])) {
    const beforeEntry = beforeCounts.get(key);
    const afterEntry = afterCounts.get(key);
    const beforeCount = beforeEntry?.count ?? 0;
    const afterCount = afterEntry?.count ?? 0;
    const sharedCount = Math.min(beforeCount, afterCount);
    for (let i = 0; i < sharedCount; i += 1) unchanged.push((afterEntry ?? beforeEntry).item);
    for (let i = sharedCount; i < afterCount; i += 1) added.push(afterEntry.item);
    for (let i = sharedCount; i < beforeCount; i += 1) removed.push(beforeEntry.item);
  }
  return { added, removed, unchanged };
}

export function compareTraces(beforeValue, afterValue) {
  const before = normalizeTrace(beforeValue, 'Before');
  const after = normalizeTrace(afterValue, 'After');
  if (before.site !== 'Unknown site' && after.site !== 'Unknown site' && before.site !== after.site) {
    throw new Error('Before and after traces must refer to the same site.');
  }
  return { before, after, requests: diff(before.requests, after.requests), storage: diff(before.storage, after.storage), comparedAt: new Date().toISOString() };
}

export function reportAsText(report) {
  // Duplicate-count changes come through as repeated entries with the same
  // key (see `diff` above) -- printed one line per instance that would read
  // as a listing bug, not the finding it is. Grouping by key and appending a
  // ×N count keeps "2 removed" legible instead of two identical lines.
  const list = (items) => {
    if (!items.length) return '  - None observed';
    const counts = new Map();
    for (const item of items) counts.set(keyFor(item), (counts.get(keyFor(item)) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => `  - ${key}${count > 1 ? ` (×${count})` : ''}`).join('\n');
  };
  return `CONSENT CHANGE RECORD\nCompared: ${report.comparedAt}\nSite: ${report.after.site}\n\nBEFORE\n  Sequence: ${report.before.sequence}\n  Captured: ${report.before.capturedAt}\n  Browser: ${report.before.browser}\n\nAFTER\n  Sequence: ${report.after.sequence}\n  Captured: ${report.after.capturedAt}\n  Browser: ${report.after.browser}\n\nREQUESTS ADDED AFTER CONSENT\n${list(report.requests.added)}\n\nREQUESTS REMOVED AFTER CONSENT\n${list(report.requests.removed)}\n\nSTORAGE KEYS ADDED AFTER CONSENT\n${list(report.storage.added)}\n\nSTORAGE KEYS REMOVED AFTER CONSENT\n${list(report.storage.removed)}\n\nLIMITATION\nThis records observations from the supplied traces only. It does not determine compliance, prove absence in other browsers or regions, or replace professional review.`;
}

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
const diff = (before, after) => ({
  added: after.filter((item) => !before.some((old) => keyFor(old) === keyFor(item))),
  removed: before.filter((item) => !after.some((next) => keyFor(next) === keyFor(item))),
  unchanged: after.filter((item) => before.some((old) => keyFor(old) === keyFor(item)))
});

export function compareTraces(beforeValue, afterValue) {
  const before = normalizeTrace(beforeValue, 'Before');
  const after = normalizeTrace(afterValue, 'After');
  if (before.site !== 'Unknown site' && after.site !== 'Unknown site' && before.site !== after.site) {
    throw new Error('Before and after traces must refer to the same site.');
  }
  return { before, after, requests: diff(before.requests, after.requests), storage: diff(before.storage, after.storage), comparedAt: new Date().toISOString() };
}

export function reportAsText(report) {
  const list = (items) => items.length ? items.map((item) => `  - ${keyFor(item)}`).join('\n') : '  - None observed';
  return `CONSENT CHANGE RECORD\nCompared: ${report.comparedAt}\nSite: ${report.after.site}\n\nBEFORE\n  Sequence: ${report.before.sequence}\n  Captured: ${report.before.capturedAt}\n  Browser: ${report.before.browser}\n\nAFTER\n  Sequence: ${report.after.sequence}\n  Captured: ${report.after.capturedAt}\n  Browser: ${report.after.browser}\n\nREQUESTS ADDED AFTER CONSENT\n${list(report.requests.added)}\n\nREQUESTS REMOVED AFTER CONSENT\n${list(report.requests.removed)}\n\nSTORAGE KEYS ADDED AFTER CONSENT\n${list(report.storage.added)}\n\nSTORAGE KEYS REMOVED AFTER CONSENT\n${list(report.storage.removed)}\n\nLIMITATION\nThis records observations from the supplied traces only. It does not determine compliance, prove absence in other browsers or regions, or replace professional review.`;
}

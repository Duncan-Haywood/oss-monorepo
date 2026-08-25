// Explicit, browser-local review history. Quote data never leaves this device.

const STORAGE_KEY = "quote-margin-check:review-history";
const MAX_REVIEWS = 8;

function storageAvailable() {
  try { return typeof localStorage !== "undefined"; } catch { return false; }
}

function readReviews() {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.quote && item.report) : [];
  } catch { return []; }
}

export function listReviews() { return readReviews(); }

export function saveReview(quote, report, savedAt = new Date().toISOString()) {
  if (!storageAvailable()) return false;
  try {
    const reviews = readReviews().filter((item) => JSON.stringify(item.quote) !== JSON.stringify(quote));
    reviews.unshift({ quote, report, savedAt });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews.slice(0, MAX_REVIEWS)));
    return true;
  } catch { return false; }
}

export function clearReviews() {
  if (!storageAvailable()) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
}

export { MAX_REVIEWS };

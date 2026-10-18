const KEY = "tender-radar:usage";
const OPT_OUT = "tender-radar:opt-out";

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function blocked() {
  try {
    return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function enabled() {
  const store = storage();
  return Boolean(store && !blocked() && store.getItem(OPT_OUT) !== "1");
}

export function setEnabled(value) {
  const store = storage();
  if (!store) return;
  if (value) store.removeItem(OPT_OUT);
  else store.setItem(OPT_OUT, "1");
}

export function record(event) {
  const store = storage();
  if (!store || !enabled()) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const counts = JSON.parse(store.getItem(KEY) || "{}");
    const key = `${event}:${day}`;
    counts[key] = (counts[key] || 0) + 1;
    store.setItem(KEY, JSON.stringify(counts));
  } catch {
    /* best effort */
  }
}

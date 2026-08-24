const VERSION = 1;
const PARAM = "compare";

export function encodeComparisonState(state) {
  if (!state || typeof state !== "object") throw new Error("Comparison state is required");
  return encodeURIComponent(JSON.stringify({ v: VERSION, ...state }));
}

export function decodeComparisonState(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!parsed || parsed.v !== VERSION || typeof parsed !== "object") return null;
    if (!parsed.shared || typeof parsed.shared !== "object" || !Array.isArray(parsed.channels)) return null;
    return { shared: parsed.shared, channels: parsed.channels };
  } catch {
    return null;
  }
}

export function addStateToUrl(url, state) {
  const result = new URL(url);
  result.searchParams.set(PARAM, encodeComparisonState(state));
  return result.toString();
}

export function stateFromUrl(url) {
  return decodeComparisonState(new URL(url).searchParams.get(PARAM));
}

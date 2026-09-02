// Shareable link for a vendor-rate comparison. The page's core content is
// the scenario rows the operator built, not a flat set of fields, so a
// share mechanism that only carried the four top fields would hand the
// recipient an empty comparison table and nothing to actually respond to.
//
// Follows the same URL-hash convention as this month's other share links:
// nothing is sent to a server, the payload rides in the fragment (never the
// query string a server or Referer header would log), and only a fixed,
// validated shape is accepted back in — a crafted fragment cannot inject an
// unbounded scenario list or a non-numeric cost into the comparison table.

const MAX_SCENARIOS = 3;

function usableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// A scenario travels as a bare [name, fixedMonthly, variablePerJob] tuple,
// matching the page's own in-memory representation exactly so the decoded
// value can be assigned straight back to `scenarios` with no reshaping.
function usableScenario(row) {
  if (!Array.isArray(row)) return null;
  const [name, fixed, variable] = row;
  const f = usableNumber(fixed);
  const v = usableNumber(variable);
  if (f === null || v === null) return null;
  return [String(name ?? '').slice(0, 80), f, v];
}

export function encodeShare(input) {
  const payload = {};
  const jobs = usableNumber(input?.jobs);
  const revenue = usableNumber(input?.revenue);
  const baseFixed = usableNumber(input?.baseFixed);
  const baseVariable = usableNumber(input?.baseVariable);
  if (jobs !== null) payload.jobs = jobs;
  if (revenue !== null) payload.revenue = revenue;
  if (baseFixed !== null) payload.baseFixed = baseFixed;
  if (baseVariable !== null) payload.baseVariable = baseVariable;
  const scenarios = Array.isArray(input?.scenarios)
    ? input.scenarios.slice(0, MAX_SCENARIOS).map(usableScenario).filter(Boolean)
    : [];
  if (scenarios.length > 0) payload.scenarios = scenarios;
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^#/, '');
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const out = {};
  const jobs = usableNumber(parsed.jobs);
  const revenue = usableNumber(parsed.revenue);
  const baseFixed = usableNumber(parsed.baseFixed);
  const baseVariable = usableNumber(parsed.baseVariable);
  if (jobs !== null) out.jobs = jobs;
  if (revenue !== null) out.revenue = revenue;
  if (baseFixed !== null) out.baseFixed = baseFixed;
  if (baseVariable !== null) out.baseVariable = baseVariable;
  if (Array.isArray(parsed.scenarios)) {
    const scenarios = parsed.scenarios.slice(0, MAX_SCENARIOS).map(usableScenario).filter(Boolean);
    if (scenarios.length > 0) out.scenarios = scenarios;
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

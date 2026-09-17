// Deterministic comparison between a repo's *actual* GitHub branch
// protection settings and a *declared* policy for what those settings
// should be. Both inputs are plain objects (already JSON.parse'd by the
// caller) -- this module does no network I/O and no YAML parsing.
//
// "Actual" is expected in the shape `gh api
// repos/:owner/:repo/branches/:branch/protection` returns: several fields
// are wrapped as `{ enabled: bool }` rather than being bare booleans. This
// module reads through that wrapper so a user can paste the API response
// verbatim. "Policy" is a flat, hand-authorable object -- see README.md --
// because nobody should have to reproduce GitHub's nested response shape
// by hand just to state "reviews required: 2".
//
// A rule the policy does not mention is reported `not-policed`, never
// coerced to a pass or a fail: a policy that only cares about force-pushes
// says nothing about signed commits, and reading that silence as either
// "compliant" or "violated" would be inventing a policy nobody wrote.

export const DRIFT = "drift";
export const OK = "meets-policy";
export const STRONGER = "stronger-than-policy";
export const NOT_POLICED = "not-policed";

function actualBool(obj, path) {
  let node = obj;
  for (const key of path) {
    if (node == null) return false;
    node = node[key];
  }
  if (node == null) return false;
  if (typeof node === "object") return Boolean(node.enabled);
  return Boolean(node);
}

function actualNumber(obj, path) {
  let node = obj;
  for (const key of path) {
    if (node == null) return 0;
    node = node[key];
  }
  return typeof node === "number" ? node : 0;
}

function actualArray(obj, path) {
  let node = obj;
  for (const key of path) {
    if (node == null) return [];
    node = node[key];
  }
  return Array.isArray(node) ? node : [];
}

// Policy accessors deliberately return `undefined` (never a default) when
// the field is absent, so "not mentioned" stays distinguishable from
// "explicitly set to false / 0 / []".
function policyValue(policy, flatKey) {
  return policy ? policy[flatKey] : undefined;
}

export const RULES = [
  {
    key: "required_approving_review_count",
    label: "Required approving reviews",
    kind: "min",
    readActual: (a) => actualNumber(a, ["required_pull_request_reviews", "required_approving_review_count"]),
    readPolicy: (p) => policyValue(p, "required_approving_review_count"),
  },
  {
    key: "require_code_owner_reviews",
    label: "Require review from Code Owners",
    kind: "bool",
    readActual: (a) => actualBool(a, ["required_pull_request_reviews", "require_code_owner_reviews"]),
    readPolicy: (p) => policyValue(p, "require_code_owner_reviews"),
  },
  {
    key: "require_last_push_approval",
    label: "Require approval of the most recent push",
    kind: "bool",
    readActual: (a) => actualBool(a, ["required_pull_request_reviews", "require_last_push_approval"]),
    readPolicy: (p) => policyValue(p, "require_last_push_approval"),
  },
  {
    key: "enforce_admins",
    label: "Enforce for administrators",
    kind: "bool",
    readActual: (a) => actualBool(a, ["enforce_admins"]),
    readPolicy: (p) => policyValue(p, "enforce_admins"),
  },
  {
    key: "allow_force_pushes",
    label: "Allow force pushes",
    kind: "bool",
    readActual: (a) => actualBool(a, ["allow_force_pushes"]),
    readPolicy: (p) => policyValue(p, "allow_force_pushes"),
  },
  {
    key: "allow_deletions",
    label: "Allow deletions",
    kind: "bool",
    readActual: (a) => actualBool(a, ["allow_deletions"]),
    readPolicy: (p) => policyValue(p, "allow_deletions"),
  },
  {
    key: "required_conversation_resolution",
    label: "Require conversation resolution before merging",
    kind: "bool",
    readActual: (a) => actualBool(a, ["required_conversation_resolution"]),
    readPolicy: (p) => policyValue(p, "required_conversation_resolution"),
  },
  {
    key: "required_linear_history",
    label: "Require linear history",
    kind: "bool",
    readActual: (a) => actualBool(a, ["required_linear_history"]),
    readPolicy: (p) => policyValue(p, "required_linear_history"),
  },
  {
    key: "required_signatures",
    label: "Require signed commits",
    kind: "bool",
    readActual: (a) => actualBool(a, ["required_signatures"]),
    readPolicy: (p) => policyValue(p, "required_signatures"),
  },
  {
    key: "strict_status_checks",
    label: "Require branches to be up to date before merging",
    kind: "bool",
    readActual: (a) => actualBool(a, ["required_status_checks", "strict"]),
    readPolicy: (p) => policyValue(p, "strict_status_checks"),
  },
  {
    key: "required_status_check_contexts",
    label: "Required status checks",
    kind: "set",
    readActual: (a) => actualArray(a, ["required_status_checks", "contexts"]),
    readPolicy: (p) => policyValue(p, "required_status_check_contexts"),
  },
];

// `allow_force_pushes` and `allow_deletions` are the two rules where a
// *lower* actual value than the flat boolean-equality check alone would
// imply is never the drift direction that matters: a policy that allows
// force pushes (true) and a repo that has them off (false) is *stricter*
// than required, not weaker. Named here rather than inferred from the key
// string, so a future rule cannot silently inherit the wrong direction by
// having a similar name.
const INVERTED_BOOL_RULES = new Set(["allow_force_pushes", "allow_deletions"]);

function compareOne(rule, actualRaw, policyRaw) {
  const declared = rule.readPolicy(policyRaw);
  if (declared === undefined || declared === null) {
    return { ...baseRow(rule), status: NOT_POLICED, actual: rule.readActual(actualRaw), declared: null };
  }
  const actual = rule.readActual(actualRaw);

  if (rule.kind === "min") {
    if (typeof declared !== "number") return { ...baseRow(rule), status: NOT_POLICED, actual, declared: null };
    if (actual < declared) return { ...baseRow(rule), status: DRIFT, actual, declared };
    if (actual > declared) return { ...baseRow(rule), status: STRONGER, actual, declared };
    return { ...baseRow(rule), status: OK, actual, declared };
  }

  if (rule.kind === "bool") {
    // Compliance is always actual === declared: a policy may legitimately
    // declare either true or false for any of these fields. The inversion
    // set only decides which *direction* of mismatch counts as "stronger
    // than required" versus "drifted weaker", below.
    if (actual === declared) return { ...baseRow(rule), status: OK, actual, declared };
    const strongerDirection = INVERTED_BOOL_RULES.has(rule.key) ? actual === false && declared === true : actual === true && declared === false;
    return { ...baseRow(rule), status: strongerDirection ? STRONGER : DRIFT, actual, declared };
  }

  if (rule.kind === "set") {
    const wanted = Array.isArray(declared) ? declared : [];
    const have = new Set(Array.isArray(actual) ? actual : []);
    const missing = wanted.filter((ctx) => !have.has(ctx));
    const extra = [...have].filter((ctx) => !wanted.includes(ctx));
    const status = missing.length > 0 ? DRIFT : extra.length > 0 ? STRONGER : OK;
    return { ...baseRow(rule), status, actual: [...have], declared: wanted, missing, extra };
  }

  throw new Error(`unknown rule kind: ${rule.kind}`);
}

function baseRow(rule) {
  return { key: rule.key, label: rule.label, kind: rule.kind };
}

/**
 * @param {object} actual - parsed branch-protection API response (or `{}`
 *   / a "Branch not protected" payload, both read as no protection at all).
 * @param {object} policy - flat declared-policy object.
 * @returns {Array<object>} one row per rule in RULES, in declaration order.
 */
export function compare(actual, policy) {
  const safeActual = actual && typeof actual === "object" ? actual : {};
  const safePolicy = policy && typeof policy === "object" ? policy : {};
  return RULES.map((rule) => compareOne(rule, safeActual, safePolicy));
}

export function hasDrift(rows) {
  return rows.some((r) => r.status === DRIFT);
}

export function isUnprotected(actual) {
  if (!actual || typeof actual !== "object") return true;
  if (typeof actual.message === "string" && /not protected/i.test(actual.message)) return true;
  return Object.keys(actual).length === 0;
}

export function summaryLine(rows, actual) {
  const driftCount = rows.filter((r) => r.status === DRIFT).length;
  if (isUnprotected(actual)) {
    return "This branch has no protection configured at all — every policed rule is drift.";
  }
  if (driftCount === 0) {
    return "No drift: every policy-covered rule matches or exceeds the declared policy.";
  }
  return `${driftCount} rule${driftCount === 1 ? "" : "s"} drifted weaker than the declared policy.`;
}

export function parsePolicyText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch (jsonErr) {
    // Fall back to a plain "key: value" line format so a policy can be
    // jotted down without JSON's quoting -- the same accommodation
    // `required-checks-drift-check`'s plain-text mode makes for a list of
    // names.
    const result = {};
    for (const rawLine of trimmed.split("\n")) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx === -1) {
        throw new Error(`Could not parse policy as JSON (${jsonErr.message}), and line "${rawLine}" is not "key: value" either.`);
      }
      const key = line.slice(0, idx).trim();
      const rawValue = line.slice(idx + 1).trim();
      result[key] = parseScalarOrList(rawValue);
    }
    return result;
  }
}

function parseScalarOrList(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "") return [];
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (raw.includes(",")) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return raw;
}

export function parseActualText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

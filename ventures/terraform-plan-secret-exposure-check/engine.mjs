// Deterministic checker: read a Terraform *structured* plan (the JSON
// `terraform show -json <planfile>` prints, not the line-by-line UI stream
// from `terraform plan -json`) and flag every attribute value that looks
// like a real secret -- an AWS access key, a PEM private key, a JWT, or a
// URL with embedded credentials -- which Terraform's own provider schema did
// *not* already mark `sensitive`.
//
// Why this is worth a dedicated check rather than trusting `sensitive`:
// the provider schema author has to remember to mark every attribute that
// can hold a secret, and misses are a documented, recurring class of bug
// (see README for the specific upstream issues this is checked against). A
// missed flag prints the real value in plaintext into whatever reads the
// plan JSON or a `terraform show` log -- most often a CI log a much wider
// audience can read than the apply itself.
//
// No network call lives here -- this module only reads the plan JSON it is
// given. The identical logic runs in the browser page (pasted/loaded plan)
// and the Node CLI (a local file, usable as a CI gate before an apply).

// --- Known secret shapes -----------------------------------------------
//
// High-confidence, low-false-positive patterns only: each one has a fixed,
// documented format that ordinary infrastructure values do not coincidentally
// match. A generic "looks like a random string" heuristic is deliberately
// left out -- it would flag AMI ids, hashes, and UUIDs constantly and teach
// people to ignore the report, which is worse than not checking at all.

export const SECRET_PATTERNS = [
  {
    code: "aws-access-key-id",
    label: "AWS access key ID",
    re: /\b(?:AKIA|ASIA|AIDA|AROA|AGPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/,
  },
  {
    code: "private-key-pem",
    label: "PEM private key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  },
  {
    code: "jwt",
    label: "JSON Web Token",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    code: "url-embedded-credentials",
    label: "URL with an embedded username:password",
    re: /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/,
  },
];

/**
 * Real, documented cases of this exact failure -- a provider schema not
 * marking an attribute sensitive, so its value prints in plaintext. Each is
 * sourced in README.md. Context for why each pattern exists, not a live feed
 * of anything.
 */
export const KNOWN_LEAK_CASES = [
  {
    case: "A provider attribute that can hold a private key or password has no `sensitive` flag in its schema",
    checkedBy: "aws-access-key-id / private-key-pem / jwt / url-embedded-credentials",
  },
  {
    case: "A nested block's secret-shaped field is missed even though a sibling top-level field is marked sensitive",
    checkedBy: "recursive walk of every attribute path, not just top-level fields",
  },
  {
    case: "A `local-exec` or `template` argument interpolates a credential into a plain string attribute",
    checkedBy: "pattern match runs on every string leaf in the plan, regardless of which resource type",
  },
];

// --- Redaction ------------------------------------------------------------

/**
 * Never echoes a full matched secret back into the report -- the report
 * itself is meant to be pasted into an issue or a CI annotation, and doing
 * that with the real value would recreate the exact leak this tool exists to
 * catch. Keeps just enough to confirm which value tripped the match.
 */
export function redact(value) {
  const s = String(value);
  if (s.length <= 8) return "*".repeat(s.length);
  const keep = 4;
  const stars = "*".repeat(Math.min(s.length - keep * 2, 24));
  return `${s.slice(0, keep)}${stars}${s.slice(-keep)}`;
}

// --- Sensitive-map lookup ---------------------------------------------

// Terraform's `before_sensitive`/`after_sensitive` trees mirror the shape of
// `before`/`after`, but a subtree is collapsed to a bare `true` the moment
// everything under it is sensitive -- so "is this path sensitive" has to
// stop descending the moment it hits `true`, not just check the leaf.
function pathIsSensitive(sensitiveTree, path) {
  let node = sensitiveTree;
  for (const key of path) {
    if (node === true) return true;
    if (node && typeof node === "object") node = node[key];
    else return false;
  }
  return node === true;
}

function formatPath(path) {
  return path
    .map((seg, i) => (typeof seg === "number" ? `[${seg}]` : i === 0 ? String(seg) : `.${seg}`))
    .join("");
}

function walkStrings(value, path, sensitiveTree, onLeaf) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, [...path, i], sensitiveTree, onLeaf));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walkStrings(v, [...path, k], sensitiveTree, onLeaf);
    return;
  }
  if (typeof value !== "string") return;
  if (pathIsSensitive(sensitiveTree, path)) return;
  onLeaf(value, path);
}

function matchPatterns(text) {
  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    const m = pattern.re.exec(text);
    if (m) hits.push({ code: pattern.code, label: pattern.label, matched: m[0] });
  }
  return hits;
}

// --- Per-resource check -------------------------------------------------

/**
 * Checks one entry from `resource_changes`. Returns a list of findings, one
 * per (attribute path, side, matched pattern) -- a value can appear on both
 * `before` and `after` (e.g. an unchanged attribute on an in-place update).
 */
export function checkResourceChange(resourceChange) {
  const findings = [];
  const address = resourceChange.address ?? "(unknown resource)";
  const change = resourceChange.change ?? {};

  for (const side of ["before", "after"]) {
    const value = change[side];
    const sensitiveTree = change[`${side}_sensitive`];
    if (sensitiveTree === true) continue; // whole object marked sensitive
    walkStrings(value, [], sensitiveTree, (text, path) => {
      for (const hit of matchPatterns(text)) {
        findings.push({
          resourceAddress: address,
          side,
          path: formatPath(path) || "(root)",
          code: hit.code,
          label: hit.label,
          redacted: redact(hit.matched),
        });
      }
    });
  }

  return findings;
}

/** Checks `output_changes` the same way -- outputs are `sensitive` as a whole, not per-path. */
export function checkOutputChange(name, outputChange) {
  const findings = [];
  for (const side of ["before", "after"]) {
    if (outputChange.sensitive) continue;
    walkStrings(outputChange[side], [], undefined, (text, path) => {
      for (const hit of matchPatterns(text)) {
        findings.push({
          resourceAddress: `output.${name}`,
          side,
          path: formatPath(path) || "(root)",
          code: hit.code,
          label: hit.label,
          redacted: redact(hit.matched),
        });
      }
    });
  }
  return findings;
}

/**
 * Parses and validates a `terraform show -json` structured plan. Throws a
 * message aimed at the most common mistake: pasting the human-readable
 * `terraform plan` output, or the line-delimited JSON from `terraform plan
 * -json`, neither of which carry `resource_changes`.
 */
export function parsePlan(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty input");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `not valid JSON (${err.message}). This tool needs the structured plan from ` +
        '"terraform show -json <planfile>", not the human-readable plan output.',
    );
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.resource_changes)) {
    throw new Error(
      'missing "resource_changes" -- run "terraform plan -out=tfplan && terraform show -json tfplan" ' +
        "and check that file, not the plain-text plan or the streamed \"terraform plan -json\" log.",
    );
  }
  return data;
}

/** Checks a whole structured plan: every resource change plus every output change. */
export function checkPlan(plan) {
  const resourceFindings = (plan.resource_changes ?? []).flatMap((rc) => checkResourceChange(rc));
  const outputChanges = plan.output_changes ?? {};
  const outputFindings = Object.entries(outputChanges).flatMap(([name, oc]) => checkOutputChange(name, oc));
  const findings = [...resourceFindings, ...outputFindings];
  return {
    findings,
    resourcesChecked: (plan.resource_changes ?? []).length,
    outputsChecked: Object.keys(outputChanges).length,
  };
}

// Offline buyer/seller electronic-address (EndpointID) observations.
// Shape and typo check only — not a directory lookup. Findings never
// repeat the address.

const KNOWN_SCHEMES = new Set([
  "0002", "0007", "0009", "0037", "0060", "0088", "0096", "0130", "0151",
  "0183", "0184", "0190", "0191", "0192", "0193", "0195", "0196", "0198",
  "0201", "0204", "0208", "0209", "0210", "0211", "0212", "0213", "0216",
  "0221", "0230", "0235", "0240",
  "9910", "9913", "9914", "9915", "9918", "9919",
  "9920", "9922", "9923", "9924", "9925", "9926", "9927", "9928", "9929",
  "9930", "9931", "9932", "9933", "9934", "9935", "9936", "9937", "9938",
  "9939", "9940", "9941", "9942", "9943", "9944", "9945", "9946", "9947",
  "9948", "9950", "9951", "9952", "9953", "9955", "9956", "9957", "9958",
  "EM",
]);

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeScheme(value) {
  if (typeof value !== "string") return null;
  const compact = value.trim().toUpperCase();
  return compact || null;
}

export function normalizeEndpointId(value) {
  if (typeof value !== "string") return null;
  const stripped = value.trim();
  return stripped || null;
}

export function looksLikeKnownScheme(value) {
  const scheme = normalizeScheme(value);
  return scheme !== null && KNOWN_SCHEMES.has(scheme);
}

function digits(identifier, length) {
  const compact = identifier.replace(/\D/g, "");
  return compact.length === length;
}

function glnOk(identifier) {
  const compact = identifier.replace(/\D/g, "");
  if (compact.length !== 13) return false;
  let total = 0;
  for (let index = 0; index < 12; index += 1) {
    total += Number(compact[index]) * (index % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (total % 10)) % 10;
  return check === Number(compact[12]);
}

function emailOk(identifier) {
  if (identifier !== identifier.trim() || identifier.includes(" ") || identifier.split("@").length !== 2) {
    return false;
  }
  const [local, domain] = identifier.split("@");
  return Boolean(local) && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

function schemeIdOk(scheme, identifier) {
  if (scheme === "0088") return glnOk(identifier);
  if (scheme === "EM") return emailOk(identifier);
  if (scheme === "0007") return digits(identifier, 10);
  if (scheme === "0184") return digits(identifier, 8);
  if (scheme === "0190") return digits(identifier, 20);
  if (scheme === "0192") return digits(identifier, 9);
  if (scheme === "0208") return digits(identifier, 10);
  if (scheme === "0212") {
    const compact = identifier.replace(/[^A-Za-z0-9]/g, "");
    return (compact.length === 8 || compact.length === 9) && /^\d+$/.test(compact.slice(0, -1));
  }
  return identifier.replace(/[^A-Za-z0-9@.\-_:\/+]/g, "") !== "";
}

export function inspectPartyEndpoint(party, partyName) {
  if (!party || typeof party !== "object" || !("endpoint" in party)) return [];
  const endpoint = party.endpoint;
  if (endpoint === null || endpoint === "") return [];
  const path = `/${partyName}/endpoint`;
  const label = partyName.charAt(0).toUpperCase() + partyName.slice(1);
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return [finding(
      "INV-039",
      `${label} electronic address is not an object with scheme and id.`,
      `Use ${partyName}.endpoint.scheme (EAS code) and ${partyName}.endpoint.id, or omit endpoint.`,
      path,
    )];
  }

  const findings = [];
  const scheme = normalizeScheme(endpoint.scheme);
  const identifier = normalizeEndpointId(endpoint.id);
  if (scheme === null || !KNOWN_SCHEMES.has(scheme)) {
    findings.push(finding(
      "INV-039",
      `${label} electronic-address scheme is missing or not a published EAS code.`,
      "Use a Peppol EAS scheme such as 0088 (GLN), 0192, 0208, or EM, or omit endpoint.",
      `${path}/scheme`,
    ));
  }
  if (identifier === null) {
    findings.push(finding(
      "INV-040",
      `${label} electronic address is empty or not text.`,
      `Provide ${partyName}.endpoint.id as text, or omit endpoint.`,
      `${path}/id`,
    ));
  }
  if (scheme !== null && KNOWN_SCHEMES.has(scheme) && identifier !== null && !schemeIdOk(scheme, identifier)) {
    findings.push(finding(
      "INV-041",
      `${label} electronic address does not match the published ${scheme} shape.`,
      `Correct the ${scheme} identifier. This is a format typo check, not a directory lookup.`,
      `${path}/id`,
    ));
  }
  return findings;
}

export function inspectPartyEndpoints(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) return [];
  const findings = [];
  for (const partyName of ["supplier", "customer"]) {
    const party = invoice[partyName];
    if (party && typeof party === "object" && !Array.isArray(party)) {
      findings.push(...inspectPartyEndpoint(party, partyName));
    }
  }
  return findings;
}

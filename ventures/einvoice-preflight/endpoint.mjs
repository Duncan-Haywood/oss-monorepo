// Offline buyer/seller electronic-address (EndpointID) observations.
// Shape and typo check only — not a directory lookup. Findings never
// repeat the address.

const KNOWN_SCHEMES = new Set([
  "0002", "0007", "0009", "0037", "0060", "0088", "0096", "0106", "0130", "0151",
  "0183", "0184", "0190", "0191", "0192", "0193", "0195", "0196", "0198",
  "0201", "0204", "0208", "0209", "0210", "0211", "0212", "0213", "0216",
  "0221", "0230", "0235", "0240",
  // In OpenPeppol's EAS list as the PINT 1.1 rules carry it (phive-rules-peppol-pint 4.6.4),
  // added 2026-11-12: Japan's examples address buyers by 0188 and Oman's by 0248, so INV-039
  // called OpenPeppol's own files unaddressable.
  "0097", "0135", "0142", "0154", "0158", "0177", "0188", "0199", "0200", "0202",
  "0215", "0218", "0242", "0244", "0245", "0246", "0248", "9949", "9959",
  "9910", "9913", "9914", "9915", "9918", "9919",
  "9920", "9922", "9923", "9924", "9925", "9926", "9927", "9928", "9929",
  "9930", "9931", "9932", "9933", "9934", "9935", "9936", "9937", "9938",
  "9939", "9940", "9941", "9942", "9943", "9944", "9945", "9946", "9947",
  "9948", "9950", "9951", "9952", "9953", "9955", "9956", "9957", "9958",
  "EM",
  // In the EAS list EN 16931's BR-CL-25 carries (plain/en16931-ubl.json), added 2026-11-17:
  // INV-039 called these unpublished, though the official rules accept them. 0225 is the
  // French reform's directory address (FRCTC); 0217 the Dutch KVK establishment number.
  "0147", "0170", "0194", "0203", "0205", "0217", "0225", "9960", "AN", "AQ", "AS", "AU",
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
  // Digits only, as PEPPOL-COMMON-R040 reads it; 13 of them, as a GLN has.
  const compact = identifier;
  if (!/^\d{13}$/.test(compact)) return false;
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

// The checksummed and fixed-format schemes below follow OpenPeppol's fatal
// PEPPOL-COMMON rules (plain/peppol-ubl.json: R040 GLN, R041 0192, R042 0184,
// R043 0208, R049 0007, R050 0151, R052 0096, R053 0198) exactly, so an address
// the Peppol network would reject is caught here too, in JSON input and in
// files that do not claim the Peppol profile. Peppol reads the trimmed text, so
// "0123.456.789" or "BE0123456789" is not a valid 0208 address.
// eval/endpoint-peppol-differential.mjs runs these against Peppol's own XQuery.
function mod11No(id) {
  if (!/^\d{9}$/.test(id) || Number(id) === 0) return false;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += Number(id[7 - i]) * ((i % 6) + 2);
  return (11 - (sum % 11)) % 11 === Number(id[8]);
}

function mod97Be(id) {
  if (!/^\d{10}$/.test(id)) return false;
  return Number(id.slice(8)) === 97 - (Number(id.slice(0, 8)) % 97);
}

function luhnSe(id) {
  if (!/^\d{10}$/.test(id)) return false;
  let sum = 0;
  for (let pos = 1; pos <= 9; pos += 1) {
    const digit = Number(id[9 - pos]);
    sum += pos % 2 === 1 ? ((digit * 2) % 10) + Math.floor((digit * 2) / 10) : digit;
  }
  return (10 - (sum % 10)) % 10 === Number(id[9]);
}

function abnOk(id) {
  if (!/^\d{11}$/.test(id)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i += 1) sum += (Number(id[i]) - (i === 0 ? 1 : 0)) * weights[i];
  return sum % 89 === 0;
}

const SCHEME_CHECKS = {
  "0088": glnOk,
  "0192": mod11No,
  "0184": (id) => /^(DK\d{8}|\d{8})$/.test(id),
  "0096": (id) => /^\d{10}$/.test(id),
  "0198": (id) => /^DK\d{8}$/.test(id),
  "0208": mod97Be,
  "0007": luhnSe,
  "0151": abnOk,
};

// What a sender should type, for the fix text.
const SCHEME_SHAPES = {
  "0088": "13 digits with a GS1 check digit",
  "0192": "9 digits with a mod-11 check digit, no spaces or MVA",
  "0184": "8 digits, optionally after DK",
  "0096": "10 digits",
  "0198": "DK followed by 8 digits",
  "0208": "10 digits (the KBO/BCE number with its leading 0), no dots or BE prefix; the last two digits are 97 minus the first eight mod 97",
  "0007": "10 digits, no hyphen; the last is a Luhn check digit",
  "0151": "11 digits, no spaces; the ABN checksum must hold",
};

function schemeIdOk(scheme, identifier) {
  if (SCHEME_CHECKS[scheme]) return SCHEME_CHECKS[scheme](identifier);
  if (scheme === "EM") return emailOk(identifier);
  if (scheme === "0190") return digits(identifier, 20);
  if (scheme === "0212") {
    const compact = identifier.replace(/[^A-Za-z0-9]/g, "");
    return (compact.length === 8 || compact.length === 9) && /^\d+$/.test(compact.slice(0, -1));
  }
  return identifier.replace(/[^A-Za-z0-9@.\-_:\/+]/g, "") !== "";
}

export { schemeIdOk as endpointIdOk };

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
      `Correct the ${scheme} identifier${SCHEME_SHAPES[scheme] ? ` (${SCHEME_SHAPES[scheme]})` : ""}. This is a format typo check, not a directory lookup.`,
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

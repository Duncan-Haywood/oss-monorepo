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

// OpenPeppol's warning-level PEPPOL-COMMON rules (plain/peppol-ubl.json, BIS
// 3.0.22): R044 0201 IPA, R045 0210 codice fiscale, R047 0211 partita IVA, R054
// 0106 KVK, R055 0190 OIN, R056-1 9944 Dutch VAT, R057 0217 KVK establishment.
// Peppol only warns on these, so INV-061 is a warning, never blocking.
// eval/endpoint-peppol-warnings.mjs runs them against Peppol's own XQuery.
// Two places are stricter than Peppol, on purpose (counted apart in the eval):
// an 11-digit 0210 or 0211 number must carry the partita IVA check digit
// (Peppol checks it only after an IT prefix, and only for 0211), and a 0211
// without IT must still be 11 digits (Peppol passes any text without IT).
// Positions Peppol reads with "castable as xs:integer" must be digits here,
// so "+1" or " 1" in a codice fiscale is not taken as a number.
function pivaOk(id) {
  if (!/^\d{11}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i += 1) {
    const d = Number(id[i]);
    sum += i % 2 === 0 ? d : Number("0246813579"[d]);
  }
  return sum % 10 === 0;
}

function codiceFiscaleOk(id) {
  if (id.length === 11) return pivaOk(id);
  return /^[A-Za-z]{6}\d{2}[A-Za-z]\d{2}...\d[A-Za-z]$/u.test(id);
}

const WARNING_CHECKS = {
  "0201": { rule: "PEPPOL-COMMON-R044", ok: (id) => /^[A-Za-z0-9]{6}$/.test(id), shape: "6 letters or digits, the IPA office code (Codice Univoco Ufficio)" },
  "0210": { rule: "PEPPOL-COMMON-R045", ok: codiceFiscaleOk, shape: "a 16-character personal codice fiscale (six letters, two digits, a letter, two digits, four characters, a letter) or an 11-digit number with its check digit" },
  "0211": { rule: "PEPPOL-COMMON-R047", ok: (id) => pivaOk(/^it/i.test(id) ? id.slice(2) : id), shape: "IT followed by the 11-digit partita IVA, whose last digit is its check digit" },
  "0106": { rule: "PEPPOL-COMMON-R054", ok: (id) => /^\d{8}$/.test(id), shape: "8 digits (12345678)" },
  "0190": { rule: "PEPPOL-COMMON-R055", ok: (id) => /^\d{20}$/.test(id), shape: "20 digits with no spaces (12345678901234567890)" },
  "9944": { rule: "PEPPOL-COMMON-R056-1", ok: (id) => /^NL\d{9}B\d{2}$/.test(id), shape: "NL, 9 digits, B and 2 digits (NL123456789B12)" },
  "0217": { rule: "PEPPOL-COMMON-R057", ok: (id) => /^\d{12}$/.test(id), shape: "12 digits (123456789012)" },
};

// true or false for a scheme with a warning-level rule, null for any other.
export function endpointWarningOk(scheme, identifier) {
  const check = WARNING_CHECKS[scheme];
  return check ? check.ok(identifier) : null;
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
      `Correct the ${scheme} identifier${SCHEME_SHAPES[scheme] ? ` (${SCHEME_SHAPES[scheme]})` : ""}. This is a format typo check, not a directory lookup.`,
      `${path}/id`,
    ));
  } else if (scheme !== null && identifier !== null && endpointWarningOk(scheme, identifier) === false) {
    const check = WARNING_CHECKS[scheme];
    findings.push({
      ...finding(
        "INV-061",
        `${label} electronic address does not match the ${scheme} format OpenPeppol checks (${check.rule}, a warning).`,
        `Check the ${scheme} identifier: ${check.shape}. Peppol warns on this rather than rejecting the file; this is a format check, not a directory lookup.`,
        `${path}/id`,
      ),
      severity: "warning",
    });
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

// The same PEPPOL-COMMON rules on the party's other identifiers (added
// 2026-11-17). Peppol's contexts are `cbc:EndpointID[@schemeID = 'X'] |
// cac:PartyIdentification/cbc:ID[@schemeID = 'X'] | cbc:CompanyID[@schemeID =
// 'X']` in UBL and `ram:URIID | ram:ID | ram:GlobalID` in CII, so a mistyped
// Belgian KBO number as the seller's legal registration (BT-30) or a GLN with
// a bad check digit as the buyer identifier (BT-46) bounces at the network
// exactly as a bad endpoint does. INV-062 is the fatal set (0088, 0192, 0184,
// 0096, 0198, 0208, 0007, 0151), blocking; INV-063 the warning set, a warning.
// Read from `legal_id: {scheme, id}` (BT-30/BT-47) and `party_ids: [{scheme,
// id}]` (BT-29/BT-46 with a scheme); ubl.mjs and cii.mjs fill both from a file.
// Only schemes with a Peppol rule are read here: an unknown ICD in these
// places is EN 16931's BR-CL-11 to judge, not an EAS code. Findings never
// repeat the identifier. eval/party-id-peppol-differential.mjs compares whole
// UBL and CII files against Peppol's own rule pass.
const ID_PLACES = {
  legal_id: "legal registration identifier",
  party_ids: "identifier",
};

function inspectOneIdentifier(entry, label, what, path) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const scheme = normalizeScheme(entry.scheme);
  const identifier = normalizeEndpointId(entry.id);
  if (scheme === null || identifier === null) return [];
  if (SCHEME_CHECKS[scheme]) {
    if (SCHEME_CHECKS[scheme](identifier)) return [];
    return [finding(
      "INV-062",
      `${label} ${what} does not match the ${scheme} format OpenPeppol rejects on (PEPPOL-COMMON).`,
      `Correct the ${scheme} identifier (${SCHEME_SHAPES[scheme]}). Peppol applies the same check here as on the electronic address; this is a format check, not a registry lookup.`,
      `${path}/id`,
    )];
  }
  const check = WARNING_CHECKS[scheme];
  if (check && !check.ok(identifier)) {
    return [{
      ...finding(
        "INV-063",
        `${label} ${what} does not match the ${scheme} format OpenPeppol checks (${check.rule}, a warning).`,
        `Check the ${scheme} identifier: ${check.shape}. Peppol warns on this rather than rejecting the file; this is a format check, not a registry lookup.`,
        `${path}/id`,
      ),
      severity: "warning",
    }];
  }
  return [];
}

// CII line ids (added 2026-11-17): Peppol's `ram:ID | ram:GlobalID | ram:URIID`
// contexts name no parent, so an item's standard identifier (BT-157,
// SpecifiedTradeProduct/GlobalID) filed under a COMMON scheme, typically a
// GTIN under 0088 instead of 0160, meets the GLN rule (R040, a mod-10 test), so
// a mistyped check digit bounces; INV-062 also keeps its 13-digit GLN length
// test here, stricter than Peppol as on every 0088 id. cii.mjs keeps every schemed id in a line as `scheme_ids`; schemes
// with no Peppol rule (0160 GTIN, VA...) are left alone here.
export function inspectLineSchemedIds(line, index) {
  if (!line || typeof line !== "object" || !Array.isArray(line.scheme_ids)) return [];
  const findings = [];
  line.scheme_ids.forEach((entry, j) => {
    findings.push(...inspectOneIdentifier(entry, `Line ${index + 1}`, "identifier", `/lines/${index}/scheme_ids/${j}`));
  });
  return findings;
}

export function inspectPartyIdentifiers(party, partyName, label = partyName.charAt(0).toUpperCase() + partyName.slice(1)) {
  if (!party || typeof party !== "object" || Array.isArray(party)) return [];
  const findings = [];
  findings.push(...inspectOneIdentifier(party.legal_id, label, ID_PLACES.legal_id, `/${partyName}/legal_id`));
  if (Array.isArray(party.party_ids)) {
    party.party_ids.forEach((entry, index) => {
      findings.push(...inspectOneIdentifier(entry, label, ID_PLACES.party_ids, `/${partyName}/party_ids/${index}`));
    });
  }
  return findings;
}

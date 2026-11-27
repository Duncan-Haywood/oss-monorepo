// Reads the Factur-X 1.0.9 profile schemas that EN 16931's subset does not cover (MINIMUM,
// BASIC WL and EXTENDED, each a restriction or extension of UN/CEFACT CII D16B published by
// FNFE-MPE and FeRD in the Factur-X package) into facturx-xsd-data.mjs, the tables cii-xsd.mjs
// checks those profiles' files against:
//   node build-facturx-schema.mjs [dir holding facturx-minimum/, facturx-basicwl/, facturx-extended/, cii-extended-ctc-fr/]
// Without a path it clones akretion/factur-x at SOURCE_COMMIT, whose
// src/facturx/xsd_and_schematron/ carries the package's XSDs unchanged (the same files its
// xml_check_xsd() validates with).
//
// As with build-cii-schema.mjs, the XSDs are not copied into the tree: the data module holds
// only facts read from them, and carries UN/CEFACT's notice, which permits derivative works
// that assist in the schema's implementation.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCiiSchema } from "./cii-schema-read.mjs";

export const SOURCE_REPO = "https://github.com/akretion/factur-x";
export const SOURCE_COMMIT = "d0c39409ec2d058ef461d1107791c5dce0f2e513";
const SUBDIR = "src/facturx/xsd_and_schematron";

let dir = process.argv[2];
if (!dir) {
  const tmp = mkdtempSync(join(tmpdir(), "facturx-"));
  execFileSync("git", ["init", "-q", tmp]);
  execFileSync("git", ["-C", tmp, "fetch", "-q", "--depth", "1", SOURCE_REPO, SOURCE_COMMIT]);
  execFileSync("git", ["-C", tmp, "checkout", "-q", "FETCH_HEAD"]);
  dir = join(tmp, SUBDIR);
}

const NAMESPACES = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};
// The package names each profile's files by profile and version (the EXTENDED ram file is
// 1.09.2), so each import is found by the namespace suffix in its name rather than spelled out.
const PROFILES = { minimum: "MINIMUM", basicwl: "BASICWL", extended: "EXTENDED" };
const SUFFIX = {
  ram: "_urn_un_unece_uncefact_data_standard_ReusableAggregateBusinessInformationEntity_100.xsd",
  qdt: "_urn_un_unece_uncefact_data_standard_QualifiedDataType_100.xsd",
  udt: "_urn_un_unece_uncefact_data_standard_UnqualifiedDataType_100.xsd",
};

// The French EXTENDED-CTC-FR profile (BT-24 urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr,
// the extension of EN 16931 for France's 2026 e-invoicing reform) ships in the same package as a
// full UN/CEFACT D22B schema set, not a Factur-X restriction of D16B: its root file is
// CrossIndustryInvoice_100pD22B.xsd and its imports carry that prefix. Its code-list files are
// imported by none of the four files read here, so they are not read.
const LAYOUTS = {
  ...Object.fromEntries(Object.entries(PROFILES).map(([key, upper]) => [key, { sub: `facturx-${key}`, prefix: "Factur-X_", root: `Factur-X_${upper}.xsd` }])),
  extendedctcfr: { sub: "cii-extended-ctc-fr", prefix: "CrossIndustryInvoice_100pD22B_", root: "CrossIndustryInvoice_100pD22B.xsd" },
};

const profiles = {};
const files = {};
for (const [key, layout] of Object.entries(LAYOUTS)) {
  const sub = join(dir, layout.sub);
  const names = readdirSync(sub);
  const pick = (suffix) => {
    const hits = names.filter((n) => n.startsWith(layout.prefix) && n.endsWith(suffix));
    if (hits.length !== 1) throw new Error(`${layout.sub}: expected one *${suffix}, found ${hits.length}`);
    return hits[0];
  };
  const FILES = [["rsm", layout.root], ["ram", pick(SUFFIX.ram)], ["qdt", pick(SUFFIX.qdt)], ["udt", pick(SUFFIX.udt)]];
  if (!names.includes(FILES[0][1])) throw new Error(`${layout.sub}: no ${FILES[0][1]}`);
  const { complex, simple, roots } = readCiiSchema(sub, FILES, NAMESPACES);
  const root = roots.find((r) => r.name === "CrossIndustryInvoice");
  if (!root) throw new Error(`${layout.sub}: no CrossIndustryInvoice element`);
  profiles[key] = { root: root.type, complex, simple };
  files[key] = FILES.map(([, f]) => f);
  console.log(`${key}: ${Object.keys(complex).length} complex types, ${Object.keys(simple).length} simple types`);
}

const NOTICE = "Copyright (C) UN/CEFACT (2016). All Rights Reserved. This document and translations of it may be copied and furnished to others, and derivative works that comment on or otherwise explain it or assist in its implementation may be prepared, copied, published and distributed, in whole or in part, without restriction of any kind, provided that the above copyright notice and this paragraph are included on all such copies and derivative works.";
const out = {
  source: `Factur-X 1.0.9 (FNFE-MPE / FeRD) MINIMUM, BASIC WL and EXTENDED XSDs, restrictions of UN/CEFACT CrossIndustryInvoice 100.D16B, and the French EXTENDED-CTC-FR XSDs (UN/CEFACT CrossIndustryInvoice 100.D22B), from ${SOURCE_REPO} at ${SOURCE_COMMIT}, ${SUBDIR}`,
  notice: NOTICE,
  namespace: NAMESPACES.rsm,
  namespaces: NAMESPACES,
  files,
  profiles,
};
writeFileSync(new URL("./facturx-xsd-data.mjs", import.meta.url), `// Generated by build-facturx-schema.mjs; do not edit.\n// Facts read from the Factur-X 1.0.9 profile schemas (UN/CEFACT D16B) and the French EXTENDED-CTC-FR schema (D22B). ${NOTICE}\nexport default ${JSON.stringify(out)};\n`);

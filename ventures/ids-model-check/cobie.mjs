// COBie 2.4 handover workbook from an IFC model, and a quality check (QC) of
// any COBie workbook: one this file writes, or one another tool exported.
//
// COBie (Construction Operations Building information exchange, NBIMS-US V3
// section 4.2, version 2.4) is the spreadsheet a facility owner asks for at
// handover: who made the data (Contact), the building (Facility), its levels
// (Floor), rooms (Space), zones (Zone), the kinds of maintainable product
// (Type), each installed one (Component), the systems they form (System), and
// every other property (Attribute). US federal owners (GSA, USACE, VA) and UK
// public projects require it; an owner's FM team rejects a workbook with
// blank required cells, template placeholders or references that point
// nowhere, so the QC below checks exactly those.
//
//   cobieFromModel(model, opts) -> { sheets: { Contact: [row], ... }, notes }
//     row = { Column: "value", ... } in COLUMNS order; a value the model
//     does not hold is "" (never invented). opts.na fills blank optional cells
//     with "n/a" (COBie's "not applicable"); opts.components "all" lists every
//     element as a Component instead of maintainable products only;
//     opts.attributes false leaves the Attribute sheet empty.
//   cobieToXlsx(cobie) -> Uint8Array (.xlsx, cells as Text)
//   cobieFromRows(rowsBySheet) -> sheets   (header row + rows, per sheet name)
//   cobieFromXlsx(bytes, inflateRaw) -> sheets
//   cobieQc(sheets, { stage: "design" | "handover" }) -> { issues, counts, rows }
//   qcText(qc) -> plain text report
//
// Values are written as the model stores them, in the model's own units
// (Facility names them), so a COBie reader's units line up with the numbers.

import { psetsOf, psetInfo } from "./ids.mjs";
import { sheetsToXlsx, xlsxToRows } from "./sheet.mjs";

export const COLUMNS = {
  Contact: ["Email", "CreatedBy", "CreatedOn", "Category", "Company", "Phone", "ExtSystem", "ExtObject", "ExtIdentifier", "Department", "OrganizationCode", "GivenName", "FamilyName", "Street", "PostalBox", "Town", "StateRegion", "PostalCode", "Country"],
  Facility: ["Name", "CreatedBy", "CreatedOn", "Category", "ProjectName", "SiteName", "LinearUnits", "AreaUnits", "VolumeUnits", "CurrencyUnit", "AreaMeasurement", "ExternalSystem", "ExternalProjectObject", "ExternalProjectIdentifier", "ExternalSiteObject", "ExternalSiteIdentifier", "ExternalFacilityObject", "ExternalFacilityIdentifier", "Description", "ProjectDescription", "SiteDescription", "Phase"],
  Floor: ["Name", "CreatedBy", "CreatedOn", "Category", "ExtSystem", "ExtObject", "ExtIdentifier", "Description", "Elevation", "Height"],
  Space: ["Name", "CreatedBy", "CreatedOn", "Category", "FloorName", "Description", "ExtSystem", "ExtObject", "ExtIdentifier", "RoomTag", "UsableHeight", "GrossArea", "NetArea"],
  Zone: ["Name", "CreatedBy", "CreatedOn", "Category", "SpaceNames", "ExtSystem", "ExtObject", "ExtIdentifier", "Description"],
  Type: ["Name", "CreatedBy", "CreatedOn", "Category", "Description", "AssetType", "Manufacturer", "ModelNumber", "WarrantyGuarantorParts", "WarrantyDurationParts", "WarrantyGuarantorLabor", "WarrantyDurationLabor", "WarrantyDurationUnit", "ExtSystem", "ExtObject", "ExtIdentifier", "ReplacementCost", "ExpectedLife", "DurationUnit", "WarrantyDescription", "NominalLength", "NominalWidth", "NominalHeight", "ModelReference", "Shape", "Size", "Color", "Finish", "Grade", "Material", "Constituents", "Features", "AccessibilityPerformance", "CodePerformance", "SustainabilityPerformance"],
  Component: ["Name", "CreatedBy", "CreatedOn", "TypeName", "Space", "Description", "ExtSystem", "ExtObject", "ExtIdentifier", "SerialNumber", "InstallationDate", "WarrantyStartDate", "TagNumber", "BarCode", "AssetIdentifier"],
  System: ["Name", "CreatedBy", "CreatedOn", "Category", "ComponentNames", "ExtSystem", "ExtObject", "ExtIdentifier", "Description"],
  Attribute: ["Name", "CreatedBy", "CreatedOn", "Category", "SheetName", "RowName", "Value", "Unit", "ExtSystem", "ExtObject", "ExtIdentifier", "Description", "AllowedValues"],
};
export const SHEETS = Object.keys(COLUMNS);

// Required cells (the 2.4 template's yellow columns). "design" is what a
// design-stage deliverable must carry; "handover" adds what the contractor
// fills at construction (product data and installed-unit data).
const REQUIRED_DESIGN = {
  Contact: ["Email", "CreatedBy", "CreatedOn", "Category", "Company", "Phone"],
  Facility: ["Name", "CreatedBy", "CreatedOn", "Category", "ProjectName", "SiteName", "LinearUnits", "AreaUnits", "VolumeUnits", "CurrencyUnit", "AreaMeasurement"],
  Floor: ["Name", "CreatedBy", "CreatedOn", "Category"],
  Space: ["Name", "CreatedBy", "CreatedOn", "Category", "FloorName", "Description"],
  Zone: ["Name", "CreatedBy", "CreatedOn", "Category", "SpaceNames"],
  Type: ["Name", "CreatedBy", "CreatedOn", "Category", "Description", "AssetType"],
  Component: ["Name", "CreatedBy", "CreatedOn", "TypeName", "Space", "Description"],
  System: ["Name", "CreatedBy", "CreatedOn", "Category", "ComponentNames"],
  Attribute: ["Name", "CreatedBy", "CreatedOn", "SheetName", "RowName", "Value"],
};
const REQUIRED_HANDOVER_EXTRA = {
  Type: ["Manufacturer", "ModelNumber", "WarrantyGuarantorParts", "WarrantyDurationParts", "WarrantyGuarantorLabor", "WarrantyDurationLabor", "WarrantyDurationUnit", "ReplacementCost", "ExpectedLife", "DurationUnit", "NominalLength", "NominalWidth", "NominalHeight"],
  Component: ["SerialNumber", "InstallationDate", "WarrantyStartDate"],
};
export function requiredColumns(sheet, stage = "design") {
  const base = REQUIRED_DESIGN[sheet] || [];
  return stage === "handover" ? base.concat(REQUIRED_HANDOVER_EXTRA[sheet] || []) : base;
}

// Key and reference cells: "n/a" is not an answer there.
const NO_NA = new Set(["Name", "Email", "FloorName", "TypeName", "Space", "SpaceNames", "ComponentNames", "SheetName", "RowName", "CreatedBy", "CreatedOn"]);
const NUMERIC = new Set(["Elevation", "Height", "UsableHeight", "GrossArea", "NetArea", "ReplacementCost", "ExpectedLife", "WarrantyDurationParts", "WarrantyDurationLabor", "NominalLength", "NominalWidth", "NominalHeight"]);
const DATES = new Set(["InstallationDate", "WarrantyStartDate"]);
const PICK = {
  "Floor.Category": ["Floor", "Roof", "Site"],
  "Type.AssetType": ["Fixed", "Moveable"],
  "Type.WarrantyDurationUnit": ["Year", "Month", "Week", "Day", "Hour", "Minute"],
  "Type.DurationUnit": ["Year", "Month", "Week", "Day", "Hour", "Minute"],
};

// --------------------------------------------------------------- export ----

// Classes that are not maintainable products: the building fabric (walls,
// slabs, beams, ...) except doors, windows and shading devices, which owners
// maintain; openings and other features; pipe, duct and cable runs and their
// fittings; parts, fasteners, reinforcement and assemblies; virtual, civil and
// geographic elements. What is left (equipment, terminals, controls,
// furniture, transport, doors, windows) is what a COBie Component sheet lists.
const NOT_ASSETS = ["IFCFEATUREELEMENT", "IFCFLOWSEGMENT", "IFCFLOWFITTING", "IFCELEMENTASSEMBLY", "IFCELEMENTCOMPONENT", "IFCBUILDINGELEMENTPART", "IFCVIRTUALELEMENT", "IFCCIVILELEMENT", "IFCGEOGRAPHICELEMENT", "IFCDISTRIBUTIONPORT", "IFCREINFORCINGELEMENT", "IFCFASTENER", "IFCMECHANICALFASTENER", "IFCDISCRETEACCESSORY", "IFCSURFACEFEATURE"];
const FABRIC = ["IFCBUILDINGELEMENT", "IFCBUILTELEMENT"];
const FABRIC_ASSETS = ["IFCDOOR", "IFCWINDOW", "IFCSHADINGDEVICE"];

export function isAsset(model, e) {
  const is = (t) => model.isA(e, t);
  if (NOT_ASSETS.some(is)) return false;
  if (FABRIC.some(is) && !FABRIC_ASSETS.some(is)) return false;
  return true;
}

const str = (v) => {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    if (v.typed !== undefined) return str(v.value);
    if (typeof v.enum === "string") return v.enum;
    return "";
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(+v.toPrecision(12)) : "";
  return String(v);
};

const isoFromSeconds = (s) => (typeof s === "number" && Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString().slice(0, 19) : "");

// One property's value as text: single values, enumerations (joined by ","),
// list values, quantities. The unit stays the model's.
export function propText(model, p) {
  if (!p) return "";
  if (p.predefined) return str(p.value);
  const a = (n) => model.attr(p, n);
  switch (p.type) {
    case "IFCPROPERTYSINGLEVALUE": return str(a("NominalValue"));
    case "IFCPROPERTYENUMERATEDVALUE": case "IFCPROPERTYLISTVALUE": {
      const l = a(p.type === "IFCPROPERTYLISTVALUE" ? "ListValues" : "EnumerationValues");
      return Array.isArray(l) ? l.map(str).filter((x) => x !== "").join(",") : str(l);
    }
    case "IFCPROPERTYBOUNDEDVALUE": {
      const lo = str(a("LowerBoundValue")), hi = str(a("UpperBoundValue"));
      return lo && hi ? `${lo}-${hi}` : lo || hi;
    }
    case "IFCQUANTITYLENGTH": return str(a("LengthValue"));
    case "IFCQUANTITYAREA": return str(a("AreaValue"));
    case "IFCQUANTITYVOLUME": return str(a("VolumeValue"));
    case "IFCQUANTITYCOUNT": return str(a("CountValue"));
    case "IFCQUANTITYWEIGHT": return str(a("WeightValue"));
    case "IFCQUANTITYTIME": return str(a("TimeValue"));
    case "IFCQUANTITYNUMBER": return str(a("NumberValue"));
    default: return "";
  }
}

// The allowed values of an enumerated property, for Attribute.AllowedValues.
function allowedValues(model, p) {
  if (!p || p.predefined || p.type !== "IFCPROPERTYENUMERATEDVALUE") return "";
  const ref = model.get(model.attr(p, "EnumerationReference"));
  const l = ref && model.attr(ref, "EnumerationValues");
  return Array.isArray(l) ? l.map(str).filter(Boolean).join(",") : "";
}

// Looks a value up in an element's property sets (its type's included), by
// [set or null, property] pairs in order of preference. A Revit COBie
// shared parameter "COBie.Type.Manufacturer" answers for "Manufacturer".
function lookup(psets, wanted) {
  for (const [set, name] of wanted) {
    for (const [sn, slot] of psets) {
      if (set && sn.toLowerCase() !== set.toLowerCase()) continue;
      for (const [pn, p] of slot.props) {
        const bare = pn.replace(/^COBie\.(?:Type|Component|Space|Floor|Facility|Zone|System)\./i, "");
        if (bare.toLowerCase() === name.toLowerCase()) return p;
      }
    }
  }
  return null;
}

function classification(model, e) {
  const out = [];
  const read = (id) => {
    for (const c of [...(model.classRels.get(id) || []), ...(model.extRefs.get(id) || [])]) {
      if (!model.isA(c, "IFCCLASSIFICATIONREFERENCE")) continue;
      const code = str(model.schemaId === "IFC2X3" ? model.attr(c, "ItemReference") : model.attr(c, "Identification"));
      const name = str(model.attr(c, "Name"));
      const v = code && name && code !== name ? `${code}: ${name}` : code || name;
      if (v) out.push(v);
    }
  };
  read(e.id);
  const ty = model.typeOf.get(e.id);
  if (!out.length && ty) read(ty.id);
  return out[0] || "";
}

// Category: a classification reference, else the classification a Revit
// export keeps in properties (OmniClass, Uniformat assembly code).
function category(model, e, psets) {
  const c = classification(model, e);
  if (c) return c;
  const t = (...names) => propText(model, lookup(psets, names.map((n) => [null, n])));
  const pair = (code, title) => {
    const a = t(code), b = t(title);
    return a && b && !b.startsWith(a) ? `${a}: ${b}` : b || a;
  };
  return t("Category") || t("OmniClass Table 13 Category") || pair("OmniClass Number", "OmniClass Title") || pair("Category Code", "Category Description") || pair("Assembly Code", "Assembly Description") || "";
}

// The spatial element an element sits in: contained, else aggregated, walking
// up until a class in `stop` is met.
function placedIn(model, e, stop, depth = 0) {
  if (!e || depth > 20) return null;
  for (const rel of ["IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELAGGREGATES", "IFCRELNESTS", "IFCRELFILLSELEMENT", "IFCRELVOIDSELEMENT"]) {
    for (const p of model.parents[rel].get(e.id) || []) {
      if (stop.some((t) => model.isA(p, t))) return p;
      const up = placedIn(model, p, stop, depth + 1);
      if (up) return up;
    }
  }
  return null;
}

function unitName(model, kind) {
  const proj = (model.byType.get("IFCPROJECT") || [])[0];
  const ua = proj && model.get(model.attr(proj, "UnitsInContext"));
  if (!ua) return "";
  for (const u of model.refs(ua, "Units")) {
    if (str(model.attr(u, "UnitType")) !== kind) continue;
    if (u.type === "IFCSIUNIT") {
      const pre = str(model.attr(u, "Prefix")).toLowerCase();
      const n = str(model.attr(u, "Name")).toLowerCase();
      const m = n.match(/^(square_|cubic_)?(.*)$/);
      const word = m[2] === "metre" ? "meters" : m[2] + "s";
      return `${m[1] ? m[1].replace("_", "").replace("square", "square ").replace("cubic", "cubic ") : ""}${pre}${word}`;
    }
    if (u.type.startsWith("IFCCONVERSIONBASEDUNIT")) return str(model.attr(u, "Name")).toLowerCase();
  }
  return "";
}

function currency(model) {
  const proj = (model.byType.get("IFCPROJECT") || [])[0];
  const ua = proj && model.get(model.attr(proj, "UnitsInContext"));
  if (!ua) return "";
  for (const u of model.refs(ua, "Units")) if (u.type === "IFCMONETARYUNIT") return str(model.attr(u, "Currency"));
  return "";
}

// A person-and-organization's email and contact facts.
function contactOf(model, po) {
  const person = model.get(model.attr(po, "ThePerson"));
  const org = model.get(model.attr(po, "TheOrganization"));
  const r = { Email: "", Company: str(org && model.attr(org, "Name")), Phone: "", GivenName: str(person && model.attr(person, "GivenName")), FamilyName: str(person && model.attr(person, "FamilyName")), Department: "", OrganizationCode: str(org && (model.attr(org, "Identification") ?? model.attr(org, "Id"))), Street: "", PostalBox: "", Town: "", StateRegion: "", PostalCode: "", Country: "" };
  const user = str(person && (model.attr(person, "Identification") ?? model.attr(person, "Id")));
  if (!r.GivenName && !r.FamilyName && user) r.GivenName = user;
  for (const holder of [person, org]) {
    if (!holder) continue;
    for (const ad of model.refs(holder, "Addresses")) {
      if (ad.type === "IFCTELECOMADDRESS") {
        const mails = model.attr(ad, "ElectronicMailAddresses");
        const phones = model.attr(ad, "TelephoneNumbers");
        if (!r.Email && Array.isArray(mails) && mails.length) r.Email = str(mails[0]);
        if (!r.Phone && Array.isArray(phones) && phones.length) r.Phone = str(phones[0]);
      } else if (ad.type === "IFCPOSTALADDRESS") {
        const lines = model.attr(ad, "AddressLines");
        if (!r.Street && Array.isArray(lines)) r.Street = lines.map(str).filter(Boolean).join(", ");
        r.PostalBox ||= str(model.attr(ad, "PostalBox"));
        r.Town ||= str(model.attr(ad, "Town"));
        r.StateRegion ||= str(model.attr(ad, "Region"));
        r.PostalCode ||= str(model.attr(ad, "PostalCode"));
        r.Country ||= str(model.attr(ad, "Country"));
        r.Department ||= str(model.attr(ad, "InternalLocation"));
      }
    }
  }
  return r;
}

export function cobieFromModel(model, opts = {}) {
  const notes = [];
  const sheets = Object.fromEntries(SHEETS.map((s) => [s, []]));
  const row = (sheet, values) => Object.fromEntries(COLUMNS[sheet].map((c) => [c, values[c] ?? ""]));
  const kind = (t) => model.ofKind(t);
  const has = (t) => model.schema.has(t);
  const safeKind = (t) => (has(t) ? kind(t) : []);

  // Owner histories -> CreatedBy (an email) and CreatedOn.
  const contacts = new Map(); // po id -> contact row values
  const histCache = new Map();
  const history = (e) => {
    const oh = model.get(model.attr(e, "OwnerHistory"));
    if (!oh) return { by: "", on: "", app: "" };
    let h = histCache.get(oh.id);
    if (h) return h;
    const po = model.get(model.attr(oh, "OwningUser"));
    const appE = model.get(model.attr(oh, "OwningApplication"));
    let by = "";
    if (po) {
      let c = contacts.get(po.id);
      if (!c) contacts.set(po.id, (c = { ...contactOf(model, po), _on: isoFromSeconds(model.attr(oh, "CreationDate")), _app: str(appE && model.attr(appE, "ApplicationFullName")), _id: po.id }));
      by = c.Email;
    }
    h = { by, on: isoFromSeconds(model.attr(oh, "CreationDate")), app: str(appE && model.attr(appE, "ApplicationFullName")) };
    histCache.set(oh.id, h);
    return h;
  };
  const base = (e, ifcClass) => {
    const h = history(e);
    return { CreatedBy: h.by, CreatedOn: h.on, ExtSystem: h.app, ExternalSystem: h.app, ExtObject: ifcClass || ifcName(model, e.type), ExtIdentifier: str(model.attr(e, "GlobalId")) };
  };

  // Facility
  const project = kind("IFCPROJECT")[0];
  const site = kind("IFCSITE")[0];
  const buildings = kind("IFCBUILDING");
  if (buildings.length > 1) notes.push(`${buildings.length} IfcBuilding: one Facility row each; COBie expects one facility per workbook`);
  for (const b of buildings) {
    const ps = psetsOf(model, b);
    const bb = base(b);
    sheets.Facility.push(row("Facility", {
      ...bb,
      Name: str(model.attr(b, "Name")) || str(model.attr(b, "LongName")) || str(project && model.attr(project, "Name")),
      Category: category(model, b, ps),
      ProjectName: str(project && (model.attr(project, "Name") || model.attr(project, "LongName"))),
      SiteName: str(site && model.attr(site, "Name")),
      LinearUnits: unitName(model, "LENGTHUNIT"), AreaUnits: unitName(model, "AREAUNIT"), VolumeUnits: unitName(model, "VOLUMEUNIT"),
      CurrencyUnit: currency(model) || propText(model, lookup(ps, [[null, "CurrencyUnit"]])),
      AreaMeasurement: propText(model, lookup(ps, [[null, "AreaMeasurement"]])),
      ExternalProjectObject: project ? "IfcProject" : "", ExternalProjectIdentifier: str(project && model.attr(project, "GlobalId")),
      ExternalSiteObject: site ? "IfcSite" : "", ExternalSiteIdentifier: str(site && model.attr(site, "GlobalId")),
      ExternalFacilityObject: "IfcBuilding", ExternalFacilityIdentifier: str(model.attr(b, "GlobalId")),
      Description: str(model.attr(b, "Description")) || str(model.attr(b, "LongName")),
      ProjectDescription: str(project && (model.attr(project, "Description") || model.attr(project, "LongName"))),
      SiteDescription: str(site && (model.attr(site, "Description") || model.attr(site, "LongName"))),
      Phase: str(project && model.attr(project, "Phase")),
    }));
  }

  // Floors
  const floorName = new Map(); // storey id -> COBie name
  for (const s of kind("IFCBUILDINGSTOREY")) {
    const ps = psetsOf(model, s);
    const name = str(model.attr(s, "Name"));
    floorName.set(s.id, name);
    const catProp = propText(model, lookup(ps, [[null, "Category"], [null, "Category Code"]]));
    sheets.Floor.push(row("Floor", {
      ...base(s),
      Name: name,
      Category: PICK["Floor.Category"].find((c) => c.toLowerCase() === catProp.toLowerCase()) || "Floor",
      Description: str(model.attr(s, "LongName")) || str(model.attr(s, "Description")) || name,
      Elevation: str(model.attr(s, "Elevation")),
      Height: propText(model, lookup(ps, [["Qto_BuildingStoreyBaseQuantities", "GrossHeight"], [null, "Height"]])),
    }));
  }

  // Spaces
  const spaceName = new Map();
  const spaceRows = [];
  for (const sp of kind("IFCSPACE")) {
    const ps = psetsOf(model, sp);
    const name = str(model.attr(sp, "Name"));
    spaceName.set(sp.id, name);
    const storey = placedIn(model, sp, ["IFCBUILDINGSTOREY"]);
    const r = row("Space", {
      ...base(sp),
      Name: name,
      Category: category(model, sp, ps),
      FloorName: storey ? floorName.get(storey.id) || "" : "",
      Description: str(model.attr(sp, "LongName")) || str(model.attr(sp, "Description")),
      RoomTag: propText(model, lookup(ps, [[null, "RoomTag"]])),
      UsableHeight: propText(model, lookup(ps, [[null, "UsableHeight"], ["Qto_SpaceBaseQuantities", "FinishCeilingHeight"], ["Qto_SpaceBaseQuantities", "Height"]])),
      GrossArea: propText(model, lookup(ps, [[null, "GrossArea"], ["Qto_SpaceBaseQuantities", "GrossFloorArea"], ["BaseQuantities", "GrossFloorArea"]])),
      NetArea: propText(model, lookup(ps, [[null, "NetArea"], ["Qto_SpaceBaseQuantities", "NetFloorArea"], ["BaseQuantities", "NetFloorArea"], ["PSet_Revit_Dimensions", "Area"]])),
    });
    sheets.Space.push(r);
    spaceRows.push([sp, ps, r]);
  }

  // Zones: IfcZone groups of spaces, and the zone names a Revit COBie set-up
  // keeps on each space ("VentilationZoneName" = "Unit A VentilationZoneName").
  const groupMembers = (g) => {
    const out = [];
    for (const [id, groups] of model.parents.IFCRELASSIGNSTOGROUP) if (groups.includes(g)) out.push(model.entities.get(id));
    return out.filter(Boolean);
  };
  for (const z of safeKind("IFCZONE")) {
    const ps = psetsOf(model, z);
    const members = groupMembers(z).filter((m) => model.isA(m, "IFCSPACE"));
    if (!members.length) notes.push(`zone ${str(model.attr(z, "Name"))} has no spaces`);
    for (const m of members.length ? members : [null]) {
      sheets.Zone.push(row("Zone", { ...base(z), Name: str(model.attr(z, "Name")), Category: category(model, z, ps) || str(model.attr(z, "ObjectType")), SpaceNames: m ? spaceName.get(m.id) || "" : "", Description: str(model.attr(z, "Description")) || str(model.attr(z, "LongName")) }));
    }
  }
  for (const [sp, ps, r] of spaceRows) {
    for (const [sn, slot] of ps) {
      for (const [pn, p] of slot.props) {
        if (!/ZoneName$/i.test(pn)) continue;
        const v = propText(model, p);
        if (!v) continue;
        sheets.Zone.push(row("Zone", { CreatedBy: r.CreatedBy, CreatedOn: r.CreatedOn, ExtSystem: r.ExtSystem, ExtObject: "IfcPropertySingleValue", ExtIdentifier: "", Name: v, Category: pn.replace(/^COBie\.Zone\./i, ""), SpaceNames: r.Name, Description: `${sn}.${pn}` }));
      }
    }
  }

  // Components and their types
  const elements = kind("IFCELEMENT").filter((e) => opts.components === "all" || isAsset(model, e));
  const typeRows = new Map(); // type id -> row
  const typeIfc = new Map();
  // Revit writes one type object per family type and host, so two type
  // objects can share a Name and class: they are one COBie Type. Types that
  // share a Name across classes stay apart (the QC names the clash).
  const typeByKey = new Map();
  let typesMerged = 0;
  const compName = new Map();
  let placed = 0, unplaced = 0;
  for (const e of elements) {
    const ty = model.typeOf.get(e.id);
    const tKey = ty ? `${ty.type}\u0000${str(model.attr(ty, "Name"))}` : null;
    if (ty && !typeRows.has(ty.id) && typeByKey.has(tKey)) { typeRows.set(ty.id, null); typesMerged++; }
    if (ty && !typeRows.has(ty.id)) {
      const tps = psetsOf(model, ty);
      const t = (...pairs) => propText(model, lookup(tps, pairs));
      const at = t([null, "AssetType"], [null, "AssetAccountingType"]);
      const atNorm = /^(fixed|nonmovable|nonfixed)$/i.test(at) ? (/^fixed$/i.test(at) ? "Fixed" : at) : /^(moveable|movable)$/i.test(at) ? "Moveable" : at;
      const r = row("Type", {
        ...base(ty),
        Name: str(model.attr(ty, "Name")),
        Category: category(model, ty, tps),
        Description: str(model.attr(ty, "Description")) || str(model.attr(ty, "Name")),
        AssetType: atNorm,
        Manufacturer: t([null, "Manufacturer"]),
        ModelNumber: t([null, "ModelNumber"], [null, "ModelLabel"]),
        WarrantyGuarantorParts: t([null, "WarrantyGuarantorParts"]),
        WarrantyDurationParts: t([null, "WarrantyDurationParts"]),
        WarrantyGuarantorLabor: t([null, "WarrantyGuarantorLabor"]),
        WarrantyDurationLabor: t([null, "WarrantyDurationLabor"]),
        WarrantyDurationUnit: t([null, "WarrantyDurationUnit"]),
        ReplacementCost: t([null, "ReplacementCost"]),
        ExpectedLife: t([null, "ExpectedLife"], ["Pset_ServiceLife", "ServiceLifeDuration"]),
        DurationUnit: t([null, "DurationUnit"]),
        WarrantyDescription: t([null, "WarrantyDescription"]),
        NominalLength: t([null, "NominalLength"]), NominalWidth: t([null, "NominalWidth"]), NominalHeight: t([null, "NominalHeight"]),
        ModelReference: t([null, "ModelReference"]),
        Shape: t([null, "Shape"]), Size: t([null, "Size"]), Color: t([null, "Color"], [null, "Colour"]), Finish: t([null, "Finish"]), Grade: t([null, "Grade"]),
        Material: t([null, "Material"]), Constituents: t([null, "Constituents"]), Features: t([null, "Features"]),
        AccessibilityPerformance: t([null, "AccessibilityPerformance"]), CodePerformance: t([null, "CodePerformance"]), SustainabilityPerformance: t([null, "SustainabilityPerformance"]),
      });
      typeRows.set(ty.id, r);
      typeByKey.set(tKey, ty.id);
      typeIfc.set(ty.id, ty);
    }
    const ps = psetsOf(model, e);
    const c = (...pairs) => propText(model, lookup(ps, pairs));
    const space = placedIn(model, e, ["IFCSPACE", "IFCBUILDINGSTOREY"]);
    const name = str(model.attr(e, "Name"));
    let spaceCell = space && model.isA(space, "IFCSPACE") ? spaceName.get(space.id) || "" : "";
    if (!spaceCell && opts.placement && opts.placement.has(e.id)) {
      const names = opts.placement.get(e.id).map((id) => spaceName.get(id)).filter(Boolean);
      if (names.length) { spaceCell = [...new Set(names)].join(","); placed++; }
    }
    compName.set(e.id, name);
    sheets.Component.push(row("Component", {
      ...base(e),
      Name: name,
      TypeName: ty ? str(model.attr(ty, "Name")) : "",
      Space: spaceCell,
      Description: str(model.attr(e, "Description")) || name,
      SerialNumber: c([null, "SerialNumber"]),
      InstallationDate: c([null, "InstallationDate"]),
      WarrantyStartDate: c([null, "WarrantyStartDate"]),
      TagNumber: c([null, "TagNumber"], [null, "Tag"]) || str(model.attr(e, "Tag")),
      BarCode: c([null, "BarCode"]),
      AssetIdentifier: c([null, "AssetIdentifier"]),
    }));
    if (!spaceCell) unplaced++;
  }
  sheets.Type.push(...[...typeRows.values()].filter(Boolean));
  if (typesMerged) notes.push(`${typesMerged} type objects share a Name and class with another and were written as one Type row`);
  if (placed) notes.push(`${placed} of ${elements.length} components the file places on a storey only were put in the room their body stands in (doors and windows: the rooms on either side), from the model's geometry`);
  if (unplaced) notes.push(`${unplaced} of ${elements.length} components are in no space${opts.placement ? " (neither in the file nor by geometry)" : " in the file (--from-geometry finds the room each stands in)"}; their Space cell is blank`);

  // Systems
  const systemClasses = ["IFCSYSTEM"].filter(has);
  for (const s of systemClasses.flatMap(kind)) {
    if (model.isA(s, "IFCZONE") || (has("IFCSTRUCTURALANALYSISMODEL") && model.isA(s, "IFCSTRUCTURALANALYSISMODEL"))) continue;
    const ps = psetsOf(model, s);
    const members = groupMembers(s).filter((m) => compName.has(m.id));
    for (const m of members.length ? members : [null]) {
      sheets.System.push(row("System", { ...base(s), Name: str(model.attr(s, "Name")), Category: category(model, s, ps) || str(model.attr(s, "ObjectType")) || str(model.attr(s, "PredefinedType")), ComponentNames: m ? compName.get(m.id) : "", Description: str(model.attr(s, "Description")) || str(model.attr(s, "LongName")) }));
    }
  }

  // Contacts (every owner of a row above)
  for (const c of contacts.values()) {
    sheets.Contact.push(row("Contact", { ...c, CreatedBy: c.Email, CreatedOn: c._on, ExtSystem: c._app, ExtObject: "IfcPersonAndOrganization", ExtIdentifier: "", Category: "" }));
  }
  if (contacts.size && [...contacts.values()].every((c) => !c.Email)) notes.push("no owner history names an email address: CreatedBy and Contact.Email are blank (COBie keys contacts by email)");

  // Attributes: every other property of a Floor, Space, Type or Component.
  if (opts.attributes !== false) {
    // One row per (property name, sheet, row): COBie's key. The same name in
    // two sets (Pset_SpaceCommon.FloorCovering and a Revit set's) is written
    // once, the first set's; properties a column already carries
    // (Manufacturer, SerialNumber, ...) are not repeated.
    const seenAttr = new Set();
    let attrDupes = 0;
    const fresh = (sheet, rowName, pn) => {
      if (COLUMNS[sheet].some((c) => c.toLowerCase() === pn.replace(/^COBie\.\w+\./i, "").toLowerCase())) return false;
      const k = `${sheet}\u0000${rowName}\u0000${pn.toLowerCase()}`;
      if (seenAttr.has(k)) { attrDupes++; return false; }
      seenAttr.add(k);
      return true;
    };
    const add = (sheet, e, rowName) => {
      const h = history(e);
      for (const [sn, slot] of psetsOf(model, e)) {
        for (const [pn, p] of slot.props) {
          const v = propText(model, p);
          if (v === "" || !fresh(sheet, rowName, pn)) continue;
          const setE = slot.entities[slot.entities.length - 1];
          sheets.Attribute.push(row("Attribute", { Name: pn, CreatedBy: h.by, CreatedOn: h.on, Category: "", SheetName: sheet, RowName: rowName, Value: v, Unit: "", ExtSystem: h.app, ExtObject: sn, ExtIdentifier: str(setE && model.attr(setE, "GlobalId")), Description: sn, AllowedValues: allowedValues(model, p) }));
        }
      }
    };
    for (const s of kind("IFCBUILDINGSTOREY")) add("Floor", s, floorName.get(s.id));
    for (const [sp] of spaceRows) add("Space", sp, spaceName.get(sp.id));
    for (const [id, r] of typeRows) if (r) add("Type", typeIfc.get(id), r.Name);
    for (const e of elements) addOwn(e);
    if (attrDupes) notes.push(`${attrDupes} properties repeat a name already written for the same row (another set's); the first set's value was kept`);
    function addOwn(e) {
      // A component's own sets only: its type's are on the Type's rows.
      const h = history(e);
      for (const pset of model.psetRels.get(e.id) || []) {
        const info = psetInfo(model, pset);
        if (info.name === null) continue;
        for (const [pn, p] of info.props) {
          const v = propText(model, p);
          if (v === "" || !fresh("Component", compName.get(e.id), pn)) continue;
          sheets.Attribute.push(row("Attribute", { Name: pn, CreatedBy: h.by, CreatedOn: h.on, Category: "", SheetName: "Component", RowName: compName.get(e.id), Value: v, Unit: "", ExtSystem: h.app, ExtObject: info.name, ExtIdentifier: str(model.attr(pset, "GlobalId")), Description: info.name, AllowedValues: allowedValues(model, p) }));
        }
      }
    }
  }

  // The person delivering the workbook, for rows whose owner history names
  // no email (most exports): opts.contact { Email, Company, Phone, ... } and
  // opts.createdOn (ISO date-time) fill blank CreatedBy / CreatedOn cells.
  if (opts.contact && opts.contact.Email) {
    const who = opts.contact;
    let filled = 0;
    for (const s of SHEETS) for (const r of sheets[s]) {
      if (r.CreatedBy === "") { r.CreatedBy = who.Email; filled++; }
      if (opts.createdOn && r.CreatedOn === "") r.CreatedOn = opts.createdOn;
    }
    // An owner with no email cannot be referenced by any row: the contact
    // given stands in for them.
    const before = sheets.Contact.length;
    sheets.Contact = sheets.Contact.filter((r) => r.Email !== "");
    if (before > sheets.Contact.length) notes.push(`${before - sheets.Contact.length} owner contact(s) with no email left out; ${who.Email} stands in for them`);
    if (!sheets.Contact.some((r) => r.Email.toLowerCase() === who.Email.toLowerCase())) {
      sheets.Contact.unshift(row("Contact", { ...who, CreatedBy: who.Email, CreatedOn: opts.createdOn || "", ExtObject: "IfcPersonAndOrganization" }));
    }
    if (filled) notes.push(`${filled} rows with no owner email take CreatedBy ${who.Email} (the contact given)`);
  } else if (opts.createdOn) {
    for (const s of SHEETS) for (const r of sheets[s]) if (r.CreatedOn === "") r.CreatedOn = opts.createdOn;
  }

  if (opts.na) {
    for (const s of SHEETS) {
      const req = new Set(requiredColumns(s, "handover"));
      for (const r of sheets[s]) for (const c of COLUMNS[s]) if (r[c] === "" && !req.has(c) && !NO_NA.has(c)) r[c] = "n/a";
    }
  }
  return { sheets, notes };
}

// The rooms each element stands in, from ifc-quantity-takeoff's reading of
// the model's geometry: takeoff(model) -> { rows, rooms }. An element the
// file puts in no space gets the room its body stands in (rooms.mjs
// assignRooms); a door or window the rooms on either side of it
// (facesRooms). Map(element STEP id -> [IfcSpace STEP id]).
export function placementFromTakeoff({ rows, rooms }) {
  const byLabel = new Map();
  for (const r of rooms || []) if (!byLabel.has(r.label)) byLabel.set(r.label, r.id);
  const out = new Map();
  for (const row of rows || []) {
    const labels = row.facesRooms && row.facesRooms.length ? row.facesRooms : row.spaceFrom === "geometry" && row.space ? [row.space] : [];
    const ids = labels.map((l) => byLabel.get(l)).filter((x) => x !== undefined);
    if (ids.length) out.set(row.id, ids);
  }
  return out;
}

const ifcName = (model, T) => (model.schema.entities[T] && model.schema.entities[T].name) || T;

const INSTRUCTION = [
  ["COBie 2.4 workbook"],
  ["Made by IDS Model Check (MIT), https://marisstella.app/ids-model-check/ , from the IFC model's own data. A blank cell is a value the model does not hold: fill it, or the QC report names it."],
  ["Sheets follow NBIMS-US V3 COBie 2.4: Contact, Facility, Floor, Space, Zone, Type, Component, System, Attribute. Values are in the model's units (Facility.LinearUnits, AreaUnits, VolumeUnits)."],
  ["Not legal or professional advice: check the workbook against your contract's COBie requirements before you hand it over."],
];

export function cobieToXlsx(cobie) {
  const sheets = [{ name: "Instruction", rows: INSTRUCTION, widths: [120] }];
  for (const s of SHEETS) {
    const cols = COLUMNS[s];
    sheets.push({ name: s, rows: [cols, ...cobie.sheets[s].map((r) => cols.map((c) => r[c] ?? ""))], widths: cols.map((c) => Math.max(12, Math.min(40, c.length + 4))) });
  }
  return sheetsToXlsx(sheets);
}

// ------------------------------------------------------------ read back ----

// rowsBySheet: { SheetName: [[header...], [cells...], ...] }. Columns are
// found by header name (case and spaces ignored), so a workbook with extra
// or reordered columns still reads; a missing column reads as blank.
export function cobieFromRows(rowsBySheet) {
  const sheets = {};
  const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const s of SHEETS) {
    const key = Object.keys(rowsBySheet).find((k) => norm(k) === norm(s));
    const rows = key ? rowsBySheet[key] : null;
    sheets[s] = [];
    if (!rows || !rows.length) continue;
    const head = rows[0].map(norm);
    const idx = Object.fromEntries(COLUMNS[s].map((c) => [c, head.indexOf(norm(c))]));
    // Older templates and other exporters say ExternalSystem for ExtSystem.
    for (const [short, long] of [["ExtSystem", "externalsystem"], ["ExtObject", "externalobject"], ["ExtIdentifier", "externalidentifier"]]) if (idx[short] === -1) idx[short] = head.indexOf(long);
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i] || [];
      if (!cells.some((x) => String(x ?? "").trim() !== "")) continue;
      const r = {};
      for (const c of COLUMNS[s]) r[c] = idx[c] >= 0 ? String(cells[idx[c]] ?? "") : "";
      r._row = i + 1;
      sheets[s].push(r);
    }
  }
  return sheets;
}

export async function cobieFromXlsx(bytes, inflateRaw) {
  const first = await xlsxToRows(bytes, inflateRaw);
  const names = first.sheetNames || [];
  const out = {};
  for (const n of names) {
    if (!SHEETS.some((s) => s.toLowerCase() === n.trim().toLowerCase())) continue;
    out[n] = await xlsxToRows(bytes, inflateRaw, { sheet: n });
  }
  if (!Object.keys(out).length) throw new Error(`no COBie sheets found (the workbook has: ${names.join(", ")})`);
  return cobieFromRows(out);
}

// ------------------------------------------------------------------- QC ----

const NA = (v) => /^n\/?a$/i.test(String(v).trim());
const blank = (v) => String(v ?? "").trim() === "";
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const ISO_DT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const list = (v) => String(v).split(",").map((x) => x.trim()).filter(Boolean);

// The rules, each with a severity: errors are what an owner's COBie check
// rejects a deliverable for; warnings are what it questions.
export const RULES = {
  required: ["error", "a required cell is blank"],
  "na-in-key": ["error", "n/a in a key or reference cell"],
  placeholder: ["error", "a template placeholder was left in (the cell holds a column name)"],
  "duplicate-key": ["error", "two rows share a key"],
  "missing-ref": ["error", "a reference names a row that does not exist"],
  "created-by": ["error", "CreatedBy is not a Contact's Email"],
  email: ["error", "not an email address"],
  date: ["error", "not an ISO 8601 date"],
  number: ["error", "not a number"],
  picklist: ["warning", "not one of the COBie pick-list values"],
  "type-unused": ["warning", "a Type no Component uses"],
  "floor-empty": ["warning", "a Floor with no Space"],
  "category-code": ["warning", "Category holds no classification code"],
  "single-facility": ["error", "COBie expects exactly one Facility row"],
};

export function cobieQc(sheets, opts = {}) {
  const stage = opts.stage === "handover" ? "handover" : "design";
  const issues = [];
  const push = (rule, sheet, r, field, value, detail = "") => issues.push({ rule, severity: RULES[rule][0], sheet, row: r ? r._row ?? null : null, name: r ? r.Name ?? r.Email ?? "" : "", field, value: value ?? "", detail });
  const rows = (s) => sheets[s] || [];
  const allColumnWords = new Set(Object.values(COLUMNS).flat().map(squash));

  if (rows("Facility").length !== 1) push("single-facility", "Facility", null, "", "", `${rows("Facility").length} rows`);

  for (const s of SHEETS) {
    const req = requiredColumns(s, stage);
    for (const r of rows(s)) {
      for (const c of COLUMNS[s]) {
        const v = r[c] ?? "";
        if (req.includes(c) && blank(v)) { push("required", s, r, c, v); continue; }
        if (blank(v)) continue;
        if (NO_NA.has(c) && NA(v)) { if (req.includes(c) || c !== "Space") push("na-in-key", s, r, c, v); continue; }
        if (NA(v)) continue;
        // A template value: the cell repeats a COBie column name ("Manufacturer"
        // in Manufacturer, "SerialNumber" in SerialNumber). Names and
        // descriptions are skipped: a space may well be called "Kitchen".
        if (!["Name", "Description", "RowName", "SheetName", "Value", "Category", "ExtObject", "ExternalProjectObject", "ExternalSiteObject", "ExternalFacilityObject"].includes(c) && (squash(v) === squash(c) || (squash(v).length > 6 && allColumnWords.has(squash(v)) && !PICK[`${s}.${c}`]))) push("placeholder", s, r, c, v);
        if (s === "Attribute" && c === "Value" && squash(v) === squash(r.Name || "")) push("placeholder", s, r, c, v, `attribute ${r.Name} holds its own name`);
        if (NUMERIC.has(c) && !NUM.test(String(v).trim())) push("number", s, r, c, v);
        if (DATES.has(c) && !ISO_DT.test(String(v).trim())) push("date", s, r, c, v);
        if (c === "CreatedOn" && !ISO_DT.test(String(v).trim())) push("date", s, r, c, v);
        if ((c === "Email" || c === "CreatedBy") && !EMAIL.test(String(v).trim())) push("email", s, r, c, v);
        const pick = PICK[`${s}.${c}`];
        if (pick && !pick.some((p) => p.toLowerCase() === String(v).trim().toLowerCase())) push("picklist", s, r, c, v, `expected ${pick.join(", ")}`);
        if (c === "Category" && ["Facility", "Space", "Type"].includes(s) && !/\d/.test(v)) push("category-code", s, r, c, v);
      }
    }
  }

  // Keys
  const KEYS = { Contact: ["Email"], Facility: ["Name"], Floor: ["Name"], Space: ["Name"], Zone: ["Name", "Category", "SpaceNames"], Type: ["Name"], Component: ["Name"], System: ["Name", "Category", "ComponentNames"], Attribute: ["Name", "SheetName", "RowName"] };
  for (const [s, cols] of Object.entries(KEYS)) {
    const seen = new Map();
    for (const r of rows(s)) {
      if (cols.some((c) => blank(r[c]) || NA(r[c]))) continue;
      const k = cols.map((c) => String(r[c]).trim().toLowerCase()).join("\u0000");
      if (seen.has(k)) push("duplicate-key", s, r, cols.join("+"), cols.map((c) => r[c]).join(" / "), `same as row ${seen.get(k)._row ?? "?"}`);
      else seen.set(k, r);
    }
  }

  // References
  const names = (s, col = "Name") => new Set(rows(s).map((r) => String(r[col] ?? "").trim().toLowerCase()).filter(Boolean));
  const floors = names("Floor"), spaces = names("Space"), types = names("Type"), comps = names("Component"), emails = names("Contact", "Email");
  const ref = (s, col, set, alsoOk = null) => {
    for (const r of rows(s)) {
      const v = r[col];
      if (blank(v) || NA(v)) continue;
      for (const one of list(v)) {
        const k = one.toLowerCase();
        if (!set.has(k) && !(alsoOk && alsoOk.has(k))) push("missing-ref", s, r, col, one, `no ${col === "TypeName" ? "Type" : col === "FloorName" ? "Floor" : col === "ComponentNames" ? "Component" : "Space"} named so`);
      }
    }
  };
  ref("Space", "FloorName", floors);
  ref("Component", "TypeName", types);
  ref("Component", "Space", spaces, floors);
  ref("Zone", "SpaceNames", spaces);
  ref("System", "ComponentNames", comps);
  for (const r of rows("Attribute")) {
    if (blank(r.SheetName) || blank(r.RowName)) continue;
    const sheetKey = SHEETS.find((x) => x.toLowerCase() === String(r.SheetName).trim().toLowerCase());
    if (!sheetKey) { push("missing-ref", "Attribute", r, "SheetName", r.SheetName, "not a COBie sheet"); continue; }
    const set = sheetKey === "Contact" ? emails : names(sheetKey);
    if (!set.has(String(r.RowName).trim().toLowerCase())) push("missing-ref", "Attribute", r, "RowName", r.RowName, `no ${sheetKey} row named so`);
  }
  if (emails.size) {
    for (const s of SHEETS) for (const r of rows(s)) {
      const v = r.CreatedBy;
      if (blank(v) || NA(v) || !EMAIL.test(String(v).trim())) continue;
      if (!emails.has(String(v).trim().toLowerCase())) push("created-by", s, r, "CreatedBy", v);
    }
  }

  // Coverage
  const usedTypes = new Set(rows("Component").map((r) => String(r.TypeName ?? "").trim().toLowerCase()));
  for (const r of rows("Type")) if (!blank(r.Name) && !usedTypes.has(String(r.Name).trim().toLowerCase())) push("type-unused", "Type", r, "Name", r.Name);
  const usedFloors = new Set(rows("Space").map((r) => String(r.FloorName ?? "").trim().toLowerCase()));
  for (const r of rows("Floor")) if (!blank(r.Name) && String(r.Category).toLowerCase() !== "site" && !usedFloors.has(String(r.Name).trim().toLowerCase())) push("floor-empty", "Floor", r, "Name", r.Name);

  const counts = {};
  for (const i of issues) {
    const k = `${i.sheet}\u0000${i.rule}\u0000${i.field}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return { stage, issues, counts, rows: Object.fromEntries(SHEETS.map((s) => [s, rows(s).length])), errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length };
}

export function qcText(qc, { examples = 3 } = {}) {
  const lines = [];
  lines.push(`COBie 2.4 QC (${qc.stage} stage): ${qc.errors} errors, ${qc.warnings} warnings`);
  lines.push("Rows: " + SHEETS.map((s) => `${s} ${qc.rows[s]}`).join(", "));
  const groups = new Map();
  for (const i of qc.issues) {
    const k = `${i.severity}|${i.sheet}|${i.rule}|${i.field}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { ...i, n: 0, ex: [] }));
    g.n++;
    if (g.ex.length < examples) g.ex.push(i);
  }
  const order = [...groups.values()].sort((a, b) => (a.severity === b.severity ? b.n - a.n : a.severity === "error" ? -1 : 1));
  for (const g of order) {
    lines.push(`${g.severity.toUpperCase()} ${g.sheet}.${g.field || "-"}: ${RULES[g.rule][1]} (${g.n} row${g.n === 1 ? "" : "s"})`);
    for (const e of g.ex) lines.push(`    ${e.row ? "row " + e.row + " " : ""}${e.name ? JSON.stringify(e.name) : ""}${e.value !== "" ? " = " + JSON.stringify(e.value) : ""}${e.detail ? " (" + e.detail + ")" : ""}`);
  }
  if (!qc.issues.length) lines.push("No issues found.");
  return lines.join("\n") + "\n";
}

// Rows numbered as in the written workbook (header is row 1), for a QC of
// a workbook this file made.
export function numberRows(cobie) {
  for (const s of SHEETS) cobie.sheets[s].forEach((r, i) => { Object.defineProperty(r, "_row", { value: i + 2, enumerable: false, configurable: true }); });
  return cobie;
}

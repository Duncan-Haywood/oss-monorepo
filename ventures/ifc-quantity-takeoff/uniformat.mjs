// Uniformat II elements for the bill of quantities.
//
// An estimator's elemental estimate is arranged by building element
// (foundations, exterior walls, partitions, roofing ...), not by IFC class.
// This file gives every row a Uniformat II code at level 3 where it can,
// level 2 or 1 where it cannot tell more, and none where it cannot tell at
// all, and says what each assignment rests on:
//
//   model   the model carries a Uniformat code: a classification reference
//           (Revit writes the Assembly Code as one, under
//           http://www.csiorg.net/uniformat) or an "Assembly Code" /
//           "AssemblyCode" property. Longer codes (B2020100) are cut to level 3;
//           codes that are not in the table below (an "E30" fire rating, an
//           NL/SfB "21.12") are ignored.
//   rule    the IFC class read with the element's PredefinedType (its own or
//           its type's), IsExternal (Pset_*Common, its own or its type's),
//           the wall a door or window fills, the assembly it is part of and
//           the storey's elevation. A wall with no IsExternal is placed by
//           the envelope test from its geometry (envelope.mjs) when the
//           geometry was read. Each rule's reason is on the row.
//
// The codes and titles are those of NISTIR 6389 (Charette and Marshall,
// "UNIFORMAT II Elemental Classification for Building Specifications, Cost
// Estimating, and Cost Analysis", NIST, 1999), a work of the US government;
// ASTM E1557 publishes the same levels 1 to 3.

export const UNIFORMAT = {
  A: "Substructure", A10: "Foundations", A1010: "Standard Foundations", A1020: "Special Foundations", A1030: "Slab on Grade",
  A20: "Basement Construction", A2010: "Basement Excavation", A2020: "Basement Walls",
  B: "Shell", B10: "Superstructure", B1010: "Floor Construction", B1020: "Roof Construction",
  B20: "Exterior Enclosure", B2010: "Exterior Walls", B2020: "Exterior Windows", B2030: "Exterior Doors",
  B30: "Roofing", B3010: "Roof Coverings", B3020: "Roof Openings",
  C: "Interiors", C10: "Interior Construction", C1010: "Partitions", C1020: "Interior Doors", C1030: "Fittings",
  C20: "Stairs", C2010: "Stair Construction", C2020: "Stair Finishes",
  C30: "Interior Finishes", C3010: "Wall Finishes", C3020: "Floor Finishes", C3030: "Ceiling Finishes",
  D: "Services", D10: "Conveying", D1010: "Elevators & Lifts", D1020: "Escalators & Moving Walks", D1090: "Other Conveying Systems",
  D20: "Plumbing", D2010: "Plumbing Fixtures", D2020: "Domestic Water Distribution", D2030: "Sanitary Waste", D2040: "Rain Water Drainage", D2090: "Other Plumbing Systems",
  D30: "HVAC", D3010: "Energy Supply", D3020: "Heat Generating Systems", D3030: "Cooling Generating Systems", D3040: "Distribution Systems", D3050: "Terminal & Package Units", D3060: "Controls & Instrumentation", D3070: "Systems Testing & Balancing", D3090: "Other HVAC Systems & Equipment",
  D40: "Fire Protection", D4010: "Sprinklers", D4020: "Standpipes", D4030: "Fire Protection Specialties", D4090: "Other Fire Protection Systems",
  D50: "Electrical", D5010: "Electrical Service & Distribution", D5020: "Lighting and Branch Wiring", D5030: "Communications & Security", D5090: "Other Electrical Systems",
  E: "Equipment & Furnishings", E10: "Equipment", E1010: "Commercial Equipment", E1020: "Institutional Equipment", E1030: "Vehicular Equipment", E1090: "Other Equipment",
  E20: "Furnishings", E2010: "Fixed Furnishings", E2020: "Movable Furnishings",
  F: "Special Construction & Demolition", F10: "Special Construction", F1010: "Special Structures", F1020: "Integrated Construction", F1030: "Special Construction Systems", F1040: "Special Facilities", F1050: "Special Controls and Instrumentation",
  F20: "Selective Building Demolition", F2010: "Building Elements Demolition", F2020: "Hazardous Components Abatement",
  G: "Building Sitework", G10: "Site Preparation", G1010: "Site Clearing", G1020: "Site Demolitions and Relocations", G1030: "Site Earthwork", G1040: "Hazardous Waste Remediation",
  G20: "Site Improvements", G2010: "Roadways", G2020: "Parking Lots", G2030: "Pedestrian Paving", G2040: "Site Development", G2050: "Landscaping",
  G30: "Site Civil/Mechanical Utilities", G3010: "Water Supply", G3020: "Sanitary Sewer", G3030: "Storm Sewer", G3040: "Heating Distribution", G3050: "Cooling Distribution", G3060: "Fuel Distribution", G3090: "Other Site Mechanical Utilities",
  G40: "Site Electrical Utilities", G4010: "Electrical Distribution", G4020: "Site Lighting", G4030: "Site Communications & Security", G4090: "Other Site Electrical Utilities",
  G90: "Other Site Construction", G9010: "Service and Pedestrian Tunnels", G9090: "Other Site Systems",
};

/** The title of a code, or null for anything not in the table. */
export const titleOf = (code) => (typeof code === "string" && Object.hasOwn(UNIFORMAT, code) ? UNIFORMAT[code] : null);

/** A code cut to `level` (1: "B", 2: "B20", 3: "B2010"). */
export const cutCode = (code, level) => (code ? code.slice(0, level === 1 ? 1 : level === 2 ? 3 : 5) : null);
export const levelOf = (code) => (!code ? 0 : code.length >= 5 ? 3 : code.length >= 3 ? 2 : 1);

/**
 * A Uniformat code read from a model's text, or null: "B2020100" -> "B2020",
 * "B10" -> "B10", "C1020 Interior Doors" -> "C1020". Level 1 alone ("B") is
 * not accepted, since one letter is too easily something else.
 */
export function parseUniformat(text) {
  if (typeof text !== "string") return null;
  const m = /^\s*([A-G])\s?(\d{2})(?:(\d{2})|(?!\d))(?:[\s.\-]?\d*)?(?:\s|$)/.exec(text.toUpperCase());
  if (!m) return null;
  const l3 = m[3] ? m[1] + m[2] + m[3] : null;
  if (l3 && titleOf(l3)) return l3;
  if (!m[3] && titleOf(m[1] + m[2])) return m[1] + m[2];
  return null;
}

const STAIRISH = /^IFC(STAIR|STAIRFLIGHT|RAMP|RAMPFLIGHT)$/;
const WALLISH = /^IFCWALL/;
const CASEWORK = /\b(cabinet|casework|counter|vanity|worktop|kitchen unit|base unit|wall unit)/i;
const BELOW_GRADE = -0.5; // m: a storey whose elevation is below this is a basement

// Names read when the class says little (a proxy, a generic flow terminal or
// a sanitary terminal that is really an accessory). English words only; the
// family names Revit's content libraries use.
const NAME_RULES = [
  [/\b(grab ?bars?|towel|dispensers?|soap|toilet paper|tissue|mirrors?|arm ?rests?|hand ?dryer|toilet accessor|coat hooks?|signage|marker ?boards?|tack ?boards?|toilet partitions?|lockers?)\b/i, "C1030", "fittings (toilet accessories, partitions, boards, lockers)", /^IFC(SANITARYTERMINAL|FLOWTERMINAL|BUILDINGELEMENTPROXY|FURNISHINGELEMENT|ELECTRICAPPLIANCE)$/],
  [/\b(elevators?|lifts?)\b/i, "D1010", "elevator", /^IFC(ELECTRICAPPLIANCE|FLOWTERMINAL|BUILDINGELEMENTPROXY|DOOR)$/],
  [/\b(wc|toilets?|water ?closets?|urinals?|wash ?basins?|lavator(y|ies)|sinks?|bath ?tubs?|baths?|showers?|bidets?|drinking fountains?|water coolers?)\b/i, "D2010", "plumbing fixture", /^IFC(FLOWTERMINAL|BUILDINGELEMENTPROXY)$/],
  [/\b(water ?heaters?)\b/i, "D2020", "water heater", /^IFC(FLOWTERMINAL|BUILDINGELEMENTPROXY|ENERGYCONVERSIONDEVICE|FLOWSTORAGEDEVICE)$/],
  [/\b(furnaces?|boilers?)\b/i, "D3020", "heat generation", /^IFC(FLOWTERMINAL|BUILDINGELEMENTPROXY|ENERGYCONVERSIONDEVICE)$/],
  [/\b(refrigerators?|fridges?|ranges?|ovens?|cooktops?|dishwashers?|washers?|dryers?|microwaves?|freezers?)\b/i, "E1090", "appliance", /^IFC(FLOWTERMINAL|BUILDINGELEMENTPROXY|ELECTRICAPPLIANCE)$/],
  [/\b(beds?|tables?|chairs?|sofas?|desks?|couch|shelving|bookcases?|stools?|benches)\b/i, "E2020", "movable furnishing", /^IFC(BUILDINGELEMENTPROXY)$/],
];
function nameRule(r, cls) {
  const text = `${r.name ?? ""} ${r.type ?? ""}`.replace(/[_\-:]/g, " ");
  for (const [re, code, what, classes] of NAME_RULES) if (classes.test(cls) && re.test(text)) return { code, why: `${r.ifcClass} named as ${what}` };
  return null;
}

// Slab type names that say what the slab is when PredefinedType says FLOOR
// (or nothing). Words from the 17 public models' own type names, English,
// German, Dutch and Norwegian: a floor finish modelled as its own thin floor
// ("FB 15.0 - Teppich", Fussbodenbelag; "Finish Floor - Ceramic Tile";
// "IFC_dekvloer 90", screed; "Flis - trapp", stair tiles) is C3020 or, on a
// stair, C2020; a flat roof typed FLOOR ("IFC_plat_dak_geisoleerd",
// "Flachdach") is B1020.
const SLAB_TEXT = (r) => ` ${`${r.type ?? ""} ${r.name ?? ""}`.replace(/[_:]/g, " ").toLowerCase()} `;
const FINISH_WORDS = /\b(fb \d+([.,]\d+)?|finish(es)? floor|floor finish|fliesen|teppich|parkett|(holz)?dielen|parquet|carpet|rugs?|(floor )?tiles?|(vloer)?tegels|dekvloer|screed|estrich|linoleum|vinyl|flis)\b/;
// a structural slab that names its topping ("Betongdekke 300 + avretting og
// flis", concrete deck with screed and tiles) is still the floor
const STRUCTURE_WORDS = /\b(betong\w*|beton\w*|concrete|stb|structural|joists?|hollow ?core|kanaalplaat)\b/;
const STAIR_WORDS = /\b(trapp|trap|treppe|stair|stairs)\b/;
const SHADE_WORDS = /\b(sonnenschutz|sun ?shades?|brise ?soleil|zonwering)\b/;
const ROOF_WORDS = /\b(roof|roofs|flat roof|roof deck|plat dak|dak|dakvloer|dakplaat|dach|flachdach|dachdecke|tak|toit|techo|cubierta|tetto)\b/;
export function slabRole(r) {
  const t = SLAB_TEXT(r);
  if (FINISH_WORDS.test(t) && !STRUCTURE_WORDS.test(t)) return STAIR_WORDS.test(t) ? { code: "C2020", why: "slab named as a stair finish" } : { code: "C3020", why: "slab named as a floor finish" };
  if (SHADE_WORDS.test(t)) return { code: "B2010", why: "slab named as a sun shade (exterior sun control, as a shading device)" };
  if (ROOF_WORDS.test(t)) return { code: "B1020", why: "slab named as a roof" };
  return null;
}

/**
 * The rule's code for one row, without the model's code: { code, why }.
 * `ctx(id)` returns another row by entity id (for hosts and parents).
 */
export function ruleCode(r, ctx) {
  const cls = r.effectiveClass || r.ifcType || "";
  const pdt = r.predefinedType || null;
  // true, false or null (not set); a wall flag the model gives every wall
  // alike while the geometry disagrees is not read (envelope.mjs)
  const flagNotRead = WALLISH.test(cls) && r.isExternal != null && r.envelope?.flagSaysNothing === true;
  const ext = flagNotRead ? null : r.isExternal;
  const below = r.storeyElevation != null && r.storeyElevation < BELOW_GRADE;
  const parent = r.parent != null ? ctx(r.parent) : null;
  const pcls = parent ? parent.effectiveClass || parent.ifcType : null;
  const extWhy = ext == null ? "" : ext ? ", IsExternal" : ", not IsExternal";

  // parts of a curtain wall, stair, ramp or roof are measured with it; a
  // door and a covering keep their own element (a door in a curtain wall is
  // B2030, not B2010; ROOFING on a roof is B3010, not B1020)
  const own = /^IFC(DOOR|DOORSTANDARDCASE|COVERING)$/.test(cls);
  if (parent && !own && (/^IFC(CURTAINWALL|STAIR|RAMP|ROOF)$/.test(pcls) || cls === "IFCBUILDINGELEMENTPART")) {
    const p = ruleCode(parent, ctx);
    if (p.code) return { code: p.code, why: `part of ${parent.ifcClass} (${p.why})` };
  }
  const byName = nameRule(r, cls);
  if (byName) return byName;
  switch (true) {
    case cls === "IFCFOOTING": return { code: "A1010", why: "footing" };
    case /^IFC(PILE|DEEPFOUNDATION|CAISSONFOUNDATION)$/.test(cls): return { code: "A1020", why: "pile or deep foundation" };
    case cls === "IFCSLAB" || cls === "IFCSLABSTANDARDCASE" || cls === "IFCSLABELEMENTEDCASE": {
      if (pdt === "BASESLAB") return { code: "A1030", why: "slab, BASESLAB" };
      if (pdt === "ROOF") return { code: "B1020", why: "slab, ROOF" };
      if (pdt === "LANDING") return { code: "C2010", why: "slab, LANDING" };
      // Revit and ArchiCAD users model finishes and flat roofs as floor
      // slabs; the type name says which (slabRole, eval/slab-roles-2026-11-20.md)
      const role = slabRole(r);
      if (role) return role;
      if (r.roofDeck) return { code: "B1020", why: `slab${pdt ? ", " + pdt : ""}, read as the roof by geometry: nothing over it, ${r.roofDeck.under} wall(s) or column(s) under it, no storey's walls on it` };
      if (below) return { code: "A1030", why: `slab on a storey below grade (${r.storey})` };
      return { code: "B1010", why: pdt ? `slab, ${pdt}` : "slab" };
    }
    case cls === "IFCROOF": return { code: "B1020", why: "roof" };
    case WALLISH.test(cls):
      // a flag the geometry disagrees with is kept, and the row says so for
      // the estimator to check (on 17 public models the flag was the wrong one
      // in most such walls looked at: eval/envelope-2026-11-20.md)
      const doubt = ext != null && r.envelope && r.envelope.exterior !== ext ? `; the geometry reads it ${r.envelope.exterior ? (r.envelope.leaf ? "as an inner leaf or lining of an exterior wall" : "on the outside") : "inside the building"}, check it` : "";
      if (ext === true) return below ? { code: "A2020", why: `wall, IsExternal, storey below grade (${r.storey})${doubt}` } : { code: "B2010", why: `wall, IsExternal${doubt}` };
      if (ext === false) return { code: "C1010", why: `wall, not IsExternal${doubt}` };
      if (r.envelope) {
        // no flag: the envelope test from the geometry (envelope.mjs)
        const e = r.envelope, by = `${flagNotRead ? `IsExternal ${r.isExternal} on every wall of the model, not read` : "no IsExternal"}; by geometry, open to the outside at ${e.open} of ${e.points} points${e.leaf ? " through its outer leaf (an inner leaf or lining of an exterior wall)" : ""}`;
        if (e.exterior) return below ? { code: "A2020", why: `wall, ${by}, storey below grade (${r.storey})` } : { code: "B2010", why: `wall, ${by}` };
        return { code: "C1010", why: `wall, ${by}` };
      }
      return { code: null, why: "wall with no IsExternal: exterior or partition cannot be told" };
    case cls === "IFCCURTAINWALL":
      return ext === false ? { code: "C1010", why: "curtain wall, not IsExternal (glazed partition)" } : { code: "B2010", why: `curtain wall${extWhy || ", assumed exterior"}` };
    case cls === "IFCWINDOW" || cls === "IFCWINDOWSTANDARDCASE": {
      // IsExternal on windows is not trusted: on Schultz Residence (Revit,
      // IFC2X3) all 25 windows and the walls they fill are flagged interior,
      // and the author's own Assembly Code puts them in B2020
      const h = r.host != null ? ctx(r.host) : null;
      const hc = h ? h.effectiveClass || h.ifcType : "";
      if (hc === "IFCROOF" || (/^IFCSLAB/.test(hc) && h.predefinedType === "ROOF") || /\bsky ?lights?\b/i.test(`${r.name ?? ""} ${r.type ?? ""}`.replace(/[_\-:]/g, " "))) return { code: "B3020", why: h && !/^IFCWALL/.test(hc) ? `window in a roof (${h.ifcClass})` : "window named as a skylight" };
      if (ext === true || h?.isExternal === true) return { code: "B2020", why: ext ? "window, IsExternal" : "window in an exterior wall" };
      return { code: "B2020", why: ext === false ? "window flagged not IsExternal, taken as exterior (exporters flag exterior windows so)" : "window, taken as exterior" };
    }
    case cls === "IFCDOOR" || cls === "IFCDOORSTANDARDCASE": {
      if (ext === true) return { code: "B2030", why: "door, IsExternal" };
      if (ext === false) return { code: "C1020", why: "door, not IsExternal" };
      const h = r.host != null ? ctx(r.host) : null;
      const hx = h ? (h.envelope?.flagSaysNothing ? null : h.isExternal) : null;
      if (hx === true) return { code: "B2030", why: "door in an exterior wall" };
      if (hx === false) return { code: "C1020", why: "door in an interior wall" };
      if (pcls === "IFCCURTAINWALL") return parent.isExternal === false ? { code: "C1020", why: "door in a curtain wall, not IsExternal" } : { code: "B2030", why: `door in a curtain wall${parent.isExternal ? ", IsExternal" : ", assumed exterior"}` };
      if (h && hx == null && h.envelope) return h.envelope.exterior ? { code: "B2030", why: "door in a wall the geometry puts on the outside" } : { code: "C1020", why: "door in a wall the geometry puts inside" };
      return { code: "C10", why: "door with no IsExternal and no host wall that says" };
    }
    case cls === "IFCCOVERING":
      if (pcls === "IFCROOF" && pdt !== "CEILING") return { code: "B3010", why: `covering${pdt ? ", " + pdt : ""}, part of ${parent.ifcClass}` };
      if (/^IFC(STAIR|RAMP)$/.test(pcls) && pdt !== "ROOFING") return { code: "C2020", why: `covering${pdt ? ", " + pdt : ""}, part of ${parent.ifcClass} (stair finish)` };
      if (pdt === "CEILING") return { code: "C3030", why: "covering, CEILING" };
      if (pdt === "FLOORING") return { code: "C3020", why: "covering, FLOORING" };
      if (pdt === "ROOFING") return { code: "B3010", why: "covering, ROOFING" };
      if (pdt === "SKIRTINGBOARD" || pdt === "MOLDING") return { code: "C3010", why: `covering, ${pdt}` };
      if (pdt === "CLADDING") return ext === false ? { code: "C3010", why: "covering, CLADDING, not IsExternal" } : { code: "B2010", why: `covering, CLADDING${extWhy || ", assumed exterior"}` };
      if (pdt === "INSULATION" || pdt === "MEMBRANE" || pdt === "SLEEVING" || pdt === "WRAPPING") return { code: null, why: `covering, ${pdt}: which element it belongs to is not read` };
      return { code: "C30", why: pdt ? `covering, ${pdt}` : "covering with no PredefinedType" };
    case STAIRISH.test(cls): return { code: "C2010", why: "stair or ramp" };
    case cls === "IFCRAILING":
      return { code: null, why: "railing not part of a stair or ramp (balcony, guard or stair cannot be told)" };
    case cls === "IFCMEMBER" && /^(RAFTER|PURLIN)$/.test(pdt || ""): return { code: "B1020", why: `member, ${pdt}` };
    case cls === "IFCMEMBER" && /^(MULLION)$/.test(pdt || ""): return { code: "B2010", why: "member, MULLION" };
    // a curtain panel is measured with its curtain wall, as a mullion is
    // (IfcCurtainWall itself is B2010 above); Revit exports many with no parent
    case /^IFCPLATE/.test(cls) && pdt === "CURTAIN_PANEL": return { code: "B2010", why: "plate, CURTAIN_PANEL (with the curtain wall)" };
    case cls === "IFCMEMBER" && pdt === "STRINGER": return { code: "C2010", why: "member, STRINGER (stair construction)" };
    case /^IFC(BEAM|BEAMSTANDARDCASE|COLUMN|COLUMNSTANDARDCASE|MEMBER|MEMBERSTANDARDCASE|PLATE|PLATESTANDARDCASE)$/.test(cls): {
      // what it carries (findCarried): the nearest slab or roof directly over
      // it. NISTIR 6389 puts the frame under a floor in B1010, the frame
      // under the roof (columns that carry only the roof too) in B1020, and
      // grade beams under a slab on grade in A1010 Standard Foundations.
      const c = r.carries;
      if (c) {
        const what = `${c.ifcClass} ${c.code} ${c.gap <= 0 ? "at its top" : `${c.gap.toFixed(2)} m above its top`}`;
        if (c.code === "B1020") return { code: "B1020", why: `frame member under the roof (carries ${what})` };
        if (c.code === "A1030") return /^IFCBEAM/.test(cls) ? { code: "A1010", why: `beam under a slab on grade (carries ${what})` } : { code: "B1010", why: `frame member under a slab on grade (carries ${what})` };
        // a beam on a below-grade storey whose bottom is at or under that
        // storey's level bears on the ground, not on a basement floor: a
        // footing or grade beam under the ground floor (schependomlaan's 82
        // funderingsbalken on "-1 fundering"), A1010
        if (below && /^IFCBEAM/.test(cls) && r.box[2] <= r.storeyElevation + 0.5) return { code: "A1010", why: `grade beam: on a storey below grade (${r.storey}) with its bottom at that level, under a floor (carries ${what})` };
        return { code: "B1010", why: `frame member under a floor (carries ${what})` };
      }
      if (below && /^IFC(BEAM|COLUMN)/.test(cls)) return { code: "B1010", why: "frame member on a basement storey (floor construction)" };
      // a storey named "Roof" is not read: Revit puts what stands on the roof
      // level there (advanced_model's 4 struts on Roof Level, coded B1010 by
      // their author, would land in B1020)
      return { code: "B10", why: r.box ? "frame member with no slab or roof found over it: floor or roof construction cannot be told" : "frame member: floor or roof construction cannot be told (geometry not read)" };
    }
    case cls === "IFCSHADINGDEVICE": return { code: "B2010", why: "shading device (exterior sun control)" };
    case cls === "IFCCHIMNEY": return { code: "B10", why: "chimney" };
    case cls === "IFCTRANSPORTELEMENT":
      if (pdt === "ELEVATOR" || pdt === "LIFTINGGEAR") return { code: "D1010", why: `transport element, ${pdt}` };
      if (pdt === "ESCALATOR" || pdt === "MOVINGWALKWAY") return { code: "D1020", why: `transport element, ${pdt}` };
      return { code: "D10", why: "transport element" };
    case cls === "IFCSANITARYTERMINAL": return { code: "D2010", why: "sanitary terminal" };
    case cls === "IFCWASTETERMINAL": return { code: "D2030", why: "waste terminal" };
    case /^IFC(PIPESEGMENT|PIPEFITTING|VALVE|PUMP|TANK|FLOWMETER)$/.test(cls): return { code: "D", why: "pipework or its fittings: plumbing, heating or sprinkler system not read" };
    case cls === "IFCFIRESUPPRESSIONTERMINAL":
      return pdt === "SPRINKLER" ? { code: "D4010", why: "fire suppression terminal, SPRINKLER" } : { code: "D40", why: "fire suppression terminal" };
    case /^IFC(BOILER|BURNER)$/.test(cls): return { code: "D3020", why: "heat generation" };
    case /^IFC(CHILLER|COOLINGTOWER|CONDENSER|EVAPORATOR|COMPRESSOR)$/.test(cls): return { code: "D3030", why: "cooling generation" };
    case /^IFC(DUCTSEGMENT|DUCTFITTING|DUCTSILENCER|AIRTERMINAL|AIRTERMINALBOX|DAMPER|FAN|FILTER|COIL|AIRTOAIRHEATRECOVERY|HUMIDIFIER)$/.test(cls): return { code: "D3040", why: "air distribution" };
    case /^IFC(UNITARYEQUIPMENT|SPACEHEATER)$/.test(cls): return { code: "D3050", why: "terminal or package unit" };
    case /^IFC(CONTROLLER|ACTUATOR|UNITARYCONTROLELEMENT|FLOWINSTRUMENT)$/.test(cls): return { code: "D3060", why: "controls" };
    case /^IFC(LIGHTFIXTURE|LAMP|OUTLET|SWITCHINGDEVICE|JUNCTIONBOX)$/.test(cls): return { code: "D5020", why: "lighting or branch wiring" };
    case /^IFC(ELECTRICDISTRIBUTIONBOARD|ELECTRICDISTRIBUTIONPOINT|TRANSFORMER|PROTECTIVEDEVICE|ELECTRICGENERATOR|ELECTRICMOTOR)$/.test(cls): return { code: "D5010", why: "electrical service and distribution" };
    case /^IFC(CABLESEGMENT|CABLEFITTING|CABLECARRIERSEGMENT|CABLECARRIERFITTING)$/.test(cls): return { code: "D50", why: "cable or cable carrier" };
    case /^IFC(ALARM|SENSOR|COMMUNICATIONSAPPLIANCE|AUDIOVISUALAPPLIANCE)$/.test(cls): return { code: "D5030", why: "communications, alarm or security" };
    case cls === "IFCELECTRICAPPLIANCE": return { code: "E1090", why: "appliance" };
    case cls === "IFCMEDICALDEVICE": return { code: "E1020", why: "medical device" };
    case cls === "IFCSYSTEMFURNITUREELEMENT": return { code: "E2010", why: "system furniture" };
    case cls === "IFCFURNISHINGELEMENT" || cls === "IFCFURNITURE":
      if (CASEWORK.test(`${r.name ?? ""} ${r.type ?? ""}`)) return { code: "E2010", why: "furniture named as casework" };
      return { code: "E2020", why: "furniture" };
    case cls === "IFCEARTHWORKSCUT": return below ? { code: "A2010", why: "excavation below grade" } : { code: "G1030", why: "earthworks cut" };
    case cls === "IFCEARTHWORKSFILL": return { code: "G1030", why: "earthworks fill" };
    case cls === "IFCKERB" || cls === "IFCPAVEMENT" || cls === "IFCCOURSE": return { code: "G20", why: "paving" };
    default: return { code: null, why: `no rule for ${r.ifcClass}` };
  }
}

/**
 * Sets row.uniformat = { code, title, level, source: "model"|"rule"|null,
 * why, rule } on every row (`rule` is the rule's code even where the model's
 * code is used, so the two can be compared).
 */
export function assignUniformat(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ctx = (id) => byId.get(id) || null;
  findRoofDecks(rows);
  findCarried(rows, ctx);
  for (const r of rows) {
    const rule = ruleCode(r, ctx);
    let code = null, source = null, why = rule.why;
    for (const c of r.uniformatCodes || []) { code = parseUniformat(c.code); if (code) { source = "model"; why = `model's ${c.from}: ${c.code}`; break; } }
    if (!code && rule.code) { code = rule.code; source = "rule"; }
    r.uniformat = { code, title: titleOf(code), level: levelOf(code), source, why, rule: rule.code, ruleWhy: rule.why };
  }
  return rows;
}

const FRAME = /^IFC(BEAM|COLUMN|MEMBER|PLATE)/;
const DECK = /^IFC(SLAB|ROOF)/;
const REACH = 0.6; // m: how far above a member's top a deck may start and still bear on it
const deckCode = (r, ctx) => {
  for (const c of r.uniformatCodes || []) { const k = parseUniformat(c.code); if (k) return k; }
  return ruleCode(r, ctx).code;
};

/**
 * Sets row.carries = { id, ifcClass, code, gap } on each beam, column, member
 * and plate whose box was read: the slab or roof that bears on it, which is
 * the one with the lowest bottom among those that cover the middle of its
 * plan, come down to within REACH of its top and do not lie wholly below
 * its top (a beam whose top is flush with the slab's top is under it). Plan
 * cover is read from the deck's box, so an L-shaped slab covers its whole
 * bounding rectangle; a roof's parts are read through their own boxes.
 */
export function findCarried(rows, ctx) {
  const decks = [];
  for (const d of rows) {
    const cls = d.effectiveClass || d.ifcType || "";
    if (!DECK.test(cls) || !d.box) continue;
    const code = deckCode(d, ctx);
    if (code === "B1010" || code === "B1020" || code === "A1030") decks.push({ d, code });
  }
  if (!decks.length) return;
  for (const r of rows) {
    if (!r.box || r.isAssembly || !FRAME.test(r.effectiveClass || r.ifcType || "")) continue;
    const b = r.box, x = (b[0] + b[3]) / 2, y = (b[1] + b[4]) / 2, top = b[5];
    let best = null;
    for (const { d, code } of decks) {
      const e = d.box;
      if (x < e[0] - 0.01 || x > e[3] + 0.01 || y < e[1] - 0.01 || y > e[4] + 0.01) continue;
      if (e[5] < top - 0.05 || e[2] > top + REACH) continue;
      if (!best || e[2] < best.d.box[2]) best = { d, code };
    }
    r.carries = best ? { id: best.d.id, ifcClass: best.d.ifcClass, code: best.code, gap: Math.max(0, best.d.box[2] - top) } : null;
  }
}

const OVER = 0.3; // m: a deck this much higher than a slab's top is over it
const STOREY_WALL = 1.5; // m: a wall rising this far above a slab's top stands on a storey, not a parapet

/**
 * Sets row.roofDeck = { under } on each slab the rules would put in B1010
 * whose box was read and which is the roof by its geometry:
 *
 *   - no slab or roof covers the middle of its plan above it (a deck whose
 *     top and bottom are both more than OVER above its own);
 *   - at least one wall or column stops at its bottom (within 0.4 m below to
 *     0.6 m below) under its plan: it is carried, not a sun shade or a slab
 *     on the ground;
 *   - no wall stands on it rising more than STOREY_WALL above its top (no
 *     storey's walls: a parapet is lower);
 *   - it is more than 2 m above the lowest slab or wall bottom in the model
 *     and covers at least 2 m2 of plan.
 *
 * Nothing is set when a roof in the model has no box (its geometry was not
 * read), since that roof may be the one over the slab, nor for a slab whose
 * type name already says what it is (slabRole).
 */
export function findRoofDecks(rows) {
  const decks = [], bearers = [];
  let low = Infinity;
  for (const r of rows) {
    if (r.isAssembly) continue;
    const cls = r.effectiveClass || r.ifcType || "";
    if (DECK.test(cls)) {
      if (!r.box && (cls === "IFCROOF" || r.predefinedType === "ROOF")) return;
      if (r.box) decks.push(r);
    }
    if (/^IFC(WALL|COLUMN)/.test(cls) && r.box) bearers.push(r);
    if (r.box && (/^IFCSLAB|^IFCWALL/.test(cls))) low = Math.min(low, r.box[2]);
  }
  for (const s of decks) {
    const cls = s.effectiveClass || s.ifcType || "";
    if (!/^IFCSLAB/.test(cls) || /^(BASESLAB|ROOF|LANDING)$/.test(s.predefinedType || "") || slabRole(s)) continue;
    if (s.parent != null || (s.storeyElevation != null && s.storeyElevation < BELOW_GRADE)) continue;
    const b = s.box, x = (b[0] + b[3]) / 2, y = (b[1] + b[4]) / 2;
    if ((b[3] - b[0]) * (b[4] - b[1]) < 2 || b[2] < low + 2) continue;
    const overlaps = (e) => e[0] < b[3] && e[3] > b[0] && e[1] < b[4] && e[4] > b[1];
    if (decks.some((d) => d !== s && x >= d.box[0] - 0.01 && x <= d.box[3] + 0.01 && y >= d.box[1] - 0.01 && y <= d.box[4] + 0.01 && d.box[5] > b[5] + OVER && d.box[2] > b[2] + OVER)) continue;
    let under = 0, on = 0;
    for (const w of bearers) {
      const e = w.box;
      if (!overlaps(e)) continue;
      if (e[5] <= b[2] + 0.4 && e[5] >= b[2] - 0.6) under++;
      if (/^IFCWALL/.test(w.effectiveClass || w.ifcType) && e[2] >= b[5] - 0.4 && e[2] <= b[5] + 0.5 && e[5] > b[5] + STOREY_WALL) on++;
    }
    if (under && !on) s.roofDeck = { under };
  }
}

/** The BoQ group label at a level: "B2010 Exterior Walls", or what is missing. */
export function uniformatLabel(r, level = 3) {
  const u = r.uniformat;
  if (!u || !u.code) return "(no Uniformat element)";
  if (u.level < level) return `${u.code} ${titleOf(u.code)} (not told further)`;
  const c = cutCode(u.code, level);
  return `${c} ${titleOf(c)}`;
}

/** Totals for the page and the eval: how many rows got each source and level. */
export function uniformatSummary(rows) {
  const s = { rows: 0, model: 0, rule: 0, none: 0, level3: 0, level2: 0, level1: 0, compared: 0, agree3: 0, agree2: 0, agree1: 0, ruleSilent: 0 };
  for (const r of rows) {
    if (r.isAssembly) continue;
    const u = r.uniformat;
    if (!u) continue;
    s.rows++;
    if (u.source === "model") s.model++; else if (u.source === "rule") s.rule++; else s.none++;
    if (u.level === 3) s.level3++; else if (u.level === 2) s.level2++; else if (u.level === 1) s.level1++;
    if (u.source === "model") {
      s.compared++;
      if (!u.rule) { s.ruleSilent++; continue; }
      const n = Math.min(levelOf(u.rule), u.level);
      if (cutCode(u.rule, 1) === cutCode(u.code, 1)) s.agree1++;
      if (n >= 2 && cutCode(u.rule, 2) === cutCode(u.code, 2)) s.agree2++;
      if (n >= 3 && u.rule === u.code) s.agree3++;
    }
  }
  return s;
}

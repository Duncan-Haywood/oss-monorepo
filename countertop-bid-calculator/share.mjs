// Shareable bid link. A fabricator comparing a takeoff with a homeowner, GC,
// or kitchen designer needs the recipient to see the exact same job -- layout,
// material, slab size and cost, every cutout count, edge profile, backsplash,
// waterfall ends, seams, and every rate and cost -- not just the headline
// price a screenshot would show. Retyping thirty-plus numbers is how that
// comparison never happens, and a silently dropped field is how the recipient
// computes a different price than the sender saw. The transform is pure: no
// DOM, no storage, no network, and everything after the # never reaches a
// server.
//
// Enum fields (layout, material, sink, edge) are checked against calc.mjs's
// own preset ids rather than a hand-duplicated list, so a crafted or stale
// link can only set them to values the form could have produced -- the drift
// class CLAUDE.md's "RENAME SUSPECTED" note describes for a select field left
// off an allowlist. They travel alongside the numeric fields they merely
// suggest defaults for (wastePct, slabSqFt, slabCost, hoursPerSink,
// edgeHoursPerLf) so the recipient's form shows the same selection the sender
// saw, not just the same arithmetic.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `concrete-lifting-bid-calculator` and
// `cabinet-refinishing-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { LAYOUT_PRESETS, MATERIAL_PRESETS, SINK_PRESETS, EDGE_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'finishedSqFt', 'perimeterLf', 'wastePct', 'slabSqFt', 'slabCost',
  'sinkCount', 'hoursPerSink', 'cooktopCount', 'hoursPerCooktop',
  'faucetHoles', 'hoursPerFaucet', 'waterfallEnds', 'hoursPerWaterfall',
  'edgeHoursPerLf', 'backsplashLf', 'backsplashHeightIn', 'hoursPerBacksplashLf',
  'seams', 'hoursPerSeam', 'fieldHoursPer100', 'installHoursPer100',
  'templateHours', 'tearoutHours', 'suppliesPerSqFt', 'hourlyWage', 'burdenRate',
  'travelAndEquipment', 'overheadRate', 'targetMargin', 'proposedPrice',
];

// Mirrors the <select id="layoutId">/<select id="materialId">/
// <select id="sinkId">/<select id="edgeId"> options in index.html, sourced
// from calc.mjs so the allowed values cannot drift out of step with the
// presets the form offers.
export const LAYOUT_VALUES = LAYOUT_PRESETS.map((preset) => preset.id);
export const MATERIAL_VALUES = MATERIAL_PRESETS.map((preset) => preset.id);
export const SINK_VALUES = SINK_PRESETS.map((preset) => preset.id);
export const EDGE_VALUES = EDGE_PRESETS.map((preset) => preset.id);

const ENUM_FIELDS = [
  ['layoutId', LAYOUT_VALUES],
  ['materialId', MATERIAL_VALUES],
  ['sinkId', SINK_VALUES],
  ['edgeId', EDGE_VALUES],
];

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const [id, allowed] of ENUM_FIELDS) {
    const value = usableEnum(inputs?.[id], allowed);
    if (value !== null) params.set(id, value);
  }
  return params.toString();
}

export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const [id, allowed] of ENUM_FIELDS) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}

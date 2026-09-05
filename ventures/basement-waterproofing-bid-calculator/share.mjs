// Shareable bid link. A waterproofing shop comparing a takeoff with a
// homeowner, GC, or office manager needs the recipient to see the exact same
// job -- system, perimeter, wall height, wells, cracks, pit, pump, backup,
// discharge, every hour and rate -- not just the headline price a screenshot
// would show. Retyping forty-plus numbers is how that comparison never
// happens. The transform is pure: no DOM, no storage, no network, and
// everything after the # never reaches a server.
//
// Enum fields are checked against calc.mjs's own preset ids rather than a
// hand-duplicated list, so a crafted or stale link can only set them to
// values the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note and #2962 both describe for a select field left off
// an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `spray-foam-bid-calculator` and `well-pump-bid-calculator`
// use -- not duplicated here, so the calculators cannot drift on how those
// five fields are carried. Company and customer details are deliberately left
// out: they persist per-device via `proposal.mjs`'s `loadCompany`/
// `saveCompany`, and a customer's name or address has no business riding in a
// URL two people paste into text or email.

import { SYSTEM_PRESETS, PUMP_PRESETS, BACKUP_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'perimeterLf', 'wallHeightFt', 'floorSqFt', 'windowWells', 'floorCrackLf', 'wallCrackCount',
  'dischargeLf', 'hoursPerDrainLf', 'hoursPerExteriorLf', 'hoursPer100Wall', 'hoursPer100Floor',
  'hoursPerWell', 'hoursPerFloorCrackLf', 'hoursPerWallCrack', 'hoursPerNewSump', 'hoursPerExistingSump',
  'hoursPerDischargeLf', 'hoursPerFreezeKit', 'hoursPerPump', 'hoursPerBackup', 'hoursPerDehumidifier',
  'siteHours', 'drainCostPerLf', 'exteriorCostPerLf', 'membraneCostPerSqFt', 'vaporCostPerSqFt',
  'pourbackCostPerLf', 'disposalPerLf', 'wellCoverCost', 'floorCrackCostPerLf', 'wallCrackCost',
  'pitLinerCost', 'pumpCost', 'backupCost', 'dischargeCostPerLf', 'freezeKitCost', 'dehumidifierCost',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['newSumpPit', 'freezeDischarge', 'includeDehumidifier'];

// Mirrors the <select id="systemId"> / <select id="pumpId"> /
// <select id="backupId"> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const SYSTEM_VALUES = SYSTEM_PRESETS.map((preset) => preset.id);
export const PUMP_VALUES = PUMP_PRESETS.map((preset) => preset.id);
export const BACKUP_VALUES = BACKUP_PRESETS.map((preset) => preset.id);

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
  for (const id of BOOLEAN_FIELD_IDS) {
    if (inputs?.[id] !== undefined) params.set(id, inputs[id] ? '1' : '0');
  }
  const systemId = usableEnum(inputs?.systemId, SYSTEM_VALUES);
  if (systemId !== null) params.set('systemId', systemId);
  const pumpId = usableEnum(inputs?.pumpId, PUMP_VALUES);
  if (pumpId !== null) params.set('pumpId', pumpId);
  const backupId = usableEnum(inputs?.backupId, BACKUP_VALUES);
  if (backupId !== null) params.set('backupId', backupId);
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
  for (const id of BOOLEAN_FIELD_IDS) {
    if (params.has(id)) inputs[id] = params.get(id) === '1';
  }
  if (params.has('systemId')) {
    const systemId = usableEnum(params.get('systemId'), SYSTEM_VALUES);
    if (systemId !== null) inputs.systemId = systemId;
  }
  if (params.has('pumpId')) {
    const pumpId = usableEnum(params.get('pumpId'), PUMP_VALUES);
    if (pumpId !== null) inputs.pumpId = pumpId;
  }
  if (params.has('backupId')) {
    const backupId = usableEnum(params.get('backupId'), BACKUP_VALUES);
    if (backupId !== null) inputs.backupId = backupId;
  }
  return inputs;
}

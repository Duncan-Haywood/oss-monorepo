// Shareable bid link. A carpenter comparing a pergola takeoff with an office
// manager, a homeowner, or a second estimator needs the recipient to see the
// exact same job -- footprint, attachment, shade, post height, every post,
// rafter, beam, and ledger count, and every wage, cost, and margin figure --
// not just the headline price a screenshot would show. Retyping forty-plus
// fields is how that comparison never happens, and a silently dropped field
// is how the recipient computes a different price than the sender saw. The
// transform is pure: no DOM, no storage, no network, and everything after
// the # never reaches a server.
//
// Unlike `jobPresets` (an index into JOB_PRESETS that only bulk-fills a
// starting layout), `attachment`, `shade`, and `height` are themselves
// direct inputs to calculateBid -- not suggestion-only presets like
// retaining-wall's wallTypePreset -- so they travel here as ENUM_FIELDS,
// checked against calc.mjs's own preset ids, the same way. The
// geometry/shade/height "kit" fields (post/rafter/beam/ledger/footing/
// knee-brace counts, shade hours and rate, post cost, and the extra
// height-hours) already round-trip as plain NUMBER_FIELD_IDS: calc.mjs
// consumes the numbers, never the geometry that suggested them, so a
// restored link reproduces the bid even though the index.html-side
// dataset.edited guard (which stops a later attachment/shade/height change
// from clobbering a restored count) lives in index.html, not here.
//
// jobPresets itself is left out, matching `sump-pump-bid-calculator`'s
// treatment of its own index-based bulk preset: it only re-derives fields
// this module already carries individually, and an index is meaningless
// once JOB_PRESETS is reordered.
//
// Deposit, hold-price days, and the proposal panel's other prose terms are
// deliberately left out, along with company and customer details: they
// persist per device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a
// customer's name or address has no business riding in a URL two people
// paste into text or email.

import { ATTACHMENT_PRESETS, SHADE_PRESETS, HEIGHT_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'widthFeet', 'depthFeet', 'postSpacingFeet', 'rafterSpacingInches',
  'hoursTrip', 'hoursPerPost', 'extraHoursPerPost', 'hoursPer100SfShade', 'hoursPerRafter',
  'hoursPerBeamLf', 'hoursLedger', 'hoursKneeBrace', 'hoursFan', 'hoursDemo', 'hoursSite', 'siteHours',
  'postCount', 'rafterCount', 'beamLf', 'ledgerLf', 'kneeBraceCount', 'footingCount',
  'postEach', 'beamPerLf', 'rafterEach', 'shadePerSf', 'footingEach', 'ledgerPerLf', 'hardwareLump',
  'kneeBraceEach', 'fanCircuitFee', 'demoFee', 'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['includeKneeBraces', 'includeFanCircuit', 'includePermit', 'demoExisting'];

// Mirrors the <select id="attachment">/<select id="shade">/<select
// id="height"> options in index.html, sourced from calc.mjs so the allowed
// values cannot drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  attachment: ATTACHMENT_PRESETS.map((preset) => preset.id),
  shade: SHADE_PRESETS.map((preset) => preset.id),
  height: HEIGHT_PRESETS.map((preset) => preset.id),
};

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
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
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
  for (const id of BOOLEAN_FIELD_IDS) {
    if (params.has(id)) inputs[id] = params.get(id) === '1';
  }
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}

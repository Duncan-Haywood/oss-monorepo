// Shareable bid link. A hood cleaner comparing a takeoff with an operator,
// GM, or a second tech needs the recipient to see the exact same system --
// every canopy, filter, duct run, and fan the contractor added, each one's
// quantity, minutes-per-unit, and access, plus the grease load and every
// wage, chemistry, and margin figure -- not just the headline price a
// screenshot would show. Retyping the system is how that comparison never
// happens, and how a job with a rooftop fan and a vertical chase reopens as
// canopy-and-filters only. The transform is pure: no DOM, no storage, no
// network, and everything after the # never reaches a server.
//
// The exhaust system is a list the visitor grows or shrinks with "+ Add a
// component" -- canopy, filters, horizontal duct, vertical duct, and fans are
// each a row the contractor adds, removes, and retypes, not a fixed field set
// -- so it cannot ride one query parameter per field the way the cost fields
// do. It rides under one parameter instead, one row per component, cells
// colon-separated and rows comma-separated -- the same encoding
// `carpet-cleaning-bid-calculator`'s rooms/upholstery, `moving-bid-calculator`,
// and `janitorial-bid-calculator` use for a visitor-grown list. A component's
// name is checked against calc.mjs's own `COMPONENT_PRESETS` and its access
// level against `ACCESS_PRESETS`, the same drift guard
// `cabinet-refinishing-bid-calculator`'s `FINISH_PRESETS`/`COLOR_PRESETS` give
// its enum fields -- so a crafted or stale link can only set them to values
// the form's own selects could have produced. A component with no matching
// preset (the "Other component" option) carries no name at all, matching what
// `readComponents()` already does for that case, and restores the way
// `restoreShare()`'s default row falls back to "kitchen floor / easy" access.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `gutter-install-bid-calculator` and
// `foundation-repair-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { COMPONENT_PRESETS, ACCESS_PRESETS, GREASE_LOADS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'hourlyWage', 'burdenRate', 'crewSize', 'travelHours', 'travelTechs', 'afterHoursPremium',
  'consumablesPerJob', 'consumablesPerHoodSqFt', 'disposalFee', 'otherJobCost',
  'overheadRate', 'targetMargin', 'cleansPerYear', 'proposedPrice',
];

// Mirrors the <select id="greaseLoad"> options in index.html, sourced from
// calc.mjs so the allowed values cannot drift out of step with the presets
// the form offers.
export const ENUM_FIELDS = {
  greaseLoad: GREASE_LOADS.map((load) => load.id),
};

// Mirrors the <select class="c-type"> options (the "Other component" option
// carries no name -- see `componentFields` below) and <select class="c-acc">
// options in index.html, sourced from calc.mjs so the allowed values cannot
// drift out of step with the presets the form offers.
export const COMPONENT_NAME_VALUES = COMPONENT_PRESETS.map((preset) => preset.label);
export const ACCESS_VALUES = ACCESS_PRESETS.map((preset) => preset.id);

const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';
// Far above any real exhaust system and far below what would take a browser
// down.
const MAX_COMPONENTS = 60;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

// A row worth keeping has at least a valid name, a quantity, minutes per
// unit, or an access level -- otherwise it is an empty row a crafted or
// truncated link left behind, and restoring it would only add a blank card to
// the form.
function componentFields(row) {
  return {
    name: usableEnum(row?.name, COMPONENT_NAME_VALUES),
    quantity: usableNumber(row?.quantity),
    minutesPerUnit: usableNumber(row?.minutesPerUnit),
    access: usableEnum(row?.access, ACCESS_VALUES),
  };
}

function encodeComponent(fields) {
  return [
    fields.name ?? '',
    fields.quantity === null ? '' : String(fields.quantity),
    fields.minutesPerUnit === null ? '' : String(fields.minutesPerUnit),
    fields.access ?? '',
  ].join(CELL_SEPARATOR);
}

function decodeComponent(raw) {
  const cells = raw.split(CELL_SEPARATOR);
  const fields = componentFields({
    name: cells[0],
    quantity: cells[1],
    minutesPerUnit: cells[2],
    access: cells[3],
  });
  if (fields.name === null && fields.quantity === null && fields.minutesPerUnit === null && fields.access === null) {
    return null;
  }
  const component = {};
  if (fields.name !== null) component.name = fields.name;
  if (fields.quantity !== null) component.quantity = fields.quantity;
  if (fields.minutesPerUnit !== null) component.minutesPerUnit = fields.minutesPerUnit;
  if (fields.access !== null) component.access = fields.access;
  return component;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    const value = usableEnum(inputs?.[id], allowed);
    if (value !== null) params.set(id, value);
  }

  const components = Array.isArray(inputs?.components) ? inputs.components : [];
  const encodedComponents = components
    .slice(0, MAX_COMPONENTS)
    .map(componentFields)
    .filter((fields) => fields.name !== null || fields.quantity !== null
      || fields.minutesPerUnit !== null || fields.access !== null)
    .map(encodeComponent);
  if (encodedComponents.length > 0) params.set('components', encodedComponents.join(ROW_SEPARATOR));

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
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  if (params.has('components')) {
    const components = params.get('components')
      .split(ROW_SEPARATOR)
      .slice(0, MAX_COMPONENTS)
      .map(decodeComponent)
      .filter((component) => component !== null);
    if (components.length > 0) inputs.components = components;
  }
  return inputs;
}

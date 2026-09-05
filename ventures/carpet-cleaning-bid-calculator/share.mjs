// Shareable bid link. A carpet cleaner comparing a takeoff with a homeowner,
// property manager, or GC needs the recipient to see the exact same stop --
// every room's square footage, soil-specific extraction rate, and pet
// treatment, every upholstery piece, stairs, furniture moving, the drive, and
// every wage, chemistry, and margin figure -- not just the headline price a
// screenshot would show. Retyping a room list is how that comparison never
// happens, and how a five-room house reopens as a three-room one. The
// transform is pure: no DOM, no storage, no network, and everything after the
// # never reaches a server.
//
// Rooms and upholstery are lists the visitor grows or shrinks, so they cannot
// ride one query parameter per field the way the fixed cost fields do. Each
// list rides under one parameter instead, one row per item, cells
// colon-separated and rows comma-separated -- the same encoding
// `moving-bid-calculator` and `janitorial-bid-calculator` use for a
// building's list of spaces. A room's name is checked against calc.mjs's own
// `ROOM_NAME_PRESETS` and an upholstery piece's name against its
// `UPHOLSTERY_PRESETS`, the same drift guard `FINISH_PRESETS`/`COLOR_PRESETS`
// give cabinet-refinishing-bid-calculator's enum fields -- so a crafted or
// stale link can only set them to values the form's own selects could have
// produced. An upholstery piece with no matching preset (the "Other piece"
// option) carries an empty name, matching what `readUpholstery()` already
// does for that case.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `spray-foam-bid-calculator`, `basement-waterproofing-bid-calculator`
// and `cabinet-refinishing-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { ROOM_NAME_PRESETS, UPHOLSTERY_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'stairFlights', 'minutesPerFlight', 'furnitureMoveMinutes', 'travelMinutes',
  'extraPassMultiplier', 'hourlyWage', 'burdenRate', 'chemicalsPerSqFt',
  'petChemistryPerRoom', 'otherJobCost', 'overheadRate', 'targetMargin',
  'minimumCharge', 'proposedPrice',
];

// Mirrors the <select class="r-name"> options in index.html, sourced from
// calc.mjs so the allowed values cannot drift out of step with the presets
// the form offers.
export const ROOM_NAME_VALUES = [...ROOM_NAME_PRESETS];
// Mirrors the <select class="u-type"> options, plus the empty name
// `readUpholstery()` produces for a piece with no matching preset (the
// "Other piece" option).
export const UPHOLSTERY_NAME_VALUES = UPHOLSTERY_PRESETS.map((preset) => preset.label);

const ROW_SEPARATOR = ',';
const CELL_SEPARATOR = ':';
// Far above any real house and far below what would take a browser down.
const MAX_ROOMS = 60;
const MAX_UPHOLSTERY = 60;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

// A row worth keeping has at least a valid name, a square footage, or a
// rate -- otherwise it is an empty row a crafted or truncated link left
// behind, and restoring it would only add a blank card to the form.
function roomFields(room) {
  return {
    name: usableEnum(room?.name, ROOM_NAME_VALUES),
    squareFeet: usableNumber(room?.squareFeet),
    productionRate: usableNumber(room?.productionRate),
    petTreatment: Boolean(room?.petTreatment),
  };
}

function encodeRoom(fields) {
  return [
    fields.name ?? '',
    fields.squareFeet === null ? '' : String(fields.squareFeet),
    fields.productionRate === null ? '' : String(fields.productionRate),
    fields.petTreatment ? '1' : '0',
  ].join(CELL_SEPARATOR);
}

function decodeRoom(raw) {
  const cells = raw.split(CELL_SEPARATOR);
  const fields = roomFields({
    name: cells[0],
    squareFeet: cells[1],
    productionRate: cells[2],
    petTreatment: cells[3] === '1',
  });
  if (fields.name === null && fields.squareFeet === null && fields.productionRate === null) return null;
  const room = { petTreatment: fields.petTreatment };
  if (fields.name !== null) room.name = fields.name;
  if (fields.squareFeet !== null) room.squareFeet = fields.squareFeet;
  if (fields.productionRate !== null) room.productionRate = fields.productionRate;
  return room;
}

// '' is itself a valid, allowed value here -- the "Other piece" option -- so
// it is not what decides whether a row carries content; a piece with minutes
// typed but no matching preset is still a piece worth restoring.
function upholsteryFields(piece) {
  const rawName = piece?.name;
  return {
    name: UPHOLSTERY_NAME_VALUES.includes(rawName) ? rawName : null,
    minutes: usableNumber(piece?.minutes),
  };
}

function encodeUpholstery(fields) {
  return [fields.name ?? '', fields.minutes === null ? '' : String(fields.minutes)].join(CELL_SEPARATOR);
}

function decodeUpholstery(raw) {
  const cells = raw.split(CELL_SEPARATOR);
  const fields = upholsteryFields({ name: cells[0], minutes: cells[1] });
  if (fields.name === null && fields.minutes === null) return null;
  return { name: fields.name ?? '', ...(fields.minutes !== null ? { minutes: fields.minutes } : {}) };
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }

  const rooms = Array.isArray(inputs?.rooms) ? inputs.rooms : [];
  const encodedRooms = rooms
    .slice(0, MAX_ROOMS)
    .map(roomFields)
    .filter((fields) => fields.name !== null || fields.squareFeet !== null || fields.productionRate !== null)
    .map(encodeRoom);
  if (encodedRooms.length > 0) params.set('rooms', encodedRooms.join(ROW_SEPARATOR));

  const upholstery = Array.isArray(inputs?.upholstery) ? inputs.upholstery : [];
  const encodedUpholstery = upholstery
    .slice(0, MAX_UPHOLSTERY)
    .map(upholsteryFields)
    .filter((fields) => fields.name !== null || fields.minutes !== null)
    .map(encodeUpholstery);
  if (encodedUpholstery.length > 0) params.set('upholstery', encodedUpholstery.join(ROW_SEPARATOR));

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
  if (params.has('rooms')) {
    const rooms = params.get('rooms')
      .split(ROW_SEPARATOR)
      .slice(0, MAX_ROOMS)
      .map(decodeRoom)
      .filter((room) => room !== null);
    if (rooms.length > 0) inputs.rooms = rooms;
  }
  if (params.has('upholstery')) {
    const upholstery = params.get('upholstery')
      .split(ROW_SEPARATOR)
      .slice(0, MAX_UPHOLSTERY)
      .map(decodeUpholstery)
      .filter((piece) => piece !== null);
    if (upholstery.length > 0) inputs.upholstery = upholstery;
  }
  return inputs;
}

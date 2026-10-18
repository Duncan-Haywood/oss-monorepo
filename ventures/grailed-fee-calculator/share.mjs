// Opens this calculator from a link: a shared sale, or the item handed over
// by ../where-to-sell-calculator (see its handoff.mjs). Before this module
// the page could only be reached with its worked example, so a seller who had
// just compared channels had to retype the item here.
//
// Nothing is transmitted. The numbers ride in the URL *fragment* (`#...`),
// which a browser never sends to a server or in a Referer header.
//
// The field lists are imported from calc.mjs, not restated, so a field added
// to the arithmetic is linkable the moment it exists. Anything unrecognised,
// negative or non-numeric is ignored rather than guessed at.

import { INPUT_IDS, TOGGLE_IDS, SELECT_IDS, SCHEDULES } from './calc.mjs';

export const FIELD_IDS = Object.freeze([...INPUT_IDS]);
const SELECT_VALUES = Object.freeze({ schedule: Object.keys(SCHEDULES) });

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of TOGGLE_IDS) {
    if (input?.[id] === undefined || input?.[id] === null) continue;
    params.set(id, input[id] ? '1' : '0');
  }
  for (const id of SELECT_IDS) {
    if (SELECT_VALUES[id]?.includes(input?.[id])) params.set(id, input[id]);
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  for (const id of TOGGLE_IDS) {
    if (!params.has(id)) continue;
    const raw = params.get(id);
    if (raw === '1' || raw === '0') result[id] = raw === '1';
  }
  for (const id of SELECT_IDS) {
    if (!params.has(id)) continue;
    const raw = params.get(id);
    if (SELECT_VALUES[id]?.includes(raw)) result[id] = raw;
  }
  return result;
}

/**
 * A value for every field the form owns. A field the link did not carry is
 * cleared (or switched off, or set to the default option) rather than left
 * showing the recipient's own saved draft, so an item arriving from another
 * calculator never mixes in numbers its sender did not send.
 */
export function formValues(decoded) {
  const values = Object.fromEntries(FIELD_IDS.map(id => [id, decoded?.[id] !== undefined ? String(decoded[id]) : '']));
  for (const id of TOGGLE_IDS) values[id] = decoded?.[id] === true;
  for (const id of SELECT_IDS) values[id] = decoded?.[id] ?? SELECT_VALUES[id][0];
  return values;
}

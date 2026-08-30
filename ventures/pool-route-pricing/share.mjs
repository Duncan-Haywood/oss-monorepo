// A route operator's account count, service/drive minutes, labor rate,
// chemical cost, overhead, and target margin are what they re-enter every
// time they price a new route or revisit this one. Persisting them locally
// and letting them ride in a shareable link is what turns a one-off
// calculation into a tool worth returning to, and lets an operator send a
// route to a partner or franchise co-owner without re-typing eight numbers.
//
// This module is pure — no DOM, no storage, no network — so it is testable
// in `node --test` and reusable for both the localStorage draft and the
// shareable link, which serialize the same field set. Unknown keys never
// survive encode or decode, so a crafted or stale link can only ever set a
// known, non-negative numeric field.

import { DEFAULTS } from './calc.mjs';

export const FIELD_IDS = Object.keys(DEFAULTS);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// inputs object -> query string (no leading '?'). Only known, valid,
// non-negative numbers are written; a blank or invalid field is left out so
// a partial link states nothing about it rather than pinning it to zero.
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

// query string -> inputs object. Accepts a bare query string, or one with a
// leading '?' or '#', so the caller can hand it `location.hash` or
// `location.search` without trimming first. A hostile or corrupted link
// yields only the fields that parse, so the page still works and just falls
// back to its own defaults for the rest.
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const trimmed = source.replace(/^[?#]/, '');
  const params = new URLSearchParams(trimmed);
  const inputs = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}

// Drop query/hash from the current page URL, then attach the encoded route.
// The hash never leaves the recipient's browser; there is no server hop.
export function buildShareUrl(baseUrl, inputs) {
  const query = encodeInputs(inputs);
  const base = String(baseUrl || '').split('#')[0].split('?')[0];
  return query ? `${base}#${query}` : base;
}

// Single-sourced from the calculator so a new input field is shareable the
// day it ships, instead of being quietly discarded by an encoder that never
// learned about it. String enums (resolution, codec, recording mode,
// construction type, lift required) travel as themselves; everything else
// travels as a number. A shared link that dropped the drive count or the
// longest cable run would let the recipient see a different bid price and a
// different storage/PoE check than the sender saw — that is the bug this
// allowlist exists to prevent.
import { INPUT_FIELDS as FIELDS } from './calc.mjs';

const STRING_FIELDS = new Set([
  'resolution',
  'codec',
  'recordingMode',
  'construction',
  'liftRequired',
]);

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    const raw = input?.[field];
    if (STRING_FIELDS.has(field)) {
      const value = String(raw ?? '').trim();
      if (value) params.set(field, value);
      continue;
    }
    // A blank numeric field is not the number zero — `hoursPerDrop` left
    // blank means "use the construction-type preset", and `proposedPrice`
    // left blank means "no price to compare". `Number('')` is 0, so without
    // this check a shared link would turn a blank override into an explicit
    // zero and silently change the priced job (0 h/drop cratered the labour
    // hours the calculator returned, a defect this file's own test caught).
    if (raw === '' || raw == null) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  return params.toString();
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of FIELDS) {
    if (!params.has(field)) continue;
    if (STRING_FIELDS.has(field)) {
      const text = String(params.get(field) || '').trim();
      if (text) result[field] = text;
      continue;
    }
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  return result;
}

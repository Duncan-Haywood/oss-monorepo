// Shareable filter-design link. A student checking a homework answer with a
// classmate, or an engineer sending a colleague the exact component values
// and unit scaling they used, needs the recipient to see the same filter --
// the topology, which mode was active (read a cutoff from components, or
// design a component for a target cutoff), every value, and which unit each
// one was entered in -- not just a cutoff frequency a screenshot would show.
// Retyping eleven fields across two modes and four component families is how
// that check never happens, and a silently dropped unit selector is how the
// recipient reads a value in the wrong scale (10 kΩ misread as 10 Ω is a
// thousand-fold error, not a rounding one). The transform is pure: no DOM,
// no storage, no network, and everything after the # never reaches a server.
//
// Every field here is either a plain non-negative number (the seven typed
// values: r, c, l, target, dr, dc, dl) or a fixed enum this page's own
// <select>/radio options offer (the filter type, the mode, each unit
// multiplier, and which component design mode solves for) -- there are no
// checkboxes and no visitor-grown rows, so the plain "one query param per
// field" pattern from the fleet's bid calculators applies directly, with
// enums validated the same way `screened-porch-bid-calculator`'s ENUM_FIELDS
// are, against this page's own option values rather than a value guessed at
// here.
//
// `solve-for` is the one enum whose *offered* options change with the
// filter family (capacitance/inductance vs resistance) -- see
// `rebuildSolveOptions()` in index.html. Rather than re-derive that
// dependency here (and risk it drifting from the page's own logic), the
// full universal set the page can ever assign is accepted; index.html
// re-applies it only after rebuilding the option list for the restored
// type, so a value that would not apply to that type is simply not one of
// the options `.value =` can select, and the page's own default stands.

export const NUMBER_FIELD_IDS = ['r', 'c', 'l', 'target', 'dr', 'dc', 'dl'];

export const BOOLEAN_FIELD_IDS = [];

export const ENUM_FIELDS = Object.freeze({
  type: ['rc-lowpass', 'rc-highpass', 'rl-lowpass', 'rl-highpass'],
  mode: ['cutoff', 'design'],
  'r-unit': ['1', '1e3', '1e6'],
  'c-unit': ['1e-12', '1e-9', '1e-6', '1e-3'],
  'l-unit': ['1e-9', '1e-6', '1e-3', '1'],
  'dr-unit': ['1', '1e3', '1e6'],
  'dc-unit': ['1e-12', '1e-9', '1e-6', '1e-3'],
  'dl-unit': ['1e-9', '1e-6', '1e-3', '1'],
  'target-unit': ['1', '1e3', '1e6'],
  'solve-for': ['capacitance', 'inductance', 'resistance'],
});

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
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}

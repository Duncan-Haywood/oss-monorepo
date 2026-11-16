// The six joint level settings pre-registered in eval/tcpd-multi-floor.mjs (2026-11-11), in their own
// module so later checks on other data (eval/beedance-multi.mjs) run exactly the same list.
export const SETTINGS = {
  'joint level (before)': { model: 'mean' },
  'joint level, floor auto (primary)': { model: 'mean', floor: 'auto' },
  'joint level, floor 2 every column': { model: 'mean', floor: 2 },
  'joint level, floor 1 every column': { model: 'mean', floor: 1 },
  'joint level, ar1': { model: 'mean', ar1: true },
  'joint level, ar1 + floor 2': { model: 'mean', ar1: true, floor: 2 },
};

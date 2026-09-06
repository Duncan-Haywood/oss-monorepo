// Shareable comparison link.
//
// This page already offers a "Copy decision summary" (text) and a "Download
// private review JSON" (a file), but neither reopens as a working calculator
// — a teammate reading the summary or the JSON has to retype fifteen fields,
// two of them multi-line rate sheets, to check a number or try a different
// workload against the same two price sheets. A link that reopens this page
// with the same workload, both providers' rates, and both graduated-rate
// sheets already in place lets the recipient verify the comparison or bring
// their own outbound-transfer estimate to it, which is the whole point of a
// tool whose own FAQ calls this "a workload... to share with your team".
//
// The transform is pure — no DOM, no storage, no network — and the page puts
// the payload in the URL fragment, which browsers never send to a server.
// Whatever rates a provider quoted stay on the two devices the link is pasted
// between, the same promise the rest of this calculator makes.

/** The workload and both providers' numeric rate fields. */
export const NUMBER_FIELD_IDS = Object.freeze([
  'storage', 'requests', 'egress',
  'aStorage', 'aRequests', 'aEgress', 'aFree',
  'bStorage', 'bRequests', 'bEgress', 'bFree',
]);

/** Provider names and graduated-rate sheets: free text, not numbers. */
export const TEXT_FIELD_IDS = Object.freeze(['aName', 'bName', 'aTiers', 'bTiers']);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * A blank or unusable numeric field is omitted rather than sent as zero, so
 * the recipient's page keeps its own starting default for anything the
 * sender left alone. A blank text field is omitted for the same reason.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of TEXT_FIELD_IDS) {
    const value = inputs?.[id];
    if (typeof value === 'string' && value !== '') params.set(id, value);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised or non-numeric in a numeric field is dropped rather
 * than throwing: a truncated link pasted into a text message should open the
 * page on the fields that survived, not on an error. A graduated-rate sheet
 * that fails to parse is caught by the page's own `tiersFor`, the same as a
 * sheet typed in by hand.
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const id of TEXT_FIELD_IDS) {
    if (params.has(id)) inputs[id] = params.get(id);
  }
  return inputs;
}

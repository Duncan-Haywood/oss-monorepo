// Shareable link for a license quote. Before this, the only way to hand a
// quote to someone else -- a second photographer, a studio manager, the
// client themselves -- was "Copy draft", which copies the finished prose
// text with no way to get back to the editable form behind it. This encodes
// the form's own fields into the page's URL fragment, so opening the link
// reopens the same scope with every field still editable.
//
// Follows the same URL-hash convention as this month's other share links:
// nothing is sent to a server, the payload rides in the fragment (never the
// query string a server or Referer header would log, and never sent on any
// request at all), and only a fixed, validated shape is accepted back in --
// a crafted fragment cannot inject an out-of-range multiplier, an unknown
// channel, or an unbounded string into the form.

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const TERMS = [1, 3, 6, 12, 24];
const TERRITORIES = [1, 1.25, 1.6];
const EXCLUSIVITIES = [1, 1.35, 1.75];
const CHANNELS = ['web', 'paid', 'print', 'outdoor'];

function usableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function oneOf(value, allowed) {
  const n = usableNumber(value);
  return n !== null && allowed.includes(n) ? n : null;
}

function usableString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : null;
}

function usableChannels(value) {
  if (!Array.isArray(value)) return null;
  const names = [...new Set(value.filter((name) => CHANNELS.includes(name)))].slice(0, CHANNELS.length);
  return names.length > 0 ? names : null;
}

export function encodeShare(input) {
  const payload = {};
  const currency = CURRENCIES.includes(input?.currency) ? input.currency : null;
  const creative = usableNumber(input?.creative);
  const images = usableNumber(input?.images);
  const term = oneOf(input?.term, TERMS);
  const territory = oneOf(input?.territory, TERRITORIES);
  const exclusivity = oneOf(input?.exclusivity, EXCLUSIVITIES);
  const rush = usableNumber(input?.rush);
  const client = usableString(input?.client, 80);
  const photographer = usableString(input?.photographer, 80);
  const channels = usableChannels(input?.channels);
  if (currency !== null) payload.currency = currency;
  if (creative !== null && creative >= 0) payload.creative = creative;
  if (images !== null && images >= 1) payload.images = images;
  if (term !== null) payload.term = term;
  if (territory !== null) payload.territory = territory;
  if (exclusivity !== null) payload.exclusivity = exclusivity;
  if (rush !== null && rush >= 0 && rush <= 100) payload.rush = rush;
  if (client) payload.client = client;
  if (photographer) payload.photographer = photographer;
  if (channels) payload.channels = channels;
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^#/, '');
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const out = {};
  const currency = CURRENCIES.includes(parsed.currency) ? parsed.currency : null;
  const creative = usableNumber(parsed.creative);
  const images = usableNumber(parsed.images);
  const term = oneOf(parsed.term, TERMS);
  const territory = oneOf(parsed.territory, TERRITORIES);
  const exclusivity = oneOf(parsed.exclusivity, EXCLUSIVITIES);
  const rush = usableNumber(parsed.rush);
  const client = usableString(parsed.client, 80);
  const photographer = usableString(parsed.photographer, 80);
  const channels = usableChannels(parsed.channels);
  if (currency !== null) out.currency = currency;
  if (creative !== null && creative >= 0) out.creative = creative;
  if (images !== null && images >= 1) out.images = images;
  if (term !== null) out.term = term;
  if (territory !== null) out.territory = territory;
  if (exclusivity !== null) out.exclusivity = exclusivity;
  if (rush !== null && rush >= 0 && rush <= 100) out.rush = rush;
  if (client) out.client = client;
  if (photographer) out.photographer = photographer;
  if (channels) out.channels = channels;
  if (Object.keys(out).length === 0) return null;
  return out;
}

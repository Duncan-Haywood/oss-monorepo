import { encodeShare, decodeShare } from './share.mjs';

const $ = (id) => document.getElementById(id);
const money = (value, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
const labels = { web: 'website, email, and organic social', paid: 'paid social or display advertising', print: 'print, packaging, or point-of-sale', outdoor: 'outdoor, signage, or broadcast' };
const read = () => ({ currency: $('currency').value, creative: Number($('creativeFee').value), images: Number($('images').value), term: Number($('term').value), territory: Number($('territory').value), exclusivity: Number($('exclusivity').value), rush: Number($('rush').value) || 0, client: $('client').value.trim(), photographer: $('photographer').value.trim(), channels: [...document.querySelectorAll('[name=channel]:checked')].map((input) => ({ name: input.value, factor: Number(input.dataset.factor) })) });
export function calculate(input) {
  // A plain average of the selected channels' factors is not monotonic: starting from
  // a high-value channel (outdoor, 1.6) and adding a lower-value one (web, 1) pulls the
  // average down, so a licence covering *more* places to use the image could quote
  // *less* than the narrower one -- the opposite of what broader usage rights are worth.
  // `0.85 * max + 0.15 * sum` keeps the single-channel case identical to the highest
  // selected factor (so "web only" still prices the same as it always did) while
  // guaranteeing the factor strictly increases with every channel added, for any
  // combination: the max term never falls and the sum term strictly grows by that
  // channel's own factor.
  const factors = input.channels.map((channel) => channel.factor);
  const channelFactor = factors.length
    ? 0.85 * Math.max(...factors) + 0.15 * factors.reduce((sum, factor) => sum + factor, 0)
    : 0.5;
  const termFactor = Math.sqrt(input.term / 6);
  const rights = input.creative * 0.35 * channelFactor * termFactor * input.territory * input.exclusivity * (1 + input.rush / 100);
  return { rights, total: input.creative + rights, perImage: rights / input.images, channelFactor, termFactor };
}
// Only on the page that has the quote form. `extension.mjs` imports
// `calculate` from here, so on license-extension-fee.html this block used to
// run, throw on the missing #quote-form, and take the whole page script down:
// the extension fee never priced and the usage opt-out was never saved
// (found by the nightly `optout` browser check, 2026-10-30).
if (typeof document !== 'undefined' && document.getElementById('quote-form')) {
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}
function event(name) {
  try {
    if (localStorage.getItem('photo-license-usage-opt-out') === 'true' || honorsBrowserSignal()) {
      updateUsage();
      return;
    }
    const key = 'photo-license-usage';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    data[name] = (data[name] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Private browsing must not break the quote.
  }
  updateUsage();
}
function updateUsage() {
  try {
    const data = JSON.parse(localStorage.getItem('photo-license-usage') || '{}');
    $('usage-summary').textContent = `This browser has counted ${Object.values(data).reduce((a, b) => a + b, 0)} anonymous feature events. No quote values are included.`;
    $('usage-opt-out').checked = localStorage.getItem('photo-license-usage-opt-out') === 'true';
  } catch {
    $('usage-summary').textContent = 'Anonymous feature counts are unavailable in this browser.';
  }
}
function render() { const input = read(); const output = calculate(input); $('total').textContent = money(output.total, input.currency); $('out-creative').textContent = money(input.creative, input.currency); $('out-license').textContent = money(output.rights, input.currency); $('out-per-image').textContent = money(output.perImage, input.currency); $('assumptions').textContent = `Based on ${input.channels.map((channel) => labels[channel.name]).join(', ')} for ${input.term} month${input.term === 1 ? '' : 's'}, ${$('territory').selectedOptions[0].text.toLowerCase()}, and ${$('exclusivity').selectedOptions[0].text.toLowerCase()}. Adjust the multipliers to match your market and negotiation.`; const client = input.client || 'the client'; const photographer = input.photographer || 'the photographer'; $('draft').value = `COMMERCIAL IMAGE LICENSE QUOTE\n\nPrepared by: ${photographer}\nFor: ${client}\n\nCreative / production fee: ${money(input.creative, input.currency)}\nUsage rights (${input.term} months): ${money(output.rights, input.currency)}\nSuggested total: ${money(output.total, input.currency)}\n\nPermitted channels: ${input.channels.map((channel) => labels[channel.name]).join(', ')}\nTerritory: ${$('territory').selectedOptions[0].text}\nExclusivity: ${$('exclusivity').selectedOptions[0].text}\nImages: ${input.images} final image${input.images === 1 ? '' : 's'}\n\nThis is a quote for discussion, not a contract. Final terms should define the specific images, permitted uses, term, territory, exclusivity, credit, renewal, payment, and any releases.`; $('results').hidden = false; event('quote_built'); }
function valid(input) { const errors = []; if (!Number.isFinite(input.creative) || input.creative < 0) errors.push('Enter a creative fee of zero or more.'); if (!Number.isInteger(input.images) || input.images < 1) errors.push('Enter at least one final image.'); if (!input.channels.length) errors.push('Select at least one usage channel.'); if (input.rush < 0 || input.rush > 100) errors.push('Rush premium must be between 0% and 100%.'); return errors; }
$('quote-form').addEventListener('submit', (eventObject) => { eventObject.preventDefault(); const input = read(); const errors = valid(input); $('errors').hidden = !errors.length; $('errors').textContent = errors.join(' '); if (!errors.length) render(); });
$('save-draft').addEventListener('click', () => {
  try {
    localStorage.setItem('photo-license-draft', JSON.stringify(read()));
    event('draft_saved');
    $('copy-status').textContent = 'Draft saved in this browser.';
  } catch {
    $('copy-status').textContent = 'This browser blocked saving a draft; copy the text instead.';
  }
});
$('copy-draft').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('draft').value); $('copy-status').textContent = 'Draft copied.'; event('draft_copied'); } catch { $('copy-status').textContent = 'Select the draft text and copy it manually.'; } });
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    document.execCommand('copy');
    fallback.remove();
  }
}
async function copyShare() {
  const input = read();
  const hash = encodeShare({ ...input, channels: input.channels.map((channel) => channel.name) });
  const url = `${location.origin}${location.pathname}#${hash}`;
  await writeClipboard(url);
  history.replaceState(null, '', `#${hash}`);
  event('share_copied');
  $('share-status').textContent = 'Share link copied.';
  setTimeout(() => { $('share-status').textContent = ''; }, 2500);
}
$('copy-share').addEventListener('click', () => {
  copyShare().catch(() => { $('share-status').textContent = 'Copy failed; copy the address bar instead.'; });
});
$('usage-opt-out').addEventListener('change', (eventObject) => {
  try {
    localStorage.setItem('photo-license-usage-opt-out', String(eventObject.target.checked));
  } catch {
    // Preference is best effort.
  }
  updateUsage();
});
$('clear-usage').addEventListener('click', () => {
  try {
    localStorage.removeItem('photo-license-usage');
  } catch {
    // Clearing is best effort.
  }
  updateUsage();
});
// A restored value (from a share link or a saved draft) always replaces the
// built-in defaults field by field -- only fields present in `values` are
// touched, so a share link that omits, say, `rush` leaves the default 0%
// rather than blanking the field.
function applyValues(values) {
  if (typeof values.currency !== 'undefined') $('currency').value = values.currency;
  if (typeof values.creative !== 'undefined') $('creativeFee').value = values.creative;
  if (typeof values.images !== 'undefined') $('images').value = values.images;
  if (typeof values.term !== 'undefined') $('term').value = values.term;
  if (typeof values.territory !== 'undefined') $('territory').value = values.territory;
  if (typeof values.exclusivity !== 'undefined') $('exclusivity').value = values.exclusivity;
  if (typeof values.rush !== 'undefined') $('rush').value = values.rush;
  if (typeof values.client !== 'undefined') $('client').value = values.client;
  if (typeof values.photographer !== 'undefined') $('photographer').value = values.photographer;
  if (Array.isArray(values.channels) && values.channels.length > 0) {
    // A saved draft stores channels as `{name, factor}` objects (the shape
    // `read()` produces); a decoded share link stores plain name strings
    // (the shape `share.mjs` validates). Both are accepted here so this one
    // function can serve both callers.
    const names = values.channels.map((channel) => (typeof channel === 'string' ? channel : channel.name));
    document.querySelectorAll('[name=channel]').forEach((input) => {
      input.checked = names.includes(input.value);
    });
  }
}
function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem('photo-license-draft') || 'null');
    if (saved) applyValues(saved);
  } catch {
    // A torn draft must not hide the empty form.
  }
}

// A share link takes priority over a saved draft: opening a link someone
// sent means seeing the scope they sent, not the visitor's own last draft.
const shared = decodeShare(location.hash);
if (shared) applyValues(shared);
else restoreDraft();
updateUsage();
}

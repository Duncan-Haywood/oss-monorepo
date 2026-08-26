const $ = (id) => document.getElementById(id);
const money = (value, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
const labels = { web: 'website, email, and organic social', paid: 'paid social or display advertising', print: 'print, packaging, or point-of-sale', outdoor: 'outdoor, signage, or broadcast' };
const read = () => ({ currency: $('currency').value, creative: Number($('creativeFee').value), images: Number($('images').value), term: Number($('term').value), territory: Number($('territory').value), exclusivity: Number($('exclusivity').value), rush: Number($('rush').value) || 0, client: $('client').value.trim(), photographer: $('photographer').value.trim(), channels: [...document.querySelectorAll('[name=channel]:checked')].map((input) => ({ name: input.value, factor: Number(input.dataset.factor) })) });
export function calculate(input) {
  const channelFactor = input.channels.length ? input.channels.reduce((sum, channel) => sum + channel.factor, 0) / input.channels.length : 0.5;
  const termFactor = Math.sqrt(input.term / 6);
  const rights = input.creative * 0.35 * channelFactor * termFactor * input.territory * input.exclusivity * (1 + input.rush / 100);
  return { rights, total: input.creative + rights, perImage: rights / input.images, channelFactor, termFactor };
}
if (typeof document !== 'undefined') {
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
try {
  const saved = JSON.parse(localStorage.getItem('photo-license-draft') || 'null');
  if (saved) {
    $('currency').value = saved.currency;
    $('creativeFee').value = saved.creative;
    $('images').value = saved.images;
    $('term').value = saved.term;
    $('territory').value = saved.territory;
    $('exclusivity').value = saved.exclusivity;
    $('rush').value = saved.rush;
    $('client').value = saved.client;
    $('photographer').value = saved.photographer;
    document.querySelectorAll('[name=channel]').forEach((input) => {
      input.checked = Array.isArray(saved.channels) && saved.channels.some((channel) => channel.name === input.value);
    });
  }
} catch {
  // A torn draft must not hide the empty form.
}
updateUsage();
}

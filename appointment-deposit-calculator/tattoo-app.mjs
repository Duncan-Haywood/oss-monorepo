import { parseInputs, plan, touchupNote, policyDraft } from './touchup.mjs';
import { recordUsage, isUsageEnabled, setUsageEnabled } from './usage.mjs';
import { encodeInputs, decodeInputs } from './tattoo-share.mjs';

const form = document.querySelector('#tattoo-form');
const money = (value, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);

function updateModeFields() {
  const mode = form.elements.namedItem('pricingMode').value;
  form.querySelector('[data-mode="percent"]').hidden = mode !== 'percent';
  form.querySelector('[data-mode="flat"]').hidden = mode !== 'flat';
  form.querySelector('[data-mode="hourly"]').hidden = mode !== 'hourly';
}

function render() {
  const parsed = parseInputs(Object.fromEntries(new FormData(form)));
  const errors = document.querySelector('#errors');
  const results = document.querySelector('#results');
  if (!parsed.ok) {
    errors.textContent = parsed.errors.join(' ');
    errors.hidden = false;
    results.hidden = true;
    return null;
  }
  errors.hidden = true;
  const modeled = plan(parsed.values);
  const format = (n) => money(n, parsed.values.currency);
  document.querySelector('#deposit').textContent = format(modeled.deposit);
  document.querySelector('#balance').textContent = format(modeled.balance);
  document.querySelector('#touchup-full-price').textContent = format(modeled.touchupFullPrice);
  const due = document.querySelector('#amount-due');
  due.textContent = format(modeled.amountDue);
  due.dataset.direction = modeled.amountDue === 0 ? 'gain' : 'loss';
  document.querySelector('#window-status').textContent = modeled.withinFreeWindow
    ? `Inside the free window (${modeled.monthsRemaining.toFixed(1)} month(s) remaining)`
    : 'Past the free window';
  document.querySelector('#touchup-note').textContent = touchupNote(parsed.values, modeled, format);
  document.querySelector('#policy').value = policyDraft(parsed.values, modeled, format);
  results.hidden = false;
  return modeled;
}

form.elements.namedItem('pricingMode').addEventListener('change', () => {
  updateModeFields();
  recordUsage('pricing_mode_changed');
});
updateModeFields();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const modeled = render();
  if (!modeled) return;
  recordUsage('touchup_calculated');
  recordUsage(modeled.withinFreeWindow ? 'touchup_within_window' : 'touchup_past_window');
});

document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#policy').value);
    document.querySelector('#status').textContent = ' Policy copied.';
    recordUsage('policy_copied');
  } catch {
    document.querySelector('#status').textContent = ' Select the policy text and copy it manually.';
  }
});

const optout = document.querySelector('#optout');
optout.checked = !isUsageEnabled();
if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) {
  optout.checked = true;
  optout.disabled = true;
}
optout.addEventListener('change', (event) => setUsageEnabled(!event.target.checked));

function applyShared(incoming) {
  for (const [id, value] of Object.entries(incoming)) {
    const field = form.elements.namedItem(id);
    if (field) field.value = value;
  }
  updateModeFields();
}

document.querySelector('#share-link').addEventListener('click', async () => {
  const status = document.querySelector('#share-status');
  try {
    const hash = encodeInputs(Object.fromEntries(new FormData(form)));
    const url = `${location.origin}${location.pathname}#${hash}`;
    await navigator.clipboard.writeText(url);
    history.replaceState(null, '', `#${hash}`);
    status.textContent = 'Link copied — your numbers travel in the link, not to a server.';
    recordUsage('share_link_copied');
  } catch {
    status.textContent = 'Could not copy automatically — copy the page URL after clicking once more.';
  }
});

const incomingShare = decodeInputs(window.location.hash || window.location.search);
if (Object.keys(incomingShare).length > 0) {
  applyShared(incomingShare);
  render();
  recordUsage('shared_link_opened');
  document.querySelector('#share-status').textContent = 'Opened from a shared link — verify every number before relying on it.';
}

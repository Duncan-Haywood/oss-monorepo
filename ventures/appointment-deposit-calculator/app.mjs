import { parseInputs, plan, policyDraft, comparisonNote, netEffectNote } from './calc.mjs';
import { recordUsage, isUsageEnabled, setUsageEnabled } from './usage.mjs';
import { encodeInputs, decodeInputs } from './share.mjs';

const form = document.querySelector('#deposit-form');
const money = (value, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);

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
  document.querySelector('#annual').textContent = format(modeled.annual);
  document.querySelector('#bookings').textContent = `${modeled.weeklyBookings.toFixed(1)} / week (${modeled.annualBookings.toFixed(0)} / year)`;
  document.querySelector('#revenue-without').textContent = format(modeled.revenueWithoutDeposit);
  document.querySelector('#revenue-with').textContent = format(modeled.revenueWithDeposit);

  // The sign is the answer, so it is carried by a word and a class rather than
  // by a leading "-" alone: `Intl.NumberFormat` renders a negative currency as
  // "-$1,234.00" in some locales and "($1,234.00)" in others, and neither
  // reads as "you lose this much" at a glance.
  const net = document.querySelector('#net-change');
  net.textContent = `${modeled.netChange >= 0 ? '+' : '−'}${format(Math.abs(modeled.netChange))} a year`;
  net.dataset.direction = modeled.netChange >= 0 ? 'gain' : 'loss';

  const breakEven = document.querySelector('#break-even');
  breakEven.textContent = modeled.breakEvenBookingRate == null
    ? 'Not applicable'
    : `${modeled.breakEvenBookingRate.toFixed(1)}% of today's bookings`;

  document.querySelector('#net-effect').textContent = netEffectNote(parsed.values, modeled, format);
  document.querySelector('#comparison').textContent = comparisonNote(parsed.values, modeled, format);
  document.querySelector('#policy').value = policyDraft(parsed.values, modeled, format);
  results.hidden = false;
  return modeled;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const modeled = render();
  if (!modeled) return;
  recordUsage('deposit_calculated');
  // Which side of break-even the run landed on. This is an outcome, not a
  // second visit counter: a tool whose users mostly discover their deposit
  // does NOT pay for itself is telling us something about the niche that the
  // raw calculate count cannot. Deliberately one of two buckets and nothing
  // else -- no price, no rate, no amount -- so the footer's promise that only
  // anonymous feature events are counted stays true.
  recordUsage(modeled.netChange >= 0 ? 'deposit_pays_off' : 'deposit_costs_money');
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

// Restoring a shared link sets each named field directly and skips any id
// the link did not carry, so the recipient's own page defaults stand for
// whatever the sender left alone (an unfilled deposit percentage, say).
function applyShared(incoming) {
  for (const [id, value] of Object.entries(incoming)) {
    const field = form.elements.namedItem(id);
    if (field) field.value = value;
  }
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

// A shared plan arrives in the fragment, which browsers never send to a
// server or log in a Referer header. `search` is accepted too, in case a
// link loses its # going through a messaging app that rewrites URLs.
const incomingShare = decodeInputs(window.location.hash || window.location.search);
if (Object.keys(incomingShare).length > 0) {
  applyShared(incomingShare);
  render();
  recordUsage('shared_link_opened');
  document.querySelector('#share-status').textContent = 'Opened from a shared link — verify every number before relying on it.';
}

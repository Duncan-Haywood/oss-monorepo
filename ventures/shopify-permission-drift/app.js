const beforeInput = document.querySelector('#before');
const afterInput = document.querySelector('#after');
const compareButton = document.querySelector('#compare');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
let report;

function validInventory(data) {
  const required = ['captured_at', 'api_version', 'source', 'authorization_state', 'apps'];
  if (!data || typeof data !== 'object' || required.some(key => !(key in data))) throw new Error('Each inventory needs captured_at, api_version, source, authorization_state, and apps.');
  if (required.slice(0, 4).some(key => typeof data[key] !== 'string' || !data[key].trim())) throw new Error('Inventory metadata must be non-empty strings.');
  if (Number.isNaN(Date.parse(data.captured_at))) throw new Error('captured_at must be an ISO 8601 timestamp.');
  if (!Array.isArray(data.apps)) throw new Error('Inventory apps must be a list.');
  const ids = new Set();
  data.apps.forEach(app => {
    if (!app || typeof app.id !== 'string' || !app.id || ids.has(app.id)) throw new Error('Every app needs a unique, non-empty id.');
    ids.add(app.id);
    ['scopes', 'webhooks'].forEach(field => { if (!Array.isArray(app[field]) || app[field].some(item => typeof item !== 'string')) throw new Error(`App ${app.id} needs a string ${field} list.`); });
  });
  return data;
}

function compare(before, after) {
  const old = Object.fromEntries(before.apps.map(app => [app.id, app]));
  const next = Object.fromEntries(after.apps.map(app => [app.id, app]));
  const changes = [];
  [...new Set([...Object.keys(old), ...Object.keys(next)])].sort().forEach(id => {
    if (!old[id]) return changes.push({ app: id, kind: 'app_added' });
    if (!next[id]) return changes.push({ app: id, kind: 'app_removed' });
    ['scopes', 'webhooks'].forEach(field => { const added = next[id][field].filter(x => !old[id][field].includes(x)); const removed = old[id][field].filter(x => !next[id][field].includes(x)); if (added.length || removed.length) changes.push({ app:id, kind:`${field}_changed`, added, removed }); });
  });
  ['authorization_state', 'api_version'].forEach(field => { if (before[field] !== after[field]) changes.push({ kind:`${field}_changed`, before:before[field], after:after[field] }); });
  return { status: changes.length ? 'changed' : 'unchanged', metadata: { before_source:before.source, after_source:after.source, before_captured_at:before.captured_at, after_captured_at:after.captured_at }, changes, review_required: Boolean(changes.length) };
}
function usage(event) { if (document.querySelector('#usage').checked && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1') { const key = 'shopify-drift-usage'; const events = JSON.parse(localStorage.getItem(key) || '[]'); events.push({ event, day:new Date().toISOString().slice(0,10) }); localStorage.setItem(key, JSON.stringify(events)); } }
async function read(file) { return validInventory(JSON.parse(await file.text())); }
function render() {
  const status = document.querySelector('#status');
  const metadata = document.querySelector('#metadata');
  const changes = document.querySelector('#changes');
  status.textContent = report.status === 'changed' ? `${report.changes.length} change${report.changes.length === 1 ? '' : 's'} require review` : 'No changes found';
  status.className = `status ${report.status}`;
  metadata.textContent = `${report.metadata.before_source} -> ${report.metadata.after_source} · captured ${report.metadata.before_captured_at} -> ${report.metadata.after_captured_at}`;
  changes.replaceChildren();
  if (!report.changes.length) {
    const item = document.createElement('li');
    item.textContent = 'Both snapshots describe the same app inventory and metadata.';
    changes.append(item);
  } else {
    report.changes.forEach(change => {
      const item = document.createElement('li');
      const kind = document.createElement('span');
      kind.className = 'change-kind';
      kind.textContent = change.kind;
      item.append(kind);
      const details = [change.app && ` · ${change.app}`, change.added?.length && ` · added: ${change.added.join(', ')}`, change.removed?.length && ` · removed: ${change.removed.join(', ')}`, change.before && ` · ${change.before} -> ${change.after}`].filter(Boolean).join('');
      item.append(document.createTextNode(details));
      changes.append(item);
    });
  }
  result.hidden = false;
}
async function run() { error.hidden = true; try { report = compare(await read(beforeInput.files[0]), await read(afterInput.files[0])); render(); usage('inventory_compared'); } catch (err) { error.textContent = err.message; error.hidden = false; } }
beforeInput.addEventListener('change', () => { compareButton.disabled = !(beforeInput.files[0] && afterInput.files[0]); }); afterInput.addEventListener('change', () => { compareButton.disabled = !(beforeInput.files[0] && afterInput.files[0]); }); compareButton.addEventListener('click', run);
document.querySelector('#download').addEventListener('click', () => { const blob = new Blob([JSON.stringify(report, null, 2)], { type:'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'shopify-permission-drift-report.json'; link.click(); URL.revokeObjectURL(link.href); usage('report_exported'); });
document.querySelector('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`Shopify permission drift: ${report.status}. ${report.changes.length} change(s) require review. Evidence only; review with the merchant.`); usage('summary_copied'); } catch { error.textContent = 'Clipboard access was unavailable. Use the downloaded report instead.'; error.hidden = false; } });
document.querySelector('#clear-usage').addEventListener('click', () => localStorage.removeItem('shopify-drift-usage'));

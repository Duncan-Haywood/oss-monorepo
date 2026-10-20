(function(){
var CATALOG = {"hourlyWage":{"label":"Crew hourly wage","prefix":"$","suffix":"/h","max":100000},"burdenRate":{"label":"Payroll burden","prefix":"","suffix":"%","max":500},"overheadRate":{"label":"Overhead on direct cost","prefix":"","suffix":"%","max":500},"targetMargin":{"label":"Target net margin","prefix":"","suffix":"%","max":99.9}};
var tag = document.querySelector('script[data-pf-rates-fields]');
var FIELDS = (tag ? tag.getAttribute('data-pf-rates-fields') || '' : '')
.split(',')
.map(function(pair){
var parts = pair.split(':');
var spec = CATALOG[parts[0]];
if (!spec || !parts[1]) return null;
return { id: parts[0], inputId: parts[1], label: spec.label,
prefix: spec.prefix, suffix: spec.suffix, max: spec.max };
})
.filter(Boolean);
var ALL_FIELDS = 4;
var KEY = "portfolio-shop-rates";
var root = document.querySelector('[data-pf-rates-root]');
if (!root) return;
var el = function(id){ return document.getElementById(id); };
var fieldFor = function(f){
var node = el(f.inputId);
return node && node.tagName === 'INPUT' ? node : null;
};
if (!FIELDS.length) { root.remove(); return; }
for (var i = 0; i < FIELDS.length; i++) {
if (!fieldFor(FIELDS[i])) { root.remove(); return; }
}
var store = (function(){ try { return window.localStorage; } catch (e) { return null; } })();
var usable = function(raw, max){
if (raw === '' || raw === null || raw === undefined) return null;
var value = typeof raw === 'number' ? raw : Number(String(raw).trim());
if (!isFinite(value) || value < 0 || value > max) return null;
return value;
};
var read = function(){
if (!store) return null;
var raw;
try { raw = store.getItem(KEY); } catch (e) { return null; }
if (!raw) return null;
var parsed;
try { parsed = JSON.parse(raw); } catch (e) { return null; }
if (!parsed || typeof parsed !== 'object') return null;
var source = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
var out = {}, kept = 0;
FIELDS.forEach(function(f){
var value = usable(source[f.id], f.max);
if (value === null) return;
out[f.id] = value; kept++;
});
return kept > 0 ? out : null;
};
var readAll = function(){
if (!store) return {};
var raw;
try { raw = store.getItem(KEY); } catch (e) { return {}; }
if (!raw) return {};
var parsed;
try { parsed = JSON.parse(raw); } catch (e) { return {}; }
if (!parsed || typeof parsed !== 'object') return {};
var source = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
return source && typeof source === 'object' ? source : {};
};
var write = function(rates){
if (!store) return false;
var merged = readAll();
Object.keys(rates).forEach(function(id){ merged[id] = rates[id]; });
try { store.setItem(KEY, JSON.stringify({ v: 1, rates: merged })); return true; }
catch (e) { return false; }
};
var bump = function(event){
try {
if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
if (!store || store.getItem('portfolio-hub-optout') === '1') return;
var k = 'portfolio-hub-usage';
var counts = JSON.parse(store.getItem(k) || '{}');
counts[event] = (counts[event] || 0) + 1;
counts.last_day = new Date().toISOString().slice(0, 10);
store.setItem(k, JSON.stringify(counts));
} catch (e) {}
};
var encoded = (location.hash || location.search).replace(/^[#?]/, '');
var params = new URLSearchParams(encoded);
var format = function(f, value){
var shown = Math.round(value * 100) / 100;
return f.prefix + shown.toLocaleString('en-US') + f.suffix;
};
var currentFromForm = function(){
var out = {}, kept = 0;
FIELDS.forEach(function(f){
var value = usable(fieldFor(f).value, f.max);
if (value === null) return;
out[f.id] = value; kept++;
});
return kept === FIELDS.length ? out : null;
};
var applyRates = function(rates, force){
var applied = [], heldBack = [];
FIELDS.forEach(function(f){
if (!(f.id in rates)) return;
if (!force && (params.has(f.inputId) || params.has(f.id))) { heldBack.push(f); return; }
var node = fieldFor(f);
applied.push(f);
if (String(node.value) === String(rates[f.id])) return;
node.value = rates[f.id];
node.dataset.edited = '1';
node.dispatchEvent(new Event('input', { bubbles: true }));
});
return { applied: applied, heldBack: heldBack };
};
var render = function(rates, outcome){
root.hidden = false;
var list = el('pf-rates-list');
var status = el('pf-rates-status');
var button = function(name){ return root.querySelector('[data-pf-rates="' + name + '"]'); };
if (!rates) {
status.textContent = 'Save your rates once \u2014 every calculator here uses them.';
list.hidden = true;
list.innerHTML = '';
button('save').textContent = 'Save the rates on this bid';
button('apply').hidden = true;
button('clear').hidden = true;
return;
}
list.hidden = false;
list.innerHTML = FIELDS.filter(function(f){ return f.id in rates; }).map(function(f){
var label = document.createElement('li');
label.textContent = f.label + ': ';
var value = document.createElement('b');
value.textContent = format(f, rates[f.id]);
label.appendChild(value);
return label.outerHTML;
}).join('');
button('save').textContent = 'Update from this bid';
button('clear').hidden = false;
var held = outcome && outcome.heldBack.length;
button('apply').hidden = !held;
var unsaved = FIELDS.filter(function(f){ return !(f.id in rates); });
status.textContent = held
? 'This bid came from a link, so it still shows the sender\u2019s rates.'
: unsaved.length
? 'Using your shop rates. ' + unsaved.map(function(f){ return f.label; }).join(' and ') +
' is not saved yet.'
: 'Using your shop rates.';
};
var start = function(){
var rates = read();
var outcome = rates ? applyRates(rates, false) : null;
if (outcome && outcome.applied.length) bump('shop_rates_applied');
render(rates, outcome);
el('pf-rates-toggle').addEventListener('click', function(){
var panel = el('pf-rates-panel');
var open = panel.hidden;
panel.hidden = !open;
el('pf-rates-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
if (open) bump('shop_rates_opened');
});
root.addEventListener('click', function(event){
var action = event.target && event.target.closest && event.target.closest('[data-pf-rates]');
if (!action) return;
var name = action.getAttribute('data-pf-rates');
if (name === 'save') {
var next = currentFromForm();
if (!next) {
el('pf-rates-status').textContent =
'Fill in all ' + FIELDS.length + ' of these rates on the bid first.';
return;
}
if (!write(next)) {
el('pf-rates-status').textContent = 'This browser is blocking site storage, so rates cannot be saved.';
return;
}
bump('shop_rates_saved');
render(next, { applied: FIELDS, heldBack: [] });
el('pf-rates-status').textContent = FIELDS.length === ALL_FIELDS
? 'Saved. Every trade bid calculator here opens with these.'
: 'Saved. Every trade bid calculator here that asks for them opens with these.';
return;
}
if (name === 'apply') {
var saved = read();
if (!saved) return;
bump('shop_rates_applied');
render(saved, applyRates(saved, true));
el('pf-rates-status').textContent = 'Repriced with your rates.';
return;
}
if (name === 'clear') {
try { if (store) store.removeItem(KEY); } catch (e) {}
bump('shop_rates_cleared');
render(null, null);
el('pf-rates-status').textContent = 'Forgotten. The numbers on this bid are unchanged.';
}
});
};
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
})();

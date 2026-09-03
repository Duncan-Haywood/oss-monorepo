(function(){
var tag = document.currentScript ||
document.querySelector('script[data-pf-embed-url]');
if (!tag) return;
var url = tag.getAttribute('data-pf-embed-url') || '';
var title = tag.getAttribute('data-pf-embed-title') || '';
var slug = tag.getAttribute('data-pf-embed-slug') || '';
var bump = function(event){
try {
if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
var store = window.localStorage;
if (store.getItem('portfolio-hub-optout') === '1') return;
var k = 'portfolio-hub-usage';
var counts = JSON.parse(store.getItem(k) || '{}');
counts[event] = (counts[event] || 0) + 1;
counts.last_day = new Date().toISOString().slice(0, 10);
store.setItem(k, JSON.stringify(counts));
} catch (e) {}
};
var framed = false;
try { framed = window.top !== window.self; } catch (e) { framed = true; }
var params;
try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
var requested = !!(params && params.get('pfEmbed') === '1');
if ((framed || requested) && url) {
document.documentElement.classList.add('pf-embed');
var bar = document.createElement('p');
bar.className = 'pf-embed-bar';
var label = document.createElement('span');
label.textContent = (title ? title + ' — ' : '') + 'free calculator';
var link = document.createElement('a');
link.href = url;
link.target = '_top';
link.rel = 'noopener';
link.textContent = 'Open the full tool & disclaimer →';
bar.appendChild(label);
bar.appendChild(document.createTextNode(' · '));
bar.appendChild(link);
if (document.body) document.body.appendChild(bar);
if (slug) bump('embed_view:' + slug);
var lastHeight = 0;
var report = function(){
try {
var doc = document.documentElement;
var height = Math.max(doc ? doc.scrollHeight : 0, document.body ? document.body.scrollHeight : 0);
if (!height || Math.abs(height - lastHeight) < 2) return;
lastHeight = height;
window.parent.postMessage({ source: 'pf-embed', slug: slug, height: height }, '*');
} catch (e) {}
};
report();
window.addEventListener('load', report);
window.addEventListener('resize', report);
if (window.ResizeObserver && document.body) {
try { new ResizeObserver(report).observe(document.body); } catch (e) {}
} else {
document.addEventListener('input', report);
document.addEventListener('change', report);
document.addEventListener('click', report);
}
}
var button = document.querySelector('[data-pf-embed-copy]');
if (button) {
button.addEventListener('click', function(){
var box = document.querySelector('[data-pf-embed-snippet]');
var status = document.querySelector('[data-pf-embed-status]');
if (!box) return;
var text = box.value || box.textContent || '';
var say = function(msg){ if (status) status.textContent = msg; };
var done = function(){
say('Copied.');
if (slug) bump('embed_snippet_copied:' + slug);
};
var fallback = function(){
try { box.focus(); box.select(); say('This browser would not copy for us — the code is selected above; copy it with your keyboard.'); }
catch (e) { say('This browser would not copy for us. Select the code above and copy it by hand.'); }
};
try {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else { fallback(); }
} catch (e) { fallback(); }
});
}
})();

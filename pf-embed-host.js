(function(){
if (!window.addEventListener) return;
window.addEventListener('message', function(event){
var data = event.data;
if (!data || data.source !== 'pf-embed') return;
var height = data.height;
if (typeof height !== 'number' || !isFinite(height)) return;
if (height < 120 || height > 20000) return;
var frames = document.getElementsByTagName('iframe');
for (var i = 0; i < frames.length; i++) {
var frame = frames[i];
if (frame.contentWindow !== event.source) continue;
var expected;
try { expected = new URL(frame.getAttribute('src'), location.href).origin; }
catch (e) { return; }
if (expected !== event.origin) return;
frame.style.height = Math.ceil(height) + 'px';
frame.style.minHeight = '0';
return;
}
}, false);
})();

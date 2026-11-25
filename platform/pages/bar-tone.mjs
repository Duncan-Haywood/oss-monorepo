/**
 * Give the shop-rates and saved-bids bars the venture's own button colour.
 *
 * Both bars are injected into ~176 venture pages, each with its own palette,
 * so their buttons were drawn in a neutral grey (#8080801f on a #80808059
 * border) that never clashes. It never matches either: on 160 of 176 bar pages
 * (measured 2026-11-24 at 1280 px) the venture has a coloured button of its
 * own, often just below the bar, and "Saved bids" and "Your shop rates" sat
 * above it as grey browser-default-looking chips. On wall-framing-takeoff, the
 * top flagship, the bar's two grey buttons sit between a teal "Start a
 * takeoff" and the form.
 *
 * So, when a bar is revealed, this finds the venture's primary button (the
 * first visible, opaque, saturated, dark control outside the site chrome and
 * the bars, whose own label passes 4.5:1 on it) and draws the bar's buttons as
 * its quiet sibling: the colour as the label, an 8% tint as the fill, a 38%
 * tint as the border, and the venture's own corner radius.
 *
 * It leaves the neutral grey in place when there is no such button, or when
 * the colour would not reach 4.5:1 against the bar's own background (a dark
 * page, or a venture whose primary is too light to read as text). It runs
 * again when the colour scheme changes, since a venture's dark mode changes
 * both sides of that test.
 *
 * The source below is plain ES5 so it can be pasted into both bar scripts,
 * which are `stripForInjection`'d files at the site root, like bar-align.mjs.
 */

/** Minimum contrast of the borrowed colour, as label text, on its own tint. */
export const BAR_TONE_MIN_CONTRAST = 4.5;

/** The CSS a bar needs to draw a toned button; `cls` is its root class. */
export const barToneCss = (cls) => `
/* Toned by bar-tone.mjs from the venture's own primary button; without the
   attribute the neutral grey above stands. */
.${cls}[data-pf-tone] button{color:rgb(var(--pf-tone));background:rgb(var(--pf-tone) / .08);
  border-color:rgb(var(--pf-tone) / .38);border-radius:var(--pf-tone-radius,7px);font-weight:600}
.${cls}[data-pf-tone] button:hover{background:rgb(var(--pf-tone) / .15)}
.${cls}[data-pf-tone] button:focus-visible{outline:2px solid rgb(var(--pf-tone));outline-offset:2px}
`;

export const BAR_TONE_JS = `
  var pfToneBar = function(root){
    var rgba = function(s){
      var m = String(s).match(/[\\d.]+/g);
      if (!m || m.length < 3) return null;
      return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
    };
    var lum = function(c){
      var f = function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    var ratio = function(a, b){
      var x = lum(a), y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    var mix = function(a, b, t){ return [0, 1, 2].map(function(i){ return a[i] * t + b[i] * (1 - t); }); };
    // Site chrome, the bars, the assistant and footers are ours, not the venture's.
    var ours = function(n){
      for (var x = n; x && x !== document.body; x = x.parentElement) {
        if (/(^|\\s)pf-/.test(typeof x.className === 'string' ? x.className : '') || /^pf-/.test(x.id || '')) return true;
        if (x.tagName === 'NAV' || x.tagName === 'FOOTER') return true;
      }
      return false;
    };
    var behind = function(n){
      for (var x = n; x; x = x.parentElement) {
        var c = rgba(getComputedStyle(x).backgroundColor);
        if (c && c[3] >= 0.99) return c;
      }
      return [255, 255, 255, 1];
    };
    var apply = function(){
      if (!root.isConnected) return;
      root.removeAttribute('data-pf-tone');
      root.style.removeProperty('--pf-tone');
      root.style.removeProperty('--pf-tone-radius');
      var all = document.querySelectorAll('button, a, input[type=submit], input[type=button]');
      var pick = null;
      for (var i = 0; i < all.length && !pick; i++) {
        var n = all[i];
        if (!n.offsetParent || ours(n)) continue;
        var s = getComputedStyle(n);
        var bg = rgba(s.backgroundColor), ink = rgba(s.color);
        if (!bg || !ink || bg[3] < 0.99) continue;
        if (Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) < 24) continue;
        if (lum(bg) > 0.35 || ratio(bg, ink) < 4.5) continue;
        pick = { c: bg, r: s.borderTopLeftRadius };
      }
      if (!pick) return;
      var page = behind(root.parentElement || document.body);
      if (ratio(pick.c, mix(pick.c, page, 0.08)) < ${BAR_TONE_MIN_CONTRAST}) return;
      root.style.setProperty('--pf-tone', pick.c.slice(0, 3).map(Math.round).join(' '));
      if (/^\\d+(\\.\\d+)?px$/.test(pick.r)) root.style.setProperty('--pf-tone-radius', pick.r);
      root.setAttribute('data-pf-tone', '');
    };
    apply();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', function(){ requestAnimationFrame(apply); });
    }
  };
`;

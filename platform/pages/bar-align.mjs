/**
 * Line the shop-rates and saved-bids bars up with the page's own heading.
 *
 * Both bars are injected into ~170 venture pages that each have their own
 * column: 1120 px on one, 980 px on another, a hero with 90 px of padding on a
 * third. The bars could only guess, so they centred themselves at 1060 px. On
 * 36 of 168 pages at 1280 px wide (measured 2026-11-12) that put the bar's
 * buttons 10 to 170 px to one side of the `h1` right next to them, which reads as
 * a mistake on the first screen: wall-framing-takeoff, the top flagship, and
 * 30 of the trade bid calculators among them.
 *
 * So, when the bar is revealed, it is laid across its container and padded in
 * to the heading's column: its left edge at the `h1`'s left edge, its right
 * edge the same distance from the page's right side (the columns here are
 * centred or full width; the `h1`'s own box is often a narrower text measure).
 * It is re-done on resize.
 * Since 2026-11-12 the bars sit just under the heading block rather than above
 * it (`toolHeadingEnd` in jobs.mjs), so the heading is above the bar on most
 * pages and below it on the few that keep the old place; either way it is the
 * column to line up with.
 * It leaves the bar as the stylesheet drew it when there is no heading, when the bar would have to stick out of its container, or when the
 * column left would be under MIN_WIDTH px (a heading squeezed beside a sidebar
 * is no column to align to).
 *
 * The bars ship hidden and hold their height invisibly until they are
 * revealed, so this runs before anyone sees them: only horizontal padding
 * changes, nothing moves vertically unless a line wraps differently.
 *
 * The source below is plain ES5 so it can be pasted into both bar scripts,
 * which are `stripForInjection`'d files at the site root.
 */
export const BAR_ALIGN_MIN_WIDTH = 240;

export const BAR_ALIGN_JS = `
  var pfAlignBar = function(root){
    var px = function(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; };
    var apply = function(){
      if (!root.isConnected) return;
      var s = root.style;
      s.maxWidth = ''; s.marginLeft = ''; s.marginRight = '';
      s.paddingLeft = ''; s.paddingRight = '';
      var h = document.querySelector('main h1') || document.querySelector('h1');
      if (!h || root.contains(h)) return;
      var hr = h.getBoundingClientRect();
      var br = root.getBoundingClientRect();
      if (!hr.width || !br.width) return;
      // The heading's own box is often a narrow text measure (a <header> 740 px
      // wide in a 1060 px page), so the right edge is the left one mirrored
      // about the page's centre: the columns here are centred, or full width.
      var right = document.documentElement.clientWidth - hr.left;
      var bs = getComputedStyle(root);
      var innerLeft = br.left + px(bs.paddingLeft) + px(bs.borderLeftWidth);
      var innerRight = br.right - px(bs.paddingRight) - px(bs.borderRightWidth);
      if (Math.abs(hr.left - innerLeft) < 2 && Math.abs(right - innerRight) < 2) return;
      s.maxWidth = 'none'; s.marginLeft = '0'; s.marginRight = '0';
      var full = root.getBoundingClientRect();
      var pl = Math.round(hr.left - full.left - px(bs.borderLeftWidth));
      var pr = Math.max(0, Math.round(full.right - right - px(bs.borderRightWidth)));
      if (pl < 0 || full.width - pl - pr < ${BAR_ALIGN_MIN_WIDTH}) {
        s.maxWidth = ''; s.marginLeft = ''; s.marginRight = '';
        return;
      }
      s.paddingLeft = pl + 'px'; s.paddingRight = pr + 'px';
    };
    apply();
    var frame = 0;
    window.addEventListener('resize', function(){
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function(){ frame = 0; apply(); });
    });
  };
`;

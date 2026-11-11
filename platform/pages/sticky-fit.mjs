/**
 * A sticky panel taller than the window gets its own scroll, so all of it can
 * be reached while it is stuck.
 *
 * Most calculators put their result in a `position:sticky; top:15px` card
 * beside a long form, so the headline number stays in view while you type.
 * Measured 2026-11-11 on a 1280x800 window: 193 sticky elements on 196 pages,
 * 131 taller than the window, and 122 of those with room to travel (the form
 * column is longer than the card). While such a card is stuck, everything below
 * the window's bottom edge (the copy-summary buttons, the hour split, the
 * notes) cannot be seen at any scroll position until the form ends, up to
 * 5,000 px later. Axe also reads past the card's edge there and reports a
 * 1.01:1 contrast false positive (polish-2026-11-11-index-contrast-dark-mode.md).
 *
 * The fix caps the card at the window's height (less its own `top` above and
 * the same gap below) and lets it scroll inside, the way a documentation
 * site's sticky table of contents does. The headline at the top stays where it
 * was; the rest is a wheel or a Tab away. Two alternatives were weighed and
 * not taken: sticking by the bottom edge instead (a negative `top`) hides the
 * headline number, which is the reason the card is sticky; and a script that
 * moves the card with every scroll event lags the compositor by a frame.
 *
 * Done in the shared script, not in each venture's CSS, because the card's
 * height depends on the window, the font and what the calculator wrote, and
 * because 149 pages spell the rule 40 different ways. It touches only a sticky
 * element that is taller than the window *and* has room to travel. A card that
 * sets its own row's height either cannot travel, or (with more grid rows
 * after it) would pull those rows up the page when capped; both are left
 * alone, the second by capping, measuring the parent and undoing it in the
 * same task. So the cap itself never shifts content (no layout shift on load).
 *
 * Candidates come from the page's stylesheet rules (`position: sticky`) and
 * `style` attributes, never from asking every element, the expensive part the
 * scroll-box sweep already learned (polish-2026-11-11-scroll-sweep.md). The
 * check runs after the paint, on resize, and after input, where a recalculation
 * may have grown the card.
 */
export const STICKY_FIT_JS = `
(function(){
  var MARK='data-pf-sticky-fit';
  var els=null;
  var find=function(){
    var out=[],ok=true;
    var walk=function(rules){
      for(var i=0;i<rules.length;i++){
        var r=rules[i];
        if(r.styleSheet){walk(r.styleSheet.cssRules);continue;}
        if(r.style&&r.selectorText&&/sticky/.test(r.style.position))out.push(r.selectorText);
        if(r.cssRules)walk(r.cssRules);
      }
    };
    var sheets=document.styleSheets||[];
    for(var s=0;s<sheets.length;s++){
      try{walk(sheets[s].cssRules);}catch(e){}
    }
    out.push('[style*="sticky"]');
    try{return document.body.querySelectorAll(out.join(','));}catch(e){
      try{return document.body.querySelectorAll('[style*="sticky"]');}catch(e2){return [];}
    }
  };
  var focusable='a[href],button,input,select,textarea,[tabindex]';
  var STYLE=['maxHeight','overflowY','scrollbarWidth','scrollbarColor'];
  var printing=false;
  var moved=typeof WeakMap==='function'?new WeakMap():{get:function(){},set:function(){}};
  var release=function(el){
    el.removeAttribute(MARK);
    for(var k=0;k<STYLE.length;k++)el.style[STYLE[k]]='';
    if(el.hasAttribute(MARK+'-tab')){el.removeAttribute('tabindex');el.removeAttribute(MARK+'-tab');}
  };
  var fit=function(){
    if(printing)return;
    if(!els)els=find();
    var vh=innerHeight;
    for(var i=0;i<els.length;i++){
      var el=els[i],cs=getComputedStyle(el);
      var on=el.hasAttribute(MARK);
      var top=parseFloat(cs.top);
      var want=false,avail=0,par=el.parentElement,before=0;
      if(cs.position==='sticky'&&cs.top!=='auto'&&cs.bottom==='auto'&&top>=0&&el.parentElement){
        // The same gap below the card as its own top leaves above it.
        avail=Math.floor(vh-2*top);
        var ps=getComputedStyle(par);
        before=par.getBoundingClientRect().height;
        var room=before-parseFloat(ps.paddingTop)-parseFloat(ps.paddingBottom);
        // Taller than the window, and its column is longer than it is: there
        // is travel, so part of it is out of reach while it is stuck. A card
        // that sets its own row's height has no travel and is left alone.
        want=avail>120&&el.scrollHeight>avail+1&&room>el.getBoundingClientRect().height+1;
        // Already tried at this height and it moved the page: see below.
        if(want&&!on&&moved.get(el)===el.scrollHeight)want=false;
      }
      if(want){
        if(!on){
          el.setAttribute(MARK,'');
          el.style.overflowY='auto';
          el.style.scrollbarWidth='thin';
          // The thumb in the card's own ink, so a dark card does not get a
          // light system scrollbar. Ignored where color-mix is unknown.
          el.style.scrollbarColor='color-mix(in srgb,currentcolor 45%,transparent) transparent';
          // A box that scrolls must take the keyboard; one with a button or
          // link in it already does (Tab scrolls it into view).
          if(!el.hasAttribute('tabindex')&&!el.querySelector(focusable)){el.setAttribute('tabindex','0');el.setAttribute(MARK+'-tab','');}
        }
        // max-height sizes the content box unless the card says border-box,
        // and the cards' padding (20 px on most) would push the edge out again.
        var pad=cs.boxSizing==='border-box'?0:parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)+parseFloat(cs.borderTopWidth)+parseFloat(cs.borderBottomWidth);
        el.style.maxHeight=Math.max(0,avail-pad)+'px';
        // A card can have travel and still set its own grid row's height,
        // with more rows after it (kitchen-tile-backsplash: the proposal
        // sections). Capping that card shrinks the row and pulls everything
        // below it up the page, a layout shift. Checked in the same task, so
        // nothing is painted in between, and undone; the card is left as it
        // was until its content changes height.
        if(!on&&par.getBoundingClientRect().height<before-1){release(el);moved.set(el,el.scrollHeight);}
      }else if(on)release(el);
    }
  };
  // A printed page has no window to fit and must not cut the card off.
  addEventListener('beforeprint',function(){printing=true;if(els)for(var i=0;i<els.length;i++)if(els[i].hasAttribute(MARK))release(els[i]);});
  addEventListener('afterprint',function(){printing=false;later();});
  var queued=false;
  var later=function(){
    if(queued)return;
    queued=true;
    var run=function(){queued=false;try{fit();}catch(e){}};
    var next=function(){setTimeout(run,0);};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(next);else next();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',later);
  else later();
  addEventListener('load',later);
  addEventListener('resize',later);
  addEventListener('input',later);
  addEventListener('change',later);
  addEventListener('click',later);
})();
`;

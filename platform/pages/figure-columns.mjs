// Figure columns in the tool pages' own tables: right-aligned, tabular digits.
//
// Polish, 2026-11-21. The blog's Markdown tables got this at build time on
// 2026-11-20 (`platform/devlog/markdown.mjs`, `numericColumns`), and the
// report for that run left the rest as its first "Still weakest" item: the
// venture pages' tables are hand-written or, more often, written by the
// calculator into its result panel from a string, so no build pass sees them
// with their figures in. Left-aligned, a column of amounts ends at a different
// x on every row and "$1,240.00" sits under "$95.00" by its first digit, so a
// reader cannot compare place values down the column, which is the reason the
// table exists. Measured before and after over the built site:
// docs/reports/polish-2026-11-21-figure-columns.md.
//
// The browser half runs in pf-site.js (SCROLL_A11Y_SCRIPT calls it on each
// width check, so a table a calculator rewrote is re-read). The test for a
// column is the blog's, so a figure reads the same on a post and on a tool:
// a column after the first (the row names) whose every non-blank body cell is
// one figure. Stricter here in two ways, because a venture table is the
// venture's own design:
//
// - A column holding a form control (an editable rate, a checkbox) is never
//   marked: its "blank" cells are inputs, not dashes.
// - Only while the rows lay out as table rows. A venture that turns its rows
//   into cards on a phone (display:block rows or cells) has its own layout
//   there; the marks come off, and go back on when a resize makes it a table
//   again. The <table> element's own display is not asked: several ventures
//   set it to block to make it scroll, and its rows still form columns.
//
// A venture's rule that names its cells by class (`.results td{text-align:
// left}`) still wins: the attribute selector below is one attribute, so it
// beats a bare `td`/`th` reset but not a deliberate class rule.

import { NUMERIC_CELL } from '../devlog/markdown.mjs';

export const FIGURE_ATTR = 'data-pf-num';

export const FIGURE_COLUMNS_CSS = `
/* Figure columns (figure-columns.mjs): right-aligned so place values line up,
   tabular digits so every row's figure is the same width. */
td[${FIGURE_ATTR}],th[${FIGURE_ATTR}]{text-align:right;font-variant-numeric:tabular-nums}
`;

/**
 * Browser source: defines `figs(table)`, which sets or clears FIGURE_ATTR on
 * the table's cells. Plain ES5 so it can sit inside pf-site.js's IIFE.
 * Remembers what it last read on the table (row count and text length), so the
 * check that runs on every keystroke does no per-cell work on a table that did
 * not change.
 */
export const FIGURE_COLUMNS_JS = `
  var FIG=${NUMERIC_CELL.toString()};
  var FIG_BLANK=/^(|\\u2014|\\u2013|-|n\\/a|N\\/A)$/;
  var figKey=function(t,on){return (on?'1':'0')+':'+t.rows.length+':'+t.textContent.length;};
  var figs=function(t){
    if(!t||!t.rows)return;
    var rows=[],head=[],i,j,r,c;
    var last=t.rows.length?t.rows[t.rows.length-1]:null;
    var on=!!last&&getComputedStyle(last).display==='table-row'&&!!last.cells[0]&&getComputedStyle(last.cells[0]).display==='table-cell';
    var key=figKey(t,on);
    if(t._pfFig===key)return;
    t._pfFig=key;
    var marked=t.querySelectorAll?t.querySelectorAll('[${FIGURE_ATTR}]'):[];
    for(i=0;i<marked.length;i++)marked[i].removeAttribute('${FIGURE_ATTR}');
    if(!on)return;
    for(i=0;i<t.rows.length;i++){
      r=t.rows[i];
      var cs=r.cells,allTh=cs.length>0,span=false;
      for(j=0;j<cs.length;j++){if(cs[j].tagName!=='TH')allTh=false;if(cs[j].colSpan>1)span=true;if(cs[j].rowSpan>1)return;}
      if(span)continue;
      var inHead=r.parentNode&&r.parentNode.tagName==='THEAD';
      if(inHead||allTh)head.push(r);else rows.push(r);
    }
    if(rows.length<2)return;
    var cols=0;
    for(i=0;i<rows.length;i++)if(rows[i].cells.length>cols)cols=rows[i].cells.length;
    for(j=1;j<cols;j++){
      var n=0,ok=true;
      for(i=0;i<rows.length&&ok;i++){
        c=rows[i].cells[j];
        if(!c)continue;
        if(c.querySelector&&c.querySelector('input,select,textarea,button'))ok=false;
        var v=(c.textContent||'').replace(/\\s+/g,' ').trim();
        if(FIG_BLANK.test(v))continue;
        if(FIG.test(v))n++;else ok=false;
      }
      if(!ok||!n)continue;
      for(i=0;i<rows.length;i++)if(rows[i].cells[j])rows[i].cells[j].setAttribute('${FIGURE_ATTR}','');
      for(i=0;i<head.length;i++)if(head[i].cells.length===cols&&head[i].cells[j])head[i].cells[j].setAttribute('${FIGURE_ATTR}','');
    }
    t._pfFig=figKey(t,on);
  };
`;

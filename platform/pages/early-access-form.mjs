/**
 * The early-access form for a paid product that is not open yet.
 *
 * It posts to the edge Worker's `POST /early-access` (`platform/edge/early-access.mjs`),
 * which keeps the address privately in D1: never in the repository, only a
 * per-product count is public. Without the Worker's origin (a local build with
 * no `platform/edge/site.json` url) it falls back to a mailto link to the
 * agent-managed inbox, which is also private. Either way nothing a visitor
 * sends here is published, unlike the site's feedback form.
 *
 * The consent wording comes from `early-access-consent.mjs`, which the Worker
 * imports too, so what is stored (`CONSENT_VERSION`) is what was shown.
 *
 * Pure: returns HTML (with its inline script and styles) for a page to place.
 */
import { CONSENT_TEXT, EARLY_ACCESS_PRODUCTS } from './early-access-consent.mjs';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const EARLY_ACCESS_CSS = `
.ea-form{background:var(--ea-panel,#f6f8fa);border:1px solid var(--ea-line,#d0d7de);border-radius:8px;padding:14px 16px;max-width:36em;margin:12px 0}
.ea-form label{display:block;font-weight:600;margin:.6em 0 .2em}
.ea-form .ea-opt{font-weight:400;color:var(--ea-muted,#57606a)}
.ea-form input[type=email],.ea-form input[type=text],.ea-form select,.ea-form textarea{box-sizing:border-box;width:100%;max-width:100%;font:inherit;padding:8px 10px;border:1px solid var(--ea-line,#d0d7de);border-radius:6px;background:inherit;color:inherit}
.ea-form textarea{min-height:4.5em}
.ea-form .ea-consent{display:flex;gap:.5em;align-items:flex-start;font-weight:400;margin-top:.8em}
.ea-form .ea-consent input{margin-top:.25em;flex:none}
.ea-form button{margin-top:.8em;font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:6px;background:var(--ea-accent,#0969da);color:#fff;cursor:pointer}
.ea-form button[disabled]{opacity:.6;cursor:default}
.ea-form .ea-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.ea-form .ea-status{min-height:1.4em;margin:.5em 0 0}
.ea-form .ea-small{color:var(--ea-muted,#57606a);font-size:.9rem;margin:.6em 0 0}
`;

/**
 * `choices`: [[productKey, label]], productKey from EARLY_ACCESS_PRODUCTS.
 * `edgeUrl`: the Worker's origin, or '' for the mailto fallback.
 * `mailto`: the fallback href. `privacyHref`: the site's privacy page.
 */
export function renderEarlyAccessForm({ edgeUrl = '', choices = [], mailto, privacyHref, id = 'ea' }) {
  const known = choices.filter(([key]) => Object.hasOwn(EARLY_ACCESS_PRODUCTS, key));
  if (!known.length) throw new Error('renderEarlyAccessForm: no known product');
  const fallback = `<p class="ic-cta"><a href="${esc(mailto)}">Ask for early access by email</a></p>`;
  if (!edgeUrl) return fallback;
  const pick = known.length === 1
    ? `<input type="hidden" name="product" value="${esc(known[0][0])}">`
    : `<label for="${id}-product">Which product</label>
      <select id="${id}-product" name="product">${known.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('')}</select>`;
  const endpoint = `${edgeUrl.replace(/\/+$/, '')}/early-access`;
  return `<form class="ea-form" id="${id}" data-funnel="early-access-form" novalidate>
      ${pick}
      <label for="${id}-email">Work email</label>
      <input id="${id}-email" name="email" type="email" autocomplete="email" required maxlength="254">
      <label for="${id}-role">Your trade and company size <span class="ea-opt">(optional)</span></label>
      <input id="${id}-role" name="role" type="text" maxlength="80" placeholder="e.g. electrical sub, 15 people">
      <label for="${id}-note">How do you bill or estimate today? <span class="ea-opt">(optional)</span></label>
      <textarea id="${id}-note" name="note" maxlength="1000" placeholder="e.g. Excel G702/G703, 8 GCs, two use Procore"></textarea>
      <div class="ea-hp" aria-hidden="true"><label for="${id}-website">Leave this empty</label><input id="${id}-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <label class="ea-consent"><input type="checkbox" name="consent" required> <span>${esc(CONSENT_TEXT)}</span></label>
      <button type="submit">Ask for early access</button>
      <p class="ea-status" role="status" aria-live="polite"></p>
      <p class="ea-small">Kept privately, not published; only the number of sign-ups per product is public. <a href="${esc(privacyHref)}">Privacy</a>. No script? <a href="${esc(mailto)}">Email us instead</a>.</p>
    </form>
    <noscript>${fallback}</noscript>
    <script>
(function(){
  var f=document.getElementById(${JSON.stringify(id)});if(!f||!window.fetch)return;
  var st=f.querySelector('.ea-status'),btn=f.querySelector('button');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var email=f.email.value.trim();
    if(!/^[^\\s@<>]+@[^\\s@<>]+\\.[A-Za-z]{2,}$/.test(email)){st.textContent='Please enter your email address.';f.email.focus();return;}
    if(!f.consent.checked){st.textContent='Please tick the box so we may email you once.';f.consent.focus();return;}
    var body={product:f.product.value,email:email,role:f.role.value,note:f.note.value,consent:true,page:location.pathname,website:f.website.value};
    btn.disabled=true;st.textContent='Sending...';
    fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){
        if(r.ok){f.reset();st.textContent='Thank you. We will email you once, when it opens.';}
        else if(r.status===429){st.textContent='Too many sign-ups right now. Please try again later, or email us.';}
        else{st.textContent='That did not go through. Please check the address, or email us instead.';}
      })
      .catch(function(){st.textContent='That did not go through. Please check your connection, or email us instead.';})
      .then(function(){btn.disabled=false;});
  });
})();
    </script>`;
}

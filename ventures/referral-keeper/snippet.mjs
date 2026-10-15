// The browser snippet the merchant adds to their own site (served at /rk.js).
// It remembers ?ref=<code> in a first-party cookie, then tags Stripe Payment Links
// and pricing tables with it so the webhook can attribute the sale.
// Written as a string so the server can serve it and tests can run it in a vm.
export function snippetSource({ cookieDays = 60 } = {}) {
  const days = Math.max(1, Math.min(365, Math.round(Number(cookieDays)) || 60));
  return `(function () {
  var CODE = /^[a-z0-9][a-z0-9_-]{2,23}$/, NAME = "rk_ref", DAYS = ${days};
  function read() {
    var m = document.cookie.match(/(?:^|; )rk_ref=([^;]*)/);
    var v = m ? decodeURIComponent(m[1]).toLowerCase() : "";
    return CODE.test(v) ? v : "";
  }
  try {
    var q = new URLSearchParams(location.search).get("ref");
    q = q ? q.toLowerCase() : "";
    // First touch wins: an existing referral is not overwritten by a later link.
    if (CODE.test(q) && !read()) {
      document.cookie = NAME + "=" + encodeURIComponent(q) + "; max-age=" + DAYS * 86400 + "; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    }
  } catch (e) {}
  function tag() {
    var code = read();
    if (!code) return;
    var links = document.querySelectorAll('a[href^="https://buy.stripe.com/"]');
    for (var i = 0; i < links.length; i++) {
      try {
        var u = new URL(links[i].href);
        if (!u.searchParams.has("client_reference_id")) { u.searchParams.set("client_reference_id", "rk_" + code); links[i].href = u.toString(); }
      } catch (e) {}
    }
    var tables = document.querySelectorAll("stripe-pricing-table, stripe-buy-button");
    for (var j = 0; j < tables.length; j++) {
      if (!tables[j].getAttribute("client-reference-id")) tables[j].setAttribute("client-reference-id", "rk_" + code);
    }
  }
  window.referralCode = read;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tag); else tag();
  setTimeout(tag, 1500);
})();
`;
}

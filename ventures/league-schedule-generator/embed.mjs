// The league on the club's own website: a read-only page made to sit in an <iframe> on Wix, Squarespace,
// WordPress, Google Sites or a hand-made site, showing the next games, the latest results and the table,
// always current because it is served by the organiser's own league server.
//
// Why a separate key: the player link (LEAGUE_TOKEN) lets anyone holding it send scores, availability,
// sub offers and waiver signatures. A website's page source is public, so the embed must carry a key
// that can only read. embedKey() derives it from ADMIN_KEY (an HMAC, like the captain keys), so there is
// nothing new to configure, and changing ADMIN_KEY retires every pasted embed at once.
import { createHmac, timingSafeEqual } from "node:crypto";
import { dayLabel } from "./calc.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const EMBED_SHOWS = ["next", "results", "table", "season"];
export const DEFAULT_SHOW = ["next", "results", "table"];
export const MAX_NIGHTS = 20;
export const MAX_RESULTS = 20;

/** The read-only embed key for this server: 22 base64url characters, stable while ADMIN_KEY is. */
export function embedKey(secret) {
  return createHmac("sha256", String(secret)).update("embed\nread-only").digest("base64url").slice(0, 22);
}

/** Constant-time check of a key from a URL against this server's embed key. */
export function embedKeyOk(secret, key) {
  const a = Buffer.from(String(key ?? "")), b = Buffer.from(embedKey(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * What a URL asks the embed to show, cleaned. Anything unknown falls back to a default rather than an
 * error, because a club webmaster editing a pasted snippet should still see a working widget.
 *   show=next,results,table,season  (which sections, in that order; default next,results,table)
 *   team=N or team=Name              (one team's games and results only; the table stays whole)
 *   nights=N                         (match days in "Next games", 1-20, default 3)
 *   results=N                        (latest results shown, 0-20, default 5)
 *   theme=light|dark|auto            (default auto: follows the visitor's setting)
 *   accent=hex                       (3 or 6 hex digits, no #; the heading rule and links)
 *   title=text                       (a heading over the widget, at most 80 characters; default none)
 */
export function parseEmbedOptions(params, teams = []) {
  const get = (k) => (params && typeof params.get === "function" ? params.get(k) : params?.[k]) ?? null;
  const int = (v, lo, hi, d) => { const n = Number(v); return v !== null && v !== "" && Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const want = String(get("show") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => EMBED_SHOWS.includes(s));
  const show = want.length ? [...new Set(want)] : DEFAULT_SHOW.slice();
  let team = null;
  const rawTeam = get("team");
  if (rawTeam !== null && rawTeam !== "") {
    const n = Number(rawTeam);
    if (/^\d+$/.test(rawTeam) && n < teams.length) team = n;
    else {
      const i = teams.findIndex((t) => t.trim().toLowerCase() === String(rawTeam).trim().toLowerCase());
      if (i >= 0) team = i;
    }
  }
  const th = String(get("theme") ?? "").toLowerCase();
  const theme = th === "light" || th === "dark" ? th : "auto";
  const ac = String(get("accent") ?? "").replace(/^#/, "");
  const accent = /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(ac) ? `#${ac.toLowerCase()}` : null;
  const title = String(get("title") ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return { show, team, nights: int(get("nights"), 1, MAX_NIGHTS, 3), results: int(get("results"), 0, MAX_RESULTS, 5), theme, accent, title };
}

/** Games on the next `nights` match days from `today` on (day numbers as calc.mjs counts them), optionally one team's. */
export function nextGames(schedule, today, nights, team = null) {
  const out = [];
  for (const r of schedule.rounds) {
    if (r.day < today) continue;
    const matches = r.matches.filter((m) => team === null || m.home === team || m.away === team);
    const bye = r.bye !== null && r.bye !== undefined && (team === null || r.bye === team) ? r.bye : null;
    if (matches.length || bye !== null) out.push({ day: r.day, label: r.label, matches, bye });
  }
  out.sort((a, b) => a.day - b.day);
  // Several rounds can share one date (doubleheaders): count match days, not rounds.
  const days = [...new Set(out.map((r) => r.day))].slice(0, nights);
  return out.filter((r) => days.includes(r.day));
}

/** The latest results, newest first: results are typed in the order played, so the last lines are the newest. */
export function latestResults(results, n, team = null) {
  // slice(-0) would be the whole list, so 0 is handled first.
  if (!(n > 0)) return [];
  return results.filter((r) => team === null || r.a === team || r.b === team).slice(-n).reverse();
}

function gamesTable(rounds, teams, team) {
  if (!rounds.length) return `<p class="lsg-muted">No more games scheduled.</p>`;
  return rounds.map((r) => {
    const rows = r.matches.map((m) => {
      const mine = (i) => (team === i ? ` class="lsg-mine"` : "");
      return `<tr><td class="lsg-n">${esc(m.time)}</td><td${mine(m.home)}>${esc(m.homeName ?? teams[m.home])}</td><td class="lsg-v">v</td><td${mine(m.away)}>${esc(m.awayName ?? teams[m.away])}</td><td class="lsg-n lsg-muted">${esc(m.court)}</td></tr>`;
    });
    if (r.bye !== null) rows.push(`<tr><td colspan="5" class="lsg-muted">Bye: ${esc(teams[r.bye])}</td></tr>`);
    return `<h3>${esc(dayLabel(r.day))} <span class="lsg-muted">${esc(r.label)}</span></h3><table>${rows.join("")}</table>`;
  }).join("");
}

function resultsTable(list, teams, team) {
  if (!list.length) return `<p class="lsg-muted">No results yet.</p>`;
  const b = (cond, s) => (cond ? `<strong>${s}</strong>` : s);
  return `<table>${list.map((r) => `<tr><td${team === r.a ? ` class="lsg-mine"` : ""}>${b(r.ga > r.gb, esc(teams[r.a]))}</td><td class="lsg-s">${r.ga} - ${r.gb}${r.walkover ? " <abbr title=\"walkover or forfeit\">w/o</abbr>" : ""}</td><td${team === r.b ? ` class="lsg-mine"` : ""}>${b(r.gb > r.ga, esc(teams[r.b]))}</td></tr>`).join("")}</table>`;
}

function standingsTable(table, team) {
  if (!table) return `<p class="lsg-muted">The table starts with the first result.</p>`;
  return `<table class="lsg-tbl"><thead><tr><th>#</th><th>Team</th><th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th><th title="Difference">+/-</th><th title="Points">Pts</th></tr></thead><tbody>${table.map((r) => `<tr${team === r.index ? ` class="lsg-mine"` : ""}><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><strong>${r.points}</strong></td></tr>`).join("")}</tbody></table>`;
}

const CSS_VARS = {
  light: "--lsg-bg:#fff;--lsg-fg:#1a1a1a;--lsg-muted:#5f6368;--lsg-line:#e3e3e3;--lsg-mine:#fff6d6",
  dark: "--lsg-bg:#15171a;--lsg-fg:#ececec;--lsg-muted:#a5a9ad;--lsg-line:#2e3236;--lsg-mine:#3a3320",
};

/**
 * The embed page. `out` is buildLeague()'s answer, `results` parseResults()'s list, `today` a day number.
 * `base` (the server's public address, or null) only feeds the "full schedule" link, which carries no secret.
 * The page reports its height to the parent window so the snippet's iframe can fit it with no scrollbar.
 */
export function embedHtml(out, results, opts, today) {
  const { show, team, nights, theme, accent, title } = opts;
  const teams = out.schedule.teams;
  const name = team === null ? "" : ` for ${teams[team]}`;
  const sections = show.map((s) => {
    if (s === "next") return `<section><h2>Next games${esc(name)}</h2>${gamesTable(nextGames(out.schedule, today, nights, team), teams, team)}</section>`;
    if (s === "results") return opts.results ? `<section><h2>Latest results${esc(name)}</h2>${resultsTable(latestResults(results, opts.results, team), teams, team)}</section>` : "";
    if (s === "table") return `<section><h2>Standings</h2>${standingsTable(out.table, team)}</section>`;
    return `<section><h2>Season${esc(name)}</h2>${gamesTable(nextGames(out.schedule, -Infinity, Infinity, team), teams, team)}</section>`;
  }).join("");
  const vars = theme === "auto" ? `:root{${CSS_VARS.light}}@media(prefers-color-scheme:dark){:root{${CSS_VARS.dark}}}` : `:root{${CSS_VARS[theme]}}`;
  const css = `${vars}:root{--lsg-accent:${accent || "#1f6feb"}}*{box-sizing:border-box}html,body{margin:0;background:var(--lsg-bg);color:var(--lsg-fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}main{padding:.5rem .75rem}h1{font-size:1.15rem;margin:.25rem 0 .5rem}h2{font-size:1rem;margin:.9rem 0 .35rem;padding-bottom:.2rem;border-bottom:2px solid var(--lsg-accent)}h3{font-size:.9rem;margin:.6rem 0 .2rem}table{border-collapse:collapse;width:100%}td,th{padding:.25rem .4rem;border-bottom:1px solid var(--lsg-line);text-align:left;vertical-align:top}th{font-weight:600;font-size:.85rem}.lsg-tbl td:nth-child(n+3),.lsg-tbl th:nth-child(n+3){text-align:right}.lsg-n{white-space:nowrap;width:1%}.lsg-v{color:var(--lsg-muted);width:1%}.lsg-s{white-space:nowrap;text-align:center;width:1%}.lsg-muted{color:var(--lsg-muted);font-weight:400}.lsg-mine{background:var(--lsg-mine)}a{color:var(--lsg-accent)}footer{font-size:.75rem;color:var(--lsg-muted);margin:.75rem 0 .25rem}`;
  const height = `<script>(function(){function s(){try{parent.postMessage({lsgEmbedHeight:Math.ceil(document.body.getBoundingClientRect().height)},"*")}catch(e){}}addEventListener("load",s);addEventListener("resize",s);s()})();</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title || "League schedule")}</title><style>${css}</style></head><body><main>${title ? `<h1>${esc(title)}</h1>` : ""}${sections}<footer>Dates can change: check with your organiser. Schedule by <a href="https://marisstella.app/league-schedule-generator/" target="_blank" rel="noopener">League Schedule Generator</a>.</footer></main>${height}</body></html>`;
}

/** Headers for the embed: framable by any site, nothing loaded from elsewhere, cached a minute. */
export const EMBED_HEADERS = {
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *",
  "cache-control": "public, max-age=60",
};

/**
 * The snippet a club webmaster pastes into their site builder's "Embed code" or "Custom HTML" block:
 * an iframe, plus four lines of script that grow it to fit (without the script it stays 600px tall and
 * scrolls, which still works on builders that strip scripts).
 */
export function embedSnippet(base, key, query = "") {
  const src = `${base || ""}/embed?k=${encodeURIComponent(key)}${query ? "&" + query : ""}`;
  return `<iframe src="${esc(src)}" title="League schedule" loading="lazy" style="width:100%;height:600px;border:0" data-lsg-embed></iframe>
<script>addEventListener("message",function(e){var h=e.data&&e.data.lsgEmbedHeight;if(!h)return;document.querySelectorAll("iframe[data-lsg-embed]").forEach(function(f){if(f.contentWindow===e.source)f.style.height=Math.min(h+4,6000)+"px"})});</script>`;
}

/** The admin page's "On your club's website" section: the whole-league snippet, one per team, and the options. */
export function adminEmbedHtml(secret, base, teams) {
  const key = embedKey(secret);
  const box = (label, q) => `<label>${esc(label)}<textarea readonly onfocus="this.select()" style="min-height:5rem;font-size:.8rem">${esc(embedSnippet(base, key, q))}</textarea></label>`;
  const perTeam = teams.map((t, i) => box(t, `team=${i}&show=next,results,table`)).join("");
  const preview = `${base || ""}/embed?k=${encodeURIComponent(key)}`;
  return `<details><summary>On your club's website (embed code)</summary>
<p class="note">Paste this into your site builder's embed block (Wix: Embed code; Squarespace: Code block; WordPress: Custom HTML; Google Sites: Embed). It shows the next games, the latest results and the table, and updates by itself when you post a result or move a game (within a minute). It can only read: unlike the player link, nobody can send a score or sign anything from it, so it is safe in public page source. Changing ADMIN_KEY retires every pasted copy. <a href="${esc(preview)}">Preview</a>.${base ? "" : " Set PUBLIC_URL on the server so the snippet carries your full address."}</p>
${box("Whole league", "")}
<details><summary>One team's page (for a team's own site)</summary>${perTeam}</details>
<p class="note">Options you can add to the address after <code>k=...</code>: <code>&amp;show=next,results,table,season</code> (sections, in order), <code>&amp;nights=3</code> (match days ahead, up to ${MAX_NIGHTS}), <code>&amp;results=5</code> (up to ${MAX_RESULTS}, 0 for none), <code>&amp;theme=light</code> or <code>dark</code>, <code>&amp;accent=c8102e</code> (your club colour, hex), <code>&amp;title=Spring%20League</code>.</p></details>`;
}

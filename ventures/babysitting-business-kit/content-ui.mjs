// The "Posts & blog" tab: the topic bank with captions per channel, the sitter's blog
// posts (draft, review, approve, publish), optional AI drafting on the sitter's own key,
// and a download of the website with its blog. DOM code only; the logic is content.mjs.
import * as C from "./content.mjs";
import { isLocal } from "./byok.mjs";

const AI_STORE = "babysitting-business-kit-ai";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PROVIDERS = [["", "Off (template drafts only)"], ["anthropic", "Anthropic (Claude)"], ["openai", "OpenAI"], ["openai-compatible", "Any OpenAI-compatible endpoint"], ["ollama", "Ollama on this computer (no key)"], ["lmstudio", "LM Studio on this computer (no key)"]];
const MONTHS = ["Any month", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function loadAI() { try { return JSON.parse(localStorage.getItem(AI_STORE) || "{}") || {}; } catch { return {}; } }
function saveAI(cfg) { try { localStorage.setItem(AI_STORE, JSON.stringify(cfg)); } catch { /* blocked storage: settings last this visit */ } }
const aiConfig = (s) => (s.provider ? { provider: s.provider, apiKey: s.apiKey || null, model: s.model || null, baseUrl: s.baseUrl || null, browser: true } : null);

/**
 * mountContent(root, { getDesk, save, record, today, buildSite })
 * `save` stores the desk; `buildSite(desk)` gives the website's index.html for the download.
 */
export function mountContent(root, { getDesk, save, record = () => {}, today, buildSite }) {
  let editing = null;
  let ai = loadAI();
  const commit = () => { save(); render(); };

  root.innerHTML = `
    <p class="note">Post ideas for parents, each with an outline, the phrase people search for locally, and a caption sized for each channel. Faith topics appear only when "Show a faith section" is on in Settings. Every draft keeps <code>${esc(C.PLACEHOLDER)}</code>: replace it with something that really happened, with no child's name or photo unless the parents said yes.</p>
    <div class="grid">
      <div><label for="ck_cat">Topic type</label><select id="ck_cat"></select></div>
      <div><label for="ck_month">Season</label><select id="ck_month"></select></div>
    </div>
    <div id="ck_topics"></div>
    <h3>Your blog</h3>
    <p class="note">Posts you approve appear on your website's blog: at <code>/site/blog</code> if you run the server, and in the download below. Drafts stay private.</p>
    <p><button type="button" id="ck_new">New blank post</button><button type="button" class="secondary" id="ck_zip">Download website + blog (.zip)</button></p>
    <div id="ck_posts"></div>
    <div id="ck_editor"></div>
    <details id="ck_aibox"><summary><strong>Optional: AI drafting with your own key</strong></summary>
      <p class="note">Off unless you set it. Your key is kept in this browser only and is sent only to the provider you pick; nothing about your families is ever sent, only your public profile and the topic. A model on your own computer (Ollama, LM Studio) needs no key and nothing leaves the machine. AI drafts are a start: you must replace the placeholder and approve before anything is published.</p>
      <div class="grid">
        <div><label for="ck_provider">Provider</label><select id="ck_provider">${PROVIDERS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></div>
        <div><label for="ck_model">Model</label><input id="ck_model" placeholder="claude-opus-5-5, llama3.2, ..."></div>
        <div><label for="ck_key">API key</label><input id="ck_key" type="password" autocomplete="off"></div>
        <div><label for="ck_base">Endpoint (optional)</label><input id="ck_base" placeholder="https://.../v1"></div>
      </div>
      <p><button type="button" id="ck_aisave">Save AI settings</button> <span id="ck_aiout" class="note" aria-live="polite"></span></p>
    </details>`;
  const $ = (id) => root.querySelector(`#${id}`);
  $("ck_cat").innerHTML = [`<option value="">All</option>`, ...C.CATEGORIES.map((c) => `<option>${esc(c)}</option>`)].join("");
  $("ck_month").innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  $("ck_month").value = String(Number(today().slice(5, 7)));
  $("ck_provider").value = ai.provider || ""; $("ck_model").value = ai.model || ""; $("ck_key").value = ai.apiKey || ""; $("ck_base").value = ai.baseUrl || "";

  function renderTopics() {
    const desk = getDesk();
    const list = C.topicBank(desk.profile, { category: $("ck_cat").value || undefined, month: Number($("ck_month").value) || undefined });
    $("ck_topics").innerHTML = `<p class="note">${list.length} topic(s).</p>` + list.map((t) => {
      const caps = C.captions(t, desk.profile);
      return `<details class="card" style="margin:8px 0"><summary><strong>${esc(t.title)}</strong> <span class="pill cool">${esc(t.cat)}</span>${t.months.length ? ` <span class="note">${t.months.map((m) => MONTHS[m].slice(0, 3)).join(", ")}</span>` : ""}</summary>
        <p class="note">Search phrase: <strong>${esc(C.localKeyword(t, desk.profile))}</strong></p>
        <ul>${t.outline.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
        ${C.CHANNEL_IDS.map((ch) => `<h4 style="margin:10px 0 2px">${esc(C.CHANNELS[ch].name)} <span class="note">(${caps[ch].length}/${C.CHANNELS[ch].target} characters)</span></h4><div class="msg">${esc(caps[ch])}</div><button type="button" class="secondary small" data-copy="${esc(caps[ch])}">Copy</button>`).join("")}
        <p><button type="button" data-ck-start="${t.id}">Start a blog post</button>${ai.provider ? `<button type="button" class="secondary" data-ck-ai="${t.id}">Draft with AI</button>` : ""}</p>
      </details>`;
    }).join("");
  }

  function renderPosts() {
    const desk = getDesk();
    const posts = (desk.posts || []).slice().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    $("ck_posts").innerHTML = posts.length ? `<table><thead><tr><th>Post</th><th>Status</th><th></th></tr></thead><tbody>${posts.map((p) => `<tr><td><strong>${esc(p.title)}</strong><br><span class="note">/blog/${esc(p.slug)} · ${esc(p.source)}${p.source === "model" ? " draft" : ""}</span></td><td>${p.status === "published" ? `<span class="pill good">published ${esc(p.published)}</span>` : `<span class="pill warm">draft</span>`}</td><td><button type="button" class="secondary small" data-ck-edit="${p.id}">Edit</button><button type="button" class="secondary small" data-ck-del="${p.id}">Delete</button></td></tr>`).join("")}</tbody></table>` : `<p class="note">No posts yet. Open a topic above and start one, or write your own.</p>`;
  }

  function renderEditor(msg = "") {
    const desk = getDesk();
    const p = editing && (desk.posts || []).find((x) => x.id === editing);
    if (!p) { $("ck_editor").innerHTML = msg ? `<p class="note">${esc(msg)}</p>` : ""; return; }
    const issues = C.reviewPost(desk, p);
    $("ck_editor").innerHTML = `<div class="card"><h3 style="margin-top:0">Editing: ${esc(p.title)}</h3>
      <label for="ck_title">Title</label><input id="ck_title" value="${esc(p.title)}">
      <label for="ck_desc">Search description (about 160 characters)</label><input id="ck_desc" value="${esc(p.description)}">
      <label for="ck_body">Post (## for a heading, - for a list)</label><textarea id="ck_body" rows="14">${esc(p.body)}</textarea>
      <p><button type="button" id="ck_save">Save draft</button></p>
      ${issues.length ? `<ul>${issues.map((i) => `<li class="${i.blocking ? "" : "note"}">${i.blocking ? "<strong>Before publishing:</strong> " : ""}${esc(i.text)}</li>`).join("")}</ul>` : `<p class="note">Nothing flagged. Read it once more as a parent would.</p>`}
      <label><input type="checkbox" id="ck_names"> The parents agreed, in writing, to any child's name in this post</label>
      <p>${p.status === "published" ? `<button type="button" class="secondary" id="ck_unpub">Unpublish</button>` : `<button type="button" id="ck_pub">I wrote or checked every word: publish</button>`}</p>
      ${msg ? `<p class="msg">${esc(msg)}</p>` : ""}
      <iframe title="Post preview" sandbox="" id="ck_preview"></iframe></div>`;
    $("ck_preview").srcdoc = C.renderPostPage(desk, { ...p, published: p.published || today() }, { home: "#", index: "#" });
  }

  function render() { renderTopics(); renderPosts(); renderEditor(); }

  const readEditor = () => ({ title: $("ck_title").value, description: $("ck_desc").value, body: $("ck_body").value });

  root.addEventListener("change", (e) => { if (e.target.id === "ck_cat" || e.target.id === "ck_month") renderTopics(); });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const desk = getDesk();
    if (b.dataset.ckStart) {
      const post = C.addPost(desk, { ...C.postFromTopic(C.topicById(b.dataset.ckStart), desk.profile), source: "template" }, today());
      editing = post.id; record("blog_post_started"); commit(); $("ck_editor").scrollIntoView?.();
    } else if (b.dataset.ckAi) {
      b.disabled = true; b.textContent = "Drafting…";
      const d = await C.draftPost(aiConfig(ai), C.topicById(b.dataset.ckAi), desk.profile);
      const post = C.addPost(desk, d, today());
      editing = post.id; record(d.source === "model" ? "blog_ai_draft" : "blog_ai_fallback"); save(); render();
      renderEditor(d.error ? `The model call failed (${d.error}), so this is the template draft.` : "AI draft: check every sentence, replace the placeholder, and remove anything that isn't true.");
    } else if (b.dataset.ckEdit) { editing = b.dataset.ckEdit; renderEditor(); }
    else if (b.dataset.ckDel) {
      if (confirm("Delete this post?")) { desk.posts = (desk.posts || []).filter((p) => p.id !== b.dataset.ckDel); if (editing === b.dataset.ckDel) editing = null; commit(); }
    } else if (b.id === "ck_new") {
      const post = C.addPost(desk, { title: "New post", body: `${C.PLACEHOLDER}\n\n` }, today()); editing = post.id; commit();
    } else if (b.id === "ck_save") { C.updatePost(desk, editing, readEditor(), today()); commit(); }
    else if (b.id === "ck_pub") {
      C.updatePost(desk, editing, readEditor(), today());
      const r = C.approvePost(desk, editing, today(), { namesConsented: $("ck_names").checked });
      if (r.ok) record("blog_post_published");
      save(); renderTopics(); renderPosts(); renderEditor(r.ok ? "Published." : "Not published yet: fix the items above.");
    } else if (b.id === "ck_unpub") { C.unpublishPost(desk, editing, today()); commit(); }
    else if (b.id === "ck_zip") {
      const files = { "index.html": buildSite(desk), ...C.blogFiles(desk) };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([C.zipFiles(files)], { type: "application/zip" }));
      a.download = "my-babysitting-site.zip"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      record("site_zip_downloaded");
    } else if (b.id === "ck_aisave") {
      ai = { provider: $("ck_provider").value, model: $("ck_model").value.trim(), apiKey: $("ck_key").value.trim(), baseUrl: $("ck_base").value.trim() };
      saveAI(ai);
      const cfg = aiConfig(ai);
      $("ck_aiout").textContent = !cfg ? "AI drafting is off." : isLocal(cfg) ? "Saved. Drafts run on your own computer." : "Saved. Drafts go to your provider on your key.";
      renderTopics();
    }
  });
  // The desk can be replaced elsewhere (restore, example, sync): redraw when the tab opens.
  for (const t of document.querySelectorAll('nav button[data-tab="blog"]')) t.addEventListener("click", render);
  render();
  return { render };
}

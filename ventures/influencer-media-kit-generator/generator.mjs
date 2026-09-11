// Deterministic sponsorship-media-kit builder: turns a content creator's own
// numbers (platforms, follower/engagement stats, audience breakdown, past
// brand work, a rate card) into (a) a self-contained, downloadable HTML
// one-sheet and (b) a plain-text version for pasting into an email or a
// brand's intake form. No network call lives here -- this module only turns
// structured input into text, so the identical logic runs from the browser
// form and from the test suite.
//
// Why a generator rather than a checker or a calculator: a creator's actual
// blocker when a brand asks "send your media kit" is not pricing math or a
// compliance verdict, it is producing a professional-looking one-pager at
// all, today, without paying for a template or a subscription tool that
// gates the export. Every field below maps to what a brand's own intake form
// or influencer-marketing platform actually asks for -- reach per platform,
// audience demographics, past collaborations, and a rate card -- so a brand
// can evaluate and pay a fair, self-stated rate without a back-and-forth
// email establishing it from scratch.

/** Escapes text for safe interpolation into the generated HTML document. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Parses a textarea's pipe-delimited lines into objects, positionally
 * matching `fields`. Blank lines and lines starting with "#" are skipped, so
 * a saved worked example can carry comments. Every value is trimmed; a line
 * with fewer segments than `fields` still parses, leaving the missing ones
 * `undefined` (later fields are frequently optional -- a collaboration with
 * no link, a platform stat with no engagement rate yet).
 *
 * @param {string} text
 * @param {string[]} fields
 * @returns {Record<string, string>[]}
 */
export function parsePipeList(text, fields) {
  const lines = String(text ?? "").split(/\r?\n/);
  const rows = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map((p) => p.trim());
    if (!parts[0]) continue;
    const row = {};
    fields.forEach((field, i) => {
      const value = parts[i];
      if (value) row[field] = value;
    });
    rows.push(row);
  }
  return rows;
}

export const parsePlatforms = (text) => parsePipeList(text, ["platform", "followers", "engagement", "url"]);
export const parseAudience = (text) => parsePipeList(text, ["label", "value"]);
export const parseCollabs = (text) => parsePipeList(text, ["brand", "campaign", "url"]);
export const parseTestimonials = (text) => parsePipeList(text, ["quote", "source"]);
export const parseRates = (text) => parsePipeList(text, ["service", "price"]);

/**
 * Structural + completeness check, never a judgement of the creator's own
 * numbers -- this does not verify a follower count or an engagement rate
 * against any platform, it only checks the kit has what a brand's intake
 * form expects to find. Errors block generation (nothing to build without a
 * name and a bio); warnings describe a kit that will build but is missing
 * something a brand would look for before paying.
 * @param {object} data
 */
export function validateMediaKit(data) {
  const errors = [];
  const warnings = [];
  if (!String(data?.creatorName ?? "").trim()) errors.push("Creator or channel name is required.");
  if (!String(data?.bio ?? "").trim()) errors.push("A bio is required — it's the one thing every media kit needs.");

  if (!String(data?.contactEmail ?? "").trim()) {
    warnings.push("No partnerships contact email — add one so a brand can actually reach you.");
  }
  const platforms = parsePlatforms(data?.platformsRaw);
  if (platforms.length === 0) {
    warnings.push("No platforms listed — a brand reading this has no reach numbers to evaluate.");
  }
  const rates = parseRates(data?.ratesRaw);
  if (rates.length === 0) {
    warnings.push("No rate card — without one, a brand still won't know what to offer, and the back-and-forth this kit exists to skip starts anyway.");
  }
  if (!String(data?.photoUrl ?? "").trim()) {
    warnings.push("No photo link — most brands expect at least one creator or content photo.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

const escLines = (text) => escapeHtml(text).split(/\r?\n\r?\n+/).map((p) => p.trim()).filter(Boolean);

/**
 * Builds a complete, self-contained HTML document: inline CSS, no external
 * script or stylesheet, print-friendly (`@media print`), and safe against
 * anything typed into the form (every interpolation is escaped). The only
 * external reference the output can contain is a photo URL the creator
 * themselves supplied -- nothing is uploaded or embedded from elsewhere.
 * @param {object} data
 * @returns {string}
 */
export function buildMediaKitHtml(data) {
  const name = String(data?.creatorName ?? "").trim();
  const tagline = String(data?.tagline ?? "").trim();
  const niche = String(data?.niche ?? "").trim();
  const location = String(data?.location ?? "").trim();
  const bioParas = escLines(data?.bio);
  const photoUrl = String(data?.photoUrl ?? "").trim();
  const photoAlt = String(data?.photoAlt ?? "").trim() || name;
  const contactName = String(data?.contactName ?? "").trim();
  const contactEmail = String(data?.contactEmail ?? "").trim();
  const contactPhone = String(data?.contactPhone ?? "").trim();
  const websiteUrl = String(data?.websiteUrl ?? "").trim();
  const platforms = parsePlatforms(data?.platformsRaw);
  const audience = parseAudience(data?.audienceRaw);
  const collabs = parseCollabs(data?.collabsRaw);
  const testimonials = parseTestimonials(data?.testimonialsRaw);
  const rates = parseRates(data?.ratesRaw);
  const generatedOn = data?.generatedOn instanceof Date
    ? data.generatedOn
    : new Date(data?.generatedOn ?? Date.now());
  const generatedLabel = Number.isNaN(generatedOn.getTime())
    ? ""
    : generatedOn.toISOString().slice(0, 10);

  const subline = [niche, location].filter(Boolean).map(escapeHtml).join(" &middot; ");

  const platformsBlock = platforms.length ? `
  <section>
    <h2>Reach</h2>
    <table class="stats">
      <tbody>
        ${platforms.map((p) => `<tr>
          <td class="k">${p.url ? `<a href="${escapeHtml(p.url)}" rel="noopener">${escapeHtml(p.platform || "")}</a>` : escapeHtml(p.platform || "")}</td>
          <td>${escapeHtml(p.followers || "")}</td>
          <td>${p.engagement ? `${escapeHtml(p.engagement)} engagement` : ""}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : "";

  const audienceBlock = audience.length ? `
  <section>
    <h2>Audience</h2>
    <ul class="stat-list">
      ${audience.map((a) => `<li><strong>${escapeHtml(a.value || "")}</strong> ${escapeHtml(a.label || "")}</li>`).join("")}
    </ul>
  </section>` : "";

  const collabsBlock = collabs.length ? `
  <section>
    <h2>Past partnerships</h2>
    <table class="stats">
      <tbody>
        ${collabs.map((c) => `<tr>
          <td class="k">${escapeHtml(c.brand || "")}</td>
          <td>${escapeHtml(c.campaign || "")}</td>
          <td>${c.url ? `<a href="${escapeHtml(c.url)}" rel="noopener">View</a>` : ""}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : "";

  const testimonialsBlock = testimonials.length ? `
  <section>
    <h2>What brands say</h2>
    ${testimonials.map((t) => `<blockquote>&ldquo;${escapeHtml(t.quote || "")}&rdquo;${t.source ? `<cite>&mdash; ${escapeHtml(t.source)}</cite>` : ""}</blockquote>`).join("")}
  </section>` : "";

  const ratesBlock = rates.length ? `
  <section>
    <h2>Rate card</h2>
    <table class="stats">
      <tbody>
        ${rates.map((r) => `<tr>
          <td class="k">${escapeHtml(r.service || "")}</td>
          <td>${escapeHtml(r.price || "")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <p class="note">Starting rates — final pricing depends on usage rights, exclusivity, and turnaround.</p>
  </section>` : "";

  const contactLines = [
    contactName ? escapeHtml(contactName) : "",
    contactEmail ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : "",
    contactPhone ? escapeHtml(contactPhone) : "",
    websiteUrl ? `<a href="${escapeHtml(websiteUrl)}" rel="noopener">${escapeHtml(websiteUrl)}</a>` : "",
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} — Media Kit${tagline ? ` — ${escapeHtml(tagline)}` : ""}</title>
<meta name="description" content="${escapeHtml(tagline || `Sponsorship media kit for ${name}`)}">
<style>
  :root { font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1b1f2a; background: #f2f4f7; }
  body { max-width: 760px; margin: auto; padding: 32px 24px 48px; }
  header { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; margin-bottom: 22px; }
  header img { width: 168px; height: 168px; object-fit: cover; border-radius: 14px; background: #d5dbe3; }
  h1 { font-size: clamp(1.8rem, 5vw, 2.6rem); margin: 0 0 4px; line-height: 1.08; }
  .tagline { font-size: 1.05rem; color: #3a4658; margin: 0 0 4px; }
  .subline { color: #4c5a68; font-size: .92rem; margin: 0; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: .04em; color: #17324a; border-bottom: 2px solid #d5dbe3; padding-bottom: 6px; margin: 30px 0 12px; }
  section p { margin: 0 0 12px; }
  ul.stat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px 22px; }
  ul.stat-list li { font-size: .94rem; }
  ul.stat-list li strong { color: #17324a; margin-right: 4px; }
  table.stats { width: 100%; border-collapse: collapse; }
  table.stats td { padding: 7px 6px; border-bottom: 1px solid #e3e9ef; font-size: .94rem; vertical-align: top; }
  table.stats td.k { font-weight: 600; white-space: nowrap; padding-right: 14px; }
  table.stats a { color: #17604a; font-weight: 600; text-decoration: none; }
  table.stats a:hover { text-decoration: underline; }
  blockquote { margin: 0 0 14px; padding-left: 14px; border-left: 3px solid #d5dbe3; font-style: italic; }
  blockquote cite { display: block; font-style: normal; font-size: .86rem; color: #4c5a68; margin-top: 4px; }
  .contact { display: flex; flex-wrap: wrap; gap: 4px 18px; }
  footer { margin-top: 34px; padding-top: 14px; border-top: 1px solid #d5dbe3; font-size: .78rem; color: #4c5a68; }
  footer a { color: #4c5a68; }
  .note { color: #4c5a68; font-size: .9rem; }
  @media print {
    body { background: #fff; max-width: none; padding: 0 8mm; }
    header img { width: 130px; height: 130px; }
    footer { display: none; }
  }
</style>
</head>
<body>
  <header>
    ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(photoAlt)}">` : ""}
    <div>
      <h1>${escapeHtml(name)}</h1>
      ${tagline ? `<p class="tagline">${escapeHtml(tagline)}</p>` : ""}
      ${subline ? `<p class="subline">${subline}</p>` : ""}
    </div>
  </header>

  <section>
    <h2>About</h2>
    ${bioParas.map((p) => `<p>${p}</p>`).join("")}
  </section>
  ${platformsBlock}
  ${audienceBlock}
  ${collabsBlock}
  ${testimonialsBlock}
  ${ratesBlock}

  <section>
    <h2>Contact</h2>
    <p class="contact">${contactLines.join(" &nbsp;&middot;&nbsp; ") || "&mdash;"}</p>
  </section>

  <footer>
    <p>Media kit${generatedLabel ? ` generated ${generatedLabel}` : ""}. Built with the free, no-signup <a href="https://duncan-haywood.github.io/monorepo-projects/influencer-media-kit-generator/" rel="noopener">Media Kit Generator</a> — nothing in it was uploaded to build this page; it runs entirely in the browser that made it.</p>
  </footer>
</body>
</html>
`;
}

/**
 * The same content as `buildMediaKitHtml`, as plain text for pasting into an
 * email body or a brand's intake form where HTML isn't accepted.
 * @param {object} data
 * @returns {string}
 */
export function buildOneSheetText(data) {
  const name = String(data?.creatorName ?? "").trim();
  const tagline = String(data?.tagline ?? "").trim();
  const niche = String(data?.niche ?? "").trim();
  const location = String(data?.location ?? "").trim();
  const bio = String(data?.bio ?? "").trim();
  const contactName = String(data?.contactName ?? "").trim();
  const contactEmail = String(data?.contactEmail ?? "").trim();
  const contactPhone = String(data?.contactPhone ?? "").trim();
  const websiteUrl = String(data?.websiteUrl ?? "").trim();
  const platforms = parsePlatforms(data?.platformsRaw);
  const audience = parseAudience(data?.audienceRaw);
  const collabs = parseCollabs(data?.collabsRaw);
  const testimonials = parseTestimonials(data?.testimonialsRaw);
  const rates = parseRates(data?.ratesRaw);

  const lines = [];
  lines.push(name || "(no creator name)");
  const subline = [niche, location].filter(Boolean).join(" | ");
  if (tagline) lines.push(tagline);
  if (subline) lines.push(subline);
  lines.push("");
  if (bio) { lines.push("ABOUT", bio, ""); }

  if (platforms.length) {
    lines.push("REACH");
    for (const p of platforms) {
      const bits = [p.followers, p.engagement ? `${p.engagement} engagement` : ""].filter(Boolean).join(", ");
      lines.push(`- ${p.platform || ""}${bits ? `: ${bits}` : ""}${p.url ? ` (${p.url})` : ""}`);
    }
    lines.push("");
  }
  if (audience.length) {
    lines.push("AUDIENCE");
    for (const a of audience) lines.push(`- ${a.value || ""} ${a.label || ""}`);
    lines.push("");
  }
  if (collabs.length) {
    lines.push("PAST PARTNERSHIPS");
    for (const c of collabs) {
      lines.push(`- ${[c.brand, c.campaign].filter(Boolean).join(" — ")}${c.url ? ` (${c.url})` : ""}`);
    }
    lines.push("");
  }
  if (testimonials.length) {
    lines.push("WHAT BRANDS SAY");
    for (const t of testimonials) lines.push(`- "${t.quote || ""}"${t.source ? ` — ${t.source}` : ""}`);
    lines.push("");
  }
  if (rates.length) {
    lines.push("RATE CARD");
    for (const r of rates) lines.push(`- ${r.service || ""}: ${r.price || ""}`);
    lines.push("(Starting rates — final pricing depends on usage rights, exclusivity, and turnaround.)");
    lines.push("");
  }

  const contactLine = [contactName, contactEmail, contactPhone, websiteUrl].filter(Boolean).join(" | ");
  if (contactLine) lines.push("CONTACT", contactLine);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

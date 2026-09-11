// Deterministic electronic-press-kit (EPK) builder: turns structured artist
// data into (a) a self-contained, downloadable HTML one-sheet and (b) a
// plain-text version for pasting into an email or a booking form. No network
// call lives here -- this module only turns structured input into text, so
// the identical logic runs from the browser form and from the test suite.
//
// Why a generator rather than a checker or a calculator: an independent
// musician's actual blocker is not pricing or compliance, it is producing a
// press-ready one-pager at all. Every field below maps to what a booker,
// blog, or festival submission form actually asks for (see README "Why this
// exists"), and nothing here computes a number or renders a verdict --
// unlike the rest of the portfolio's *-check and *-bid-calculator ventures,
// this one's whole job is to assemble a document the artist already knows
// the content of.

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
 * `undefined` (later fields are frequently optional -- a tour date with no
 * ticket link, a press quote with no named source).
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

export const parseLinkList = (text) => parsePipeList(text, ["label", "url"]);
export const parseTourDates = (text) => parsePipeList(text, ["date", "venue", "city", "url"]);
export const parsePressQuotes = (text) => parsePipeList(text, ["quote", "source"]);

/**
 * Structural + completeness check, never a judgement of the writing itself.
 * Errors block generation (nothing to build without a name and a bio);
 * warnings describe a press kit that will build but is missing something a
 * booker or blog would expect to find.
 * @param {object} data
 */
export function validateEpk(data) {
  const errors = [];
  const warnings = [];
  if (!String(data?.artistName ?? "").trim()) errors.push("Artist or band name is required.");
  if (!String(data?.bio ?? "").trim()) errors.push("A bio is required — it's the one thing every press kit needs.");

  if (!String(data?.contactEmail ?? "").trim()) {
    warnings.push("No booking/press contact email — add one so a promoter or blog can actually reach you.");
  }
  const streaming = parseLinkList(data?.streamingLinksRaw);
  const social = parseLinkList(data?.socialLinksRaw);
  if (streaming.length === 0 && social.length === 0) {
    warnings.push("No streaming or social links — a reader has nowhere to go listen.");
  }
  if (!String(data?.photoUrl ?? "").trim()) {
    warnings.push("No photo link — most bookers and blogs expect at least one press photo.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

const escLines = (text) => escapeHtml(text).split(/\r?\n\r?\n+/).map((p) => p.trim()).filter(Boolean);

/**
 * Builds a complete, self-contained HTML document: inline CSS, no external
 * script or stylesheet, print-friendly (`@media print`), and safe against
 * anything typed into the form (every interpolation is escaped). The only
 * external reference the output can contain is a photo URL the artist
 * themselves supplied -- nothing is uploaded or embedded from elsewhere.
 * @param {object} data
 * @returns {string}
 */
export function buildEpkHtml(data) {
  const name = String(data?.artistName ?? "").trim();
  const tagline = String(data?.tagline ?? "").trim();
  const location = String(data?.location ?? "").trim();
  const genre = String(data?.genre ?? "").trim();
  const bioParas = escLines(data?.bio);
  const photoUrl = String(data?.photoUrl ?? "").trim();
  const photoAlt = String(data?.photoAlt ?? "").trim() || name;
  const contactName = String(data?.contactName ?? "").trim();
  const contactEmail = String(data?.contactEmail ?? "").trim();
  const contactPhone = String(data?.contactPhone ?? "").trim();
  const websiteUrl = String(data?.websiteUrl ?? "").trim();
  const techRiderUrl = String(data?.techRiderUrl ?? "").trim();
  const streaming = parseLinkList(data?.streamingLinksRaw);
  const social = parseLinkList(data?.socialLinksRaw);
  const dates = parseTourDates(data?.tourDatesRaw);
  const quotes = parsePressQuotes(data?.pressQuotesRaw);
  const generatedOn = data?.generatedOn instanceof Date
    ? data.generatedOn
    : new Date(data?.generatedOn ?? Date.now());
  const generatedLabel = Number.isNaN(generatedOn.getTime())
    ? ""
    : generatedOn.toISOString().slice(0, 10);

  const subline = [genre, location].filter(Boolean).map(escapeHtml).join(" &middot; ");

  const linkList = (items, emptyNote) => {
    if (!items.length) return emptyNote ? `<p class="note">${escapeHtml(emptyNote)}</p>` : "";
    return `<ul class="links">${items.map((i) => (
      i.url
        ? `<li><a href="${escapeHtml(i.url)}" rel="noopener">${escapeHtml(i.label || i.url)}</a></li>`
        : `<li>${escapeHtml(i.label || "")}</li>`
    )).join("")}</ul>`;
  };

  const datesBlock = dates.length ? `
  <section>
    <h2>Upcoming shows</h2>
    <table class="dates">
      <tbody>
        ${dates.map((d) => `<tr>
          <td class="d">${escapeHtml(d.date || "")}</td>
          <td>${escapeHtml(d.venue || "")}${d.city ? `, ${escapeHtml(d.city)}` : ""}</td>
          <td>${d.url ? `<a href="${escapeHtml(d.url)}" rel="noopener">Tickets</a>` : ""}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>` : "";

  const quotesBlock = quotes.length ? `
  <section>
    <h2>Press</h2>
    ${quotes.map((q) => `<blockquote>&ldquo;${escapeHtml(q.quote || "")}&rdquo;${q.source ? `<cite>&mdash; ${escapeHtml(q.source)}</cite>` : ""}</blockquote>`).join("")}
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
<title>${escapeHtml(name)} — Electronic Press Kit${tagline ? ` — ${escapeHtml(tagline)}` : ""}</title>
<meta name="description" content="${escapeHtml(tagline || `Electronic press kit for ${name}`)}">
<style>
  :root { font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1b1f2a; background: #f2f4f7; }
  body { max-width: 760px; margin: auto; padding: 32px 24px 48px; }
  header { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; margin-bottom: 22px; }
  header img { width: 168px; height: 168px; object-fit: cover; border-radius: 14px; background: #d5dbe3; }
  h1 { font-size: clamp(1.8rem, 5vw, 2.6rem); margin: 0 0 4px; line-height: 1.08; }
  .tagline { font-size: 1.05rem; color: #3a4658; margin: 0 0 4px; }
  .subline { color: #55606f; font-size: .92rem; margin: 0; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: .04em; color: #17324a; border-bottom: 2px solid #d5dbe3; padding-bottom: 6px; margin: 30px 0 12px; }
  section p { margin: 0 0 12px; }
  ul.links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  ul.links li a { color: #17604a; font-weight: 600; text-decoration: none; }
  ul.links li a:hover { text-decoration: underline; }
  table.dates { width: 100%; border-collapse: collapse; }
  table.dates td { padding: 7px 6px; border-bottom: 1px solid #e3e9ef; font-size: .94rem; vertical-align: top; }
  table.dates td.d { white-space: nowrap; font-weight: 600; width: 1%; padding-right: 14px; }
  blockquote { margin: 0 0 14px; padding-left: 14px; border-left: 3px solid #d5dbe3; font-style: italic; }
  blockquote cite { display: block; font-style: normal; font-size: .86rem; color: #55606f; margin-top: 4px; }
  .contact { display: flex; flex-wrap: wrap; gap: 4px 18px; }
  footer { margin-top: 34px; padding-top: 14px; border-top: 1px solid #d5dbe3; font-size: .78rem; color: #7c8797; }
  footer a { color: #7c8797; }
  .note { color: #55606f; font-size: .9rem; }
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
    <h2>Bio</h2>
    ${bioParas.map((p) => `<p>${p}</p>`).join("")}
  </section>

  <section>
    <h2>Listen</h2>
    ${linkList(streaming)}
  </section>

  <section>
    <h2>Follow</h2>
    ${linkList(social)}
  </section>
  ${datesBlock}
  ${quotesBlock}

  <section>
    <h2>Contact</h2>
    <p class="contact">${contactLines.join(" &nbsp;&middot;&nbsp; ") || "&mdash;"}</p>
    ${techRiderUrl ? `<p><a href="${escapeHtml(techRiderUrl)}" rel="noopener">Tech rider / stage plot</a></p>` : ""}
  </section>

  <footer>
    <p>Press kit${generatedLabel ? ` generated ${generatedLabel}` : ""}. Built with the free, no-signup <a href="https://duncan-haywood.github.io/monorepo-projects/epk-generator/" rel="noopener">EPK Generator</a> — nothing in it was uploaded to build this page; it runs entirely in the browser that made it.</p>
  </footer>
</body>
</html>
`;
}

/**
 * The same content as `buildEpkHtml`, as plain text for pasting into an
 * email body or a submission form's free-text field where HTML isn't
 * accepted.
 * @param {object} data
 * @returns {string}
 */
export function buildOneSheetText(data) {
  const name = String(data?.artistName ?? "").trim();
  const tagline = String(data?.tagline ?? "").trim();
  const location = String(data?.location ?? "").trim();
  const genre = String(data?.genre ?? "").trim();
  const bio = String(data?.bio ?? "").trim();
  const contactName = String(data?.contactName ?? "").trim();
  const contactEmail = String(data?.contactEmail ?? "").trim();
  const contactPhone = String(data?.contactPhone ?? "").trim();
  const websiteUrl = String(data?.websiteUrl ?? "").trim();
  const techRiderUrl = String(data?.techRiderUrl ?? "").trim();
  const streaming = parseLinkList(data?.streamingLinksRaw);
  const social = parseLinkList(data?.socialLinksRaw);
  const dates = parseTourDates(data?.tourDatesRaw);
  const quotes = parsePressQuotes(data?.pressQuotesRaw);

  const lines = [];
  lines.push(name || "(no artist name)");
  const subline = [genre, location].filter(Boolean).join(" | ");
  if (tagline) lines.push(tagline);
  if (subline) lines.push(subline);
  lines.push("");
  if (bio) { lines.push("BIO", bio, ""); }

  if (streaming.length) {
    lines.push("LISTEN");
    for (const s of streaming) lines.push(`- ${s.label || s.url}${s.url && s.label ? `: ${s.url}` : ""}`);
    lines.push("");
  }
  if (social.length) {
    lines.push("FOLLOW");
    for (const s of social) lines.push(`- ${s.label || s.url}${s.url && s.label ? `: ${s.url}` : ""}`);
    lines.push("");
  }
  if (dates.length) {
    lines.push("UPCOMING SHOWS");
    for (const d of dates) {
      const venue = [d.venue, d.city].filter(Boolean).join(", ");
      lines.push(`- ${[d.date, venue].filter(Boolean).join(" — ")}${d.url ? ` (${d.url})` : ""}`);
    }
    lines.push("");
  }
  if (quotes.length) {
    lines.push("PRESS");
    for (const q of quotes) lines.push(`- "${q.quote || ""}"${q.source ? ` — ${q.source}` : ""}`);
    lines.push("");
  }

  const contactLine = [contactName, contactEmail, contactPhone, websiteUrl].filter(Boolean).join(" | ");
  if (contactLine) lines.push("CONTACT", contactLine);
  if (techRiderUrl) lines.push(`Tech rider: ${techRiderUrl}`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// Atom and JSON Feed for the public changelog.
import { esc, renderMarkdown } from "./store.mjs";

export function toAtom(entries, { publicUrl, company }) {
  const updated = new Date(entries.length ? Math.max(...entries.map((e) => e.updatedAt || e.publishAt)) : 0).toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${esc(company)} changelog</title><id>${esc(publicUrl)}/changelog</id><updated>${updated}</updated>
<link rel="self" href="${esc(publicUrl)}/feed.xml"/><link rel="alternate" href="${esc(publicUrl)}/changelog"/>
${entries.map((e) => `<entry><title>${esc(`[${e.tag}] ${e.title}`)}</title><id>${esc(publicUrl)}/changelog#${esc(e.id)}</id><link rel="alternate" href="${esc(publicUrl)}/changelog#${esc(e.id)}"/><published>${new Date(e.publishAt).toISOString()}</published><updated>${new Date(e.updatedAt || e.publishAt).toISOString()}</updated><category term="${esc(e.tag)}"/><content type="html">${esc(renderMarkdown(e.body))}</content></entry>`).join("\n")}
</feed>
`;
}

export function toJsonFeed(entries, { publicUrl, company }) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: `${company} changelog`,
    home_page_url: `${publicUrl}/changelog`,
    feed_url: `${publicUrl}/feed.json`,
    items: entries.map((e) => ({ id: e.id, url: `${publicUrl}/changelog#${e.id}`, title: e.title, content_html: renderMarkdown(e.body), content_text: e.body, date_published: new Date(e.publishAt).toISOString(), date_modified: new Date(e.updatedAt || e.publishAt).toISOString(), tags: [e.tag] })),
  };
}

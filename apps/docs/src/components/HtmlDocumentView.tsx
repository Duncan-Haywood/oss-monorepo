import type { HtmlDocMeta } from "../generated/htmlManifest";

export function HtmlDocumentView({
  meta,
  bodyHtml,
}: {
  meta: HtmlDocMeta;
  bodyHtml: string;
}) {
  return (
    <article className="html-doc-root" data-source={meta.sourcePath}>
      <p className="html-doc-source">
        Built from <code>{meta.sourcePath}</code> via{" "}
        <code>pnpm docs:sync</code>
      </p>
      <div
        className="html-doc-body"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  );
}

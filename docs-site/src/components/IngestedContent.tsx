import type { IngestedPage } from "@/generated/content";

interface IngestedContentProps {
  page: IngestedPage;
}

export function IngestedContent({ page }: IngestedContentProps) {
  return (
    <>
      {page.styles ? (
        <style dangerouslySetInnerHTML={{ __html: page.styles }} />
      ) : null}
      <div
        className={
          page.kind === "html" ? "ingested-html" : "ingested-markdown"
        }
        dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
      />
    </>
  );
}

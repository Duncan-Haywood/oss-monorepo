interface DocBodyProps {
  kind: "html" | "markdown";
  html: string;
  styles?: string;
}

/** Renders build-generated documentation body HTML inside the site shell. */
export function DocBody({ kind, html, styles }: DocBodyProps) {
  return (
    <>
      {styles ? <style dangerouslySetInnerHTML={{ __html: styles }} /> : null}
      <div
        className={kind === "html" ? "ingested-html" : "ingested-markdown"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

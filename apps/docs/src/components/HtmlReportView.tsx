import { useEffect, useState } from "react";

interface ReportBundle {
  slug: string;
  title: string;
  sourcePath: string;
  kind: "html" | "markdown";
  css: string;
  html: string;
}

export function HtmlReportView({ slug }: { slug: string }) {
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setError(null);

    fetch(`./generated/${slug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Report not found (${res.status})`);
        return res.json() as Promise<ReportBundle>;
      })
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <p className="stub" role="alert">
        Could not load report <code>{slug}</code>: {error}. Run{" "}
        <code>pnpm docs:sync</code> and rebuild.
      </p>
    );
  }

  if (!bundle) {
    return <p className="stub">Loading report…</p>;
  }

  return (
    <article className="html-archive">
      <p className="archive-meta">
        Built from <code>{bundle.sourcePath}</code> ({bundle.kind})
      </p>
      {bundle.css ? <style>{bundle.css}</style> : null}
      <div
        className="html-archive-body"
        dangerouslySetInnerHTML={{ __html: bundle.html }}
      />
    </article>
  );
}

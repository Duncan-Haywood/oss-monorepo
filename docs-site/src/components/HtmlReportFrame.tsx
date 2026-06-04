type HtmlReportFrameProps = {
  title: string;
  src: string;
  sourceFile: string;
};

export function HtmlReportFrame({ title, src, sourceFile }: HtmlReportFrameProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Built from <code className="text-sky-300">docs/{sourceFile}</code> at site build time.
        Styling is preserved inside the embedded report frame.
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <iframe
          title={title}
          src={src}
          className="min-h-[80vh] w-full bg-slate-950"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

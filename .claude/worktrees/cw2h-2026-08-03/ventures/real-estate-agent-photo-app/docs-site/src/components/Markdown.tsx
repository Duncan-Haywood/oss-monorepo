import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  children: string;
};

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-200">
      <code>{children}</code>
    </pre>
  );
}

export function Markdown({ children }: MarkdownProps) {
  return (
    <article className="prose prose-invert prose-headings:font-display prose-headings:text-white prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-white prose-a:text-brand-300 prose-code:text-brand-200 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0 max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children: preChildren }) => <CodeBlock>{preChildren}</CodeBlock>,
          code: ({ className, children: codeChildren, ...props }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {codeChildren}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-brand-200"
                {...props}
              >
                {codeChildren}
              </code>
            );
          },
          table: ({ children: tableChildren }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{tableChildren}</table>
            </div>
          ),
          th: ({ children: thChildren }) => (
            <th className="border border-slate-700 bg-slate-900 px-3 py-2 text-left text-slate-200">
              {thChildren}
            </th>
          ),
          td: ({ children: tdChildren }) => (
            <td className="border border-slate-800 px-3 py-2 text-slate-300">{tdChildren}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}

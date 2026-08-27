import type { DiffOp } from "@/lib/diff";

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default function DiffView({ diff }: { diff: DiffOp[] }) {
  return (
    <p className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-800">
      {diff.map((op, index) => {
        // Long unchanged runs are just context; keep them from swamping the
        // view while still showing the diff sits inside real page text.
        const text = op.type === "same" ? truncate(op.value, 240) : op.value;
        if (op.type === "removed") {
          return (
            <span key={index} className="bg-red-100 text-red-800 line-through decoration-red-400">
              {text}{" "}
            </span>
          );
        }
        if (op.type === "added") {
          return (
            <span key={index} className="bg-green-100 text-green-800">
              {text}{" "}
            </span>
          );
        }
        return (
          <span key={index} className="text-slate-500">
            {text}{" "}
          </span>
        );
      })}
    </p>
  );
}

import { formatHours, parseHours } from "@shared/certified-payroll";
import { useEffect, useState } from "react";

/** Hours typed as "8" or "8.5", held as hundredths of an hour (at most 24). */
export function HoursCell(props: { value: number; onChange: (h: number) => void; label: string }) {
  const [text, setText] = useState(props.value ? formatHours(props.value) : "");
  useEffect(() => {
    setText((t) =>
      parseHours(t) === props.value ? t : props.value ? formatHours(props.value) : "",
    );
  }, [props.value]);
  const bad = parseHours(text) === null || (parseHours(text) ?? 0) > 2400;
  return (
    <input
      aria-label={props.label}
      inputMode="decimal"
      className={`input w-12 px-1 text-right ${bad ? "border-red-500" : ""}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const h = parseHours(e.target.value);
        if (h !== null && h <= 2400) props.onChange(h);
      }}
    />
  );
}

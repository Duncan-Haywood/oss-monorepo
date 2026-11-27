import { formatQuantity, parseQuantity, quantityDecimal } from "@shared/unit-price";
import { useEffect, useState } from "react";

/** Quantity text input holding thousandths (unit-price lines). Invalid text is shown red and not committed. */
export function QuantityInput(props: {
  value: number | null;
  onChange: (milli: number) => void;
  unit: string;
  disabled?: boolean;
  label: string;
}) {
  const { value, onChange, unit, disabled, label } = props;
  const [text, setText] = useState(value ? quantityDecimal(value) : "");
  useEffect(() => {
    setText((t) =>
      parseQuantity(t || "0") === (value ?? 0) ? t : value ? quantityDecimal(value) : "",
    );
  }, [value]);
  const invalid = parseQuantity(text || "0") === null;
  return (
    <span className="flex items-center gap-1">
      <input
        aria-label={label}
        inputMode="decimal"
        title={value ? `${formatQuantity(value)} ${unit}` : undefined}
        className={`input text-right ${invalid ? "border-red-500" : ""}`}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const q = parseQuantity(e.target.value || "0");
          if (q !== null) onChange(q);
        }}
      />
      <span className="text-xs text-slate-600">{unit}</span>
    </span>
  );
}

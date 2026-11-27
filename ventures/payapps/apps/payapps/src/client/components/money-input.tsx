import { centsToDecimal, parseDollarsToCents } from "@shared/money";
import { useEffect, useState } from "react";

/** Dollar text input holding integer cents. Invalid text is shown red and not committed. */
export function MoneyInput(props: {
  value: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  label: string;
  min?: number;
}) {
  const { value, onChange, disabled, label, min } = props;
  const [text, setText] = useState(value ? centsToDecimal(value) : "");
  useEffect(() => {
    setText((t) =>
      parseDollarsToCents(t || "0") === value ? t : value ? centsToDecimal(value) : "",
    );
  }, [value]);
  const parsed = parseDollarsToCents(text || "0");
  const invalid = parsed === null || (min !== undefined && parsed < min);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={`input text-right ${invalid ? "border-red-500" : ""}`}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const c = parseDollarsToCents(e.target.value || "0");
        if (c !== null && (min === undefined || c >= min)) onChange(c);
      }}
    />
  );
}

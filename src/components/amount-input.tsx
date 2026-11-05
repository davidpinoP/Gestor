"use client";
import { useState } from "react";
import { centsToInput, parseAmountToCents } from "@/lib/money";
import { Input } from "./ui";

/** Campo de importe: acepta "1.234,56", "45", "45.5"; devuelve céntimos o null. */
export function AmountInput({ cents, onChange, autoFocus, id, allowZero }: { cents: number | null; onChange: (c: number | null) => void; autoFocus?: boolean; id?: string; allowZero?: boolean }) {
  const [text, setText] = useState(cents ? centsToInput(cents) : cents === 0 && allowZero ? "0" : "");
  const [lastExternal, setLastExternal] = useState(cents);
  if (cents !== lastExternal) {
    // valor cambiado desde fuera (p. ej. por el intérprete de lenguaje natural)
    setLastExternal(cents);
    const parsed = parseAmountToCents(text);
    if (parsed !== cents) setText(cents ? centsToInput(cents) : "");
  }
  const parsed = parseAmountToCents(text);
  const invalid = text.trim() !== "" && parsed === null && !(allowZero && /^0([.,]0{1,2})?$/.test(text.trim()));
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="0,00"
        value={text}
        aria-invalid={invalid}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const c = parseAmountToCents(v);
          const zero = allowZero && /^0([.,]0{1,2})?$/.test(v.trim());
          const next = zero ? 0 : c;
          setLastExternal(next);
          onChange(next);
        }}
        className={`num pr-14 text-right text-base font-semibold ${invalid ? "border-bad/60" : ""}`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-fg-subtle">
        {invalid ? "inválido" : "€"}
      </span>
    </div>
  );
}

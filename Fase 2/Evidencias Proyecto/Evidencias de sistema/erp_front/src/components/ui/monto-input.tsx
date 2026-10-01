import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  caretAfterEsClReformat,
  formatMontoEsCl,
  kindDecimals,
  parseMontoEsCl,
  type MontoDecimals,
} from '@/lib/monto-es-cl';
import type { InputHTMLAttributes } from 'react';

export type MontoInputKind = 'monto' | 'precio' | 'tc';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  kind?: MontoInputKind;
  decimals?: MontoDecimals;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  allowNegative?: boolean;
};

function displayFromValue(value: number, decimals: MontoDecimals): string {
  return formatMontoEsCl(value, { decimals, padDecimals: false });
}

export function MontoInput({
  kind = 'monto',
  decimals,
  value,
  onChange,
  allowNegative = false,
  onBlur,
  onFocus,
  ...rest
}: Props) {
  const d = decimals ?? kindDecimals(kind);
  const focusedRef = useRef(false);
  const elRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const [text, setText] = useState(() =>
    value == null || !Number.isFinite(Number(value)) ? '' : displayFromValue(Number(value), d),
  );

  useEffect(() => {
    if (focusedRef.current) return;
    if (value == null || !Number.isFinite(Number(value))) {
      setText('');
      return;
    }
    setText(displayFromValue(Number(value), d));
  }, [value, d]);

  useLayoutEffect(() => {
    const el = elRef.current;
    const caret = caretRef.current;
    if (el == null || caret == null) return;
    el.setSelectionRange(caret, caret);
    caretRef.current = null;
  }, [text]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      lang="es-CL"
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        focusedRef.current = true;
        elRef.current = e.currentTarget;
        onFocus?.(e);
      }}
      onChange={(e) => {
        const el = e.currentTarget;
        elRef.current = el;
        const raw = el.value;
        const caret = el.selectionStart ?? raw.length;
        const parsed = parseMontoEsCl(raw, { decimals: d, allowNegative });
        const next = parsed.display || raw;
        caretRef.current = caretAfterEsClReformat(raw, caret, next);
        setText(next);
        onChange(parsed.value);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        if (value != null && Number.isFinite(value)) {
          setText(displayFromValue(value, d));
        }
        onBlur?.(e);
      }}
    />
  );
}

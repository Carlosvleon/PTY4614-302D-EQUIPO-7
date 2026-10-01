import { MESES_CONTABLES } from '@/lib/appSettings';
import { Field, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  defaultPeriodWeek,
  fmtYmd,
  lastWeekIndex,
  parsePeriodWeek,
  weekRange,
  withSemana,
  withYearMonth,
} from './period-week';

export function NominaSemanaSelects({
  value,
  onChange,
  years,
  idPrefix,
  lockYearMonth = false,
  allowEmpty = false,
  emptyLabel = 'Sin asociar',
  defaultWeek,
}: {
  value: string;
  onChange: (key: string) => void;
  years: number[];
  idPrefix: string;
  lockYearMonth?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  defaultWeek?: string;
}) {
  const parsed = parsePeriodWeek(value);
  const fallback = defaultWeek && parsePeriodWeek(defaultWeek) ? defaultWeek : defaultPeriodWeek();

  if (allowEmpty && !parsed) {
    return (
      <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
        <Checkbox
          id={`${idPrefix}-asociar`}
          checked={false}
          onChange={(e) => {
            if (e.target.checked) onChange(fallback);
          }}
          aria-label="Asociar a nómina"
        />
        Asociar a nómina (año, mes y semana)
      </label>
    );
  }

  if (!parsed) return null;
  const last = lastWeekIndex(parsed.year, parsed.month);
  const yearsShown = years.includes(parsed.year) ? years : [...years, parsed.year].sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-end gap-3">
      {allowEmpty && (
        <label className="mb-2 flex items-center gap-2 text-sm text-[var(--color-text)]">
          <Checkbox
            id={`${idPrefix}-asociar`}
            checked
            onChange={(e) => {
              if (!e.target.checked) onChange('');
            }}
            aria-label="Asociar a nómina"
          />
          Nómina
        </label>
      )}
      <Field label="Año">
        <Select
          id={`${idPrefix}-anio`}
          className="w-[7.5rem]"
          value={String(parsed.year)}
          disabled={lockYearMonth}
          aria-label="Año de nómina"
          onChange={(e) => onChange(withYearMonth(value, Number(e.target.value), parsed.month))}
        >
          {yearsShown.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </Field>
      <Field label="Mes">
        <Select
          id={`${idPrefix}-mes`}
          className="w-[11rem]"
          value={String(parsed.month).padStart(2, '0')}
          disabled={lockYearMonth}
          aria-label="Mes de nómina"
          onChange={(e) => onChange(withYearMonth(value, parsed.year, Number(e.target.value)))}
        >
          {MESES_CONTABLES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Semana">
        <Select
          id={`${idPrefix}-semana`}
          className="min-w-[16rem]"
          value={String(parsed.semana)}
          aria-label="Semana de nómina"
          onChange={(e) => onChange(withSemana(value, Number(e.target.value)))}
        >
          {Array.from({ length: last }, (_, i) => {
            const semana = i + 1;
            const range = weekRange(parsed.year, parsed.month, semana);
            return (
              <option key={semana} value={semana}>
                S{semana} · {fmtYmd(range.desde)} – {fmtYmd(range.hasta)}
              </option>
            );
          })}
        </Select>
      </Field>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  FichaCambio,
  FichaContacto,
  FichaCuentaBancaria,
  FichaDireccion,
} from '@/types/domain';
import { fmtDate } from '@/lib/utils';
import { validateFiscalId } from '@/lib/inputValidation';
import { SII_DTE_LIMITS } from '@/lib/siiDteLimits';
import { useAppSettings } from '@/app/app-settings-context';

export type FichaKind = 'cliente' | 'proveedor';

export type FichaFormState = {
  rut: string;
  razonSocial: string;
  giro: string;
  telefono: string;
  email: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  activo: boolean;
  credito?: number;
  vendedor?: string;
  tipoCliente?: string;
  contacto?: string;
  solicitadoPor?: string;
  solicitadoNota?: string;
  /** D7: productor de fruta (lookup RUT). */
  esProductor?: boolean;
  /** Proveedor: condición del NETO en días (entero positivo). Vacío si aún no se parametrizó. */
  condicionPagoDias?: number | '';
  /** Proveedor: días para pagar el IVA. Presets de 10 en 10, o un entero manual. */
  condicionIvaDia?: number | '';
  /** Proveedor: moneda de pago (CLP, USD, CNY…). */
  monedaPago?: string;
  cuentasBancarias: FichaCuentaBancaria[];
  contactos: FichaContacto[];
  direcciones: FichaDireccion[];
};

const emptyBanco = (): FichaCuentaBancaria => ({
  banco: '', tipoCuenta: 'CORRIENTE', numero: '', monedaCodigo: 'CLP', principal: false,
});
const emptyContacto = (): FichaContacto => ({ nombre: '', cargo: '', email: '', telefono: '', principal: false });
const emptyDir = (): FichaDireccion => ({ tipo: 'DESPACHO', linea: '', comuna: '', ciudad: '', principal: false });

export function emptyFicha(kind: FichaKind): FichaFormState {
  return {
    rut: '',
    razonSocial: '',
    giro: '',
    telefono: '',
    email: '',
    direccion: '',
    comuna: '',
    ciudad: '',
    activo: true,
    credito: kind === 'cliente' ? 0 : undefined,
    vendedor: kind === 'cliente' ? '' : undefined,
    tipoCliente: kind === 'cliente' ? 'NACIONAL' : undefined,
    contacto: kind === 'proveedor' ? '' : undefined,
    solicitadoPor: '',
    solicitadoNota: '',
    esProductor: false,
    condicionPagoDias: kind === 'proveedor' ? 10 : undefined,
    condicionIvaDia: kind === 'proveedor' ? 10 : undefined,
    monedaPago: kind === 'proveedor' ? 'CLP' : undefined,
    cuentasBancarias: [emptyBanco()],
    contactos: [emptyContacto()],
    direcciones: [emptyDir()],
  };
}

type Tab = 'id' | 'bancos' | 'contactos' | 'despacho' | 'historial';

const DIAS_PRESET = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

function esDiaManual(dias: number | '' | undefined) {
  return typeof dias === 'number' && dias >= 1 && !(DIAS_PRESET as readonly number[]).includes(dias);
}

function CampoDiasPago({
  label,
  value,
  otro,
  onOtro,
  onChange,
  canWrite,
  hint,
}: {
  label: string;
  value: number | '' | undefined;
  otro: boolean;
  onOtro: (next: boolean) => void;
  onChange: (dias: number | '') => void;
  canWrite: boolean;
  hint?: string;
}) {
  const isPreset = typeof value === 'number' && (DIAS_PRESET as readonly number[]).includes(value);
  const showOtro = otro || esDiaManual(value);
  const selectValue = showOtro ? 'otro' : isPreset ? String(value) : '';
  return (
    <Field label={label}>
      <Select
        disabled={!canWrite}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') {
            onOtro(false);
            onChange('');
            return;
          }
          if (v === 'otro') {
            onOtro(true);
            if (isPreset) onChange('');
            return;
          }
          onOtro(false);
          onChange(Number(v));
        }}
      >
        <option value="">Sin definir</option>
        {DIAS_PRESET.map((d) => (
          <option key={d} value={d}>{d} días</option>
        ))}
        <option value="otro">Ingresar días</option>
      </Select>
      {showOtro && (
        <Input
          className="mt-2"
          disabled={!canWrite}
          type="number"
          min={1}
          step={1}
          placeholder="Días (ej. 45)"
          value={showOtro && typeof value === 'number' ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange('');
              return;
            }
            const n = Number(raw);
            if (Number.isInteger(n) && n >= 1) onChange(n);
          }}
        />
      )}
      {hint ? <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </Field>
  );
}

function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printSolicitudFicha(kind: FichaKind, value: FichaFormState) {
  const title = kind === 'cliente' ? 'Solicitud alta cliente' : 'Solicitud alta proveedor';
  const rows: [string, string][] = [
    ['RUT', value.rut],
    ['Razón social', value.razonSocial],
    ['Giro', value.giro],
  ];
  if (kind === 'cliente') {
    rows.push(
      ['Tipo', value.tipoCliente ?? 'NACIONAL'],
      ['Línea de crédito', String(value.credito ?? 0)],
      ['Vendedor', value.vendedor ?? ''],
    );
  } else {
    rows.push(
      ['Contacto', value.contacto ?? ''],
      ['Condición del NETO', value.condicionPagoDias ? `${value.condicionPagoDias} días` : ''],
      ['IVA (días)', value.condicionIvaDia ? `${value.condicionIvaDia} días` : ''],
      ['Moneda de pago', value.monedaPago ?? ''],
    );
  }
  rows.push(
    ['Teléfono', value.telefono],
    ['Email', value.email],
    ['Dirección fiscal', value.direccion],
    ['Comuna', value.comuna],
    ['Ciudad', value.ciudad],
    ['Solicitado por', value.solicitadoPor ?? ''],
    ['Nota de solicitud', value.solicitadoNota ?? ''],
    ['Productor', value.esProductor ? 'Sí' : 'No'],
    ['Activo', value.activo ? 'Sí' : 'No'],
  );
  const body = rows
    .map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v || '—')}</td></tr>`)
    .join('');
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;max-width:720px;color:#111}
h1{font-size:18px;margin:0 0 16px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:6px 8px;border:1px solid #ccc;vertical-align:top}
td:first-child{font-weight:600;width:35%;background:#f5f5f5}
@media print{body{padding:0}}
</style></head><body>
<h1>${escHtml(title)}</h1>
<table>${body}</table>
<script>window.onload=function(){window.print();}</script>
</body></html>`);
  w.document.close();
}

export function FichaContraparteModal(props: {
  kind: FichaKind;
  open: boolean;
  title: string;
  canWrite: boolean;
  value: FichaFormState;
  historial?: FichaCambio[];
  saving?: boolean;
  onChange: (next: FichaFormState) => void;
  onClose: () => void;
  onSave: () => void;
  /** Aviso cuando el RUT ya existe en Contratistas. */
  rutNota?: string | null;
}) {
  const { kind, open, title, canWrite, value, historial, saving, onChange, onClose, onSave, rutNota } = props;
  const { demoMode } = useAppSettings();
  const [tab, setTab] = useState<Tab>('id');
  /** Select «Ingresar días» activo aunque el número aún no esté tipado. */
  const [netoOtro, setNetoOtro] = useState(false);
  const [ivaOtro, setIvaOtro] = useState(false);
  const rutValidation = value.rut.trim()
    ? validateFiscalId(value.rut, { demoMode, allowForeign: true })
    : null;
  const rutInvalido = Boolean(rutValidation && !rutValidation.valid);
  useEffect(() => {
    if (open) setTab('id');
  }, [open]);
  useEffect(() => {
    if (!open || kind !== 'proveedor') {
      setNetoOtro(false);
      setIvaOtro(false);
      return;
    }
    setNetoOtro(esDiaManual(value.condicionPagoDias));
    setIvaOtro(esDiaManual(value.condicionIvaDia));
  }, [open, kind]); // solo al abrir: no pelear con el tipado manual

  const tabs: { id: Tab; label: string }[] = [
    { id: 'id', label: 'Identificación' },
    { id: 'bancos', label: 'Datos bancarios' },
    { id: 'contactos', label: 'Contactos' },
    { id: 'despacho', label: 'Despacho' },
    { id: 'historial', label: 'Historial' },
  ];

  const patch = (p: Partial<FichaFormState>) => onChange({ ...value, ...p });

  const guardar = () => {
    if (kind === 'cliente') {
      if (value.direccion.trim().length < 3 || value.comuna.trim().length < 2) {
        toast.error('Dirección fiscal y comuna son obligatorias (el SII las exige en el DTE).');
        setTab('id');
        return;
      }
    }
    onSave();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" onClick={() => printSolicitudFicha(kind, value)}>Imprimir solicitud</Button>
          {canWrite && (
            <Button disabled={saving || rutInvalido} onClick={guardar}>{saving ? 'Guardando…' : 'Guardar ficha'}</Button>
          )}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-md px-2.5 py-1 text-xs ${tab === t.id ? 'bg-[var(--color-surface-2)] font-semibold' : 'text-[var(--color-muted)]'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'id' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="RUT">
            <Input
              disabled={!canWrite}
              value={value.rut}
              aria-invalid={rutInvalido}
              onChange={(e) => patch({ rut: e.target.value })}
            />
            {rutInvalido && (
              <p role="alert" className="mt-1 text-xs font-medium text-[var(--color-danger)]">
                {rutValidation?.error}
              </p>
            )}
            {rutValidation?.warning && (
              <p role="status" className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                {rutValidation.warning}
              </p>
            )}
            {rutNota && (
              <p role="status" className="mt-1 text-xs font-medium text-[var(--color-accent-2)]">
                {rutNota}
              </p>
            )}
          </Field>
          <Field label="Razón social"><Input disabled={!canWrite} maxLength={SII_DTE_LIMITS.rznSocRecep} value={value.razonSocial} onChange={(e) => patch({ razonSocial: e.target.value })} /></Field>
          <Field label={kind === 'cliente' ? 'Giro (máx. 40 SII)' : 'Giro (máx. 80 SII)'}>
            <Input
              disabled={!canWrite}
              maxLength={kind === 'cliente' ? SII_DTE_LIMITS.giroRecep : SII_DTE_LIMITS.giroEmis}
              value={value.giro}
              onChange={(e) => patch({ giro: e.target.value })}
            />
          </Field>
          {kind === 'cliente' && (
            <>
              <Field label="Tipo">
                <Select disabled={!canWrite} value={value.tipoCliente ?? 'NACIONAL'} onChange={(e) => patch({ tipoCliente: e.target.value })}>
                  <option value="NACIONAL">Nacional</option>
                  <option value="EXPORTACION">Exportación</option>
                </Select>
              </Field>
              <Field label="Línea de crédito">
                <MontoInput
                  kind="monto"
                  disabled={!canWrite}
                  value={value.credito}
                  onChange={(v) => patch({ credito: v ?? 0 })}
                />
              </Field>
              <Field label="Vendedor"><Input disabled={!canWrite} value={value.vendedor ?? ''} onChange={(e) => patch({ vendedor: e.target.value })} /></Field>
            </>
          )}
          {kind === 'proveedor' && (
            <>
              <Field label="Contacto (resumen)"><Input disabled={!canWrite} value={value.contacto ?? ''} onChange={(e) => patch({ contacto: e.target.value })} /></Field>
              <CampoDiasPago
                label="Condición del NETO (días)"
                value={value.condicionPagoDias}
                otro={netoOtro}
                onOtro={setNetoOtro}
                canWrite={canWrite}
                hint="Se sugiere al armar la OC más adelante; aquí solo se guarda en el proveedor."
                onChange={(dias) => patch({ condicionPagoDias: dias })}
              />
              <CampoDiasPago
                label="Día de pago del IVA (días)"
                value={value.condicionIvaDia}
                otro={ivaOtro}
                onOtro={setIvaOtro}
                canWrite={canWrite}
                onChange={(dias) => patch({ condicionIvaDia: dias })}
              />
              <Field label="Moneda de pago">
                <Input
                  disabled={!canWrite}
                  maxLength={8}
                  className="uppercase"
                  value={value.monedaPago ?? 'CLP'}
                  onChange={(e) => patch({ monedaPago: e.target.value.toUpperCase() })}
                  placeholder="CLP"
                />
              </Field>
            </>
          )}
          <Field label="Teléfono"><Input disabled={!canWrite} value={value.telefono} onChange={(e) => patch({ telefono: e.target.value })} /></Field>
          <Field label="Email"><Input disabled={!canWrite} value={value.email} onChange={(e) => patch({ email: e.target.value })} /></Field>
          <Field label="Dirección fiscal" required={kind === 'cliente'}><Input disabled={!canWrite} maxLength={SII_DTE_LIMITS.dirRecep} value={value.direccion} onChange={(e) => patch({ direccion: e.target.value })} /></Field>
          <Field label="Comuna" required={kind === 'cliente'}><Input disabled={!canWrite} maxLength={SII_DTE_LIMITS.cmnaRecep} value={value.comuna} onChange={(e) => patch({ comuna: e.target.value })} /></Field>
          <Field label="Ciudad (máx. 20 SII)"><Input disabled={!canWrite} maxLength={SII_DTE_LIMITS.ciudadRecep} value={value.ciudad} onChange={(e) => patch({ ciudad: e.target.value })} /></Field>
          <Field label="Solicitado por"><Input disabled={!canWrite} value={value.solicitadoPor ?? ''} onChange={(e) => patch({ solicitadoPor: e.target.value })} /></Field>
          <Field label="Nota de solicitud"><Input disabled={!canWrite} value={value.solicitadoNota ?? ''} onChange={(e) => patch({ solicitadoNota: e.target.value })} /></Field>
          <Checkbox
            className="sm:col-span-2"
            label="Productor (fruta)"
            disabled={!canWrite}
            checked={!!value.esProductor}
            onChange={(e) => patch({ esProductor: e.target.checked })}
          />
          <Checkbox
            className="sm:col-span-2"
            label="Activo"
            disabled={!canWrite}
            checked={value.activo}
            onChange={(e) => patch({ activo: e.target.checked })}
          />
        </div>
      )}

      {tab === 'bancos' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-muted)]">N cuentas y monedas (Agustín Reu6). Sirven después a tesorería.</p>
          {value.cuentasBancarias.map((b, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-[var(--color-border)] p-2 sm:grid-cols-3">
              <Input disabled={!canWrite} placeholder="Banco" value={b.banco} onChange={(e) => {
                const cuentasBancarias = value.cuentasBancarias.map((x, j) => j === i ? { ...x, banco: e.target.value } : x);
                patch({ cuentasBancarias });
              }} />
              <Select disabled={!canWrite} value={b.tipoCuenta} onChange={(e) => {
                const cuentasBancarias = value.cuentasBancarias.map((x, j) => j === i ? { ...x, tipoCuenta: e.target.value } : x);
                patch({ cuentasBancarias });
              }}>
                <option value="CORRIENTE">Corriente</option>
                <option value="VISTA">Vista</option>
                <option value="AHORRO">Ahorro</option>
              </Select>
              <Input disabled={!canWrite} placeholder="N° cuenta" value={b.numero} onChange={(e) => {
                const cuentasBancarias = value.cuentasBancarias.map((x, j) => j === i ? { ...x, numero: e.target.value } : x);
                patch({ cuentasBancarias });
              }} />
              <Input disabled={!canWrite} placeholder="Moneda" value={b.monedaCodigo ?? 'CLP'} onChange={(e) => {
                const cuentasBancarias = value.cuentasBancarias.map((x, j) => j === i ? { ...x, monedaCodigo: e.target.value.toUpperCase() } : x);
                patch({ cuentasBancarias });
              }} />
              <Input disabled={!canWrite} placeholder="Titular" value={b.titular ?? ''} onChange={(e) => {
                const cuentasBancarias = value.cuentasBancarias.map((x, j) => j === i ? { ...x, titular: e.target.value } : x);
                patch({ cuentasBancarias });
              }} />
              <Checkbox
                label="Principal"
                labelClassName="text-xs"
                disabled={!canWrite}
                checked={!!b.principal}
                onChange={(e) => {
                  const cuentasBancarias = value.cuentasBancarias.map((x, j) => j === i ? { ...x, principal: e.target.checked } : x);
                  patch({ cuentasBancarias });
                }}
              />
            </div>
          ))}
          {canWrite && <Button size="sm" variant="outline" onClick={() => patch({ cuentasBancarias: [...value.cuentasBancarias, emptyBanco()] })}>Agregar cuenta</Button>}
        </div>
      )}

      {tab === 'contactos' && (
        <div className="space-y-3">
          {value.contactos.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-[var(--color-border)] p-2 sm:grid-cols-2">
              <Input disabled={!canWrite} placeholder="Nombre" value={c.nombre} onChange={(e) => {
                const contactos = value.contactos.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x);
                patch({ contactos });
              }} />
              <Input disabled={!canWrite} placeholder="Cargo" value={c.cargo ?? ''} onChange={(e) => {
                const contactos = value.contactos.map((x, j) => j === i ? { ...x, cargo: e.target.value } : x);
                patch({ contactos });
              }} />
              <Input disabled={!canWrite} placeholder="Email" value={c.email ?? ''} onChange={(e) => {
                const contactos = value.contactos.map((x, j) => j === i ? { ...x, email: e.target.value } : x);
                patch({ contactos });
              }} />
              <Input disabled={!canWrite} placeholder="Teléfono" value={c.telefono ?? ''} onChange={(e) => {
                const contactos = value.contactos.map((x, j) => j === i ? { ...x, telefono: e.target.value } : x);
                patch({ contactos });
              }} />
            </div>
          ))}
          {canWrite && <Button size="sm" variant="outline" onClick={() => patch({ contactos: [...value.contactos, emptyContacto()] })}>Agregar contacto</Button>}
        </div>
      )}

      {tab === 'despacho' && (
        <div className="space-y-3">
          {value.direcciones.map((d, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-[var(--color-border)] p-2 sm:grid-cols-2">
              <Select disabled={!canWrite} value={d.tipo ?? 'DESPACHO'} onChange={(e) => {
                const direcciones = value.direcciones.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x);
                patch({ direcciones });
              }}>
                <option value="FISCAL">Fiscal</option>
                <option value="DESPACHO">Despacho</option>
                <option value="OTRA">Otra</option>
              </Select>
              <Input disabled={!canWrite} placeholder="Dirección" maxLength={SII_DTE_LIMITS.dirRecep} value={d.linea} onChange={(e) => {
                const direcciones = value.direcciones.map((x, j) => j === i ? { ...x, linea: e.target.value } : x);
                patch({ direcciones });
              }} />
              <Input disabled={!canWrite} placeholder="Comuna" maxLength={SII_DTE_LIMITS.cmnaRecep} value={d.comuna ?? ''} onChange={(e) => {
                const direcciones = value.direcciones.map((x, j) => j === i ? { ...x, comuna: e.target.value } : x);
                patch({ direcciones });
              }} />
              <Input disabled={!canWrite} placeholder="Ciudad" maxLength={SII_DTE_LIMITS.ciudadRecep} value={d.ciudad ?? ''} onChange={(e) => {
                const direcciones = value.direcciones.map((x, j) => j === i ? { ...x, ciudad: e.target.value } : x);
                patch({ direcciones });
              }} />
            </div>
          ))}
          {canWrite && <Button size="sm" variant="outline" onClick={() => patch({ direcciones: [...value.direcciones, emptyDir()] })}>Agregar dirección</Button>}
        </div>
      )}

      {tab === 'historial' && (
        <ul className="max-h-64 space-y-2 overflow-auto text-sm">
          {(historial ?? []).length === 0 && <li className="text-[var(--color-muted)]">Sin cambios registrados.</li>}
          {(historial ?? []).map((h) => (
            <li key={h.id} className="border-b border-[var(--color-border)] pb-1">
              <span className="font-medium">{h.usuarioNombre}</span>
              {' · '}{h.resumen}{' · '}
              <span className="text-[var(--color-muted)]">{fmtDate(h.createdAt.slice(0, 10))}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

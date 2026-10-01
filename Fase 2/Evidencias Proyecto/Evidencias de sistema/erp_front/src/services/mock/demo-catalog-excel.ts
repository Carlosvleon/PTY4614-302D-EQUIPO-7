/**
 * Importación Excel del modo demo para centros, elementos y códigos financieros.
 * Un código ya creado no se actualiza ni se repite, aunque el nombre sea distinto.
 */

export type DemoCatalogKind = 'centro' | 'elemento' | 'codigo';

export type DemoCatalogFila = {
  codigo: string;
  nombre: string;
  contactoEncargado?: string;
  departamento?: string;
  activa?: boolean;
  accion: 'NUEVO' | 'SIN_CAMBIOS';
  cambios: string[];
};

function normHeader(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function activaDe(raw: string | undefined): boolean {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return true;
  if (v === 'NO' || v === 'N' || v === '0' || v === 'FALSE') return false;
  return true;
}

export function filasCatalogoDesdeHoja(
  rows: string[][],
  kind: DemoCatalogKind,
  existentes: Iterable<string>,
): {
  items: DemoCatalogFila[];
  skippedInFile: string[];
  ignoredHeaders: string[];
} {
  const headerAt = rows.findIndex((row) => row.some((c) => normHeader(c) === 'codigo'));
  if (headerAt < 0) throw new Error('No se encontró la columna Código');
  const header = rows[headerAt].map(normHeader);
  const col = (name: string) => header.indexOf(name);
  const iCodigo = col('codigo');
  const iNombre = col('nombre');
  if (iCodigo < 0 || iNombre < 0) throw new Error('La hoja debe traer Código y Nombre');
  const iContacto = col('contacto');
  const iDepto = col('departamento');
  const iActiva = col('activa');
  const known = new Set(['codigo', 'nombre', 'contacto', 'departamento', 'activa', 'vigencia', 'vigenciadesde']);
  const ignoredHeaders = header.filter((h) => h && !known.has(h));

  const existing = new Set([...existentes].map((c) => String(c).trim()));
  const seen = new Set<string>();
  const items: DemoCatalogFila[] = [];
  const skippedInFile: string[] = [];

  for (const row of rows.slice(headerAt + 1)) {
    const codigo = String(row[iCodigo] ?? '').trim();
    const nombre = String(row[iNombre] ?? '').trim().toUpperCase();
    if (!codigo && !nombre) continue;
    if (!/^\d+$/.test(codigo)) {
      skippedInFile.push(codigo ? `${codigo} (el código solo admite dígitos)` : '(fila sin código numérico)');
      continue;
    }
    if (!nombre) {
      skippedInFile.push(`${codigo} (sin nombre)`);
      continue;
    }
    const base = {
      codigo,
      nombre,
      ...(kind === 'centro' && iContacto >= 0
        ? { contactoEncargado: String(row[iContacto] ?? '').trim() || undefined }
        : {}),
      ...(kind === 'elemento' && iDepto >= 0
        ? { departamento: String(row[iDepto] ?? '').trim() }
        : {}),
      ...(kind !== 'elemento' && iActiva >= 0 ? { activa: activaDe(row[iActiva]) } : {}),
    };
    if (seen.has(codigo) || existing.has(codigo)) {
      items.push({
        ...base,
        accion: 'SIN_CAMBIOS',
        cambios: ['El código ya existe. No se pisa ni se repite, aunque el nombre sea distinto.'],
      });
      seen.add(codigo);
      continue;
    }
    seen.add(codigo);
    items.push({ ...base, accion: 'NUEVO', cambios: ['Nuevo'] });
  }

  return { items, skippedInFile, ignoredHeaders };
}

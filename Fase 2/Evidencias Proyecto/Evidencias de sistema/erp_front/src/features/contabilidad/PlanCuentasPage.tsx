import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Field, Select, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSearchableSelect } from '@/components/ui/multi-searchable-select';
import {
  ChevronDown, ChevronRight, Upload, Download, FileDown, Plus, Pencil, Ban, FolderTree,
  Search, Layers, Database, Folder, FileText, ChevronsDownUp, ChevronsUpDown,
  HelpCircle, Save, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AreaNegocio, CentroCosto, CuentaContable, ElementoCosto } from '@/types/domain';
import { CatalogoImportacionesHistorial } from '@/components/common/CatalogoImportacionesHistorial';
import {
  CATALOG_IMPORT_LOST_RESPONSE,
  catalogImportResponseLost,
} from '@/components/common/catalog-excel-import.util';
import { descargarPlantillaCuentas, exportarCuentas } from '@/features/catalogos/catalog-excel-plantilla';
import * as api from '@/services/api';

type CuentaNode = Omit<CuentaContable, 'children'> & { children: CuentaNode[] };

/** Inferir código padre del formato X-X-XX-XX[-XXX] cuando falta padreId. */
function inferPadreCodigo(codigo: string): string | null {
  const parts = codigo.split('-');
  if (parts.length >= 5) return parts.slice(0, 4).join('-');
  if (parts.length !== 4) return null;
  const [a, b, c, d] = parts;
  if (b === '0' && c === '00' && d === '00') return null;
  if (c === '00' && d === '00') return `${a}-0-00-00`;
  if (d === '00') return `${a}-${b}-00-00`;
  return `${a}-${b}-${c}-00`;
}

/** Excel primero; si ese código no existe, el grupo de más arriba (4-1-01-00 → 4-1-00-00 → 4-0-00-00). */
function climbPadreCodigos(codigo: string, padreExcel?: string | null): string[] {
  const out: string[] = [];
  const push = (c: string | null | undefined) => {
    const n = c?.trim();
    if (n && !out.includes(n)) out.push(n);
  };
  push(padreExcel);
  let cur = inferPadreCodigo(codigo);
  while (cur) {
    push(cur);
    const next = inferPadreCodigo(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return out;
}

/** Aplana respuesta anidada (?tree=true) o lista plana. */
function flattenCuentas(rows: CuentaContable[]): CuentaContable[] {
  const out: CuentaContable[] = [];
  const walk = (list: CuentaContable[], parentId?: string) => {
    for (const r of list) {
      const { children, ...rest } = r;
      out.push({ ...rest, padreId: rest.padreId || parentId });
      if (children?.length) walk(children, r.id);
    }
  };
  walk(rows);
  return out;
}

function buildTree(raw: CuentaContable[]): CuentaNode[] {
  const flat = flattenCuentas(raw);
  const byId = new Map<string, CuentaNode>();
  const byCodigo = new Map<string, CuentaNode>();
  for (const r of flat) {
    const node: CuentaNode = { ...r, children: [] };
    byId.set(r.id, node);
    byCodigo.set(r.codigo, node);
  }
  for (const node of byId.values()) {
    if (node.padreId && byId.has(node.padreId)) continue;
    for (const code of climbPadreCodigos(node.codigo)) {
      const p = byCodigo.get(code);
      if (p && p.id !== node.id) {
        node.padreId = p.id;
        break;
      }
    }
  }
  const roots: CuentaNode[] = [];
  for (const node of byId.values()) {
    if (node.padreId && byId.has(node.padreId)) {
      byId.get(node.padreId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: CuentaNode[]) => {
    nodes.sort((a, b) => a.codigo.localeCompare(b.codigo));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function collectIds(nodes: CuentaNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.id);
    collectIds(n.children, out);
  }
  return out;
}

/** IDs de nodos a expandir hasta cierta profundidad (0 = solo raíces abiertas). */
function collectExpandIds(nodes: CuentaNode[], maxDepth: number, depth = 0, out: string[] = []): string[] {
  for (const n of nodes) {
    if (!n.children.length) continue;
    if (depth <= maxDepth) {
      out.push(n.id);
      collectExpandIds(n.children, maxDepth, depth + 1, out);
    }
  }
  return out;
}

function filterTree(nodes: CuentaNode[], q: string): CuentaNode[] {
  if (!q.trim()) return nodes;
  const needle = q.trim().toLowerCase();
  const walk = (list: CuentaNode[]): CuentaNode[] =>
    list
      .map((n) => {
        const kids = walk(n.children);
        const self =
          n.codigo.toLowerCase().includes(needle) || n.nombre.toLowerCase().includes(needle);
        if (self || kids.length) return { ...n, children: kids };
        return null;
      })
      .filter(Boolean) as CuentaNode[];
  return walk(nodes);
}

function nextChildCodigo(padre: CuentaContable, siblings: CuentaContable[]): string {
  const parts = padre.codigo.split('-');
  const nivel = (padre.nivel ?? 1) + 1;
  if (nivel === 2) {
    const used = new Set(siblings.map((s) => s.codigo.split('-')[1]));
    for (let i = 1; i <= 9; i++) {
      const d = String(i);
      if (!used.has(d)) return `${parts[0]}-${d}-00-00`;
    }
  }
  if (nivel === 3) {
    const used = new Set(siblings.map((s) => s.codigo.split('-')[2]));
    for (let i = 1; i <= 99; i++) {
      const d = String(i).padStart(2, '0');
      if (!used.has(d)) return `${parts[0]}-${parts[1]}-${d}-00`;
    }
  }
  if (nivel === 4) {
    const used = new Set(siblings.map((s) => s.codigo.split('-')[3]));
    for (let i = 1; i <= 99; i++) {
      const d = String(i).padStart(2, '0');
      if (!used.has(d)) return `${parts[0]}-${parts[1]}-${parts[2]}-${d}`;
    }
  }
  if (nivel >= 5) {
    const prefix = parts.length >= 4 ? parts.slice(0, 4).join('-') : padre.codigo;
    const used = new Set(siblings.map((s) => s.codigo.split('-')[4] ?? ''));
    for (let i = 1; i <= 999; i++) {
      const d = String(i).padStart(3, '0');
      if (!used.has(d)) return `${prefix}-${d}`;
    }
  }
  return `${padre.codigo}-001`;
}

function LevelIcon({ nivel, imputable }: { nivel: number; imputable: boolean }) {
  if (nivel <= 1) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <Database size={13} />
      </span>
    );
  }
  if (!imputable) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
        <Folder size={13} />
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      <FileText size={13} />
    </span>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  onAdd,
  onEdit,
  onToggleActiva,
}: {
  node: CuentaNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onAdd: (n: CuentaContable) => void;
  onEdit: (n: CuentaContable) => void;
  onToggleActiva: (n: CuentaContable) => void;
}) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  const nivel = node.nivel ?? 1;
  const isRoot = nivel === 1;
  const imputable = !node.noImputable;

  return (
    <>
      <div
        className="group flex items-center gap-2 border-b border-[var(--color-border)]/60 px-2 py-1.5 last:border-0 hover:bg-[var(--color-surface-2)]"
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center text-[var(--color-muted)]"
          onClick={() => hasKids && toggle(node.id)}
          aria-label={open ? 'Colapsar' : 'Expandir'}
        >
          {hasKids ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
        </button>
        <LevelIcon nivel={nivel} imputable={imputable} />
        <span className="font-mono text-xs text-[var(--color-muted)]">{node.codigo}</span>
        <span className="text-sm text-[var(--color-text)]">— {node.nombre}</span>
        {isRoot && (
          <Badge tone={node.tipo === 'INGRESO' || node.tipo === 'GASTO' ? 'info' : 'success'}>
            {node.tipo === 'INGRESO' || node.tipo === 'GASTO' ? 'Resultado' : 'Balance'}
          </Badge>
        )}
        {!isRoot && !imputable && <Badge tone="muted">Grupo</Badge>}
        {imputable && <Badge tone="info">Imputable</Badge>}
        {!node.activa && <Badge tone="warning">Inactiva</Badge>}
        {node.requiereCc && <Badge tone="muted">CC</Badge>}
        {node.requiereElemento && <Badge tone="muted">EC</Badge>}
        {node.requiereArea && <Badge tone="muted">Área</Badge>}
        <span className="ml-auto flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" className="rounded p-1.5 text-[var(--color-accent-2)] hover:bg-[var(--color-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent-2)]" title="Agregar hijo" aria-label={`Agregar hijo de ${node.codigo}`} onClick={() => onAdd(node)}>
            <Plus size={14} />
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent-2)]" title="Editar" aria-label={`Editar ${node.codigo}`} onClick={() => onEdit(node)}>
            <Pencil size={14} />
          </button>
          <button type="button" className="rounded p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-brand-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-danger)]" title={node.activa ? 'Deshabilitar' : 'Reactivar'} aria-label={`${node.activa ? 'Deshabilitar' : 'Reactivar'} ${node.codigo}`} onClick={() => onToggleActiva(node)}>
            {node.activa ? <Ban size={14} /> : <RotateCcw size={14} />}
          </button>
        </span>
      </div>
      {hasKids && open && node.children.map((c) => (
        <TreeRow
          key={c.id}
          node={c}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          onAdd={onAdd}
          onEdit={onEdit}
          onToggleActiva={onToggleActiva}
        />
      ))}
    </>
  );
}

type AccionImport = 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';
type VinculosPolitica = 'conservar' | 'quitar_si_flag_off' | 'arrastrar_padre' | 'desde_excel';
type PreviewSortKey = 'codigo' | 'nombre' | 'nivel' | 'padreCodigo' | 'accion';

type PreviewItem = {
  codigo: string;
  nombre: string;
  nivel?: number;
  tipo?: string;
  padreCodigo?: string | null;
  padreActual?: string | null;
  codigoExcel?: string | null;
  activa?: boolean;
  requiereCc?: boolean;
  requiereArea?: boolean;
  requiereEspecie?: boolean;
  requiereElemento?: boolean;
  noImputable?: boolean;
  accion?: AccionImport;
  cambios?: string[];
  vinculosCount?: number;
  centroCostoCodigos?: string[];
  elementoCostoCodigos?: string[];
  areaNegocioCodigos?: string[];
};

type PreviewState = {
  file: File;
  total: number;
  duplicados: number;
  existingCount: number;
  duplicateCodigos: string[];
  items: PreviewItem[];
  nuevos?: number;
  sinCambios?: number;
  ignoredHeaders?: string[];
  hasDimensionCodes?: boolean;
  centrosCount?: number;
  elementosCount?: number;
  areasCount?: number;
  avisoMaestros?: string | null;
};

function sortPreviewItems(items: PreviewItem[], key: PreviewSortKey, dir: 'asc' | 'desc') {
  const m = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === 'nivel') return ((a.nivel ?? 0) - (b.nivel ?? 0)) * m;
    const av = String(a[key] ?? '');
    const bv = String(b[key] ?? '');
    return av.localeCompare(bv, 'es', { numeric: true }) * m;
  });
}

function labelAccionPreview(accion?: AccionImport) {
  if (accion === 'NUEVO') return 'Nueva';
  if (accion === 'ACTUALIZA') return 'Cambia';
  if (accion === 'SIN_CAMBIOS') return 'Igual';
  return '—';
}

function ImportPolicyBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="pt-0.5 shrink-0">{children}</div>
      <div>
        <div className="font-medium text-[var(--color-text)]">{title}</div>
        <p className="mt-0.5 text-[var(--color-muted)] leading-snug">{hint}</p>
      </div>
    </div>
  );
}

function QueHacerCard({
  selected,
  title,
  children,
  onSelect,
}: {
  selected: boolean;
  title: string;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <label
      className={[
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]',
      ].join(' ')}
    >
      <input
        type="radio"
        name="que-hacer-plan"
        className="mt-1 accent-[var(--color-accent)]"
        checked={selected}
        onChange={onSelect}
      />
      <span>
        <span className="block font-semibold text-[var(--color-text)]">{title}</span>
        <span className="mt-1 block text-[var(--color-muted)] leading-relaxed">{children}</span>
      </span>
    </label>
  );
}

export function PlanCuentasPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const qKey = listQueryKey(scope, empresaId, 'cuentas');
  const cuentasQ = useQuery({ queryKey: qKey, queryFn: api.getCuentas });
  const centrosQ = useQuery({ queryKey: listQueryKey(scope, empresaId, 'centros-costo'), queryFn: api.getCentrosCosto });
  const elementosQ = useQuery({ queryKey: listQueryKey(scope, empresaId, 'elementos-costo'), queryFn: api.getElementosCosto });
  const areasQ = useQuery({ queryKey: listQueryKey(scope, empresaId, 'areas-negocio'), queryFn: api.getAreasNegocio });
  const flat = (cuentasQ.data ?? []) as CuentaContable[];
  const tree = useMemo(() => buildTree(flat), [flat]);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const autoExpandKey = useRef('');
  const filtered = useMemo(() => filterTree(tree, search), [tree, search]);

  const centroOptions = useMemo(
    () => ((centrosQ.data ?? []) as CentroCosto[]).map((c) => ({
      value: c.id,
      label: `${c.codigo} · ${c.nombre}`,
    })),
    [centrosQ.data],
  );
  const elementoOptions = useMemo(
    () => ((elementosQ.data ?? []) as ElementoCosto[]).map((c) => ({
      value: c.id,
      label: `${c.codigo} · ${c.nombre}`,
    })),
    [elementosQ.data],
  );
  const areaOptions = useMemo(
    () => ((areasQ.data ?? []) as AreaNegocio[]).map((c) => ({
      value: c.id,
      label: `${c.codigo} · ${c.nombre}`,
    })),
    [areasQ.data],
  );

  // Buscador: expandir ramas visibles al filtrar
  useEffect(() => {
    if (!search.trim()) return;
    setExpanded(new Set(collectIds(filtered)));
  }, [search, filtered]);

  // Expandir jerarquía al cargar (todo si es plan pequeño; 3 niveles si es grande)
  useEffect(() => {
    if (!tree.length) return;
    const key = `${empresaId}:${flat.length}:${flat[0]?.id ?? ''}:${flat[flat.length - 1]?.id ?? ''}`;
    if (autoExpandKey.current === key) return;
    autoExpandKey.current = key;
    if (flat.length <= 250) {
      setExpanded(new Set(collectIds(tree)));
    } else {
      setExpanded(new Set(collectExpandIds(tree, 2)));
    }
  }, [tree, flat, empresaId]);

  const [catOpen, setCatOpen] = useState(false);
  const [catDigito, setCatDigito] = useState('1');
  const [catNombre, setCatNombre] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<CuentaContable | null>(null);
  const [formCodigo, setFormCodigo] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formTipo, setFormTipo] = useState<CuentaContable['tipo']>('ACTIVO');
  const [formPadreId, setFormPadreId] = useState<string>('');
  const [formNoImputable, setFormNoImputable] = useState(true);
  const [formActiva, setFormActiva] = useState(true);
  const [formReqCc, setFormReqCc] = useState(false);
  const [formReqEl, setFormReqEl] = useState(false);
  const [formReqArea, setFormReqArea] = useState(false);
  const [formReqEsp, setFormReqEsp] = useState(false);
  const [formCcIds, setFormCcIds] = useState<string[]>([]);
  const [formElIds, setFormElIds] = useState<string[]>([]);
  const [formAreaIds, setFormAreaIds] = useState<string[]>([]);
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactRow, setImpactRow] = useState<CuentaContable | null>(null);
  const [impact, setImpact] = useState<{
    asientos: number;
    asientosBorrador?: number;
    asientosContabilizados?: number;
    asientoEjemplos?: { numero: string; estado: string }[];
    hijos: number;
    configsSii: number;
    ordenesCompra: number;
    documentos: number;
    insumos: number;
    vinculos: number;
  } | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState<'excel' | 'csv'>('excel');
  const [bulkStep, setBulkStep] = useState<1 | 2>(1);
  const [queHacer, setQueHacer] = useState<'nombres' | 'arbol'>('nombres');
  const [bulkText, setBulkText] = useState('codigo,nombre,tipo,nivel\n1-0-00-00,ACTIVO,ACTIVO,1');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  /** Códigos a importar. Por defecto: todas las filas del Excel. */
  const [keptCodigos, setKeptCodigos] = useState<Set<string>>(() => new Set());
  const [replacePlan, setReplacePlan] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aplicarArrastre, setAplicarArrastre] = useState(false);
  const [aplicarFlags, setAplicarFlags] = useState(false);
  const [vinculos, setVinculos] = useState<VinculosPolitica>('conservar');
  const [sortKey, setSortKey] = useState<PreviewSortKey>('codigo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const fileRef = useRef<HTMLInputElement>(null);
  const keptCount = preview ? preview.items.filter((it) => keptCodigos.has(it.codigo)).length : 0;
  const sueltasCount = useMemo(() => {
    if (!preview) return 0;
    const byCodigo = new Map(flat.map((c) => [c.codigo, c]));
    const byId = new Map(flat.map((c) => [c.id, c]));
    const known = new Set([...byCodigo.keys(), ...preview.items.map((it) => it.codigo)]);
    return preview.items.filter((it) => {
      if (!keptCodigos.has(it.codigo)) return false;
      const existing = byCodigo.get(it.codigo);
      if (!existing) return false;
      if (existing.padreId && byId.has(existing.padreId)) return false;
      return climbPadreCodigos(it.codigo, it.padreCodigo).some((c) => known.has(c) && c !== it.codigo);
    }).length;
  }, [preview, keptCodigos, flat]);
  const sortedPreviewItems = useMemo(
    () => (preview ? sortPreviewItems(preview.items, sortKey, sortDir) : []),
    [preview, sortKey, sortDir],
  );

  const togglePreviewSort = (key: PreviewSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qKey });
    void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'catalogo-importaciones:PLAN_CUENTAS') });
  };

  const expandAll = () => setExpanded(new Set(collectIds(filtered)));
  const collapseAll = () => setExpanded(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateChild = (padre: CuentaContable) => {
    const siblings = flat.filter((c) => c.padreId === padre.id);
    setEditRow(null);
    setFormCodigo(nextChildCodigo(padre, siblings));
    setFormNombre('');
    setFormTipo(padre.tipo);
    setFormPadreId(padre.id);
    setFormNoImputable((padre.nivel ?? 1) + 1 < 5);
    setFormActiva(true);
    setFormReqCc(false);
    setFormReqEl(false);
    setFormReqArea(false);
    setFormReqEsp(false);
    setFormCcIds([]);
    setFormElIds([]);
    setFormAreaIds([]);
    setEditOpen(true);
  };

  const openEdit = (row: CuentaContable) => {
    setEditRow(row);
    setFormCodigo(row.codigo);
    setFormNombre(row.nombre);
    setFormTipo(row.tipo);
    setFormPadreId(row.padreId ?? '');
    setFormNoImputable(Boolean(row.noImputable));
    setFormActiva(row.activa);
    setFormReqCc(Boolean(row.requiereCc));
    setFormReqEl(Boolean(row.requiereElemento));
    setFormReqArea(Boolean(row.requiereArea));
    setFormReqEsp(Boolean(row.requiereEspecie));
    setFormCcIds(row.centroCostoIds ?? []);
    setFormElIds(row.elementoCostoIds ?? []);
    setFormAreaIds(row.areaNegocioIds ?? []);
    setEditOpen(true);
  };

  const saveCuenta = async () => {
    try {
      if (!formCodigo.trim() || !formNombre.trim()) {
        toast.error('Código y nombre son obligatorios');
        return;
      }
      const payload = {
        codigo: formCodigo.trim(),
        nombre: formNombre.trim(),
        tipo: formTipo,
        padreId: formPadreId || undefined,
        noImputable: formNoImputable,
        activa: formActiva,
        requiereCc: formReqCc,
        requiereElemento: formReqEl,
        requiereArea: formReqArea,
        requiereEspecie: formReqEsp,
        centroCostoIds: formCcIds,
        elementoCostoIds: formElIds,
        areaNegocioIds: formAreaIds,
      };
      if (editRow) {
        if (editRow.nombre.trim() !== formNombre.trim()) {
          toast.message('El nombre se verá actualizado en asientos, diario, mayor y reportes que leen el maestro.');
        }
        await api.updateCuenta(editRow.id, payload);
        toast.success('Cuenta actualizada');
      } else {
        await api.createCuenta({ ...payload, activa: true });
        toast.success('Cuenta creada');
      }
      setEditOpen(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  const createCategoria = async () => {
    try {
      const digito = Number(catDigito);
      if (digito < 1 || digito > 8) {
        toast.error('El primer dígito debe ser 1–8');
        return;
      }
      if (!catNombre.trim()) {
        toast.error('Nombre obligatorio');
        return;
      }
      await api.createCategoriaCuenta({ digito, nombre: catNombre.trim() });
      toast.success('Categoría creada');
      setCatOpen(false);
      setCatNombre('');
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear categoría');
    }
  };

  const requestToggleActiva = async (row: CuentaContable) => {
    if (row.activa) {
      try {
        const data = await api.getCuentaImpacto(row.id);
        setImpactRow(row);
        setImpact(data);
        setImpactOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo calcular el impacto');
      }
      return;
    }
    try {
      await api.updateCuenta(row.id, { activa: true });
      toast.success('Cuenta reactivada');
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reactivar');
    }
  };

  const confirmInactivar = async () => {
    if (!impactRow) return;
    try {
      await api.updateCuenta(impactRow.id, { activa: false });
      toast.success('Cuenta deshabilitada. El histórico se conserva.');
      setImpactOpen(false);
      setImpactRow(null);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo deshabilitar');
    }
  };

  const loadExcelPreview = async (file: File, arrastre: boolean) => {
    const res = await api.previewPlanCuentasExcel(file, arrastre);
    const items = (res.items ?? []) as PreviewItem[];
    setPreview({
      file,
      total: res.total,
      duplicados: res.duplicados,
      existingCount: res.existingCount,
      duplicateCodigos: res.duplicateCodigos ?? [],
      items,
      nuevos: res.nuevos,
      sinCambios: res.sinCambios,
      ignoredHeaders: res.ignoredHeaders,
      hasDimensionCodes: res.hasDimensionCodes,
      centrosCount: res.centrosCount,
      elementosCount: res.elementosCount,
      areasCount: res.areasCount,
      avisoMaestros: res.avisoMaestros,
    });
    setKeptCodigos(new Set(items.map((it) => it.codigo)));
    if (res.hasDimensionCodes === false && vinculos === 'desde_excel') setVinculos('conservar');
    return res;
  };

  const onPickExcel = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      toast.error('Solo se aceptan archivos .xls o .xlsx de una sola hoja (PlanDeCuenta)');
      return;
    }
    setImporting(true);
    try {
      const res = await loadExcelPreview(file, aplicarArrastre);
      setBulkStep(1);
      invalidate();
      toast.success(`Preview: ${res.total} cuentas · ${res.nuevos ?? 0} nuevas · ${res.duplicados} con cambios`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el Excel');
      setPreview(null);
      setKeptCodigos(new Set());
    } finally {
      setImporting(false);
    }
  };

  const toggleKept = (codigo: string) => {
    setKeptCodigos((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const keepAll = () => {
    if (!preview) return;
    setKeptCodigos(new Set(preview.items.map((it) => it.codigo)));
  };

  const discardAll = () => setKeptCodigos(new Set());

  const keepOnlyCambios = () => {
    if (!preview) return;
    setKeptCodigos(new Set(preview.items.filter((it) => it.accion !== 'SIN_CAMBIOS').map((it) => it.codigo)));
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setPreview(null);
    setKeptCodigos(new Set());
    setBulkStep(1);
    setQueHacer('nombres');
    setReplacePlan(false);
  };

  const confirmExcelImport = async () => {
    if (!preview) return;
    const selected = preview.items
      .filter((it) => keptCodigos.has(it.codigo))
      .sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0) || a.codigo.localeCompare(b.codigo));
    if (!selected.length) {
      toast.error('Seleccione al menos una cuenta para importar');
      return;
    }
    if (preview.avisoMaestros && !window.confirm(preview.avisoMaestros)) return;
    const borrarDeCero = queHacer !== 'arbol' && replacePlan;
    if (borrarDeCero && !confirm('Se va a borrar el plan actual y cargar el Excel de cero. Esto no se puede deshacer y falla si hay asientos o cuentas usadas. Para agrupar no hace falta borrar. ¿Continuar?')) return;
    setImporting(true);
    try {
      const res = await api.bulkCuentas({
        items: selected.map((it) => ({
          codigo: it.codigo,
          nombre: it.nombre,
          tipo: (it.tipo ?? 'ACTIVO') as CuentaContable['tipo'],
          nivel: it.nivel,
          padreCodigo: it.padreCodigo ?? undefined,
          codigoExcel: it.codigoExcel ?? undefined,
          activa: it.activa,
          requiereCc: it.requiereCc,
          requiereArea: it.requiereArea,
          requiereEspecie: it.requiereEspecie,
          requiereElemento: it.requiereElemento,
          noImputable: it.noImputable,
          centroCostoCodigos: it.centroCostoCodigos,
          elementoCostoCodigos: it.elementoCostoCodigos,
          areaNegocioCodigos: it.areaNegocioCodigos,
        })),
        replace: borrarDeCero,
        actualizarAnidacion: queHacer === 'arbol',
        aplicarFlags,
        vinculos,
        archivoNombre: preview.file.name,
      });
      toast.success(`Importado: +${res.created} / ~${res.updated} (total ${res.total})`);
      setBulkOpen(false);
      setPreview(null);
      setKeptCodigos(new Set());
      setReplacePlan(false);
      setAplicarArrastre(false);
      setQueHacer('nombres');
      setBulkStep(1);
      setAplicarFlags(false);
      setVinculos('conservar');
      invalidate();
    } catch (e) {
      if (catalogImportResponseLost(e)) {
        closeBulk();
        invalidate();
        toast.warning(CATALOG_IMPORT_LOST_RESPONSE);
      } else {
        toast.error(e instanceof Error ? e.message : 'Error al importar');
      }
    } finally {
      setImporting(false);
    }
  };

  const runBulkCsv = async () => {
    try {
      const lines = bulkText.trim().split(/\r?\n/).filter(Boolean);
      const start = lines[0]?.toLowerCase().includes('codigo') ? 1 : 0;
      const items = lines.slice(start).map((line) => {
        const [codigo, nombre, tipo, nivel] = line.split(',').map((s) => s.trim());
        const nivelNum = nivel ? Number(nivel) : undefined;
        return {
          codigo,
          nombre,
          tipo: (tipo || 'ACTIVO').toUpperCase() as CuentaContable['tipo'],
          nivel: nivelNum,
          padreCodigo: inferPadreCodigo(codigo) ?? undefined,
          activa: true,
          noImputable: nivelNum ? nivelNum < 5 : true,
        };
      });
      const res = await api.bulkCuentas({ items, replace: false });
      toast.success(`Carga masiva: +${res.created} / ~${res.updated}`);
      setBulkOpen(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en carga masiva');
    }
  };

  const catCodigoPreview = `${catDigito || 'X'}-0-00-00`;

  return (
    <div>
      <div className="mb-5 overflow-hidden rounded-xl border border-[var(--color-border)] bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div>
            <div className="mb-1 text-xs text-white/70">Parametrización</div>
            <h1 className="text-2xl font-semibold tracking-tight">Plan de Cuentas</h1>
            <p className="mt-1 text-sm text-white/85">
              Catálogo contable por categorías y cuentas codificadas
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
            onClick={() => toast.message('Ayuda', {
              description: 'Use la plantilla de una sola hoja «PlanDeCuenta», con las cuentas padre (nivel 1 a 4) y la hoja (nivel 5). Exportar baja el plan en ese formato para editarlo y volver a subirlo.',
            })}
          >
            <HelpCircle size={14} /> Ayuda
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" leftIcon={<FolderTree size={14} />} onClick={() => toast.message('Niveles', { description: 'Formato X-X-XX-XX (+ segmento Excel opcional X-X-XX-XX-XXX). Máx. 8 categorías raíz (1–8).' })}>
          Configurar niveles
        </Button>
        <Button size="sm" leftIcon={<Layers size={14} />} onClick={() => {
          const used = new Set(
            flat.filter((c) => (c.nivel ?? 1) === 1).map((c) => c.codigo.split('-')[0]),
          );
          let next = '1';
          for (let i = 1; i <= 8; i += 1) {
            if (!used.has(String(i))) {
              next = String(i);
              break;
            }
          }
          setCatDigito(next);
          setCatNombre('');
          setCatOpen(true);
        }}>
          Nueva categoría
        </Button>
        <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={descargarPlantillaCuentas}>
          Plantilla
        </Button>
        <Button variant="outline" size="sm" leftIcon={<FileDown size={14} />} onClick={() => exportarCuentas(flat)}>
          Exportar
        </Button>
        <CatalogoImportacionesHistorial tipo="PLAN_CUENTAS" size="sm" />
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Upload size={14} />}
          onClick={() => {
            setBulkOpen(true);
            setBulkTab('excel');
            setBulkStep(1);
            setQueHacer('nombres');
            setPreview(null);
            setKeptCodigos(new Set());
            setAplicarArrastre(false);
            setAplicarFlags(false);
            setVinculos('conservar');
          }}
        >
          Carga masiva
        </Button>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                Estructura del plan de cuentas contable
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Pase el cursor sobre una cuenta para agregar, editar o deshabilitar
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por código o nombre..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" leftIcon={<ChevronsUpDown size={14} />} onClick={expandAll}>
                Expandir
              </Button>
              <Button variant="ghost" size="sm" leftIcon={<ChevronsDownUp size={14} />} onClick={collapseAll}>
                Colapsar
              </Button>
              <span className="text-xs text-[var(--color-muted)]">{flat.length} cuentas</span>
            </div>
          </div>

          {cuentasQ.isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Sin cuentas. Cree una categoría o use Carga masiva.
            </p>
          ) : (
            <div className="max-h-[65vh] overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1">
              {filtered.map((n) => (
                <TreeRow
                  key={n.id}
                  node={n}
                  depth={0}
                  expanded={expanded}
                  toggle={toggle}
                  onAdd={openCreateChild}
                  onEdit={openEdit}
                  onToggleActiva={requestToggleActiva}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent-2)]">
              <Layers size={16} />
            </span>
            <span>
              <span className="block">Nueva Categoría</span>
              <span className="block text-xs font-normal text-[var(--color-muted)]">Gestión de categoría contable.</span>
            </span>
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setCatOpen(false)}>Cancelar</Button>
            <Button leftIcon={<Save size={14} />} onClick={createCategoria}>Guardar</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código Categoría *">
            <Input
              type="number"
              min={1}
              max={8}
              value={catDigito}
              onChange={(e) => setCatDigito(e.target.value)}
              className="font-mono"
              placeholder="1"
            />
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              Sugerido. Puede cambiarlo. Formato completo: <span className="font-mono">{catCodigoPreview}</span>. Los niveles siguientes al primero deben ser ceros. Primer dígito 1–8.
            </p>
          </Field>
          <Field label="Nombre Categoría *">
            <Input value={catNombre} onChange={(e) => setCatNombre(e.target.value)} placeholder="Ej: ACTIVO" />
          </Field>
        </div>
        <p className="mt-3 text-xs text-[var(--color-accent-2)]">
          Solo se permiten códigos que empiecen con dígitos del 1 al 8 (máximo 8 categorías principales).
        </p>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editRow ? 'Editar cuenta' : 'Nueva cuenta'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveCuenta}>Guardar</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código">
            <div className="flex items-center gap-2">
              <Input
                value={formCodigo}
                onChange={(e) => setFormCodigo(e.target.value)}
                placeholder="1-1-01-01"
                className="font-mono"
              />
              {!editRow && (
                <p className="mt-1 text-[11px] text-[var(--color-muted)]">Sugerido. Puede cambiarlo.</p>
              )}
              {editRow && !editRow.activa && <Badge tone="warning">Inactiva</Badge>}
            </div>
          </Field>
          <Field label="Nombre">
            <Input value={formNombre} onChange={(e) => setFormNombre(e.target.value)} />
          </Field>
          <Field label="Tipo">
            <Select
              value={formTipo}
              onChange={(e) => setFormTipo(e.target.value as CuentaContable['tipo'])}
            >
              {['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Padre">
            <SearchableSelect
              value={formPadreId}
              onChange={setFormPadreId}
              options={[
                { value: '', label: '(raíz)' },
                ...flat
                  .filter((c) => c.id !== editRow?.id)
                  .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` })),
              ]}
              placeholder="Buscar padre…"
            />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="No imputable (agrupación)"
              checked={formNoImputable}
              onChange={(e) => setFormNoImputable(e.target.checked)}
            />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">Requisitos de imputación</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Checkbox
                label="Exige centro de costo"
                checked={formReqCc}
                onChange={(e) => setFormReqCc(e.target.checked)}
              />
              <Checkbox
                label="Exige elemento de costo"
                checked={formReqEl}
                onChange={(e) => setFormReqEl(e.target.checked)}
              />
              <Checkbox
                label="Exige área de negocio"
                checked={formReqArea}
                onChange={(e) => setFormReqArea(e.target.checked)}
              />
              <Checkbox
                label="Exige especie"
                checked={formReqEsp}
                onChange={(e) => setFormReqEsp(e.target.checked)}
              />
            </div>
          </div>
          <Field label="Centros de costo asociados" className="sm:col-span-2">
            <MultiSearchableSelect
              value={formCcIds}
              onChange={setFormCcIds}
              options={centroOptions}
              placeholder="Buscar y seleccionar centros…"
              emptyLabel="Sin centros de costo"
            />
          </Field>
          <Field label="Elementos de costo asociados" className="sm:col-span-2">
            <MultiSearchableSelect
              value={formElIds}
              onChange={setFormElIds}
              options={elementoOptions}
              placeholder="Buscar y seleccionar elementos…"
              emptyLabel="Sin elementos de costo"
            />
          </Field>
          <Field label="Áreas de negocio asociadas" className="sm:col-span-2">
            <MultiSearchableSelect
              value={formAreaIds}
              onChange={setFormAreaIds}
              options={areaOptions}
              placeholder="Buscar y seleccionar áreas…"
              emptyLabel="Sin áreas de negocio"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={impactOpen}
        onClose={() => setImpactOpen(false)}
        title="Deshabilitar cuenta"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImpactOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmInactivar}>Confirmar deshabilitar</Button>
          </>
        }
      >
        <p className="text-sm">
          {impactRow ? `${impactRow.codigo} · ${impactRow.nombre}` : ''}
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Los comprobantes asociados quedan. No se podrá usar esta cuenta en asientos ni imputaciones nuevas.
          Si más adelante cambia el nombre, los reportes históricos muestran el nombre actual del maestro.
        </p>
        {impact && (
          <ul className="mt-3 list-disc pl-5 text-sm">
            <li>
              {impact.asientos} asiento(s)
              {impact.asientosContabilizados != null || impact.asientosBorrador != null
                ? ` (${impact.asientosContabilizados ?? 0} contabilizado(s), ${impact.asientosBorrador ?? 0} borrador)`
                : ''}
            </li>
            {(impact.asientoEjemplos ?? []).length > 0 && (
              <li>
                Ejemplos:{' '}
                {impact.asientoEjemplos!.map((a) => `${a.numero} (${a.estado})`).join(', ')}
              </li>
            )}
            <li>{impact.hijos} cuenta(s) hija(s)</li>
            <li>{impact.ordenesCompra} orden(es) de compra</li>
            <li>{impact.documentos} documento(s) comercial(es)</li>
            <li>{impact.insumos} insumo(s)</li>
            <li>{impact.configsSii} config(s) SII</li>
            <li>{impact.vinculos} vínculo(s) CC/elemento/área</li>
          </ul>
        )}
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={closeBulk}
        title={
          bulkTab === 'excel'
            ? (bulkStep === 1 ? 'Carga masiva · paso 1 de 2' : 'Carga masiva · paso 2 de 2')
            : 'Carga masiva'
        }
        size="xl"
        footer={
          bulkTab === 'csv' ? (
            <>
              <Button variant="ghost" onClick={closeBulk}>Cancelar</Button>
              <Button onClick={runBulkCsv}>Importar CSV</Button>
            </>
          ) : bulkStep === 2 ? (
            <>
              <Button variant="ghost" onClick={() => setBulkStep(1)}>Atrás</Button>
              <Button disabled={!preview || importing || keptCount === 0} onClick={confirmExcelImport}>
                {importing ? 'Importando…' : `Confirmar (${keptCount} cuentas)`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={closeBulk}>Cancelar</Button>
              <Button disabled={!preview || importing || keptCount === 0} onClick={() => setBulkStep(2)}>
                Siguiente
              </Button>
            </>
          )
        }
      >
        {!(bulkTab === 'excel' && bulkStep === 2) && (
        <div className="mb-3 flex gap-2">
          <Button size="sm" variant={bulkTab === 'excel' ? 'primary' : 'outline'} onClick={() => { setBulkTab('excel'); setBulkStep(1); }}>
            Excel
          </Button>
          <Button size="sm" variant={bulkTab === 'csv' ? 'primary' : 'outline'} onClick={() => { setBulkTab('csv'); setBulkStep(1); }}>
            CSV simple
          </Button>
        </div>
        )}

        {bulkTab === 'excel' ? (
          <div className="space-y-3">
            {bulkStep === 1 && (
            <>
            <p className="text-sm text-[var(--color-muted)]">
              Descargue la plantilla (una hoja llamada <strong>PlanDeCuenta</strong>, con el grupo de cuentas padre y la cuenta hoja) o exporte el plan, edítelo y vuelva a subirlo.
              El libro con varias pestañas no se acepta.
              En este paso solo elige el archivo y qué cuentas incluir.
              Nada se guarda todavía.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onPickExcel(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              leftIcon={<Upload size={14} />}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? 'Leyendo…' : 'Seleccionar Excel'}
            </Button>
            {preview && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm space-y-2">
                <div><strong>{preview.file.name}</strong></div>
                <div className="text-[var(--color-muted)]">
                  {preview.nuevos ?? 0} cuentas nuevas
                  {' · '}{preview.duplicados} con cambios de nombre u otros datos
                  {' · '}{preview.sinCambios ?? 0} iguales a lo que ya está
                  {' · '}hoy hay {preview.existingCount} en el plan
                </div>
                {(preview.ignoredHeaders?.length ?? 0) > 0 && (
                  <p className="text-xs text-[var(--color-muted)]">
                    El Excel trae columnas que este plan no usa y se ignoran:
                    {' '}{preview.ignoredHeaders!.join(', ')}.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[var(--color-text)]">
                    {keptCount} filas marcadas de {preview.items.length}
                  </span>
                  <Button size="sm" variant="outline" onClick={keepAll}>Marcar todas</Button>
                  <Button size="sm" variant="outline" onClick={discardAll}>Ninguna</Button>
                  <Button size="sm" variant="outline" onClick={keepOnlyCambios}>
                    Solo nuevas y las que cambian
                  </Button>
                </div>
                <p className="text-xs text-[var(--color-muted)]">
                  Puede ordenar la tabla con un clic en el encabezado; eso no cambia cómo se guarda.
                </p>
                <div className="max-h-[50vh] overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
                      <tr>
                        <th className="w-10 px-2 py-1.5">
                          <Checkbox
                            checked={preview.items.length > 0 && keptCount === preview.items.length}
                            ref={(el) => {
                              if (el) el.indeterminate = keptCount > 0 && keptCount < preview.items.length;
                            }}
                            onChange={(e) => (e.target.checked ? keepAll() : discardAll())}
                            aria-label="Seleccionar todas"
                          />
                        </th>
                        {([
                          ['codigo', 'Código'],
                          ['nombre', 'Nombre'],
                          ['nivel', 'Nivel'],
                          ['padreCodigo', 'Grupo padre'],
                          ['accion', 'Qué hará'],
                        ] as const).map(([key, header]) => (
                          <th key={key} className="px-2 py-1.5">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-medium hover:underline"
                              onClick={() => togglePreviewSort(key)}
                            >
                              {header}
                              {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPreviewItems.map((it) => {
                        const kept = keptCodigos.has(it.codigo);
                        return (
                          <tr
                            key={it.codigo}
                            className={[
                              'border-t border-[var(--color-border)]',
                              it.accion === 'ACTUALIZA' ? 'bg-amber-50/80 dark:bg-amber-950/30' : '',
                              it.accion === 'NUEVO' ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : '',
                              !kept ? 'opacity-50' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            <td className="px-2 py-1">
                              <Checkbox
                                checked={kept}
                                onChange={() => toggleKept(it.codigo)}
                                aria-label={`Conservar ${it.codigo}`}
                              />
                            </td>
                            <td className="px-2 py-1 font-mono">{it.codigo}</td>
                            <td className="px-2 py-1">{it.nombre}</td>
                            <td className="px-2 py-1">{it.nivel ?? ''}</td>
                            <td className="px-2 py-1 font-mono text-[var(--color-muted)]">
                              {it.padreActual && it.padreActual !== (it.padreCodigo ?? null)
                                ? `${it.padreActual ?? '(vacío)'} → ${it.padreCodigo ?? '(vacío)'}`
                                : (it.padreCodigo ?? '—')}
                              {typeof it.vinculosCount === 'number' && it.vinculosCount > 0
                                ? ` · ${it.vinculosCount} asignados`
                                : ''}
                            </td>
                            <td className="px-2 py-1">
                              <Badge tone={it.accion === 'NUEVO' ? 'success' : it.accion === 'ACTUALIZA' ? 'warning' : 'muted'}>
                                {labelAccionPreview(it.accion)}
                              </Badge>
                              {(it.cambios?.length ?? 0) > 0 && (
                                <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">{it.cambios!.join('; ')}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </>
            )}
            {bulkStep === 2 && preview && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-[var(--color-text)]">
                    Van a procesarse <strong>{keptCount}</strong> cuentas de{' '}
                    <strong>{preview.file.name}</strong>.
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    ¿Qué quiere que haga el sistema con ellas?
                  </p>
                </div>
                {sueltasCount > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                    Hoy hay <strong>{sueltasCount}</strong> cuentas marcadas que se ven sueltas
                    (sin carpeta), como una factura al lado de ACTIVO o PASIVO.
                    Para agruparlas elija <strong>Armar el árbol</strong>.
                  </div>
                )}
                <div className="space-y-2">
                  <QueHacerCard
                    selected={queHacer === 'nombres'}
                    title="Solo nombres y cuentas nuevas"
                    onSelect={() => setQueHacer('nombres')}
                  >
                    Se agregan las que no existen y se corrige el nombre de las que ya están.
                    Las carpetas no se tocan: si hoy ve una cuenta suelta, seguirá suelta.
                  </QueHacerCard>
                  <QueHacerCard
                    selected={queHacer === 'arbol'}
                    title="Armar el árbol: cada cuenta dentro de su grupo"
                    onSelect={() => {
                      setQueHacer('arbol');
                      keepAll();
                      setReplacePlan(false);
                    }}
                  >
                    Ejemplo: IVA débito fiscal queda dentro de PASIVO, no al mismo nivel.
                    Si el Excel no trae un grupo intermedio, se cuelga del grupo de más arriba
                    que sí exista. Úselo si las cuentas aparecen mezcladas, sin carpeta.
                    No borra el plan.
                  </QueHacerCard>
                </div>
                {queHacer === 'arbol' && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Para armar el árbol se marcan todas las filas del archivo (también las que
                    no cambian de nombre). Si vuelve atrás puede desmarcar algunas.
                  </p>
                )}
                <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-[var(--color-text)]">
                    Opciones avanzadas (casi nunca hacen falta)
                  </summary>
                  <div className="mt-3 space-y-3 text-xs">
                    <ImportPolicyBlock
                      title="Completar celdas vacías del Excel"
                      hint="En Agrosoft el grupo a veces trae Sí en centro de costo y la cuenta hija viene en blanco. Si marca esto, se copia el valor de arriba hacia abajo. Si no, una celda vacía no dice nada."
                    >
                      <Checkbox
                        checked={aplicarArrastre}
                        aria-label="Completar celdas vacías del Excel"
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAplicarArrastre(next);
                          void (async () => {
                            setImporting(true);
                            try {
                              await loadExcelPreview(preview.file, next);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'No se pudo rehacer el preview');
                            } finally {
                              setImporting(false);
                            }
                          })();
                        }}
                      />
                    </ImportPolicyBlock>
                    <ImportPolicyBlock
                      title="Actualizar si la cuenta pide centro, elemento, área o especie"
                      hint="Usa las columnas Sí/No del Excel. Una celda vacía no apaga lo que ya está grabado. Las cuentas nuevas sí toman el valor del archivo."
                    >
                      <Checkbox
                        checked={aplicarFlags}
                        aria-label="Actualizar si la cuenta pide centro, elemento, área o especie"
                        onChange={(e) => setAplicarFlags(e.target.checked)}
                      />
                    </ImportPolicyBlock>
                    <fieldset className="space-y-2 border-t border-[var(--color-border)] pt-2">
                      <legend className="font-medium text-[var(--color-text)]">
                        Centros, elementos y áreas ya asignados a cada cuenta
                      </legend>
                      <p className="text-[var(--color-muted)] leading-snug">
                        Es la lista concreta (por ejemplo Packing), no el Sí/No de arriba.
                        El Excel de Agrosoft normalmente no trae esos códigos.
                      </p>
                      {([
                        ['conservar', 'Dejar las listas como están', 'No cambia qué centros, elementos o áreas tiene cada cuenta.'],
                        ['quitar_si_flag_off', 'Quitar la lista si el Excel dice que no la pide', 'Si en el archivo centro de costo (u otro) queda en No, se vacían los asignados de esa cuenta.'],
                        ['arrastrar_padre', 'Copiar la lista del grupo padre', 'Los hijos heredan lo que ya tiene el padre. Sirve si ya asignó centros en la ficha del padre.'],
                        ['desde_excel', preview.hasDimensionCodes
                          ? 'Usar códigos que vienen en el Excel'
                          : 'Usar códigos del Excel (no disponible en este archivo)',
                        preview.hasDimensionCodes
                          ? 'Solo se aceptan códigos que ya existan en Parametrización. No se inventan centros nuevos.'
                          : 'Este archivo no trae códigos de centros, elementos ni áreas.'],
                      ] as const).map(([value, title, hint]) => (
                        <label
                          key={value}
                          className={[
                            'flex items-start gap-2',
                            value === 'desde_excel' && !preview.hasDimensionCodes ? 'opacity-60' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <input
                            type="radio"
                            name="vinculos-plan"
                            className="mt-0.5 accent-[var(--color-accent)]"
                            checked={vinculos === value}
                            disabled={value === 'desde_excel' && !preview.hasDimensionCodes}
                            onChange={() => setVinculos(value)}
                          />
                          <span>
                            <span className="font-medium text-[var(--color-text)]">{title}</span>
                            <span className="mt-0.5 block text-[var(--color-muted)] leading-snug">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    {queHacer === 'arbol' ? (
                      <p className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-[var(--color-muted)] leading-snug">
                        Con “Armar el árbol” no se borra el plan. Las cuentas que ya existen se
                        agrupan; las que falten se agregan desde el Excel.
                      </p>
                    ) : (
                    <ImportPolicyBlock
                      title="Borrar el plan actual y cargar este Excel de cero"
                      hint="Casi nunca hace falta. Falla si hay asientos o cuentas usadas (mapeo SII). No lo use para agrupar: elija “Armar el árbol”."
                    >
                      <Checkbox
                        checked={replacePlan}
                        aria-label="Borrar el plan actual y cargar este Excel de cero"
                        onChange={(e) => setReplacePlan(e.target.checked)}
                      />
                    </ImportPolicyBlock>
                    )}
                  </div>
                </details>
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="mb-2 text-sm text-[var(--color-muted)]">
              CSV: codigo,nombre,tipo,nivel — upsert por código.
            </p>
            <Field label="Contenido CSV">
              <Textarea
                className="h-48 font-mono text-xs"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}

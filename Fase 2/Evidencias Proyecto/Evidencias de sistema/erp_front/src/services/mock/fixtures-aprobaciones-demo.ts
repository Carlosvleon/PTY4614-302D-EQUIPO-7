/**
 * Grupos / escalas / AdminConcepto / suplencias para modo demo.
 * Compacto vs seed fase 2, pero misma narrativa (S1/S5): Luis → María (suplencia Jorge) → Claudia → Admin.
 */
import type {
  AdminConcepto,
  DelegacionAprobacion,
  GrupoAprobacion,
  NodoEscalaAprobacion,
} from '@/types/domain';

export const gruposAprobacionDemo: GrupoAprobacion[] = [
  {
    id: 'GRP-COMPRAS-1',
    nombre: 'Grupo 1 — Bodega / insumos',
    modulo: 'Compras',
    aprobadorInicialId: 'U-6',
    aprobadorInicialNombre: 'María González',
    miembroIds: ['U-2', 'U-6', 'U-15'],
    miembros: [
      { id: 'U-2', nombre: 'Carolina Pérez' },
      { id: 'U-6', nombre: 'María González' },
      { id: 'U-15', nombre: 'Luis Herrera' },
    ],
    activo: true,
    empresaId: 'EMP-1',
  },
  {
    id: 'GRP-COMPRAS-2',
    nombre: 'Grupo 2 — Campo / cuarteles',
    modulo: 'Compras',
    aprobadorInicialId: 'U-3',
    aprobadorInicialNombre: 'Jorge Sánchez',
    miembroIds: ['U-3', 'U-4'],
    miembros: [
      { id: 'U-3', nombre: 'Jorge Sánchez' },
      { id: 'U-4', nombre: 'Ana Torres' },
    ],
    activo: true,
    empresaId: 'EMP-1',
  }
];

type NodoSeed = Omit<NodoEscalaAprobacion, 'activo' | 'empresaId' | 'logica' | 'aprobadores'> & {
  logica?: NodoEscalaAprobacion['logica'];
};

function nodo(partial: NodoSeed): NodoEscalaAprobacion {
  return {
    ...partial,
    logica: partial.logica ?? 'SIMPLE',
    activo: true,
    empresaId: 'EMP-1',
    aprobadores: [
      { usuarioId: partial.usuarioId, usuarioNombre: partial.usuarioNombre, orden: 0 },
    ],
  };
}

export const escalasAprobacionDemo: NodoEscalaAprobacion[] = [
  nodo({
    id: 'NOD-C1-M6',
    grupoId: 'GRP-COMPRAS-1',
    grupoNombre: 'Grupo 1 — Bodega / insumos',
    modulo: 'Compras',
    usuarioId: 'U-6',
    usuarioNombre: 'María González',
    montoMax: 1_000_000,
    escalaAUsuarioId: 'U-3',
    escalaANombre: 'Jorge Sánchez',
  }),
  nodo({
    id: 'NOD-C1-J3',
    grupoId: 'GRP-COMPRAS-1',
    grupoNombre: 'Grupo 1 — Bodega / insumos',
    modulo: 'Compras',
    usuarioId: 'U-3',
    usuarioNombre: 'Jorge Sánchez',
    montoMax: 2_000_000,
    escalaAUsuarioId: 'U-7',
    escalaANombre: 'Claudia Vargas',
  }),
  nodo({
    id: 'NOD-C1-C7',
    grupoId: 'GRP-COMPRAS-1',
    grupoNombre: 'Grupo 1 — Bodega / insumos',
    modulo: 'Compras',
    usuarioId: 'U-7',
    usuarioNombre: 'Claudia Vargas',
    montoMax: 5_000_000,
    escalaAUsuarioId: 'U-1',
    escalaANombre: 'Admin Almahue',
  }),
  nodo({
    id: 'NOD-C1-A1',
    grupoId: 'GRP-COMPRAS-1',
    grupoNombre: 'Grupo 1 — Bodega / insumos',
    modulo: 'Compras',
    usuarioId: 'U-1',
    usuarioNombre: 'Admin Almahue',
    logica: 'OR',
    montoMax: null,
    escalaAUsuarioId: null,
    escalaANombre: null,
  }),
  nodo({
    id: 'NOD-C2-J3',
    grupoId: 'GRP-COMPRAS-2',
    grupoNombre: 'Grupo 2 — Campo / cuarteles',
    modulo: 'Compras',
    usuarioId: 'U-3',
    usuarioNombre: 'Jorge Sánchez',
    montoMax: 2_000_000,
    escalaAUsuarioId: 'U-1',
    escalaANombre: 'Admin Almahue',
  }),
  nodo({
    id: 'NOD-C2-A1',
    grupoId: 'GRP-COMPRAS-2',
    grupoNombre: 'Grupo 2 — Campo / cuarteles',
    modulo: 'Compras',
    usuarioId: 'U-1',
    usuarioNombre: 'Admin Almahue',
    logica: 'OR',
    montoMax: null,
    escalaAUsuarioId: null,
    escalaANombre: null,
  }),


];

export const delegacionesAprobacionDemo: DelegacionAprobacion[] = [
  {
    id: 'DEL-1',
    titularId: 'U-6',
    titularNombre: 'María González',
    suplenteId: 'U-3',
    suplenteNombre: 'Jorge Sánchez',
    modulo: 'Compras',
    vigenciaDesde: '2026-08-01',
    vigenciaHasta: '2026-08-31',
    motivo: 'Vacaciones temporada (demo)',
    activo: true,
    empresaId: 'EMP-1',
  },
];

export const adminConceptosDemo: AdminConcepto[] = [
  {
    id: 'ac-compras-u7',
    empresaId: 'EMP-1',
    usuarioId: 'U-7',
    usuarioNombre: 'Claudia Vargas',
    usuarioEmail: 'cvargas@almahue.cl',
    modulo: 'Compras',
    activo: true,
  }

];

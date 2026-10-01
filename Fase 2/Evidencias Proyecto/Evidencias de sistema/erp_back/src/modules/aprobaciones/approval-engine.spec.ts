import {
  buildCadenaAprobacion,
  resolverPrimeraAprobacion,
  resolveAprobadorEfectivo,
  resolveCadenaCompleta,
  siguienteAprobadorEnCadena,
  type DelegacionAprobacionRow,
  type UsuarioOrganigrama,
} from './approval-engine';

const USUARIOS: UsuarioOrganigrama[] = [
  { id: 'U-ANA', nombre: 'Ana', jefeId: 'U-MARIO', montoMaxAprobacion: null, activo: true },
  { id: 'U-MARIO', nombre: 'Mario', jefeId: 'U-AGUS', montoMaxAprobacion: 500_000, activo: true },
  { id: 'U-AGUS', nombre: 'Agustín', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
  { id: 'U-OTRO', nombre: 'Otro', jefeId: null, montoMaxAprobacion: null, activo: true },
];

const POOL = ['U-MARIO', 'U-AGUS'];

describe('buildCadenaAprobacion', () => {
  it('escala cuando el monto supera el tope del jefe directo', () => {
    const chain = buildCadenaAprobacion('U-ANA', 800_000, USUARIOS, POOL);
    expect(chain.map((c) => c.id)).toEqual(['U-MARIO', 'U-AGUS']);
  });

  it('solo incluye jefe directo si cubre el monto', () => {
    const chain = buildCadenaAprobacion('U-ANA', 300_000, USUARIOS, POOL);
    expect(chain.map((c) => c.id)).toEqual(['U-MARIO']);
  });

  it('omite jefes fuera del pool', () => {
    const chain = buildCadenaAprobacion('U-ANA', 100, USUARIOS, ['U-AGUS']);
    expect(chain.map((c) => c.id)).toEqual(['U-AGUS']);
  });

  it('retorna vacío si no hay jefe en pool', () => {
    const chain = buildCadenaAprobacion('U-ANA', 100, USUARIOS, ['U-OTRO']);
    expect(chain).toEqual([]);
  });
});

describe('resolverPrimeraAprobacion', () => {
  it('devuelve null sin pool', () => {
    expect(resolverPrimeraAprobacion('U-ANA', 100, USUARIOS, [])).toBeNull();
  });

  it('devuelve primer paso y metadatos', () => {
    const r = resolverPrimeraAprobacion('U-ANA', 800_000, USUARIOS, POOL);
    expect(r?.aprobadorId).toBe('U-MARIO');
    expect(r?.pasoTotal).toBe(2);
    expect(r?.cadenaIds).toEqual(['U-MARIO', 'U-AGUS']);
  });
});

describe('siguienteAprobadorEnCadena', () => {
  it('devuelve segundo paso tras aprobar el primero', () => {
    const next = siguienteAprobadorEnCadena(['U-MARIO', 'U-AGUS'], 1);
    expect(next).toEqual({ id: 'U-AGUS', paso: 2 });
  });

  it('null en paso final', () => {
    expect(siguienteAprobadorEnCadena(['U-MARIO', 'U-AGUS'], 2)).toBeNull();
  });
});

describe('resolveAprobadorEfectivo / suplencia', () => {
  const DELEG: DelegacionAprobacionRow[] = [
    {
      titularId: 'U-MARIO',
      suplenteId: 'U-CARLOS',
      modulo: 'Compras',
      vigenciaDesde: new Date('2026-08-01'),
      vigenciaHasta: new Date('2026-08-31'),
      activo: true,
    },
  ];

  const USUARIOS_SUPL: UsuarioOrganigrama[] = [
    ...USUARIOS,
    { id: 'U-CARLOS', nombre: 'Carlos', jefeId: 'U-AGUS', montoMaxAprobacion: 500_000, activo: true },
  ];

  it('usa suplente vigente en lugar del titular', () => {
    const at = new Date('2026-08-10');
    expect(resolveAprobadorEfectivo('U-MARIO', DELEG, 'Compras', at)).toBe('U-CARLOS');
  });

  it('cadena con suplencia reemplaza al titular', () => {
    const at = new Date('2026-08-10');
    const chain = buildCadenaAprobacion('U-ANA', 300_000, USUARIOS_SUPL, POOL, {
      delegaciones: DELEG,
      modulo: 'Compras',
      at,
    });
    expect(chain.map((c) => c.id)).toEqual(['U-CARLOS']);
    expect(chain[0].nombre).toBe('Carlos');
  });

  it('fuera de vigencia mantiene titular', () => {
    const at = new Date('2026-09-01');
    expect(resolveAprobadorEfectivo('U-MARIO', DELEG, 'Compras', at)).toBe('U-MARIO');
  });
});

describe('buildCadenaDesdeGrupo / resolveCadenaCompleta (fase 2 A/B/C/D)', () => {
  const USUARIOS_ABCD: UsuarioOrganigrama[] = [
    { id: 'U-A', nombre: 'Usuario A', jefeId: null, montoMaxAprobacion: null, activo: true },
    { id: 'U-B', nombre: 'Usuario B', jefeId: null, montoMaxAprobacion: null, activo: true },
    { id: 'U-C', nombre: 'Usuario C', jefeId: null, montoMaxAprobacion: null, activo: true },
    { id: 'U-D', nombre: 'Usuario D', jefeId: null, montoMaxAprobacion: null, activo: true },
    { id: 'U-ANA', nombre: 'Ana', jefeId: null, montoMaxAprobacion: null, activo: true },
    { id: 'U-PEDRO', nombre: 'Pedro', jefeId: null, montoMaxAprobacion: null, activo: true },
  ];

  const NODOS = [
    { grupoId: 'G1', usuarioId: 'U-A', montoMax: 1_000_000, escalaAUsuarioId: 'U-C', activo: true },
    { grupoId: 'G1', usuarioId: 'U-C', montoMax: 2_000_000, escalaAUsuarioId: 'U-D', activo: true },
    { grupoId: 'G1', usuarioId: 'U-D', montoMax: null, escalaAUsuarioId: null, activo: true },
    { grupoId: 'G2', usuarioId: 'U-B', montoMax: 2_000_000, escalaAUsuarioId: 'U-D', activo: true },
    { grupoId: 'G2', usuarioId: 'U-D', montoMax: null, escalaAUsuarioId: null, activo: true },
  ].map((n, i) => ({
    id: `N-${i + 1}`,
    logica: 'SIMPLE' as const,
    aprobadores: [n.usuarioId],
    escalaAId: null as string | null,
    ...n,
  }));

  const GRUPOS = [
    {
      id: 'G1',
      nombre: 'Grupo A',
      modulo: 'Compras',
      aprobadorInicialId: 'U-A',
      miembros: ['U-ANA', 'U-A', 'U-LUIS'],
      activo: true,
    },
    {
      id: 'G2',
      nombre: 'Grupo B',
      modulo: 'Compras',
      aprobadorInicialId: 'U-B',
      miembros: ['U-PEDRO'],
      activo: true,
    },
  ];

  const POOL_ABCD = ['U-A', 'U-B', 'U-C', 'U-D'];

  const baseInput = (solicitanteId: string, monto: number) => ({
    solicitanteId,
    monto,
    modulo: 'Compras',
    usuarios: USUARIOS_ABCD,
    allowedIds: POOL_ABCD,
    grupos: GRUPOS,
    nodos: NODOS,
  });

  it('AND en escala incluye logica y co-aprobadores', () => {
    const r = resolveCadenaCompleta({
      ...baseInput('U-ANA', 800_000),
      nodos: NODOS.map((n) =>
        n.usuarioId === 'U-A'
          ? {
              ...n,
              logica: 'AND' as const,
              aprobadores: ['U-A', 'U-B'],
            }
          : n,
      ),
    });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadena[0].logica).toBe('AND');
      expect(r.cadena[0].aprobadores?.map((a) => a.id)).toEqual(['U-A', 'U-B']);
    }
  });

  it('Ana $800k → A', () => {
    const r = resolveCadenaCompleta(baseInput('U-ANA', 800_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-A']);
    }
  });

  it('Ana $1.5M → A → C', () => {
    const r = resolveCadenaCompleta(baseInput('U-ANA', 1_500_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-A', 'U-C']);
    }
  });

  it('Ana $2.5M → A → C → D', () => {
    const r = resolveCadenaCompleta(baseInput('U-ANA', 2_500_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-A', 'U-C', 'U-D']);
    }
  });

  it('Pedro $1.5M → B', () => {
    const r = resolveCadenaCompleta(baseInput('U-PEDRO', 1_500_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-B']);
    }
  });

  it('Pedro $3M → B → D', () => {
    const r = resolveCadenaCompleta(baseInput('U-PEDRO', 3_000_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-B', 'U-D']);
    }
  });

  it('jefa de área (A) solicitando $800k → C (sin auto-aprobación)', () => {
    const r = resolveCadenaCompleta(baseInput('U-A', 800_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-C']);
    }
  });

  it('jefa de área (A) solicitando $1.5M → C', () => {
    const r = resolveCadenaCompleta(baseInput('U-A', 1_500_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-C']);
    }
  });

  it('jefa de área (A) solicitando $2.5M → C → D', () => {
    const r = resolveCadenaCompleta(baseInput('U-A', 2_500_000));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-C', 'U-D']);
    }
  });

  it('sin grupo cuando hay config de grupos', () => {
    const r = resolveCadenaCompleta(baseInput('U-OTRO', 100_000));
    expect(r.status).toBe('sin_grupo');
  });

  it('omite el mantenedor aunque figure como nodo final en la escala', () => {
    const usuarios = [
      ...USUARIOS_ABCD,
      { id: 'U-1', nombre: 'Admin', jefeId: null, montoMaxAprobacion: null, activo: true, esMantenedor: true },
    ];
    const nodos = [
      ...NODOS,
      {
        id: 'N-ADM',
        grupoId: 'G1',
        logica: 'SIMPLE' as const,
        aprobadores: ['U-1'],
        escalaAId: null as string | null,
        usuarioId: 'U-1',
        montoMax: null,
        escalaAUsuarioId: null,
        activo: true,
      },
    ].map((n) =>
      n.usuarioId === 'U-D'
        ? { ...n, escalaAUsuarioId: 'U-1' }
        : n,
    );
    const r = resolveCadenaCompleta({
      ...baseInput('U-ANA', 2_500_000),
      usuarios,
      nodos,
      allowedIds: [...POOL_ABCD, 'U-1'],
    });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds).toEqual(['U-A', 'U-C', 'U-D']);
      expect(r.cadenaIds).not.toContain('U-1');
    }
  });

  it('mantenedor sin membresía usa el primer grupo del módulo', () => {
    const r = resolveCadenaCompleta({
      ...baseInput('U-1', 800_000),
      solicitanteEsMantenedor: true,
    });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.cadenaIds[0]).toBe('U-A');
    }
  });

  it('usuario normal no usa el atajo de mantenedor', () => {
    const r = resolveCadenaCompleta({
      ...baseInput('U-1', 800_000),
      solicitanteEsMantenedor: false,
    });
    expect(r.status).toBe('sin_grupo');
  });

  it('fallback organigrama sin grupos configurados', () => {
    const r = resolveCadenaCompleta({
      ...baseInput('U-ANA', 300_000),
      grupos: [],
    });
    expect(r.status).toBe('sin_cadena');
  });
});

import {
  marcarAprobadoresEnSnapshot,
  parseAprobacionCadena,
  pasosFromCadenaEngine,
  resolverAccionPaso,
} from './aprobacion-cadena.util';
import type { AprobadorPaso } from './approval-engine';

describe('pasosFromCadenaEngine', () => {
  it('AND conserva logica y todos los aprobadores en PENDIENTE', () => {
    const cadena: AprobadorPaso[] = [
      {
        id: 'U-A',
        nombre: 'A',
        logica: 'AND',
        aprobadores: [
          { id: 'U-A', nombre: 'A' },
          { id: 'U-B', nombre: 'B' },
        ],
      },
    ];
    expect(pasosFromCadenaEngine(cadena)).toEqual([
      {
        logica: 'AND',
        aprobadores: [
          { id: 'U-A', nombre: 'A', estado: 'PENDIENTE' },
          { id: 'U-B', nombre: 'B', estado: 'PENDIENTE' },
        ],
      },
    ]);
  });

  it('SIMPLE sin lista usa el principal', () => {
    const cadena: AprobadorPaso[] = [{ id: 'U-A', nombre: 'A' }];
    expect(pasosFromCadenaEngine(cadena)[0]).toEqual({
      logica: 'SIMPLE',
      aprobadores: [{ id: 'U-A', nombre: 'A', estado: 'PENDIENTE' }],
    });
  });
});

describe('parseAprobacionCadena', () => {
  it('ignora basura y conserva forma JSON del contrato', () => {
    const parsed = parseAprobacionCadena([
      {
        logica: 'OR',
        aprobadores: [
          { id: 'U-A', nombre: 'A', estado: 'APROBADA' },
          { id: 'U-B', nombre: 'B', estado: 'OMITIDA' },
        ],
      },
      { logica: 'AND' },
    ]);
    expect(parsed).toEqual([
      {
        logica: 'OR',
        aprobadores: [
          { id: 'U-A', nombre: 'A', estado: 'APROBADA' },
          { id: 'U-B', nombre: 'B', estado: 'OMITIDA' },
        ],
      },
    ]);
  });
});

describe('resolverAccionPaso', () => {
  it('AND: un PIN no cierra el paso', () => {
    const r = resolverAccionPaso({
      logica: 'AND',
      pendientesAprobadorIds: ['U-A', 'U-B'],
      actorId: 'U-A',
      accion: 'APROBAR',
    });
    expect(r.pasoCompleto).toBe(false);
    expect(r.estadoActor).toBe('APROBADA');
    expect(r.omitirAprobadorIds).toEqual([]);
    expect(r.ocRechazada).toBe(false);
  });

  it('AND: el segundo PIN cierra', () => {
    const r = resolverAccionPaso({
      logica: 'AND',
      pendientesAprobadorIds: ['U-B'],
      actorId: 'U-B',
      accion: 'APROBAR',
    });
    expect(r.pasoCompleto).toBe(true);
    expect(r.ocRechazada).toBe(false);
  });

  it('OR: un PIN omite al otro', () => {
    const r = resolverAccionPaso({
      logica: 'OR',
      pendientesAprobadorIds: ['U-A', 'U-B'],
      actorId: 'U-A',
      accion: 'APROBAR',
    });
    expect(r.pasoCompleto).toBe(true);
    expect(r.omitirAprobadorIds).toEqual(['U-B']);
  });

  it('AND rechazo cierra la OC y omite hermanas', () => {
    const r = resolverAccionPaso({
      logica: 'AND',
      pendientesAprobadorIds: ['U-A', 'U-B'],
      actorId: 'U-A',
      accion: 'RECHAZAR',
    });
    expect(r.pasoCompleto).toBe(true);
    expect(r.ocRechazada).toBe(true);
    expect(r.omitirAprobadorIds).toEqual(['U-B']);
  });

  it('OR rechazo no cierra si queda otro PENDIENTE', () => {
    const r = resolverAccionPaso({
      logica: 'OR',
      pendientesAprobadorIds: ['U-A', 'U-B'],
      actorId: 'U-A',
      accion: 'RECHAZAR',
    });
    expect(r.pasoCompleto).toBe(false);
    expect(r.ocRechazada).toBe(false);
    expect(r.omitirAprobadorIds).toEqual([]);
  });
});

describe('marcarAprobadoresEnSnapshot', () => {
  it('actualiza solo el paso indicado', () => {
    const snap = [
      {
        logica: 'AND' as const,
        aprobadores: [
          { id: 'U-A', nombre: 'A', estado: 'PENDIENTE' as const },
          { id: 'U-B', nombre: 'B', estado: 'PENDIENTE' as const },
        ],
      },
    ];
    const next = marcarAprobadoresEnSnapshot(snap, 0, [
      { id: 'U-A', estado: 'APROBADA' },
    ]);
    expect(next[0].aprobadores[0].estado).toBe('APROBADA');
    expect(next[0].aprobadores[1].estado).toBe('PENDIENTE');
  });
});

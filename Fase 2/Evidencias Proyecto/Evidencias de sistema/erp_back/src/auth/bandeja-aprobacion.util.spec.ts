import {
  APROBADOR_SIN_BANDEJA,
  findUsuariosSinBandeja,
  loadUsuarioIdsDesignadosBandeja,
  usuarioTieneBandejaEscritura,
  usuarioTieneBandejaLectura,
} from './bandeja-aprobacion.util';

const PANTALLA = 'Compras · Aprobaciones';

describe('bandeja V1: compras:read/write no equivalen a bandeja', () => {
  it('ROL-1 / * siguen con bandeja', () => {
    expect(usuarioTieneBandejaLectura('ROL-1', [], null, 'Compras')).toBe(true);
    expect(usuarioTieneBandejaEscritura('ROL-2', ['*'], null, 'Compras')).toBe(true);
  });

  it('compras:write sin pantalla Aprobaciones no tiene bandeja', () => {
    expect(
      usuarioTieneBandejaLectura('ROL-2', ['compras:write', 'compras:read'], [], 'Compras'),
    ).toBe(false);
    expect(
      usuarioTieneBandejaEscritura('ROL-2', ['compras:write'], null, 'Compras'),
    ).toBe(false);
  });

  it('pantalla Compras · Aprobaciones sí habilita bandeja', () => {
    expect(
      usuarioTieneBandejaLectura(
        'ROL-2',
        ['compras:read'],
        [{ pantalla: PANTALLA, lectura: true, escritura: false }],
        'Compras',
      ),
    ).toBe(true);
    expect(
      usuarioTieneBandejaEscritura(
        'ROL-2',
        ['compras:write'],
        [{ pantalla: PANTALLA, lectura: true, escritura: true }],
        'Compras',
      ),
    ).toBe(true);
  });

  it('SIN-BAN: findUsuariosSinBandeja con compras:write sin pantalla', () => {
    const invalidos = findUsuariosSinBandeja(
      'Compras',
      [
        {
          id: 'U-X',
          nombre: 'Sin bandeja',
          email: 'x@almahue.local',
          rolId: 'ROL-2',
          rol: {
            id: 'ROL-2',
            nombre: 'Compras',
            permisos: ['compras:write', 'compras:read'],
            permisosPantalla: [],
          },
        },
      ],
      'write',
    );
    expect(invalidos).toHaveLength(1);
    expect(invalidos[0].usuarioId).toBe('U-X');
    expect(invalidos[0].pantallaRequerida).toContain('Aprobaciones');
    expect(APROBADOR_SIN_BANDEJA).toBe('APROBADOR_SIN_BANDEJA');
  });
});

describe('loadUsuarioIdsDesignadosBandeja', () => {
  it('incluye al aprobador inicial aunque el rol no tenga pantalla', async () => {
    const prisma = {
      grupoAprobacion: {
        findMany: jest.fn().mockResolvedValue([{ aprobadorInicialId: 'U-ANA' }]),
      },
      nodoEscalaAprobacion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      delegacionAprobacion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const ids = await loadUsuarioIdsDesignadosBandeja(
      prisma as never,
      'EMP-1',
      'Compras',
      ['U-ANA', 'U-PIA'],
    );
    expect(ids.has('U-ANA')).toBe(true);
    expect(ids.has('U-PIA')).toBe(false);
  });
});

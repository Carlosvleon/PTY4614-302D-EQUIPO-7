import { CATALOGO_IMPORTACION_RESUMEN_MAX, registrarCatalogoImportacion } from './catalogo-importacion.util';
import { createPrismaMock, tenantUser } from '../../test-utils/prisma-mock';

describe('registrarCatalogoImportacion', () => {
  it('acota el resumen a 200 filas y guarda snapshot de usuario', async () => {
    const { prisma, mock } = createPrismaMock();
    prisma.usuario.findUnique.mockResolvedValue({ nombre: 'María José' });
    prisma.catalogoImportacion.create.mockResolvedValue({ id: 'IMP-1' });
    const resumen = Array.from({ length: 250 }, (_, i) => ({
      codigo: `C-${i}`,
      cambios: [`Nombre: a → b${i}`],
    }));
    await registrarCatalogoImportacion(mock, {
      empresaId: 'EMP-1',
      user: tenantUser(),
      tipo: 'PLAN_CUENTAS',
      archivoNombre: 'plan.xlsx',
      created: 1,
      updated: 250,
      resumen,
      politicas: { actualizarAnidacion: false },
    });
    expect(prisma.catalogoImportacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usuarioEmail: 'user@almahue.local',
          usuarioNombre: 'María José',
          archivoNombre: 'plan.xlsx',
        }),
      }),
    );
    const data = prisma.catalogoImportacion.create.mock.calls[0][0].data as { resumen: unknown[] };
    expect(data.resumen).toHaveLength(CATALOGO_IMPORTACION_RESUMEN_MAX);
  });
});

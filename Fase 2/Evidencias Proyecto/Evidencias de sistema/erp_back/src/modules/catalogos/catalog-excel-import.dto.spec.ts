import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ImportCentrosCostoExcelDto } from './dto/catalogos.dto';
import { ImportElementosCostoExcelDto } from '../contabilidad/dto/contabilidad.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

async function validateBody<T>(metatype: new () => T, value: unknown) {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('DTO import Excel (forbidNonWhitelisted)', () => {
  const previewOnly = { accion: 'NUEVO', cambios: [] as string[] };

  it('rechaza elementos con accion/cambios del preview', async () => {
    await expect(
      validateBody(ImportElementosCostoExcelDto, {
        items: [
          {
            codigo: '3708',
            nombre: 'ARRIENDO MAQUINARIA PVG',
            ...previewOnly,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta elementos solo con campos del maestro', async () => {
    const out = await validateBody(ImportElementosCostoExcelDto, {
      items: [{ codigo: '3708', nombre: 'ARRIENDO MAQUINARIA PVG' }],
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ codigo: '3708', nombre: 'ARRIENDO MAQUINARIA PVG' });
    expect(out.items[0]).not.toHaveProperty('accion');
  });

  it('rechaza centros con accion/cambios del preview', async () => {
    await expect(
      validateBody(ImportCentrosCostoExcelDto, {
        items: [{ codigo: 'ADM', nombre: 'Administración', ...previewOnly }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta centros solo con campos del maestro', async () => {
    const out = await validateBody(ImportCentrosCostoExcelDto, {
      items: [{ codigo: 'ADM', nombre: 'Administración', activa: true }],
    });
    expect(out.items[0]).toMatchObject({ codigo: 'ADM', nombre: 'Administración', activa: true });
    expect(out.items[0]).not.toHaveProperty('cambios');
  });
});

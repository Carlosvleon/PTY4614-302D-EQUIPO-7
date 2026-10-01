import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATALOG_EXCEL_CENTRO_KEYS,
  CATALOG_EXCEL_ELEMENTO_KEYS,
  CATALOG_EXCEL_PREVIEW_ONLY_KEYS,
  catalogImportResponseLost,
  toCatalogExcelImportPayload,
} from './catalog-excel-import.util.ts';

describe('payload import Excel catálogos', () => {
  it('no envía accion/cambios del preview (Nest forbidNonWhitelisted)', () => {
    const preview = [
      {
        codigo: '3708',
        nombre: 'ARRIENDO MAQUINARIA PVG',
        departamento: undefined,
        vigencia: undefined,
        accion: 'NUEVO',
        cambios: [],
      },
    ];
    const payload = toCatalogExcelImportPayload(preview, CATALOG_EXCEL_ELEMENTO_KEYS);
    assert.deepEqual(payload, [{ codigo: '3708', nombre: 'ARRIENDO MAQUINARIA PVG' }]);
    for (const key of CATALOG_EXCEL_PREVIEW_ONLY_KEYS) {
      assert.equal(Object.hasOwn(payload[0], key), false);
    }
  });

  it('conserva campos de centro y omite preview', () => {
    const payload = toCatalogExcelImportPayload(
      [
        {
          codigo: 'ADM',
          nombre: 'Administración',
          activa: true,
          contactoEncargado: 'Mario',
          vigenciaDesde: '2026-01-01',
          accion: 'ACTUALIZA',
          cambios: ['Nombre: X → Administración'],
        },
      ],
      CATALOG_EXCEL_CENTRO_KEYS,
    );
    assert.deepEqual(payload, [
      {
        codigo: 'ADM',
        nombre: 'Administración',
        activa: true,
        contactoEncargado: 'Mario',
      },
    ]);
  });
});

describe('respuesta perdida al confirmar importación', () => {
  it('trata 502 y corte de red como grabación posible', () => {
    assert.equal(catalogImportResponseLost({ status: 502 }), true);
    assert.equal(catalogImportResponseLost({ response: { status: 503 } }), true);
    assert.equal(catalogImportResponseLost(new Error('Network Error')), true);
  });

  it('no refresca el listado ante un rechazo de validación', () => {
    assert.equal(catalogImportResponseLost({ status: 400 }), false);
  });
});

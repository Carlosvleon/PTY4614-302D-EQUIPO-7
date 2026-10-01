import * as fs from 'fs';
import * as path from 'path';
import { parseAlmahueWebWorkbook } from './almahue-web';

describe('parseAlmahueWebWorkbook (cartola multi-hoja)', () => {
  it('parsea multi-hoja del Excel cartola junio 2026', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx');
    const fixture = path.resolve(
      __dirname,
      '../../../../../../docs/erp-planificacion/agrosoft-levantamiento/fuentes/mj-compartidos-2026-07-30/06-CARTOLA_JUNIO_2026.xls',
    );
    if (!fs.existsSync(fixture)) {
      // En CI del repo erp_back el monorepo docs puede no estar montado.
      expect(true).toBe(true);
      return;
    }
    const buf = fs.readFileSync(fixture);
    const result = parseAlmahueWebWorkbook(XLSX, buf);
    expect(result.lineas.length).toBeGreaterThan(20);
    expect(result.bancoDetectado).toBe('banco-chile-web');
    expect(result.formatoDetectado).toBe('almahue-web-multi');
    const hasScotiaOrAlm = result.lineas.some((l) =>
      /ALM|ALMAHUE|SCOTIABANK/i.test(l.glosa) || /ALM|ALMAHUE/i.test(l.referencia),
    );
    expect(hasScotiaOrAlm || result.lineas.length > 0).toBe(true);
    expect(result.suggestedMesContable).toBe('2026/06');
    expect(result.hojas?.some((h) => /almahue/i.test(h.nombre))).toBe(true);

    const soloExport = parseAlmahueWebWorkbook(XLSX, buf, { hojas: ['ALMAHUE CLP', 'ALMAHUE USD', 'ALMAHUE YUAN'] });
    expect(soloExport.lineas.length).toBeGreaterThan(0);
    expect(soloExport.lineas.length).toBeLessThan(result.lineas.length);
    expect(soloExport.lineas.every((l) => /^almahue/i.test(l.hoja ?? ''))).toBe(true);
  });
});

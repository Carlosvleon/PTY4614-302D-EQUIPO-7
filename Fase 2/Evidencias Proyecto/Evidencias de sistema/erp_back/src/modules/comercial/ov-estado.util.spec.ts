import { ESTADO_OV_CONFIRMADA, normalizeEstadoOv, ovEsFacturable } from './ov-estado.util';

describe('ov-estado.util', () => {
  it('no deja APROBADO en una OV', () => {
    expect(normalizeEstadoOv('APROBADO')).toBe(ESTADO_OV_CONFIRMADA);
    expect(normalizeEstadoOv('aprobado')).toBe(ESTADO_OV_CONFIRMADA);
  });

  it('facturable = confirmada o emitida', () => {
    expect(ovEsFacturable('CONFIRMADA')).toBe(true);
    expect(ovEsFacturable('EMITIDO')).toBe(true);
    expect(ovEsFacturable('APROBADO')).toBe(true);
    expect(ovEsFacturable('BORRADOR')).toBe(false);
  });
});

import { BadRequestException } from '@nestjs/common';
import {
  assertDomicilioFiscalCliente,
  resolveDomicilioFiscal,
} from './cliente-domicilio.util';

describe('cliente-domicilio.util', () => {
  it('resuelve domicilio desde cabecera', () => {
    expect(resolveDomicilioFiscal({
      direccion: 'Av. Apoquindo 4501',
      comuna: 'Las Condes',
      ciudad: '',
    })).toEqual({
      direccion: 'Av. Apoquindo 4501',
      comuna: 'Las Condes',
      ciudad: 'Las Condes',
    });
  });

  it('usa la dirección de ficha si la cabecera viene vacía', () => {
    expect(resolveDomicilioFiscal({
      direcciones: [
        { linea: 'Calle Falsa 123', comuna: 'Santiago', ciudad: 'Santiago', principal: true },
      ],
    })).toEqual({
      direccion: 'Calle Falsa 123',
      comuna: 'Santiago',
      ciudad: 'Santiago',
    });
  });

  it('falla si falta comuna', () => {
    expect(() =>
      assertDomicilioFiscalCliente({ direccion: 'Calle 1', comuna: '' }),
    ).toThrow(BadRequestException);
  });
});

import { BadRequestException } from '@nestjs/common';
import { resolveBodegaId } from './stock-bodega.util';

describe('resolveBodegaId', () => {
  it('solo acepta Bodega.id del tenant, no el nombre', async () => {
    const tx = {
      bodega: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    await expect(resolveBodegaId(tx as never, 'EMP-1', 'Central')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.bodega.findFirst).toHaveBeenCalledWith({
      where: { empresaId: 'EMP-1', id: 'Central' },
    });
  });

  it('resuelve por id', async () => {
    const tx = {
      bodega: {
        findFirst: jest.fn().mockResolvedValue({ id: 'BOD-1' }),
      },
    };
    await expect(resolveBodegaId(tx as never, 'EMP-1', 'BOD-1')).resolves.toBe('BOD-1');
  });
});

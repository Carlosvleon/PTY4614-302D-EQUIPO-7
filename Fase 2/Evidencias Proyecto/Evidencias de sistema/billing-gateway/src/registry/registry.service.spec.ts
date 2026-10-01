import { mergeTenantConfigs, RegistryService } from './registry.service';

describe('RegistryService', () => {
  it('prioriza match exacto de empresa y RUT sobre wildcard', () => {
    const registry = new RegistryService();
    registry.loadForTests([
      {
        erpId: 'almahue',
        empresaId: 'EMP-1',
        rutEmisor: '*',
        partner: 'stub',
        connectionMode: 'stub',
        activo: true,
      },
      {
        erpId: 'almahue',
        empresaId: 'EMP-1',
        rutEmisor: '76.000.000-0',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        activo: true,
      },
    ]);

    expect(registry.resolve('almahue', '76000000-0', 'EMP-1')?.partner).toBe('gosocket');
  });

  it('no usa el wildcard de otra empresa', () => {
    const registry = new RegistryService();
    registry.loadForTests([
      {
        erpId: 'almahue',
        empresaId: 'EMP-1',
        rutEmisor: '*',
        partner: 'stub',
        connectionMode: 'stub',
        activo: true,
      },
    ]);

    expect(registry.resolve('almahue', '76.000.000-0', 'EMP-DESCONOCIDA')).toBeNull();
  });

  it('combina base y local; local reemplaza solo la misma identidad', () => {
    const base = [
      {
        erpId: 'almahue',
        empresaId: 'EMP-1',
        rutEmisor: '*',
        partner: 'stub',
        connectionMode: 'stub' as const,
        activo: true,
      },
      {
        erpId: 'almahue',
        empresaId: 'EMP-EXPORT',
        rutEmisor: '77.032.638-9',
        partner: 'stub',
        connectionMode: 'stub' as const,
        activo: true,
      },
    ];
    const local = [
      {
        erpId: 'almahue',
        empresaId: 'EMP-EXPORT',
        rutEmisor: '77032638-9',
        partner: 'gosocket',
        connectionMode: 'sandbox' as const,
        activo: true,
      },
      {
        erpId: 'almahue',
        empresaId: 'EMP-SERVICES',
        rutEmisor: '77.032.639-7',
        partner: 'gosocket',
        connectionMode: 'sandbox' as const,
        activo: true,
      },
    ];

    const registry = new RegistryService();
    registry.loadForTests(mergeTenantConfigs(base, local));

    expect(registry.resolve('almahue', '76.000.000-0', 'EMP-1')?.partner).toBe('stub');
    expect(registry.resolve('almahue', '77.032.638-9', 'EMP-EXPORT')?.partner).toBe('gosocket');
    expect(registry.resolve('almahue', '77.032.639-7', 'EMP-SERVICES')?.partner).toBe('gosocket');
    expect(mergeTenantConfigs(base, local)).toHaveLength(3);
  });

  it('wildcard de ERP (sin empresaId) cubre cualquier sociedad nueva', () => {
    const registry = new RegistryService();
    registry.loadForTests(
      mergeTenantConfigs(
        [
          {
            erpId: 'almahue',
            rutEmisor: '*',
            partner: 'stub',
            connectionMode: 'stub',
            activo: true,
          },
        ],
        [
          {
            erpId: 'almahue',
            rutEmisor: '*',
            partner: 'gosocket',
            connectionMode: 'sandbox',
            activo: true,
          },
        ],
      ),
    );

    expect(registry.resolve('almahue', '77.032.638-9', 'EMP-EXPORT')?.partner).toBe('gosocket');
    expect(registry.resolve('almahue', '77.032.639-7', 'EMP-SERVICES')?.partner).toBe('gosocket');
    expect(registry.resolve('almahue', '76.000.000-0', 'EMP-NUEVA')?.partner).toBe('gosocket');
    expect(registry.resolve('almahue', '76.000.000-0', 'EMP-NUEVA')?.billerId).toBeUndefined();
  });
});

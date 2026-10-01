import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ConnectionMode, TenantBillingConfig } from '../common/types';

@Injectable()
export class RegistryService implements OnModuleInit {
  private tenants: TenantBillingConfig[] = [];

  onModuleInit() {
    const baseCandidates = [
      join(__dirname, 'tenants.json'),
      join(process.cwd(), 'src/registry/tenants.json'),
      join(process.cwd(), 'dist/registry/tenants.json'),
    ];
    const localCandidates = [
      join(__dirname, 'tenants.local.json'),
      join(process.cwd(), 'src/registry/tenants.local.json'),
      join(process.cwd(), 'dist/registry/tenants.local.json'),
    ];
    const basePath = baseCandidates.find((p) => existsSync(p));
    if (!basePath) throw new Error('No se encontró registry base tenants.json');

    const base = readTenants(basePath);
    const localPath = localCandidates.find((p) => existsSync(p));
    const local = localPath ? readTenants(localPath) : [];
    this.tenants = mergeTenantConfigs(base, local);
  }

  /** Carga fixtures en tests sin leer disco. */
  loadForTests(tenants: TenantBillingConfig[]) {
    this.tenants = tenants;
  }

  resolve(erpId: string, rutEmisor: string, empresaId?: string): TenantBillingConfig | null {
    const rut = normalizeRut(rutEmisor);
    const active = this.tenants.filter((t) => t.activo && t.erpId === erpId);

    // Prioridad estricta: tenant completo, wildcard dentro de la misma empresa,
    // y recién después reglas globales explícitas (sin empresaId).
    return (
      active.find(
        (t) =>
          t.empresaId === empresaId
          && t.rutEmisor !== '*'
          && normalizeRut(t.rutEmisor) === rut,
      )
      ?? active.find((t) => t.empresaId === empresaId && t.rutEmisor === '*')
      ?? active.find(
        (t) =>
          !t.empresaId
          && t.rutEmisor !== '*'
          && normalizeRut(t.rutEmisor) === rut,
      )
      ?? active.find((t) => !t.empresaId && t.rutEmisor === '*')
      ?? null
    );
  }

  defaultMode(): ConnectionMode {
    const m = (process.env.DEFAULT_CONNECTION_MODE || 'stub').toLowerCase();
    if (m === 'sandbox' || m === 'live' || m === 'stub') return m;
    return 'stub';
  }
}

function normalizeRut(value: string): string {
  return value.replace(/[.\s]/g, '').toUpperCase();
}

export function mergeTenantConfigs(
  base: TenantBillingConfig[],
  local: TenantBillingConfig[],
): TenantBillingConfig[] {
  const merged = new Map<string, TenantBillingConfig>();
  for (const tenant of [...base, ...local]) {
    merged.set(tenantIdentity(tenant), tenant);
  }
  return [...merged.values()];
}

function tenantIdentity(tenant: TenantBillingConfig): string {
  return [
    tenant.erpId,
    tenant.empresaId ?? '',
    tenant.rutEmisor === '*' ? '*' : normalizeRut(tenant.rutEmisor),
  ].join('|');
}

function readTenants(path: string): TenantBillingConfig[] {
  return JSON.parse(readFileSync(path, 'utf8')) as TenantBillingConfig[];
}

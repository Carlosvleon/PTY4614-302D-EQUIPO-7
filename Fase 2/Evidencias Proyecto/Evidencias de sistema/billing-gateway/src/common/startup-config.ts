import { assertApiKeyConfiguration } from './api-key.guard';

export interface StartupConfig {
  port: number;
  host: string;
  corsOrigins: string[];
}

export function resolveStartupConfig(
  env: NodeJS.ProcessEnv = process.env,
): StartupConfig {
  assertApiKeyConfiguration(env.BILLING_API_KEYS);

  const port = Number(env.PORT || 3040);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }

  const host = env.BILLING_BIND_HOST?.trim() || '127.0.0.1';
  const corsOrigins = parseCorsOrigins(env.BILLING_CORS_ORIGINS);
  return { port, host, corsOrigins };
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(',').map((origin) => origin.trim()).filter(Boolean))];
}

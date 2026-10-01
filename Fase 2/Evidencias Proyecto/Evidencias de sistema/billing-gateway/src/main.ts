import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { resolveStartupConfig } from './common/startup-config';

async function bootstrap() {
  const { port, host, corsOrigins } = resolveStartupConfig();
  const app = await NestFactory.create(AppModule);
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins });
  }
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`billing-gateway listening on ${host}:${port}`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'error de configuración';
  // No incluir variables de entorno ni credenciales en el error de arranque.
  // eslint-disable-next-line no-console
  console.error(`billing-gateway no pudo iniciar: ${message}`);
  process.exitCode = 1;
});

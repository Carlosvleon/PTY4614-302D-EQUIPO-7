import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

// En desarrollo, .env debe ganar sobre variables del sistema (p. ej. JWT_SECRET placeholder).
if (process.env.NODE_ENV !== 'production') {
  loadEnv({ override: true });
}
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

/** Body-parser por defecto de Nest/Express limita a 100kb: insuficiente para
 * logos/sellos guardados como data-URL base64 en Empresa.plantillaDoc. */
const JSON_BODY_LIMIT = '15mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = process.env.FRONTEND_URL;
      const extras = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (!origin) return callback(null, true);
      if (allowed && origin === allowed) return callback(null, true);
      if (extras.includes(origin)) return callback(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`,
      );
    });
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('ERP v1 Web API')
    .setDescription('API Enterprise Almahue — modular monolith /api/v1')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`ERP API: http://localhost:${port}/api/v1`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}
bootstrap();

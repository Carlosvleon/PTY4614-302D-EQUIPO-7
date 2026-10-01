import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { HealthModule } from './modules/health/health.module';
import { MonedasModule } from './modules/parametrizacion/monedas/monedas.module';
import { IndicadoresBcModule } from './modules/parametrizacion/indicadores-bc/indicadores-bc.module';
import { AdminModule } from './modules/admin/admin.module';
import { ContratistasModule } from './modules/contratistas/contratistas.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ComprasModule } from './modules/compras/compras.module';
import { InsumosModule } from './modules/insumos/insumos.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { TesoreriaModule } from './modules/tesoreria/tesoreria.module';
import { ComercialModule } from './modules/comercial/comercial.module';
import { UiModule } from './modules/ui/ui.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    ContabilidadModule,
    ContratistasModule,
    CatalogosModule,
    DashboardModule,
    ComprasModule,
    InsumosModule,
    TesoreriaModule,
    ComercialModule,
    UiModule,
    HealthModule,
    MonedasModule,
    IndicadoresBcModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
